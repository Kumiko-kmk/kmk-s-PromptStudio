import { memo, useEffect, useMemo, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import type { UiOption, UiPayload } from '../services/chatService';
import GlassSurface from './GlassSurface';
import './ChatMessage.css';

export type ChatHistoryMessage = {
  id: number;
  role: 'user' | 'ai';
  content: string;
  ui?: UiPayload;
  selectedOptionId?: string;
  silent?: boolean;
};

interface ChatMessageProps {
  message: ChatHistoryMessage;
  copied: boolean;
  optionsDisabled: boolean;
  onCopy: (messageId: number, text: string) => void;
  onOptionSelect: (messageId: number, option: UiOption) => void;
}

const rowVisibilityCallbacks = new WeakMap<Element, (isOffscreen: boolean) => void>();
let rowVisibilityObserver: IntersectionObserver | null = null;

function observeMessageRow(row: Element, onVisibilityChange: (isOffscreen: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') return () => undefined;
  rowVisibilityObserver ??= new IntersectionObserver((entries) => {
    entries.forEach((entry) => rowVisibilityCallbacks.get(entry.target)?.(!entry.isIntersecting));
  }, { rootMargin: '300px 0px' });
  rowVisibilityCallbacks.set(row, onVisibilityChange);
  rowVisibilityObserver.observe(row);
  return () => {
    rowVisibilityObserver?.unobserve(row);
    rowVisibilityCallbacks.delete(row);
  };
}

function cleanContent(text: string) {
  return text
    .replace(/\[UI_META\][\s\S]*?(\[\/UI_META\]|$)/gi, '')
    .replace(/\[\/?FINAL_PROMPT\]/gi, '')
    .replace(/\[STATUS:\s*READY_TO_GENERATE\]/gi, '')
    .trim();
}

function ChatMessageView({
  message,
  copied,
  optionsDisabled,
  onCopy,
  onOptionSelect,
}: ChatMessageProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const isOffscreenRef = useRef(false);
  const contentText = useMemo(() => cleanContent(message.content), [message.content]);
  const finalPrompt = message.ui?.finalPrompt;
  const shouldAppendFinalPrompt = Boolean(finalPrompt && !contentText.includes(finalPrompt.trim()));
  const options = message.role === 'ai' ? message.ui?.options : undefined;

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    return observeMessageRow(row, (isOffscreen) => {
      isOffscreenRef.current = isOffscreen;
      row.classList.toggle('chat-message-row--offscreen', isOffscreenRef.current);
    });
  }, []);

  return (
    <div ref={rowRef} className={`chat-message-row ${isOffscreenRef.current ? 'chat-message-row--offscreen' : ''} flex w-full flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
      <div className="max-w-[80%] flex flex-col gap-2 items-stretch">
        <GlassSurface
          width="100%"
          height="auto"
          borderRadius={24}
          className="p-5 relative group"
        >
          <div className={`text-white/90 text-sm leading-relaxed whitespace-pre-wrap ${finalPrompt ? 'pb-8' : ''}`}>
            {contentText}
            {shouldAppendFinalPrompt && (
              <>
                {contentText.trim() ? '\n\n' : ''}
                {finalPrompt}
              </>
            )}
          </div>
          {message.role === 'ai' && finalPrompt && (
            <button
              type="button"
              aria-label="复制最终 Prompt"
              onClick={() => onCopy(message.id, finalPrompt)}
              className="absolute bottom-3 right-3 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
        </GlassSurface>

        {options && options.length > 0 && (
          <div className="flex flex-row gap-2 w-full">
            {options.map((option) => {
              const isSelected = message.selectedOptionId === option.id;
              const hasSelection = Boolean(message.selectedOptionId);

              return (
                <button
                  type="button"
                  key={option.id}
                  disabled={hasSelection || optionsDisabled}
                  onClick={() => onOptionSelect(message.id, option)}
                  className={`flex-1 text-center transition-all duration-300 ${hasSelection && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'}`}
                >
                  <GlassSurface
                    width="100%"
                    height="auto"
                    borderRadius={16}
                    className={`py-2.5 px-4 transition-colors duration-300 ${isSelected ? 'bg-white/20 border-white/50 shadow-[0_0_15px_rgba(255,255,255,0.15)]' : 'hover:bg-white/10'}`}
                  >
                    <div className="flex items-center justify-center w-full h-full">
                      <span className={`font-bold text-sm transition-colors ${isSelected ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'text-white/80'}`}>
                        {isSelected ? '✓' : option.id}
                      </span>
                    </div>
                  </GlassSurface>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageView);
