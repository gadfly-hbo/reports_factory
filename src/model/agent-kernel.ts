import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { TODO_CONTEXT } from '@earendil-works/pi-agent-core';
import { loadSkills, formatSkillsForSystemPrompt, formatSkillInvocation, type Skill } from '@earendil-works/pi-agent-core';

/**
 * agent 适配 kernel（AGENT-RUNTIME §4.1 适配层单点；M10 G3 装配阶梯 C）：
 * 业务代码零直接 `@earendil-works/*` import——全部经本文件收敛。
 *
 * 承载分工：
 * - pi-agent-core：skills 机制（SKILL.md 目录装载 → system prompt 注入 → 显式调用格式化）。
 *   AgentHarness（lane/session/operation 全量装配）按 G3 优先级评估后判定与工人单发形态冲突：
 *   六步工人调用必须保留 LlmStageClient 的主备熔断链 + 录制回放测试基建 + §10 坑规避（transport 层），
 *   AgentHarness 绑定自有 streamFn/session，接入即需在其内重造上述三样——收益为零。
 *   后续对话式形态（§8 闸门通过后）再评估启用 AgentHarness。
 * - pi-ai（既有 pi-transport/LlmStageClient）：模型调用、主备链、录制回放（不变）。
 *
 * 装配形态在 docs/agent-runtime-compliance.md 记账（D-1 撤销 + D-4）。
 */

export interface PptSkillSet {
  /** 已装载的 skills（按 name 索引） */
  byName: Map<string, Skill>;
  /** 注入每次工人调用的 system prompt 块（formatSkillsForSystemPrompt 产物） */
  systemPromptBlock: string;
  /** 装载诊断（警告文本，供日志；装载失败不阻塞、降级为空集） */
  diagnostics: string[];
}

let cached: Promise<PptSkillSet> | undefined;

/** skills 目录：仓库 assets/skills（随代码版本化；REPORT_STUDIO_SKILLS_DIR 可覆盖） */
export function skillsDir(): string {
  const override = process.env['REPORT_STUDIO_SKILLS_DIR'];
  if (override) return override;
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'skills');
}

/** 装载 PPT skill 集（进程内缓存） */
export async function loadPptSkills(): Promise<PptSkillSet> {
  cached ??= (async () => {
    const env = new NodeExecutionEnv({ cwd: process.cwd() });
    const { skills, diagnostics } = await loadSkills(env, skillsDir(), TODO_CONTEXT);
    const byName = new Map(skills.map((s) => [s.name, s]));
    // 标准化 location 字段为仓库内相对路径：避免不同部署机器的绝对路径污染 replay 键
      const normalizedSkills = skills.map((sk) => {
        const rel = sk.filePath.split('assets/skills/').pop() ?? sk.filePath.split(/[/\\]/).pop() ?? 'SKILL.md';
        return { ...sk, filePath: 'assets/skills/' + rel };
      });
      const systemPromptBlock = normalizedSkills.length > 0 ? formatSkillsForSystemPrompt(normalizedSkills) : '';
    return { byName, systemPromptBlock, diagnostics: diagnostics.map((d) => `${d.code}: ${d.message}`) };
  })();
  return cached;
}

/** 测试/多项目辅助：清空装载缓存 */
export function resetPptSkillsCache(): void {
  cached = undefined;
}

/** 取指定 skill；缺失抛 UnknownSkill 语义错误（编程错误，不静默降级） */
export async function getPptSkill(name: string): Promise<Skill> {
  const set = await loadPptSkills();
  const skill = set.byName.get(name);
  if (!skill) {
    throw Object.assign(new Error(`skill 未注册：${name}（可用：${[...set.byName.keys()].join(', ') || '无'}）`), {
      code: 'UnknownSkill',
    });
  }
  return skill;
}

export interface WorkerRequest {
  system: string;
  user: string;
}

/**
 * 工人调用请求构造（§4.6 上下文装配单点）：
 * system = PPT skill 守则全集（formatSkillsForSystemPrompt）+ 本环节任务指令（输出 schema/任务描述由调用方给出）；
 * user = 结构化载荷 JSON（材料上下文已由调用方按语义投影组装）。
 * 产物交 LlmStageClient（主备熔断/录制回放/§10 规避）执行。
 */
export async function buildWorkerRequest(input: {
  /** 守则 skill 名（当前唯一：'ppt-report'；不存在即抛 UnknownSkill） */
  skillName?: string;
  /** 本环节任务指令（含输出 schema 与该环节重点守则引用） */
  stageInstruction: string;
  /** 结构化载荷（材料/页面/边界等） */
  payload: unknown;
}): Promise<WorkerRequest> {
  let system = '';
  if (input.skillName) {
    const set = await loadPptSkills();
    await getPptSkill(input.skillName); // 未注册即抛（fail-closed）
    system += set.systemPromptBlock;
  }
  system = [system, input.stageInstruction].filter(Boolean).join('\n\n');
  return { system, user: JSON.stringify(input.payload, null, 1) };
}

/** 显式调用格式化（S4/S6 逐页调用可选用形态）：skill 定位语 + 附加指令 */
export async function formatInvocation(skillName: string, additionalInstructions?: string): Promise<string> {
  const skill = await getPptSkill(skillName);
  return formatSkillInvocation(skill, additionalInstructions);
}
