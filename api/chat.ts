import { GoogleGenAI } from '@google/genai';
import { MODEL_MODES, ModelType } from '../src/types.js';
import {
  extractUiPayload,
  preparePromptRequest,
  PromptMessage,
} from '../src/services/geminiService.js';

export const config = {
  maxDuration: 60,
};

type ChatRequest = {
  messages: PromptMessage[];
  targetModel: ModelType;
  mode: string;
  temperature: number;
  intensity: number;
  detailLevel: number;
};

type Provider = 'gemini' | 'deepseek';

type OpenedStream = {
  provider: Provider;
  firstText: string | null;
  iterator: AsyncIterator<string>;
};

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_TOTAL_CONTENT = 100_000;
const FIRST_CHUNK_TIMEOUT_MS = 25_000;

function jsonError(response: any, status: number, code: string, message: string, retryable = false) {
  response.status(status).json({ code, message, retryable });
}

function parseRequest(body: unknown): ChatRequest | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if ('apiKey' in value || 'deepseekApiKey' in value) return null;

  const { messages, targetModel, mode, temperature, intensity, detailLevel } = value;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) return null;
  if (typeof targetModel !== 'string' || !(targetModel in MODEL_MODES)) return null;
  if (typeof mode !== 'string' || !MODEL_MODES[targetModel as ModelType].includes(mode)) return null;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) return null;
  if (typeof intensity !== 'number' || !Number.isInteger(intensity) || intensity < 1 || intensity > 5) return null;
  if (typeof detailLevel !== 'number' || !Number.isInteger(detailLevel) || detailLevel < 1 || detailLevel > 5) return null;

  let totalLength = 0;
  const normalizedMessages: PromptMessage[] = [];
  for (const item of messages) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const message = item as Record<string, unknown>;
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') return null;
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return null;
    totalLength += content.length;
    if (totalLength > MAX_TOTAL_CONTENT) return null;
    normalizedMessages.push({ role: message.role, content });
  }

  if (normalizedMessages.at(-1)?.role !== 'user') return null;
  return {
    messages: normalizedMessages,
    targetModel: targetModel as ModelType,
    mode,
    temperature,
    intensity,
    detailLevel,
  };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(Object.assign(new Error('Provider timeout'), { code: 'TIMEOUT' })), FIRST_CHUNK_TIMEOUT_MS);
    }),
  ]);
}

function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; code?: string; message?: string };
  if (candidate.code === 'TIMEOUT' || candidate.code === 'ABORT_ERR') return true;
  if (candidate.status === 429 || (candidate.status !== undefined && candidate.status >= 500)) return true;
  const message = candidate.message || '';
  return /timeout|timed out|429|rate limit|\b5\d\d\b/i.test(message);
}

async function primeStream(provider: Provider, stream: AsyncIterable<string>): Promise<OpenedStream> {
  const iterator = stream[Symbol.asyncIterator]();
  while (true) {
    const first = await withTimeout(iterator.next());
    if (first.done) return { provider, firstText: null, iterator };
    if (first.value) return { provider, firstText: first.value, iterator };
  }
}

async function* createGeminiStream(
  apiKey: string,
  request: ChatRequest,
  systemInstruction: string,
  controlInstruction: string,
  temperature: number,
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey });
  const lastIndex = request.messages.length - 1;
  const contents = request.messages.map((message, index) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{
      text: index === lastIndex
        ? `${message.content}\n\n${controlInstruction}`
        : message.content,
    }],
  }));
  const response = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents,
    config: { systemInstruction, temperature },
  });

  for await (const chunk of response) {
    const text = chunk.text || '';
    if (text) yield text;
  }
}

async function* createDeepSeekStream(
  apiKey: string,
  request: ChatRequest,
  systemInstruction: string,
  controlInstruction: string,
  temperature: number,
): AsyncGenerator<string> {
  const lastMessage = request.messages.at(-1)!;
  const messages = [
    { role: 'system', content: systemInstruction },
    ...request.messages.slice(0, -1),
    { role: 'system', content: controlInstruction },
    lastMessage,
  ];
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature,
      stream: true,
    }),
    signal: AbortSignal.timeout(FIRST_CHUNK_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw Object.assign(new Error('DeepSeek request failed'), { status: response.status });
  }
  if (!response.body) throw new Error('DeepSeek returned an empty response');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const payload = line.trim();
        if (!payload.startsWith('data: ')) continue;
        const data = payload.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.delta?.content;
          if (typeof text === 'string' && text) yield text;
        } catch {
          // Ignore incomplete or provider-specific SSE events.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function openProviderStream(
  request: ChatRequest,
  systemInstruction: string,
  controlInstruction: string,
  temperature: number,
): Promise<{ stream: OpenedStream; fellBack: boolean }> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const deepSeekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!geminiKey && !deepSeekKey) {
    throw Object.assign(new Error('Provider keys are not configured'), { code: 'CONFIGURATION_ERROR' });
  }

  if (geminiKey) {
    try {
      const stream = await primeStream(
        'gemini',
        createGeminiStream(geminiKey, request, systemInstruction, controlInstruction, temperature),
      );
      return { stream, fellBack: false };
    } catch (error) {
      if (!isRetryableProviderError(error) || !deepSeekKey) throw error;
    }
  }

  if (!deepSeekKey) throw new Error('DeepSeek fallback is not configured');
  const stream = await primeStream(
    'deepseek',
    createDeepSeekStream(deepSeekKey, request, systemInstruction, controlInstruction, temperature),
  );
  return { stream, fellBack: Boolean(geminiKey) };
}

function writeEvent(response: any, event: object) {
  response.write(`${JSON.stringify(event)}\n`);
}

export default async function handler(request: any, response: any) {
  const startedAt = Date.now();
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return jsonError(response, 405, 'METHOD_NOT_ALLOWED', '仅支持 POST 请求。');
  }

  const chatRequest = parseRequest(request.body);
  if (!chatRequest) {
    return jsonError(response, 400, 'INVALID_REQUEST', '请求内容无效，请调整后重试。');
  }

  const prepared = preparePromptRequest(
    chatRequest.messages,
    chatRequest.targetModel,
    chatRequest.mode,
    chatRequest.temperature,
    chatRequest.intensity,
    chatRequest.detailLevel,
  );

  let opened: { stream: OpenedStream; fellBack: boolean };
  try {
    opened = await openProviderStream(
      chatRequest,
      prepared.systemInstruction,
      prepared.controlInstruction,
      prepared.temperature,
    );
  } catch (error) {
    const configurationError = (error as { code?: string })?.code === 'CONFIGURATION_ERROR';
    const timeout = (error as { code?: string })?.code === 'TIMEOUT';
    console.error('chat_open_failed', {
      durationMs: Date.now() - startedAt,
      configurationError,
      timeout,
    });
    return jsonError(
      response,
      configurationError ? 500 : timeout ? 504 : 502,
      configurationError ? 'CONFIGURATION_ERROR' : timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      configurationError ? '生成服务尚未完成配置，请联系维护者。' : timeout ? '生成服务响应超时，请稍后重试。' : '生成服务暂时不可用，请稍后重试。',
      !configurationError,
    );
  }

  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, no-transform');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  let assistantText = '';
  let startedStreaming = false;
  try {
    if (opened.stream.firstText) {
      startedStreaming = true;
      assistantText += opened.stream.firstText;
      writeEvent(response, { type: 'text', text: opened.stream.firstText });
    }
    while (true) {
      const next = await opened.stream.iterator.next();
      if (next.done) break;
      if (!next.value) continue;
      startedStreaming = true;
      assistantText += next.value;
      writeEvent(response, { type: 'text', text: next.value });
    }

    const parsed = extractUiPayload(assistantText);
    if (parsed.ui.options?.length || parsed.ui.finalPrompt || parsed.ui.readyToGenerate) {
      writeEvent(response, { type: 'ui', ui: parsed.ui });
    }
    writeEvent(response, { type: 'done', provider: opened.stream.provider });
    response.end();
    console.info('chat_completed', {
      provider: opened.stream.provider,
      fellBack: opened.fellBack,
      durationMs: Date.now() - startedAt,
    });
  } catch {
    writeEvent(response, {
      type: 'error',
      code: 'STREAM_INTERRUPTED',
      message: '生成连接意外中断，请稍后重试。',
      retryable: true,
    });
    response.end();
    console.error('chat_stream_failed', {
      provider: opened.stream.provider,
      fellBack: opened.fellBack,
      startedStreaming,
      durationMs: Date.now() - startedAt,
    });
  }
}
