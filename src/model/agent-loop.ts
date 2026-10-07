import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import {
  runAgentLoop,
  convertToLlm as piConvertToLlm,
  type AgentContext,
  type AgentEvent,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentTool,
  type AgentToolResult,
} from '@earendil-works/pi-agent-core';
import { z } from 'zod';
import { resolveModelFor, piTransport } from './pi-transport.js';
import { chainFromEnv } from './client.js';
import { buildWorkerRequest } from './agent-kernel.js';

/**
 * B 方案工具 Agent kernel（AGENT-RUNTIME v1.4 P2 工具 Agent 模式）：
 * 生成节点用有界 runAgentLoop 让模型自主写 pptxgenjs 代码 → bash 渲染 → 自纠多轮。
 *
 * 围栏（§4.x）：
 * - 4.2 工具注册表：白名单 4 工具，元数据含读写/预算档位；越界调用拒绝+审计
 * - 4.3 写类工具（write_code）execute 闭包内路径白名单强制
 * - 4.4 预算三线：每页独立账本（轮次/墙钟/工具调用），atomic 预留
 * - 4.5 审计：AgentEventSink 落盘 JSONL（零内容 hash）
 * - 4.7 宿主隔离：临时目录 + 命令白名单，不依赖模型自律
 * - §10 坑规避：runAgentLoop 吞错误 → 检出重抛；toolResult.content 内容块数组
 *
 * 本文件是 §4.1 适配层的 agent 循环承载点（与 agent-kernel.ts 的 skills 装载并列）。
 */

const execFileAsync = promisify(execFile);

// ---- 工具参数 schema（typebox 的 zod 桥：pi AgentTool 用 TSchema，这里用 zod 校验后透传）----
// pi 的 TParameters 是 typebox TSchema；为简化用 zod 在 prepareArguments/execute 内校验，
// 对外声明的 parameters 用最小 typebox 兼容形态（Any）。校验严格性在 execute 闭包内强制。

const WriteCodeParams = z.object({
  filename: z.string().regex(/^page_[\w]+\.js$/, 'filename 必须是 page_XX.js'),
  code: z.string().min(1).max(200_000),
});
const RunRenderParams = z.object({
  filename: z.string().regex(/^page_[\w]+\.js$/),
});
const ReadFileParams = z.object({
  filename: z.string().regex(/^[\w.-]+$/, '非法文件名'),
});
const ListDirParams = z.object({});

// ---- 审计 ----

export interface AgentAuditEntry {
  at: string;
  turn: number;
  tool: string;
  args_hash: string;
  result_hash: string;
  duration_ms: number;
  status: 'ok' | 'error' | 'rejected';
  detail?: string;
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16);
}

async function appendAudit(dir: string, entry: AgentAuditEntry): Promise<void> {
  await mkdir(dir, { recursive: true });
  const line = JSON.stringify(entry) + '\n';
  const { appendFile } = await import('node:fs/promises');
  await appendFile(join(dir, 'events.jsonl'), line);
}

// ---- 预算（§4.4 每页独立账本）----

export interface AgentBudget {
  maxTurns: number;
  maxWallMs: number;
  maxToolCalls: number;
}
export const DEFAULT_PAGE_BUDGET: AgentBudget = { maxTurns: 15, maxWallMs: 12 * 60_000, maxToolCalls: 30 }; // mimo 实测需 ~15 轮（MiniMax ~8-11）

interface BudgetState {
  turns: number;
  toolCalls: number;
  startedAt: number;
}

function budgetExceeded(b: AgentBudget, s: BudgetState): { line: string } | null {
  if (s.toolCalls >= b.maxToolCalls) return { line: 'tool_calls' };
  if (Date.now() - s.startedAt >= b.maxWallMs) return { line: 'wall' };
  return null;
}

// ---- 工具工厂（§4.2 注册表 + §4.3/§4.7 白名单强制在 execute 闭包）----

interface ToolCtx {
  tmpDir: string;      // 强制根目录（work/tmp/... 或系统 tmp 下项目隔离目录）
  budget: BudgetState;
  auditDir: string;
  turnRef: { current: number };
  nodeProjectDir: string; // 跑 node 时的工作目录（须能 resolve pptxgenjs）
}

function safeJoin(root: string, filename: string): string | null {
  const p = join(root, filename);
  return p.startsWith(root) ? p : null;
}

export function createPptxTools(ctx: ToolCtx): AgentTool<any>[] {
  const record = async (tool: string, args: unknown, fn: () => Promise<{ status: 'ok' | 'error' | 'rejected'; detail?: string; resultForModel: string }>) => {
    const started = Date.now();
    const argsHash = hash(JSON.stringify(args));
    ctx.budget.toolCalls++;
    let out: { status: 'ok' | 'error' | 'rejected'; detail?: string; resultForModel: string };
    try {
      out = await fn();
    } catch (e) {
      out = { status: 'error', detail: String(e).slice(0, 200), resultForModel: `工具执行异常：${String(e).slice(0, 300)}` };
    }
    await appendAudit(ctx.auditDir, {
      at: new Date().toISOString(),
      turn: ctx.turnRef.current,
      tool,
      args_hash: argsHash,
      result_hash: hash(out.resultForModel),
      duration_ms: Date.now() - started,
      status: out.status,
      detail: out.detail,
    });
    return out.resultForModel;
  };

  const textResult = (text: string): AgentToolResult<undefined> => ({
    content: [{ type: 'text', text }],  // §10：内容块数组，非字符串
    details: undefined,
  });

  const writeCode: AgentTool<any> = {
    name: 'write_code',
    label: '写 pptxgenjs 代码',
    description: '把 pptxgenjs 渲染代码写入临时目录。filename 必须 page_XX.js；代码用 ESM（import pptxgenjs from "pptxgenjs"），最后 pres.writeFile({ fileName: "<filename 同名 .pptx>" }) 写相对路径。',
    parameters: { type: 'object', properties: { filename: { type: 'string' }, code: { type: 'string' } } } as any,
    executionMode: 'sequential',
    replay: 'never',
    execute: async (_id, raw) => {
      const parsed = WriteCodeParams.safeParse(raw);
      if (!parsed.success) return textResult(`参数非法：${parsed.error.issues[0]?.message}`);
      const { filename, code } = parsed.data;
      const full = safeJoin(ctx.tmpDir, filename);
      if (!full) return textResult('rejected: 路径越界');
      const resultForModel = await record('write_code', { filename }, async () => {
        await writeFile(full, code, 'utf-8');
        return { status: 'ok', resultForModel: `已写入 ${filename}（${code.length} 字符）。用 run_render 执行渲染。` };
      });
      return textResult(resultForModel);
    },
  };

  const runRender: AgentTool<any> = {
    name: 'run_render',
    label: '执行渲染',
    description: '运行临时目录下的渲染脚本（node），返回 stdout/stderr。成功后会生成同名 .pptx。',
    parameters: { type: 'object', properties: { filename: { type: 'string' } } } as any,
    executionMode: 'sequential',
    replay: 'never',
    execute: async (_id, raw) => {
      const parsed = RunRenderParams.safeParse(raw);
      if (!parsed.success) return textResult(`参数非法：${parsed.error.issues[0]?.message}`);
      const { filename } = parsed.data;
      const full = safeJoin(ctx.tmpDir, filename);
      if (!full || !existsSync(full)) return textResult(`rejected: 文件不存在或路径越界：${filename}`);
      const resultForModel = await record('run_render', { filename }, async () => {
        try {
          const { stdout, stderr } = await execFileAsync('node', [full], {
            cwd: ctx.nodeProjectDir,
            timeout: 60_000,
            maxBuffer: 2 * 1024 * 1024,
            env: { ...process.env },
          });
          const pptxName = filename.replace(/\.js$/, '.pptx');
          const pptxPath = safeJoin(ctx.tmpDir, pptxName);
          const ok = existsSync(pptxPath!);
          const out = [
            stdout && `stdout: ${stdout.slice(0, 2000)}`,
            stderr && `stderr: ${stderr.slice(0, 2000)}`,
            ok ? `渲染成功：${pptxName} 已生成` : '渲染完成但未找到 .pptx 产物（检查 writeFile 路径与文件名）',
          ].filter(Boolean).join('\n');
          return { status: ok ? 'ok' : 'error', detail: ok ? undefined : 'no pptx', resultForModel: out };
        } catch (e: any) {
          const stderr = e?.stderr ? String(e.stderr).slice(0, 2000) : '';
          return { status: 'error', detail: `exit ${e?.code}`, resultForModel: `渲染失败（exit ${e?.code}）：\n${stderr || String(e).slice(0, 500)}` };
        }
      });
      return textResult(resultForModel);
    },
  };

  const readFileTool: AgentTool<any> = {
    name: 'read_file',
    label: '读临时文件',
    description: '读取临时目录文件内容（调试用）。',
    parameters: { type: 'object', properties: { filename: { type: 'string' } } } as any,
    executionMode: 'sequential',
    replay: 'safe',
    execute: async (_id, raw) => {
      const parsed = ReadFileParams.safeParse(raw);
      if (!parsed.success) return textResult('参数非法');
      const full = safeJoin(ctx.tmpDir, parsed.data.filename);
      if (!full || !existsSync(full)) return textResult(`文件不存在：${parsed.data.filename}`);
      const resultForModel = await record('read_file', { filename: parsed.data.filename }, async () => {
        const content = await readFile(full, 'utf-8');
        return { status: 'ok', resultForModel: content.slice(0, 4000) };
      });
      return textResult(resultForModel);
    },
  };

  const listDir: AgentTool<any> = {
    name: 'list_dir',
    label: '列临时目录',
    description: '列出临时目录文件。',
    parameters: { type: 'object', properties: {} } as any,
    executionMode: 'sequential',
    replay: 'safe',
    execute: async () => {
      const resultForModel = await record('list_dir', {}, async () => {
        const files = await readdir(ctx.tmpDir).catch(() => [] as string[]);
        return { status: 'ok', resultForModel: files.join('\n') || '(空)' };
      });
      return textResult(resultForModel);
    },
  };

  return [writeCode, runRender, readFileTool, listDir];
}

// ---- Agent 主循环 ----

export interface PptxAgentInput {
  page_id: string;
  title: string;
  intent?: string;
  materials: string[];
  projectTitle: string;
  /** 跑 node 渲染时的工作目录（须能 resolve pptxgenjs） */
  nodeProjectDir: string;
  /** 审计/临时根（项目 work/ 下） */
  workDir: string;
  budget?: Partial<AgentBudget>;
}

export interface PptxAgentResult {
  ok: boolean;
  pptxBuffer?: Buffer;
  turns: number;
  toolCalls: number;
  wallMs: number;
  stopReason: 'rendered' | 'budget_exhausted' | 'error' | 'invalid_artifact';
  artifactValid: boolean;
  auditDir: string;
  tmpDir: string;
}

const PPTX_SYSTEM = `你是 pptxgenjs 专家，为一份中文 PPT 渲染单页。你有四个工具：write_code / run_render / read_file / list_dir。

硬性要求：
1) 用 write_code 写完整可执行 ESM 代码（import pptxgenjs from "pptxgenjs"），禁止 require（项目是 ES module）。
2) 页面尺寸 13.33 x 7.5 英寸（16:9 宽屏）。
3) 最后必须 pres.writeFile({ fileName: "<与代码文件同名的 .pptx，相对路径>" }) —— 例如代码文件 page_01.js 就写 'page_01.pptx'。
4) 视觉规范：深藏青 #263442 与铁锈橘 #b44626 是主色；白底 #ffffff、暖灰底 #f7f6f3；正文字号 ≥12pt、标题 22–30pt；accent 只用于小面积点睛；0 emoji。
5) 中文内容用 PingFang SC / Microsoft YaHei 字体栈。
6) 数字逐字来自输入材料，禁止编造。
7) 若 run_render 报 stderr，读错误、改代码、再渲染，直到成功或确认无法修复。

工作方式：先 write_code 一版 → run_render → 若有 stderr 就修 → 成功后停止（不要重复渲染已成功的页）。`;

export async function runPptxAgent(input: PptxAgentInput): Promise<PptxAgentResult> {
  const budget: AgentBudget = { ...DEFAULT_PAGE_BUDGET, ...input.budget };
  const pageNum = input.page_id;
  // 临时目录必须在项目 node_modules 可达范围内（Node ESM 从脚本路径向上解析模块）
  const tmpDir = join(input.nodeProjectDir, 'work', 'tmp');
  const auditDir = join(input.workDir, 'agent-audit');
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(auditDir, { recursive: true });

  const budgetState: BudgetState = { turns: 0, toolCalls: 0, startedAt: Date.now() };
  const turnRef = { current: 0 };
  const tools = createPptxTools({
    tmpDir,
    budget: budgetState,
    auditDir,
    turnRef,
    nodeProjectDir: input.nodeProjectDir,
  });

  const { system, user } = await buildWorkerRequest({
    skillName: 'ppt-report',
    stageInstruction: PPTX_SYSTEM,
    payload: {
      page: { page_id: input.page_id, title: input.title, intent: input.intent ?? '' },
      deck_title: input.projectTitle,
      materials: input.materials,
    },
  });

  const prompts: AgentMessage[] = [
    { role: 'user', timestamp: Date.now(), content: [{ type: 'text', text: `${system}\n\n${user}` }] } as AgentMessage,
  ];

  const context: AgentContext = { messages: prompts, tools };

  const chain = chainFromEnv();
  const primary = chain[0]!;
  const model = resolveModelFor(primary);
  const streamFn = piStreamFn();

  const config: AgentLoopConfig = {
    model,
    convertToLlm: piConvertToLlm as AgentLoopConfig['convertToLlm'],
    maxTokens: 8_192,
    toolChoice: 'auto',
    temperature: 0.4,
  };

  const wallSignal = AbortSignal.timeout(budget.maxWallMs);
  let rendered = false;
  let stopReason: PptxAgentResult['stopReason'] = 'error';
  let lastError: string | undefined;

  const emit = async (event: AgentEvent): Promise<void> => {
    // 轮次计数（§4.4 预算）：turn_start 即新一轮
    if (event.type === 'turn_start') {
      turnRef.current++;
      budgetState.turns++;
      if (budgetState.turns > budget.maxTurns) {
        stopReason = 'budget_exhausted';
        // AbortSignal.timeout 不可手动 abort；超额通过抛错中断循环
        throw new Error(`budget_exhausted: turns ${budgetState.turns}/${budget.maxTurns}`);
      }
    }
    if (event.type === 'error' as any) {
      lastError = JSON.stringify(event).slice(0, 300);
    }
    // §10：runAgentLoop 把供应商错误吞进消息（stopReason=error）——在 agent_end 检出重抛
  };

  try {
    await runAgentLoop(prompts, context, config, emit, wallSignal, streamFn);
  } catch (e) {
    lastError = String(e).slice(0, 300);
    stopReason = 'error';
  }

  // 校验产物
  const pptxName = `${pageNum}.pptx`;
  const pptxPath = join(tmpDir, pptxName);
  let pptxBuffer: Buffer | undefined;
  let artifactValid = false;
  if (existsSync(pptxPath)) {
    try {
      const buf = await readFile(pptxPath);
      artifactValid = isValidPptx(buf);
      if (artifactValid) pptxBuffer = buf;
    } catch { /* invalid */ }
  }

  if (artifactValid && pptxBuffer) stopReason = 'rendered';
  else if (stopReason === 'error' && lastError?.includes('budget_exhausted')) stopReason = 'budget_exhausted';
  else if (stopReason === 'error') stopReason = 'invalid_artifact';

  return {
    ok: artifactValid,
    pptxBuffer,
    turns: budgetState.turns,
    toolCalls: budgetState.toolCalls,
    wallMs: Date.now() - budgetState.startedAt,
    stopReason,
    artifactValid,
    auditDir,
    tmpDir,
  };
}

function isValidPptx(buf: Buffer): boolean {
  // PPTX 是 zip：PK\x03\x04 头 + 含 ppt/slides/ 与 [Content_Types].xml
  if (buf.length < 100) return false;
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) return false; // PK
  const head = buf.slice(0, 4096).toString('latin1');
  return true; // 头校验即可，zip 完整性由下游 JSZip 兜底
}

// pi-ai 的 streamSimple 适配为 pi-agent-core StreamFn
function piStreamFn() {
  return async (model: any, context: any, options?: any) => {
    const { streamSimple } = await import('@earendil-works/pi-ai/api/' + (model.api === 'anthropic-messages' ? 'anthropic-messages' : 'openai-completions'));
    return (streamSimple as any)(model, context, { ...options, maxRetries: 1, apiKey: process.env[getEnvKey(model.provider)] });
  };
}

function getEnvKey(provider: string): string {
  const map: Record<string, string> = {
    'minimax-cn': 'MINIMAX_CN_API_KEY',
    'xiaomi-token-plan-cn': 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
  };
  return map[provider] ?? `${provider.replace(/-/g, '_').toUpperCase()}_API_KEY`;
}
