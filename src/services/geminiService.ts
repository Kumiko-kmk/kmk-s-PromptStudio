// @ts-ignore - runtime dependency is provided by host app environment
import { GoogleGenAI } from '@google/genai';

/**
 * =============================================================================
 * 01) 启发式追问策略生成（按问题深度动态切换）
 * -----------------------------------------------------------------------------
 * 作用：
 * - 根据 questionDepth(1~5) 生成不同粒度的追问指导文本。
 * - 该文本会被拼接进 systemInstruction，直接影响后续提问风格。
 *
 * 维护提示：
 * - 仅调整文案，不要改动入参与返回结构。
 * - depth 的分层语义已被上层流程依赖（探索 -> 专家）。
 * =============================================================================
 */
function getHeuristicGuidance(model: string, mode: string, depth: number): string {
  let depthStrategy = "";

  if (depth === 1) {
    depthStrategy = "【探索级深度】聚焦宏观方向与创意空间，问题应帮助用户明确任务领域、目标受众或整体风格。避免技术细节。";
  }
  else if (depth === 2) {
    depthStrategy = "【方向级深度】逐渐收敛任务目标，问题应聚焦结构、输出类型或内容重点，但仍保持一定开放性。";
  }
  else if (depth === 3) {
    depthStrategy = "【专业级深度】开始进入专业结构设计，提问应涉及逻辑框架、数据结构、执行步骤或技术规范。";
  }
  else if (depth === 4) {
    depthStrategy = "【技术级深度】问题必须涉及具体技术实现，例如参数标准、工具链、数据结构或执行策略。";
  }
  else {
    depthStrategy = "【专家级深度】深入底层执行细节、边界条件、异常处理、格式标准或算法结构，确保最终Prompt具有高度工程可执行性。";
  }

  // 用动态思考框架替代写死的知识矩阵
  return `
[启发式动态思考框架]
- 目标AI模型：${model} (请充分调动你对该模型技术长处的理解，如长文本解析、逻辑推理、代码工程或多模态生成)
- 当前任务模式：${mode}
- 当前问题深度：${depth}/5
- 策略指引：${depthStrategy}

【动态追问原则】
请基于用户的具体主题与历史上下文，动态分析：
1）当前任务最关键但尚未明确的维度是什么？
2）该维度是否适合通过选择题确认，还是必须通过开放描述获取？
如果维度具有明确分类（如结构、格式、模式），可以提供选项。
如果维度高度开放（如创意方向、复杂需求、策略设计），应优先使用开放问题。
`;
}

/**
 * =============================================================================
 * 02) 模型/任务模式策略矩阵
 * -----------------------------------------------------------------------------
 * 作用：
 * - 根据 (model, mode) 命中对应策略片段，补充到 systemInstruction。
 * - 如果未命中，返回空字符串，不阻断主流程。
 *
 * 维护提示：
 * - 新增模型或模式时，只在 matrix 内追加映射即可。
 * - key 必须与上层传入值保持一致（大小写与中文命名都敏感）。
 * =============================================================================
 */
function getModelStrategy(model: string, mode: string): string {

const matrix: Record<string, Record<string, string>> = {
  ChatGPT: {
    '深度研究': `
【ChatGPT 深度研究策略】
- 目标聚焦：先明确研究问题、边界与交付目标，避免泛泛而谈。
- 输入建议：尽量提供已知背景、关键术语、时间范围与优先关注点。
- 执行建议：采用“问题拆分 -> 证据归纳 -> 观点比较 -> 阶段结论”的推进方式。
- 输出建议：使用结构化章节（摘要、核心发现、证据、风险与建议），便于直接复用。
- 可发挥空间：允许模型补充相关视角与替代方案，但应区分“事实”与“推断”。
`,
    '图片生成': `
【ChatGPT 图片生成策略】
- 目标聚焦：先确定画面主体与核心情绪，再扩展风格细节。
- 输入建议：优先描述“主体 + 场景 + 风格 + 光影 + 构图”，可附参考关键词。
- 执行建议：先锁定主构图与镜头语言，再细化材质、色彩与氛围层次。
- 输出建议：给出可直接用于生成的完整描述，并可附 1-2 个轻微变体方向。
- 可发挥空间：在不偏离主体设定的前提下，可适度增强视觉叙事与细节丰富度。
`,
    '深入推理': `
【ChatGPT 深入推理策略】
- 目标聚焦：将复杂问题拆成可验证的中间步骤，逐步收敛到结论。
- 输入建议：明确问题定义、已知条件、限制条件与期望判断标准。
- 执行建议：采用“假设 -> 推导 -> 校验 -> 修正”的循环方式进行分析。
- 输出建议：先给结论，再给关键理由与必要的推导路径，保证可读性。
- 可发挥空间：允许提出备选结论，并说明各自适用前提与潜在风险。
`
  },
  Gemini: {
    '深度研究': `
【Gemini 深度研究策略】
- 目标聚焦：围绕核心议题组织多来源信息，形成可比较、可落地的洞见。
- 输入建议：提供背景资料、目标受众、业务语境及可用数据范围。
- 执行建议：采用“主题聚类 + 交叉对比 + 关键证据提炼 + 行动建议”流程。
- 输出建议：建议以清晰分段呈现（结论、依据、差异点、建议），提升决策效率。
- 可发挥空间：可补充跨领域关联观点，但建议标注其确定性等级。
`,
    '图片生成': `
【Gemini 图片生成策略】
- 目标聚焦：强调场景完整性与情绪表达的一致性。
- 输入建议：优先给出人物/物体设定、时空环境、色调倾向与画面叙事目的。
- 执行建议：先确定场景构图与光线关系，再细化局部元素与视觉层次。
- 输出建议：可按“主提示词 + 细节补充 + 风格修饰”组织，便于迭代。
- 可发挥空间：允许在主题一致前提下增加氛围细节和镜头感。
`,
    '文本撰写': `
【Gemini 文本撰写策略】
- 目标聚焦：先对齐受众与传播目的，再决定语气、深度与篇幅。
- 输入建议：提供主题、使用场景、目标读者、希望强调的观点与禁区。
- 执行建议：采用“开篇定位 -> 主体展开 -> 结尾收束/行动建议”的稳定结构。
- 输出建议：语言保持自然流畅，可选附加标题方案或小节摘要。
- 可发挥空间：允许适度增强表达风格，但保持核心信息准确与连贯。
`
  },
  Manus: {
    '深度研究': `
【Manus 深度研究策略】
- 目标聚焦：面向执行落地，优先产出可操作结论与下一步计划。
- 输入建议：明确研究对象、可用数据、时间窗口与决策场景。
- 执行建议：遵循“数据整理 -> 指标分析 -> 问题定位 -> 方案建议”的路径。
- 输出建议：建议附关键指标、结论依据与可执行动作清单。
- 可发挥空间：可提出替代策略，并说明资源成本与收益权衡。
`,
    '程序开发': `
【Manus 程序开发策略】
- 目标聚焦：优先保证架构清晰、接口稳定与后续可维护性。
- 输入建议：提供业务目标、技术栈、约束条件、性能/安全关注点。
- 执行建议：采用“模块划分 -> 接口定义 -> 核心流程实现 -> 异常处理 -> 测试建议”。
- 输出建议：代码说明与实现步骤保持对应，便于开发与评审同步。
- 可发挥空间：允许模型给出实现备选方案，并标明适用场景与取舍理由。
`,
    '制作报告': `
【Manus 制作报告策略】
- 目标聚焦：形成“可阅读、可决策、可追踪”的报告结构。
- 输入建议：说明汇报对象、关注指标、结论预期与展示时长。
- 执行建议：采用“摘要 -> 背景 -> 数据与分析 -> 结论 -> 建议与后续计划”的框架。
- 输出建议：建议关键结论前置，并在正文保留必要证据链。
- 可发挥空间：可根据受众风格调整表达密度与专业术语比例。
`
  },
  Grok: {
    '深究真相': `
【Grok 深究真相策略】
- 目标聚焦：先界定问题真伪边界，再收集证据与对立观点。
- 输入建议：提供事件背景、时间范围、可参考来源类型与争议点。
- 执行建议：采用“证据汇总 -> 观点分层 -> 冲突点核查 -> 暂定结论”。
- 输出建议：尽量区分“已确认事实”“高概率判断”“待验证信息”。
- 可发挥空间：允许提出质疑路径与进一步核验建议，避免过早定论。
`,
    '图片生成': `
【Grok 图片生成策略】
- 目标聚焦：强调视觉冲击力，同时保持主题可识别与叙事完整。
- 输入建议：给出主体设定、动作情境、风格方向、镜头角度与对比强度。
- 执行建议：先确定画面动势与主次关系，再强化纹理、光影和情绪细节。
- 输出建议：可提供“主方案 + 氛围增强版”两种轻差异方向，便于选择。
- 可发挥空间：允许模型增强戏剧性，但不偏离核心主题与角色设定。
`,
    '人物设定': `
【Grok 人物设定策略】
- 目标聚焦：确保人物“动机、性格、外在表现、成长轨迹”相互一致。
- 输入建议：描述角色身份、世界观背景、冲突来源与故事功能定位。
- 执行建议：采用“基础档案 -> 行为特征 -> 关系网络 -> 成长弧线”的构建方式。
- 输出建议：建议产出可复用的人设卡片（含关键词、口吻、禁忌与高光场景）。
- 可发挥空间：允许增加个性反差与记忆点，但保持人物逻辑闭环。
`
  }
}

return matrix[model]?.[mode] || "";
}

function getRoundRangeByIntensity(intensity: number): { normalized: number; min: number; max: number } {
  const normalized = Math.max(1, Math.min(5, Math.floor(intensity)));
  const roundRangeMap: Record<number, { min: number; max: number }> = {
    1: { min: 1, max: 2 },
    2: { min: 2, max: 4 },
    3: { min: 3, max: 5 },
    4: { min: 4, max: 6 },
    5: { min: 5, max: 8 },
  };

  return { normalized, ...roundRangeMap[normalized] };
}

/**
 * =============================================================================
 * 02.5) 追问轮次强约束策略（按 intensity 映射区间）
 * -----------------------------------------------------------------------------
 * 作用：
 * - 将 1~5 的强度等级映射为“建议最少追问轮次 + 允许最多追问轮次”。
 * - 作为强约束注入 systemInstruction，避免“计划轮数”过于松散。
 *
 * 规则：
 * - 1 -> 1~2 轮
 * - 2 -> 2~4 轮
 * - 3 -> 3~5 轮
 * - 4 -> 4~6 轮
 * - 5 -> 5~8 轮
 *
 * 提前结束：
 * - 如果核心需求、约束和输出标准已经明确，可在达到上限前提前结束追问，
 *   直接进入最终 Prompt 生成。
 * =============================================================================
 */
function getIntensityGuidance(intensity: number): string {
  const range = getRoundRangeByIntensity(intensity);

  return `
[追问轮次强约束]
- 强度等级：${range.normalized}/5
- 追问轮次区间：建议至少 ${range.min} 轮，最多 ${range.max} 轮
- 单轮规则：每轮只聚焦 1 个最关键未明确维度，避免一次抛出多个问题
- 收敛规则：若核心需求、关键约束、输出格式与评估标准已明确，可提前结束追问
- 结束动作：一旦判断信息充分，直接输出最终 Prompt（使用 [STATUS: READY_TO_GENERATE] 标记）
`;
}

/**
 * =============================================================================
 * 02.6) 温度参数归一化（兼容 0~2 输入）
 * -----------------------------------------------------------------------------
 * 作用：
 * - 兼容上层以 0~2 作为温度输入范围的设定。
 * - 统一映射到模型常用的 0~1 区间，再传给 Gemini/DeepSeek。
 *
 * 规则：
 * - 输入先钳制到 [0, 2]
 * - 线性映射：normalized = clamped / 2
 * =============================================================================
 */
function normalizeTemperature(temperature: number): number {
  const safeTemperature = Number.isFinite(temperature) ? temperature : 1;
  const clampedTemperature = Math.max(0, Math.min(2, safeTemperature));
  return clampedTemperature / 2;
}

/**
 * =============================================================================
 * 02.65) 信息充分度评分器（代码级收敛判定）
 * -----------------------------------------------------------------------------
 * 作用：
 * - 对用户历史输入做轻量启发式评分（0~6）。
 * - 用于辅助轮次状态机决定“继续追问”或“提前收束”。
 *
 * 评分维度（每项 1 分）：
 * - 目标任务、受众对象、输入上下文、输出格式、约束条件、评估标准
 * =============================================================================
 */
function evaluateInformationSufficiency(userMessages: string[]): { score: number; threshold: number; ready: boolean } {
  const merged = userMessages.join('\n').toLowerCase();
  let score = 0;

  const checks = [
    /(目标|目的|想要|需要|用于|任务|goal|objective)/i, // 目标任务
    /(受众|读者|用户|客户|面向|audience|persona)/i, // 受众对象
    /(背景|上下文|输入|数据|资料|素材|参考|context|input)/i, // 输入上下文
    /(输出|格式|结构|字数|长度|json|markdown|表格|模板|format)/i, // 输出格式
    /(约束|限制|必须|不要|风格|语气|时间|预算|技术栈|constraints?)/i, // 约束条件
    /(评估|验收|标准|成功|指标|quality|criteria|kpi)/i, // 评估标准
  ];

  for (const rule of checks) {
    if (rule.test(merged)) score += 1;
  }

  const threshold = 4;
  return { score, threshold, ready: score >= threshold };
}

/**
 * =============================================================================
 * 02.7) Prompt 模板矩阵（按任务模式统一最终输出格式）
 * -----------------------------------------------------------------------------
 * 作用：
 * - 将“最终 Prompt 的输出骨架”按 mode 进行映射管理，而不是全模式共用一个模板。
 * - 在不改变调用方式的前提下，提高不同任务场景的结构适配度与可维护性。
 *
 * 设计原则（参考主流提示词实践）：
 * - 结构化：明确角色、上下文、任务、约束、输出规格。
 * - 可执行：给到可直接复制的模板段落。
 * - 适度开放：保留“可选增强项”，避免过度僵化。
 * =============================================================================
 */
function getFinalPromptTemplateByMode(mode: string): string {
  const templateMatrix: Record<string, string> = {
    '深度研究': `
# Final Output Format（深度研究）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是资深研究分析师，目标是在限定范围内产出可验证、可决策的研究结论。

# [Research Objective]
- 核心问题：
- 研究边界（行业/时间/地区/对象）：
- 决策场景与目标受众：

# [Inputs & Context]
- 已知背景：
- 关键术语：
- 已有假设/争议点：

# [Method]
- 先拆分研究子问题，再进行证据归纳与对比分析。
- 对结论标注确定性（高/中/低），并区分事实与推断。

# [Constraints]
- 保持结构化输出，结论前置，证据可追溯。
- 若信息不足，先列缺口与补充建议，再给阶段性结论。

# [Output]
1) 摘要
2) 核心发现（含证据要点）
3) 结论与建议（含风险与前提）
4) 待验证问题
[/FINAL_PROMPT]
`,
    '图片生成': `
# Final Output Format（图片生成）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是视觉创意总监，负责将需求转化为可执行的高质量图像生成指令。

# [Creative Goal]
- 主体：
- 场景：
- 情绪/氛围：
- 目标用途（海报/封面/社媒/概念图）：

# [Visual Spec]
- 构图与镜头（景别/角度/画幅）：
- 光线与色彩（主光、色温、对比、主色调）：
- 风格与材质（艺术风格、质感、细节等级）：

# [Constraints]
- 保持主体明确、层次清晰、风格一致。
- 避免与主题冲突的元素；可给少量可选增强细节。

# [Output]
- 主提示词（可直接生成）
- 可选增强项（1-3条）
- 可选负向约束（如有需要）
[/FINAL_PROMPT]
`,
    '深入推理': `
# Final Output Format（深入推理）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是严谨的问题求解专家，目标是产出可验证、可复核的推理结果。

# [Problem Definition]
- 问题陈述：
- 已知条件：
- 约束条件：
- 评估标准：

# [Reasoning Plan]
- 将问题拆分为若干可验证步骤。
- 每步给出关键依据与中间判断。
- 如存在不确定性，明确假设并说明影响。

# [Constraints]
- 先结论后解释，保证逻辑链可追踪。
- 可提供备选结论，但需说明适用前提。

# [Output]
1) 最终结论
2) 关键推理链
3) 备选方案（可选）
4) 风险与边界条件
[/FINAL_PROMPT]
`,
    '文本撰写': `
# Final Output Format（文本撰写）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是专业内容编辑，目标是生成符合受众与场景的高质量文本。

# [Writing Brief]
- 主题：
- 目标读者：
- 使用场景：
- 核心观点：
- 期望语气与风格：

# [Structure]
- 开篇定位（吸引注意并定义主题）
- 主体展开（2-4个核心段落）
- 收束结尾（总结/行动建议）

# [Constraints]
- 信息准确、表达自然、逻辑连贯。
- 可适度发挥文采，但不偏离核心目标。

# [Output]
- 标题（可选 1-3 个）
- 正文（按目标篇幅）
- 可选摘要/要点（如需要）
[/FINAL_PROMPT]
`,
    '程序开发': `
# Final Output Format（程序开发）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是资深软件工程师，目标是交付可实现、可维护、可验证的开发方案/代码指令。

# [Development Goal]
- 业务目标：
- 技术栈与运行环境：
- 输入/输出预期：

# [Technical Context]
- 相关模块与依赖：
- 接口约束：
- 性能/安全关注点：

# [Implementation Plan]
- 模块拆分与职责
- 核心流程与关键函数
- 异常处理与边界场景
- 测试建议（单元/集成）

# [Constraints]
- 保持代码风格一致，优先可读性与可维护性。
- 必要时提供替代实现并说明取舍。

# [Output]
1) 实现步骤
2) 关键代码说明
3) 测试与验收清单
[/FINAL_PROMPT]
`,
    '制作报告': `
# Final Output Format（制作报告）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是商业报告顾问，目标是输出可阅读、可决策、可追踪的报告内容。

# [Report Brief]
- 报告目标：
- 汇报对象：
- 关注指标：
- 结论预期：

# [Report Structure]
- Executive Summary
- 背景与范围
- 数据与分析
- 结论与建议
- 后续行动计划

# [Constraints]
- 关键结论前置，证据链清晰，语言专业但易读。
- 可根据受众调整术语密度与详略层级。

# [Output]
- 报告正文
- 关键图表/数据建议（如适用）
- 执行建议清单
[/FINAL_PROMPT]
`,
    '深究真相': `
# Final Output Format（深究真相）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是事实核验分析员，目标是区分事实、推断与待验证信息。

# [Investigation Scope]
- 核查对象：
- 时间范围：
- 争议焦点：
- 可用信息来源：

# [Verification Method]
- 汇总证据并标注来源类型。
- 分离“已确认事实 / 高概率判断 / 待验证项”。
- 对冲突信息给出可能解释与后续核验路径。

# [Constraints]
- 避免先入为主，保持证据导向。
- 信息不足时给出暂定结论与补证建议。

# [Output]
1) 事实层结论
2) 争议点分析
3) 当前可信判断
4) 后续核验建议
[/FINAL_PROMPT]
`,
    '人物设定': `
# Final Output Format（人物设定）
当信息收集完毕，生成最终 Prompt 时，请使用以下结构，并将其完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role]
你是角色设计师，目标是构建逻辑自洽、可持续扩展的人物设定。

# [Character Core]
- 角色身份与背景：
- 核心动机与目标：
- 主要冲突与弱点：

# [Character Design]
- 外在特征（外貌/服装/标志元素）
- 内在性格（价值观/行为模式）
- 关系网络（盟友/对手/关键关系）
- 成长弧线（起点->转折->阶段目标）

# [Constraints]
- 保持设定一致性与可叙事性。
- 可增加记忆点，但不破坏人物逻辑。

# [Output]
- 人设卡片（可复用）
- 口吻与行为示例（可选）
- 典型场景钩子（1-3 条）
[/FINAL_PROMPT]
`,
  };

  return templateMatrix[mode] || `
# Final Output Format（通用模板）
当信息收集完毕，生成最终 Prompt 时，必须包含以下标记并严格排版，完整放入 [FINAL_PROMPT] 标签内：
[STATUS: READY_TO_GENERATE]
[FINAL_PROMPT]
# [Role] ...
# [Context] ...
# [Task] ...
# [Constraints] ...
# [Output] ...
[/FINAL_PROMPT]
`;
}

type RoundDecision =
  | 'FORCE_FINALIZE_MAX_REACHED'
  | 'COLLECT_MORE_UNDER_MIN'
  | 'CONTINUE_COLLECTING'
  | 'EARLY_FINALIZE_READY';

/**
 * =============================================================================
 * 02.8) 轮次控制状态机（代码级强约束）
 * -----------------------------------------------------------------------------
 * 作用：
 * - 在每轮发送前根据“已追问轮次 + 信息充分度 + 区间上下限”做决策。
 * - 决策结果注入当前消息，驱动模型执行“继续追问”或“最终收束”。
 *
 * 状态策略：
 * - 已达上限：强制收束输出最终 Prompt
 * - 未达下限：即使信息较充分，也继续追问 1 个关键问题
 * - 区间内且信息充分：允许提前收束
 * - 区间内且信息不足：继续追问
 * =============================================================================
 */
function decideRoundAction(
  askedRounds: number,
  minRounds: number,
  maxRounds: number,
  readiness: { ready: boolean }
): RoundDecision {
  if (askedRounds >= maxRounds) return 'FORCE_FINALIZE_MAX_REACHED';
  if (askedRounds < minRounds && readiness.ready) return 'COLLECT_MORE_UNDER_MIN';
  if (readiness.ready) return 'EARLY_FINALIZE_READY';
  return 'CONTINUE_COLLECTING';
}

function buildRoundControlInstruction(
  decision: RoundDecision,
  askedRounds: number,
  minRounds: number,
  maxRounds: number,
  readiness: { score: number; threshold: number; ready: boolean }
): string {
  if (decision === 'FORCE_FINALIZE_MAX_REACHED') {
    return `
[控制指令 - 轮次状态机]
- 已追问轮次：${askedRounds}（达到上限 ${maxRounds}）
- 当前信息充分度：${readiness.score}/${readiness.threshold}
- 必须立即收束：不要继续提问，直接输出最终 Prompt，并包含 [STATUS: READY_TO_GENERATE]。`;
  }

  if (decision === 'COLLECT_MORE_UNDER_MIN') {
    return `
[控制指令 - 轮次状态机]
- 已追问轮次：${askedRounds}（未达到下限 ${minRounds}）
- 当前信息充分度：${readiness.score}/${readiness.threshold}
- 继续追问：本轮必须只问 1 个关键问题，不要直接输出最终 Prompt。`;
  }

  if (decision === 'EARLY_FINALIZE_READY') {
    return `
[控制指令 - 轮次状态机]
- 已追问轮次：${askedRounds}（区间 ${minRounds}~${maxRounds} 内）
- 当前信息充分度：${readiness.score}/${readiness.threshold}
- 允许提前收束：直接输出最终 Prompt，并包含 [STATUS: READY_TO_GENERATE]。`;
  }

  return `
[控制指令 - 轮次状态机]
- 已追问轮次：${askedRounds}（区间 ${minRounds}~${maxRounds} 内）
- 当前信息充分度：${readiness.score}/${readiness.threshold}
- 继续追问：本轮只问 1 个关键缺口，不要输出最终 Prompt。`;
}

type MessageSource = 'user' | 'option_button' | 'system_control';

type SelectionPayload = {
  id: string;
  label: string;
};

type SendMessageParams = {
  message: string;
  // 前端可用：静默消息不会影响服务端处理，仅用于 UI 层决定是否展示用户气泡
  silent?: boolean;
  // 前端可用：标记消息来源，便于埋点与行为分析
  source?: MessageSource;
  // 前端可用：选项按钮回填时透传被选项信息
  selection?: SelectionPayload;
};

type UiOption = {
  id: string;
  label: string;
  reply: string;
};

type UiPayload = {
  options?: UiOption[];
  finalPrompt?: string;
  readyToGenerate?: boolean;
};

type StreamChunk = {
  text?: string;
  ui?: UiPayload;
};

function normalizeOptionIdByIndex(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26)); // A-Z
  const cycle = Math.floor(index / 26);
  return cycle === 0 ? letter : `${letter}${cycle + 1}`;
}

function parseKeyValuePairs(segment: string): Record<string, string> {
  const pairs = segment.split('|');
  const result: Record<string, string> = {};

  for (const pair of pairs) {
    const sepIndex = pair.indexOf(':');
    if (sepIndex <= 0) continue;
    const key = pair.slice(0, sepIndex).trim();
    const value = pair.slice(sepIndex + 1).trim();
    if (key && value) result[key] = value;
  }

  return result;
}

function extractUiPayload(rawText: string): { cleanedText: string; ui: UiPayload } {
  const ui: UiPayload = {};
  let cleanedText = rawText;

  const finalPromptRegex = /\[FINAL_PROMPT\]([\s\S]*?)\[\/FINAL_PROMPT\]/i;
  const finalPromptMatch = rawText.match(finalPromptRegex);
  if (finalPromptMatch) {
    const finalPrompt = finalPromptMatch[1].trim();
    if (finalPrompt) ui.finalPrompt = finalPrompt;
    cleanedText = cleanedText.replace(finalPromptMatch[0], '').trim();
  }

  const uiMetaRegex = /\[UI_META\]([\s\S]*?)\[\/UI_META\]/i;
  const uiMetaMatch = rawText.match(uiMetaRegex);
  if (uiMetaMatch) {
    const block = uiMetaMatch[1];
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const options: UiOption[] = [];
    let uiType = '';

    for (const line of lines) {
      if (line.startsWith('type=')) {
        uiType = line.slice(5).trim();
        continue;
      }

      if (!line.startsWith('option=')) continue;
      const payload = parseKeyValuePairs(line.slice(7));
      if (payload.id && payload.label && payload.reply) {
        options.push({ id: payload.id, label: payload.label, reply: payload.reply });
      }
    }

    if (uiType === 'options' && options.length > 0) {
      // 统一选项 id 为 A/B/C... 格式，确保前端按钮映射稳定。
      ui.options = options.map((option, index) => ({
        ...option,
        id: normalizeOptionIdByIndex(index),
      }));
    }

    if (uiType === 'final_prompt') {
      ui.readyToGenerate = true;
    }

    cleanedText = cleanedText.replace(uiMetaMatch[0], '').trim();
  }

  const hasStatusReady = /\[STATUS:\s*READY_TO_GENERATE\]/i.test(rawText);
  if (hasStatusReady) {
    ui.readyToGenerate = true;
    cleanedText = cleanedText.replace(/\[STATUS:\s*READY_TO_GENERATE\]/gi, '').trim();
    if (!ui.finalPrompt) {
      // 没有显式 FINAL_PROMPT 块时，兜底把清洗后的回复作为可复制内容
      ui.finalPrompt = cleanedText;
    }
  }

  return { cleanedText, ui };
}

class ControlledPromptSession {
  private baseSession: any;
  private minRounds: number;
  private maxRounds: number;
  private askedRounds = 0;
  private userMessages: string[] = [];
  private finalized = false;

  constructor(baseSession: any, intensity: number) {
    this.baseSession = baseSession;
    const range = getRoundRangeByIntensity(intensity);
    this.minRounds = range.min;
    this.maxRounds = range.max;
  }

  async *sendMessageStream({ message, silent, source, selection }: SendMessageParams): AsyncGenerator<StreamChunk> {
    this.userMessages.push(message || '');
    const readiness = evaluateInformationSufficiency(this.userMessages);
    const decision = this.finalized
      ? 'EARLY_FINALIZE_READY'
      : decideRoundAction(this.askedRounds, this.minRounds, this.maxRounds, readiness);

    const controlInstruction = buildRoundControlInstruction(
      decision,
      this.askedRounds,
      this.minRounds,
      this.maxRounds,
      readiness
    );

    const controlledMessage = `${message}

${controlInstruction}`;

    // DeepSeek 走“临时控制指令”通道：控制信息参与本轮决策，但不写入长期历史，避免污染上下文。
    const stream = await (this.baseSession instanceof DeepSeekChatSession
      ? this.baseSession.sendMessageStream({ message, controlInstruction, silent, source, selection })
      : this.baseSession.sendMessageStream({ message: controlledMessage }));
    let assistantText = '';

    for await (const chunk of stream) {
      const text = (chunk as StreamChunk)?.text || '';
      assistantText += text;
      yield chunk as StreamChunk;
    }

    const parsed = extractUiPayload(assistantText);
    const isReady = parsed.ui.readyToGenerate || assistantText.includes('[STATUS: READY_TO_GENERATE]');

    if (isReady) {
      this.finalized = true;
    } else {
      // 未进入最终输出时，按 1 轮追问计数；确保不会无限增长
      this.askedRounds = Math.min(this.askedRounds + 1, this.maxRounds);
    }

    // 在流结束补发一条 ui 元信息事件，不影响既有 text 流消费。
    if (parsed.ui.options?.length || parsed.ui.finalPrompt || parsed.ui.readyToGenerate) {
      yield { ui: parsed.ui };
    }
  }
}

function createControlledSessionProxy(baseSession: any, intensity: number): any {
  const controlled = new ControlledPromptSession(baseSession, intensity) as any;
  return new Proxy(controlled, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      const base = target.baseSession;
      const value = base?.[prop];
      return typeof value === 'function' ? value.bind(base) : value;
    },
  });
}

/**
 * =============================================================================
 * 03) DeepSeek 会话适配层（流式输出）
 * -----------------------------------------------------------------------------
 * 作用：
 * - 对齐 Gemini chat session 的使用方式，提供 sendMessageStream。
 * - 管理历史消息，向 DeepSeek 接口发起 stream 请求并逐段 yield 文本。
 *
 * 维护提示：
 * - history 结构是上下文连续性的核心，不要随意改变 role/content 形态。
 * - SSE 解析逻辑对格式较敏感，改动前建议先做回归验证。
 * =============================================================================
 */
class DeepSeekChatSession {
  private history: { role: string, content: string }[] = [];
  private apiKey: string;
  private temperature: number;

  constructor(apiKey: string, systemInstruction: string, temperature: number) {
    this.apiKey = apiKey;
    this.temperature = temperature;
    this.history.push({ role: 'system', content: systemInstruction });
  }

  async *sendMessageStream({
    message,
    controlInstruction,
  }: {
    message: string;
    controlInstruction?: string;
    silent?: boolean;
    source?: MessageSource;
    selection?: SelectionPayload;
  }): AsyncGenerator<StreamChunk> {
    // Step A: 先写入用户输入，确保本轮请求携带完整上下文
    this.history.push({ role: 'user', content: message });

    // 控制指令只在当前轮次生效，不写回历史，避免多轮后上下文被控制文本淹没。
    const messagesForRequest = controlInstruction
      ? [
        ...this.history.slice(0, -1),
        { role: 'system', content: controlInstruction },
        this.history[this.history.length - 1],
      ]
      : this.history;

    // Step B: 以 OpenAI 兼容格式调用 DeepSeek 聊天接口（开启流式）
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messagesForRequest,
        temperature: this.temperature,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let aiMessage = '';

    if (reader) {
      let buffer = '';
      let doneBySentinel = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Step C: 逐块解码并按行拆分，处理 SSE 的 data: 前缀
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          if (trimmedLine === 'data: [DONE]') {
            doneBySentinel = true;
            break;
          }
          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6));
              const text = data.choices[0]?.delta?.content || '';
              if (text) {
                // Step D: 累积完整回复，并向上游持续输出增量文本
                aiMessage += text;
                yield { text };
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
        if (doneBySentinel) break;
      }
    }

    // Step E: 流式结束后，把本轮完整 assistant 回复写回历史
    this.history.push({ role: 'assistant', content: aiMessage });
  }
}

/**
 * =============================================================================
 * 04) 对外入口：创建聊天会话（Gemini 优先，DeepSeek 兜底）
 * -----------------------------------------------------------------------------
 * 执行顺序：
 * 1. 解析可用的 Gemini Key（优先入参，其次环境变量）
 * 2. 选择 Gemini 目标模型版本
 * 3. 组装 systemInstruction（角色 + 动态策略 + 输出约束）
 * 4. 按 key 情况路由到 Gemini 或 DeepSeek
 *
 * 兼容约束：
 * - 不改变函数签名，保持既有调用方可直接复用。
 * - 返回对象保持与原实现一致（Gemini chat session / DeepSeek session）。
 * =============================================================================
 */
export function createChatSession(
  apiKey: string,
  deepseekApiKey: string,
  model: string, 
  mode: string, 
  temperature: number, 
  intensity: number, 
  questionDepth: number = 3 // 问题深度，范围1-5
) {
  const normalizedTemperature = normalizeTemperature(temperature);
  const finalPromptTemplate = getFinalPromptTemplateByMode(mode);

  // Step 1) 统一解析 Gemini Key 来源（入参优先，环境变量兜底）
  const rawGeminiKey = apiKey || (globalThis as { process?: { env?: { GEMINI_API_KEY?: string } } }).process?.env?.GEMINI_API_KEY;
  const actualGeminiKey = rawGeminiKey ? rawGeminiKey.trim().replace(/[^\x00-\x7F]/g, "") : undefined;
  const actualDeepseekKey = deepseekApiKey ? deepseekApiKey.trim().replace(/[^\x00-\x7F]/g, "") : undefined;

  // Step 2) Gemini 模型选择策略（显式传入 key 时使用更高版本）
  const targetModel = actualGeminiKey ? 'gemini-2.5-flash' : 'gemini-2.0-flash';

  // Step 3) 组装系统提示词：角色、上下文策略、交互流程、输出格式
  const systemInstruction = `
# Role
你是一个顶级的“Prompt架构师”。你的任务是通过启发式对话，深度挖掘用户的独特需求，并最终生成完美适配 ${model} 的高质量指令。

# Context
${getHeuristicGuidance(model, mode, questionDepth)}
${getModelStrategy(model, mode)}
${getIntensityGuidance(intensity)}

# Workflow
1. **深度情境分析**：根据用户输入的内容，结合启发式框架，思考当前业务场景中最需要明确的 1 个核心维度（如：数据结构、逻辑框架、视觉光影、情绪基调等）。
2. **启发式追问**：向用户提出 1 个深入具体业务场景的核心问题。
3. **灵活引导**：根据当前信息完整度选择最佳方式：
    - 如果用户需求已经比较清晰，可以提供 2-3 个具有启发性的选项供选择。
    - 如果当前信息过于模糊或关键条件缺失，应优先提出一个开放式问题，让用户进一步描述需求，而不是强行给出选项。
4. **轮次控制（强约束）**：遵循“追问轮次区间”推进。达到信息充分条件时，允许提前收束并输出最终 Prompt；若仍不充分，可继续追问但不得超过上限轮次。

# Output Constraints (极高优先级)
- **避免机械选项**：当问题本身需要用户自由描述时，不要强行提供选择题。
- **拒绝重复**：严禁在单次回复中重复相同的短语或逻辑。不要复读。
- **单一序列**：回复必须是单一、连贯的对话段落。严禁输出多个版本的尝试或对比。
- **直接对话**：不要输出任何系统设定标签（如[启发式动态思考框架]等），直接以自然语言对话。
- **对话起始**：自然地反馈用户的具体需求，例如：“针对您提到的这个主题，为了充分发挥 ${model} 在 ${mode} 方面的优势，我们需要进一步确认...”
- **单轮输出二选一**：每一轮只能选择一种输出形态：
  1) 仅提出 1 个问题（开放式补全），不提供选项；
  2) 提出 1 个选择题并给出可点击选项。
- **禁止混合形态**：同一轮中不得同时出现“开放式追问 + 选项列表”。

# UI Integration Protocol（前端交互协议）
- 当你给出“可点击选项”时，请在回复末尾追加：
  [UI_META]
  type=options
  option=id:A|label:选项文案|reply:用户点击后应静默提交给模型的回复文本
  option=id:B|label:选项文案|reply:用户点击后应静默提交给模型的回复文本
  [/UI_META]
- 选项 id 必须使用大写字母序列（A/B/C...），数量不固定，但必须连续且不重复。
- 当你输出最终 Prompt 时，请在回复末尾追加：
  [UI_META]
  type=final_prompt
  [/UI_META]
  [FINAL_PROMPT]
  <这里必须包含完整的最终提示词正文，包括 [Role], [Objective], [Context], [Method], [Constraints], [Output] 等所有部分，而不仅仅是 Output 部分>
  [/FINAL_PROMPT]

${finalPromptTemplate}
`;

  // Step 4) 路由与模型调用逻辑（Gemini 优先，DeepSeek 作为备选）
  if (apiKey && actualGeminiKey) {
    // 用户显式提供了 Gemini Key，优先使用
    const ai = new GoogleGenAI({ apiKey: actualGeminiKey });
    const chat = ai.chats.create({
      model: targetModel,
      config: {
        systemInstruction,
        temperature: normalizedTemperature,
      },
    });
    return createControlledSessionProxy(chat, intensity);
  } else if (actualDeepseekKey) {
    // 用户显式提供了 DeepSeek Key
    const deepSeekSession = new DeepSeekChatSession(actualDeepseekKey, systemInstruction, normalizedTemperature);
    return createControlledSessionProxy(deepSeekSession, intensity);
  } else if (actualGeminiKey) {
    // 环境变量中存在 Gemini Key，作为兜底
    const ai = new GoogleGenAI({ apiKey: actualGeminiKey });
    const chat = ai.chats.create({
      model: targetModel,
      config: {
        systemInstruction,
        temperature: normalizedTemperature,
      },
    });
    return createControlledSessionProxy(chat, intensity);
  } else {
    throw new Error("请在设置中提供 Gemini 或 DeepSeek 的 API Key");
  }
}