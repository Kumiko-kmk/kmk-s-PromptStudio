export type UiOption = {
  id: string;
  label: string;
  reply: string;
};

export type UiPayload = {
  options?: UiOption[];
  finalPrompt?: string;
  readyToGenerate?: boolean;
};

export type StreamChunk = {
  text?: string;
  ui?: UiPayload;
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ApiEvent =
  | { type: 'text'; text: string }
  | { type: 'ui'; ui: UiPayload }
  | { type: 'done'; provider: 'gemini' | 'deepseek' }
  | { type: 'error'; code: string; message: string; retryable: boolean };

const STATUS_MESSAGES: Record<number, string> = {
  400: '请求内容无效，请调整后重试。',
  413: '对话内容过长，请清空会话后重试。',
  429: '请求过于频繁，请稍后再试。',
  500: '生成服务配置异常，请联系维护者。',
  502: '生成服务暂时不可用，请稍后重试。',
  504: '生成服务响应超时，请稍后重试。',
};

class RemotePromptSession {
  private messages: ChatMessage[] = [];

  constructor(
    private targetModel: string,
    private mode: string,
    private temperature: number,
    private intensity: number,
    private detailLevel: number,
  ) {}

  async *sendMessageStream({ message }: { message: string }): AsyncGenerator<StreamChunk> {
    this.messages.push({ role: 'user', content: message });

    let response: Response;
    try {
      response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages,
          targetModel: this.targetModel,
          mode: this.mode,
          temperature: this.temperature,
          intensity: this.intensity,
          detailLevel: this.detailLevel,
        }),
      });
    } catch {
      this.messages.pop();
      throw new Error('网络连接失败，请检查网络后重试。');
    }

    if (!response.ok || !response.body) {
      this.messages.pop();
      let serverMessage = '';
      try {
        const payload = await response.json();
        serverMessage = typeof payload?.message === 'string' ? payload.message : '';
      } catch {
        // Vercel Firewall responses are not guaranteed to be JSON.
      }
      throw new Error(serverMessage || STATUS_MESSAGES[response.status] || '服务暂时不可用，请稍后重试。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantText = '';
    let completed = false;

    const consumeLine = (line: string): ApiEvent | null => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed) as ApiEvent;
      } catch {
        throw new Error('服务返回了无法解析的数据，请稍后重试。');
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const event = consumeLine(line);
          if (!event) continue;
          if (event.type === 'text') {
            assistantText += event.text;
            yield { text: event.text };
          } else if (event.type === 'ui') {
            yield { ui: event.ui };
          } else if (event.type === 'error') {
            throw new Error(event.message);
          } else if (event.type === 'done') {
            completed = true;
          }
        }
      }

      const finalEvent = consumeLine(buffer);
      if (finalEvent?.type === 'text') {
        assistantText += finalEvent.text;
        yield { text: finalEvent.text };
      } else if (finalEvent?.type === 'ui') {
        yield { ui: finalEvent.ui };
      } else if (finalEvent?.type === 'error') {
        throw new Error(finalEvent.message);
      } else if (finalEvent?.type === 'done') {
        completed = true;
      }

      if (!completed) {
        throw new Error('生成连接意外中断，请稍后重试。');
      }

      this.messages.push({ role: 'assistant', content: assistantText });
    } catch (error) {
      this.messages.pop();
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
}

export function createChatSession(
  targetModel: string,
  mode: string,
  temperature: number,
  intensity: number,
  detailLevel: number,
) {
  return new RemotePromptSession(targetModel, mode, temperature, intensity, detailLevel);
}
