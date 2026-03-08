/// <reference types="vite/client" />
import { GoogleGenAI } from '@google/genai';

function getKnowledgeBase(model: string, mode: string, depth: number): string {
  const isHighDepth = depth >= 3;

  // 深度控制策略：决定 AI 提问时的颗粒度和最终 Prompt 的限制死板程度
  const depthStrategy = isHighDepth
    ? "【极深约束策略】：限制目标AI自由度，通过精准参数剥夺其发挥空间。"
    : "【灵感引导策略】：保留创意留白，通过方向性引导捕捉核心意图。";

  // 针对 4 个模型 × 3 个模式的精细化知识库
  const knowledgeMatrix: Record<string, Record<string, { low: string; high: string }>> = {
    "ChatGPT": {
      "深度研究": {
        low: "提供核心论点与大纲选项；追问侧重于文章的受众层级（如小白科普 vs 专业分析）以及是否需要总结特定时间段的趋势。",
        high: "强制要求定义逻辑闭环。选项应包含：特定的学术引用格式（APA/MLA）、数据对比矩阵（如 SWOT/PEST 框架）、以及要求目标 AI 进行 MECE（相互独立、完全穷尽）原则的结构审查。"
      },
      "图片生成": { // 基于 DALL-E 3 特性
        low: "提供画面主体与整体艺术流派的选项；追问侧重于画面的情绪氛围和主色调。",
        high: "精准控制构图。选项应包含：绝对的视角要求（如等角透视、超广角仰视）、具体的媒介材质（如 3D Blender 渲染、醇酸树脂厚涂）、以及画面中多对象的精准空间坐标关系（左前、右后）。"
      },
      "深入推理": { // 基于 o1/GPT-4o 强逻辑特性
        low: "提供不同的分析视角选项；追问侧重于需要重点探讨的利弊或正反面论证。",
        high: "强制触发思维链（Chain of Thought）。选项应包含：指定特定的认知模型（如第一性原理、六顶思考帽）、强制设定极端边界条件（Edge Cases）进行压力测试、以及要求 AI 显式输出每一步的推导公式或逻辑判定树。"
      }
    },
    
    "Gemini": {
      "深度研究": { // 基于 1M/2M 超长上下文与 Google 搜索生态
        low: "提供信息整合广度的选项；追问侧重于是否需要结合最新的 Google 搜索结果，以及需要跨界关联哪些领域的知识。",
        high: "榨干长文本窗口。选项应包含：要求定义超长文档的 JSON/CSV 数据提取 Schema、设定特定年份/域名的信源白名单与黑名单、以及要求对跨文档的矛盾信息提供置信度评估。"
      },
      "图片生成": { // 基于 Imagen 3 特性
        low: "提供光影与画面故事性的选项；追问侧重于画面所传达的温度与主体动态。",
        high: "摄影机参数级别的控制。选项应包含：具体的镜头焦距（如 85mm 人像镜头）、专业布光术语（如伦勃朗光、全局光照 GI、丁达尔效应）、以及微距下的材质纹理表现（如皮肤毛孔、金属拉丝）。"
      },
      "文本撰写": { 
        low: "提供语气基调和行文节奏的选项；追问侧重于目标读者的阅读习惯和文章的最终用途。",
        high: "极致的排版与风格克隆。选项应包含：强制设定每个章节的精确字数占比、提供 3-5 个禁止使用的陈词滥调（Stop Words）、以及要求完美复刻某位特定作家的断句习惯或修辞手法。"
      }
    },

    "Manus": {
      "深度研究": { // 原生 Agent 架构
        low: "提供研究目标的选项；追问侧重于 Agent 需要最终交付一份什么样形态的总结报告。",
        high: "定义自动化执行路径。选项应包含：指定目标抓取网站的类型、设定遇到反爬虫机制时的重试或绕过策略、以及定义最终清洗出的结构化数据字段映射（Mapping）。"
      },
      "程序开发": { 
        low: "提供核心业务逻辑的选项；追问侧重于项目是追求快速原型验证（MVP）还是长期的可维护性。",
        high: "工程级约束落地。选项应包含：强制指定具体的技术栈及版本号、要求实现 API 接口的幂等性与错误日志追踪规范（如 ELK 格式）、以及要求强制生成单元测试（覆盖率 > 80%）。"
      },
      "制作报告": { 
        low: "提供报告受众和核心主旨的选项；追问侧重于报告是偏向数据展示还是战略宣讲。",
        high: "精确到 PPT 每一页的生成。选项应包含：强制规定每一页的“Key Takeaway”字数限制、指定特定数据的图表可视化形态（如桑基图、瀑布图）、以及统一品牌视觉的十六进制颜色代码。"
      }
    },

    "Grok": {
      "深究真相": { // 实时 X 平台数据，无审查
        low: "提供探讨视角的选项；追问侧重于是否需要引入非主流观点或当前互联网的热门争议点。",
        high: "舆论攻防战模式。选项应包含：强制要求交叉比对 X（原 Twitter）过去 24 小时的实时情绪指数、挖掘被主流媒体刻意忽略的“房间里的大象”、并要求采用极致的批判性思维（甚至带点毒舌）进行解构。"
      },
      "图片生成": { // 基于 Flux 模型的无限制特性
        low: "提供视觉冲击力选项；追问侧重于画面的夸张程度和是否需要融入网络流行文化。",
        high: "释放极致迷因（Meme）张力。选项应包含：强烈的政治讽刺或黑色幽默元素、极端的视觉反差设计、以及深度植入特定的亚文化隐喻符号。"
      },
      "人物设定": { 
        low: "提供角色基础性格的选项；追问侧重于角色的核心驱动力与外在表现。",
        high: "剖析人性的幽暗面。选项应包含：定义角色不可调和的道德灰色地带、设计在生死抉择等极端压力下的非线性心理扭曲、以及赋予其极具辨识度的、带有黑色幽默的语言口癖。"
      }
    }
  };

  // 兜底逻辑，防止传入未知的 model 或 mode
  const currentModelBase = knowledgeMatrix[model];
  const currentModeInfo = currentModelBase ? currentModelBase[mode] : null;
  
  const guidance = currentModeInfo 
    ? (isHighDepth ? currentModeInfo.high : currentModeInfo.low)
    : "通用专业建议。";

  // 关键：去掉“你正在写”、“请遵循”等动词，改为静态参考信息
  return `
[参考知识库]
- 策略方向：${depthStrategy}
- 当前模型模式建议：${guidance}
`;
}

export function createChatSession(
  apiKey: string,
  model: string, 
  mode: string, 
  temperature: number, 
  intensity: number, 
  questionDepth: number = 3 // 新增：问题深度，范围1-5
) {
  const actualApiKey = apiKey || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey: actualApiKey });
  const targetModel = apiKey ? 'gemini-3.1-pro-preview' : 'gemini-3.1-flash-lite-preview';

  const systemInstruction = `
# Role
你是一个顶级的“Prompt架构师”。你的任务是协助用户完善需求，并最终生成适配 ${model} 的高质量指令。

# Context
- 目标模型：${model}
- 任务模式：${mode}
- 追问深度：${questionDepth}/5
- 计划轮数：${intensity} 轮
${getKnowledgeBase(model, mode, questionDepth)}

# Workflow
1. **分析输入**：理解初始需求。
2. **精准追问**：基于[参考知识库]中的建议，每次向用户提出 1 个核心问题。
3. **提供选项**：**必须**随提问附带 2-3 个具体选项。

# Output Constraints (极高优先级)
- **拒绝重复**：严禁在单次回复中重复相同的短语或逻辑。不要复读。
- **单一序列**：回复必须是单一、连贯的对话段落。严禁输出多个版本的尝试或对比。
- **直接对话**：不要输出任何系统标签（如[STATUS]、[参考知识库]等），除非在生成最终结果时。
- **对话起始**：回复应自然地以对用户需求的反馈开始，例如：“好的，为了针对 ${model} 进行 ${mode} 优化，我们需要明确...”

# Final Output Format
生成最终 Prompt 时，必须包含以下标记并严格排版：
[STATUS: READY_TO_GENERATE]
---
# [Role] ...
# [Context] ...
# [Task] ...
# [Constraints] ...
# [Output] ...
---
`;

  return ai.chats.create({
    model: targetModel,
    config: {
      systemInstruction,
      temperature: temperature,
    },
  });
}
