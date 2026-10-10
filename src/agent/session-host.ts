import {
  createSessionRuntime,
  createExecutionTools,
  createLocalExecutionEnvironment,
  loadHarnessResources,
  RuntimeFault,
  type AuditEvent,
  type AuditSink,
  type Authorization,
  type BudgetStore,
  type HarnessObservation,
  type ModelConfig,
  type ModelTransport,
  type RunResult,
  type SessionInfo,
  type SessionRuntime,
  type SessionRuntimeOptions,
  type SessionStorage,
  type Tool,
  type UncappedLimits,
} from 'pi-agent-runtime';
import { mkdirSync, openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileBudgetStore } from './budget-store.js';
import { JsonlAuditSink } from './audit.js';
import { localAuthorize, LOCAL_POLICY_VERSION } from './authorize.js';
import type { JsonValue } from 'pi-agent-runtime';
import { proposeOutlineTool } from './tools/outline-tool.js';
import { renderDeckTool } from './tools/render-deck-tool.js';
import { qaDeckTool } from './tools/qa-deck-tool.js';
import { exportDeckTool } from './tools/export-deck-tool.js';
import { BUILD_SYSTEM, confirmedOutlinePrompt } from './prompts.js';
import type { OutlinePage } from './outline.js';

/**
 * 会话宿主（S2，AGENT-RUNTIME 原生 Harness 接入）：
 * 每项目一个 createSessionRuntime 实例 + 一个持续原生会话（JSONL 落盘，重启恢复）。
 * 适配层边界：本目录（src/agent/）是业务代码唯一触达 pi-agent-runtime 的位置。
 *
 * 宿主输入（INTEGRATION 五输入）：显式 transport（model.ts）、授权（authorize.ts）、
 * 预算（budget-store.ts，uncapped）、审计（audit.ts）、工具（原生 read/write/edit/bash + 自定义）。
 */

/** 用途标识（审计与 UI 归类用；未声明 purposes 集合时 run 不传 purpose——SDK 合同）。 */
export const PURPOSE = 'ppt-build';

/** 单次保护必填（uncapped 合同）：输出/模型/工具/控制 IO 各自独立计时封顶。 */
export const UNLIMITED_LIMITS: UncappedLimits = {
  cumulative: 'unlimited',
  maxOutputTokens: 32_768, // 与主模型单次输出上限一致（T3 真调教训：写代码轮 8192 不够）
  modelTimeoutMs: 600_000,
  toolTimeoutMs: 120_000,
  controlTimeoutMs: 30_000,
};

export interface SessionHostOptions {
  /** 项目数据根（data/<proj> 绝对路径）——会话 JSONL 与受限执行环境的边界 */
  projectRoot: string;
  /** PPT skill 目录（assets/skills/ppt） */
  skillsDir: string;
  model: ModelConfig;
  transport: ModelTransport;
  fallbacks?: ReadonlyArray<{ model: ModelConfig; transport: ModelTransport }>;
  /** 审计/账本文件（缺省 data/ 下中心文件） */
  auditFile?: string;
  budgetFile?: string;
}

export interface AgentEventForUi {
  at: string;
  kind: string;
  detail?: Record<string, unknown>;
}

/** 操作绑定持久文件（bindOperation 的幂等凭据 + reconcile 的对账依据）。 */
interface OperationBindings {
  version: 1;
  operations: Record<string, { taskId: string; purpose?: string }>;
}

export class SessionHost {
  readonly taskId: string;
  private readonly runtime: SessionRuntime;
  private session: SessionInfo | null = null;
  private readonly tools: readonly Tool[];
  private activeRun: Promise<RunResult<string>> | null = null;
  private lastOutcome: RunResult<string> | null = null;
  private readonly events: AgentEventForUi[] = [];
  private readonly eventListeners = new Set<(e: AgentEventForUi) => void>();
  private closed = false;

  private constructor(runtime: SessionRuntime, taskId: string, tools: readonly Tool[]) {
    this.runtime = runtime;
    this.taskId = taskId;
    this.tools = tools;
  }

  // ---- 事件（SSE 数据源；真实事件，零内容）----

  private recordEvent(e: AgentEventForUi): void {
    this.events.push(e);
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    for (const l of this.eventListeners) {
      try { l(e); } catch { /* 观察者异常不影响运行 */ }
    }
  }

  subscribe(listener: (e: AgentEventForUi) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  recentEvents(): AgentEventForUi[] {
    return [...this.events];
  }

  // ---- 装配 ----

  static async create(opts: SessionHostOptions): Promise<SessionHost> {
    const sessionRoot = join(opts.projectRoot, 'session');
    mkdirSync(sessionRoot, { recursive: true });
    mkdirSync(join(opts.projectRoot, 'work'), { recursive: true });

    // 专业内容：原生 skills 装载（宿主指定可信源）
    const resources = await loadHarnessResources({
      cwd: opts.projectRoot,
      sources: [{ kind: 'skills', path: opts.skillsDir, version: LOCAL_POLICY_VERSION }],
      authorize: async () => true,
    });
    for (const d of resources.diagnostics) {
      console.error(`[skills] ${d.kind}: ${d.path}`);
    }

    // 受限执行环境 + 原生文件/进程工具（目录边界 = 项目数据根；macOS 单进程 sandbox，禁网络/fork）
    const env = await createLocalExecutionEnvironment({
      root: opts.projectRoot,
      policyVersion: LOCAL_POLICY_VERSION,
      exclusiveWorkspace: true,
      maxFileBytes: 20_000_000,
      maxOutputBytes: 200_000,
      timeoutMs: UNLIMITED_LIMITS.toolTimeoutMs,
      processes: true,
    });
    const nativeTools = createExecutionTools(env, ['read', 'write', 'edit', 'bash']);
    const outlineTool = proposeOutlineTool(opts.projectRoot);
    const renderDeck = renderDeckTool(opts.projectRoot);
    const qaTool = qaDeckTool(opts.projectRoot);
    const exportTool = exportDeckTool(opts.projectRoot);
    // 宿主软化策略（P2/P3）：文件类工具失败转 JSON 错误文本回模型自纠，不终止整轮
    // （SDK 默认 after_tool 对 isError 直接 TOOL_FAILED 杀运行——对 read 路径猜测失败这类可自纠错误过严）。
    // 授权/预算/审计仍发生在每次准入边界，软化不绕过任何护栏。
    const soft = (t: Tool): Tool => ({
      ...t,
      execute: async (args, signal, invocation) => {
        try {
          return await t.execute(args, signal, invocation);
        } catch (e) {
          const error = String(e instanceof Error ? e.message : e).slice(0, 300);
          const payload: JsonValue = { ok: false, error, retry_hint: '工具执行失败：检查路径/参数后重试（read 支持项目根相对路径）' };
          // output:'content' 工具须返回 content 形状（SDK 校验 content 数组，缺它即 TOOL_FAILED）
          if (t.output === 'content') {
            return { content: [{ kind: 'text', text: JSON.stringify(payload) }], details: null };
          }
          return payload;
        }
      },
    });

    const auditFile = opts.auditFile ?? join(opts.projectRoot, '..', 'agent-audit.jsonl');
    const budgetFile = opts.budgetFile ?? join(opts.projectRoot, '..', 'agent-budget.json');
    const audit: AuditSink = new JsonlAuditSink(auditFile);
    const budgets: BudgetStore = new FileBudgetStore(budgetFile);
    const authorize = localAuthorize();
    const taskId = `task_${sessionIdOf(opts.projectRoot)}`;

    const operationsFile = join(opts.projectRoot, 'work', 'agent-operations.json');
    const bindOperation: SessionRuntimeOptions['bindOperation'] = async (input) => {
      const bindings = await readBindings(operationsFile);
      const known = bindings.operations[input.operationId];
      if (known) {
        if (known.taskId !== input.taskId || (known.purpose ?? undefined) !== (input.purpose ?? undefined)) {
          throw new RuntimeFault('INVALID_REQUEST');
        }
        return; // 幂等重复确认
      }
      bindings.operations[input.operationId] = { taskId: input.taskId, purpose: input.purpose };
      await writeBindings(operationsFile, bindings);
    };
    const reconcile: SessionRuntimeOptions['reconcile'] = async (input) => {
      const bindings = await readBindings(operationsFile);
      for (const op of input.open) {
        if (!bindings.operations[op.operationId]) return 'unknown'; // 未知开放操作拒绝推进
      }
      return 'ready';
    };

    const onAudit = (e: Readonly<AuditEvent>) => {
      hostRef?.recordEvent({ at: e.at, kind: e.kind, detail: { provider: e.provider, model: e.model, toolName: e.toolName, reason: e.reason, attempt: e.attempt, failed: e.toolFailed } });
    };
    let hostRef: SessionHost | null = null;

    const runtime = createSessionRuntime({
      model: opts.model,
      transport: opts.transport,
      fallbacks: opts.fallbacks,
      authorize,
      audit,
      budgets,
      storage: await projectSessionStorage(sessionRoot),
      harness: {
        skills: resources.skills,
        templates: resources.templates,
        // 原生压缩开启（持续任务）；retry 必须关闭（uncapped 合同：modelRecovery 单次额外尝试）
        compaction: { enabled: true, reserveTokens: 4096, keepRecentTokens: 8192 },
        steeringMode: 'all',
        followUpMode: 'all',
      },
      bindOperation,
      reconcile,
      onEvent: onAudit,
      onHarnessEvent: (e: HarnessObservation) => {
        hostRef?.recordEvent({ at: new Date().toISOString(), kind: `harness:${e.kind}` });
      },
    });

    const host = new SessionHost(runtime, taskId, [outlineTool, renderDeck, qaTool, exportTool, ...nativeTools].map(soft));
    hostRef = host;
    host.session = await host.findOrCreateSession();
    return host;
  }

  private async findOrCreateSession(): Promise<SessionInfo> {
    const existing = await this.runtime.list();
    const latest = existing.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest) return latest;
    return this.runtime.create();
  }

  get sessionId(): string | null {
    return this.session?.id ?? null;
  }

  isBusy(): boolean {
    return this.activeRun !== null;
  }

  defaultTools(): readonly Tool[] {
    return this.tools;
  }

  /** 发送消息（prompt）。已有运行在推进时转 steer（对话式插话）；否则开新 run。 */
  async send(text: string, opts: { system?: string } = {}): Promise<{ mode: 'steer' | 'run' }> {
    const system = opts.system ?? BUILD_SYSTEM;
    if (this.closed) throw new Error('宿主已关闭');
    if (this.activeRun) {
      await this.control({ kind: 'steer', text });
      return { mode: 'steer' };
    }
    const session = this.session ?? (this.session = await this.findOrCreateSession());
    this.recordEvent({ at: new Date().toISOString(), kind: 'chat:user_send' });
    const run = this.runtime.run({
      sessionId: session.id,
      taskId: this.taskId,
      prompt: text,
      system,
      tools: this.tools,
      limits: UNLIMITED_LIMITS,
      modelRecovery: { extraAttempts: 1 },
    });
    this.activeRun = run;
    void run.then(
      (r) => { this.lastOutcome = r; },
      (e) => {
        // SDK 面上 run 不应 reject；防御性兜底为 failed 结果（R1-2：停止/失败后前端必须能退出 busy）
        this.lastOutcome = { taskId: this.taskId, runId: 'unknown', status: 'failed', reason: 'MODEL_FAILED', usage: { modelCalls: 0, toolCalls: 0, outputTokens: 0, resourceUnits: 0, activeMs: 0 }, usageKnown: false };
        void e;
      },
    );
    void run.finally(() => {
      this.activeRun = null;
    }).catch(() => { /* finally 上的 catch 防御未处理拒绝 */ });
    return { mode: 'run' };
  }

  /** 等待当前 run 结束并取结果（聊天端点轮询/长轮询用；无活动 run 返回 null）。 */
  async currentResult(): Promise<RunResult<string> | null> {
    return this.activeRun;
  }

  /** 最近一次已结束的结果（R1-2：停止/快速失败后前端退出 busy 的依据；无则 null）。 */
  outcome(): RunResult<string> | null {
    return this.lastOutcome;
  }

  /** 框架确认注入（outline/confirm 路由调用）：把确认大纲作为一次推进发给会话。 */
  async notifyOutlineConfirmed(version: number, pages: OutlinePage[]): Promise<{ mode: 'steer' | 'run' }> {
    return this.send(confirmedOutlinePrompt(version, pages));
  }

  async control(command: { kind: 'steer' | 'followUp' | 'nextRun' | 'abort'; text?: string }): Promise<void> {
    if (!this.session) throw new Error('会话不存在');
    const kind = command.kind === 'abort' ? { kind: 'abort' as const } : { kind: command.kind, text: command.text ?? '' };
    await this.runtime.control({ taskId: this.taskId, sessionId: this.session.id, command: kind });
  }

  async snapshot() {
    if (!this.session) throw new Error('会话不存在');
    const r = await this.runtime.control({ taskId: this.taskId, sessionId: this.session.id, command: { kind: 'snapshot', includeContent: false } });
    return r.snapshot;
  }

  async history() {
    if (!this.session) return [];
    return this.runtime.history(this.session.id);
  }

  async close(): Promise<void> {
    this.closed = true;
    // 释放 storage writer 锁由 runtime/storage 层负责；这里停止事件与后续 run
    this.eventListeners.clear();
  }
}

// ---- 项目会话存储（SessionStorage 宿主实现：专属根 + 跨进程 lockfile 单写入者）----

/** 进程内共享所有者：同进程多 host 实例=同一写入者；跨进程由 O_EXCL lockfile 互斥。 */
const writerLocks = new Map<string, { fd: number; holders: number }>();

async function projectSessionStorage(sessionRoot: string): Promise<SessionStorage> {
  const lockPath = join(sessionRoot, '.writer-lock');
  return {
    directory: sessionRoot,
    cwd: sessionRoot,
    policyVersion: LOCAL_POLICY_VERSION,
    authorize: async () => true, // 本地单用户：专属根目录即访问边界（无跨项目访问）
    acquireWriter: async () => {
      const existing = writerLocks.get(sessionRoot);
      if (existing) {
        existing.holders += 1;
        let released = false;
        return {
          release: async () => {
            if (released) return;
            released = true;
            existing.holders -= 1;
            if (existing.holders === 0) {
              closeSync(existing.fd);
              try { unlinkSync(lockPath); } catch { /* 已被清理 */ }
              writerLocks.delete(sessionRoot);
            }
          },
        };
      }
      mkdirSync(sessionRoot, { recursive: true });
      let fd: number;
      try {
        fd = openSync(lockPath, 'wx');
        writeFileSync(lockPath, String(process.pid), 'utf-8');
      } catch {
        // 已有跨进程写入者：拒绝争用，不抢占活动/未对账 owner
        throw new RuntimeFault('TASK_BUSY');
      }
      writerLocks.set(sessionRoot, { fd, holders: 1 });
      return {
        release: async () => {
          const entry = writerLocks.get(sessionRoot);
          if (!entry) return;
          entry.holders -= 1;
          if (entry.holders === 0) {
            closeSync(entry.fd);
            try { unlinkSync(lockPath); } catch { /* 已被清理 */ }
            writerLocks.delete(sessionRoot);
          }
        },
      };
    },
  };
}

// ---- 操作绑定持久化 ----

async function readBindings(file: string): Promise<OperationBindings> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8')) as OperationBindings;
    if (raw.version === 1 && raw.operations && typeof raw.operations === 'object') return raw;
  } catch { /* 首次/缺失 → 空表 */ }
  return { version: 1, operations: {} };
}

async function writeBindings(file: string, bindings: OperationBindings): Promise<void> {
  await writeFile(file, JSON.stringify(bindings, null, 1), 'utf-8');
}

/** 项目数据根目录名（…/data/proj_xxx → proj_xxx）。 */
function sessionIdOf(projectRoot: string): string {
  const parts = projectRoot.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? 'unknown';
}
