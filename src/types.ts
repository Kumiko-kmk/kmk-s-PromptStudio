export type ModelType = 'ChatGPT' | 'Gemini' | 'Grok' | 'Manus';

export const MODEL_MODES: Record<ModelType, string[]> = {
  ChatGPT: ['深度研究', '图片生成', '深入推理'],
  Gemini: ['深度研究', '图片生成', '文本撰写'],
  Manus: ['深度研究', '程序开发', '制作报告'],
  Grok: ['深究真相', '图片生成', '人物设定'],
};
