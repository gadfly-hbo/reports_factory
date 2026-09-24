import { z, ZodError } from 'zod';

/**
 * ModelClient 运输层（M5 D1）：怎么调模型。
 * 上层 ModelGateway 管"允许模型参与什么"（能力缝 + PrivacyGate），这里只管执行：
 * provider 主备链、瞬时错误切备用、熔断冷却、超时、schema 校验。
 * transport 注入 = 测试 seam：离线测试用假/重放 transport，真实调用只在 probe（合成 fixture）。
 * pi sdk 类型零漏出本层；输出一律经调用方提供的 zod schema 校验。
 */

export interface ProviderConfig {
  provider: string;
  modelId: string;
  /** 自定义 provider（非 pi-ai 内置）时提供 */
  api?: string;
  baseUrl?: string;
}

export interface StageRequest<T> {
  /** 用点标识（outline/recommend/proposal-draft/semantic-checks/evidence-gaps） */
  stage: string;
  /** 录制/重放键：同内容的重复调用共享录制 */
  callKey: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

export interface StageOutcome<T> {
  output: T;
  provider: string;
  modelId: string;
  cost: number;
}

export interface TransportRequest {
  system: string;
  user: string;
}

export type ModelTransport = (
  cfg: ProviderConfig,
  req: TransportRequest,
) => Promise<{ text: string; cost: number }>;

export class ModelUnavailableError extends Error {
  constructor(readonly attempts: string[]) {
    super(`模型服务不可用（全部尝试失败）：${attempts.join(' | ') || '无可用 provider'}`);
    this.name = 'ModelUnavailableError';
  }
}

/** 瞬时错误判定（对齐 deep-research）：配额/限流/超时/网络类切备用；配置类直接抛出不掩盖 */
const TRANSIENT =
  /429|402|rate.?limit|quota|用量上限|2067|insufficient|额度|缺少模型密钥|No API key|aborted|timeout|timed? ?out|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|network|HTTP 5\d\d|服务暂时|overloaded/i;

export function isTransientProviderError(error: unknown): boolean {
  // 重放未命中按"该 provider 不可用"处理（切备用/全链失败），不按配置错误直抛
  if (error instanceof Error && error.name === 'ReplayMissError') return true;
  const text = String(error instanceof Error ? error.message : error);
  return TRANSIENT.test(text);
}

export interface BreakerOptions {
  threshold: number;
  cooldownMs: number;
  now?: () => number;
}

interface ProviderState {
  consecutiveFailures: number;
  trippedAt: number | null;
}

/** 同一 provider 连续 N 次瞬时失败后冷却跳过，避免每次调用烧满超时 */
export class ModelCircuitBreaker {
  private readonly states = new Map<string, ProviderState>();

  constructor(private readonly options: BreakerOptions) {}

  private state(provider: string): ProviderState {
    let s = this.states.get(provider);
    if (!s) {
      s = { consecutiveFailures: 0, trippedAt: null };
      this.states.set(provider, s);
    }
    return s;
  }

  recordFailure(provider: string): void {
    const s = this.state(provider);
    s.consecutiveFailures += 1;
    if (s.consecutiveFailures >= this.options.threshold) s.trippedAt = this.options.now?.() ?? Date.now();
  }

  recordSuccess(provider: string): void {
    const s = this.state(provider);
    s.consecutiveFailures = 0;
    s.trippedAt = null;
  }

  isTripped(provider: string): boolean {
    const s = this.state(provider);
    if (s.trippedAt === null) return false;
    const elapsed = (this.options.now?.() ?? Date.now()) - s.trippedAt;
    if (elapsed >= this.options.cooldownMs) {
      s.trippedAt = null;
      s.consecutiveFailures = 0;
      return false;
    }
    return true;
  }
}

/** 鲁棒 JSON 解析（对齐 deep-research）：围栏/裸/截取块/空对象 */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // 继续尝试截取第一个 JSON 块
  }
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleanLastIndex(cleaned));
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return {};
    }
  }
  return {};
}

function cleanLastIndex(text: string): number {
  return Math.max(text.lastIndexOf(']'));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`模型调用 timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 交互场景默认超时（R2：单一来源；pi-transport 与 workbench 共用） */
export const DEFAULT_TIMEOUT_MS = Number(process.env['REPORT_STUDIO_MODEL_TIMEOUT_MS'] ?? 120_000);

export interface LlmStageClientOptions {
  transport: ModelTransport;
  chain: ProviderConfig[];
  timeoutMs?: number;
  breaker?: ModelCircuitBreaker;
}

/**
 * 阶段调用客户端：主备链 + 熔断 + schema 护栏。
 * schema 不合格与瞬时错误同样切备用（模型质量问题换一家重试）；全链失败抛 ModelUnavailableError。
 */
export class LlmStageClient {
  private readonly breaker: ModelCircuitBreaker;
  private readonly timeoutMs: number;

  constructor(private readonly opts: LlmStageClientOptions) {
    this.breaker = opts.breaker ?? new ModelCircuitBreaker({ threshold: 2, cooldownMs: 10 * 60_000 });
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async complete<T>(req: StageRequest<T>): Promise<StageOutcome<T>> {
    const errors: string[] = [];
    for (const cfg of this.opts.chain) {
      if (this.breaker.isTripped(cfg.provider)) {
        errors.push(`${cfg.provider}: 熔断冷却中（连续瞬时失败）`);
        continue;
      }
      try {
        const { text, cost } = await withTimeout(this.opts.transport(cfg, { system: req.system, user: req.user }), this.timeoutMs);
        const output = req.schema.parse(parseJsonLoose(text));
        this.breaker.recordSuccess(cfg.provider);
        return { output, provider: cfg.provider, modelId: cfg.modelId, cost };
      } catch (error) {
        if (error instanceof ZodError || isTransientProviderError(error)) {
          this.breaker.recordFailure(cfg.provider);
          const detail = error instanceof ZodError ? '输出不符合 schema' : String(error instanceof Error ? error.message : error).slice(0, 160);
          errors.push(`${cfg.provider}: ${detail}`);
          continue;
        }
        throw error; // 配置/参数类错误不掩盖
      }
    }
    throw new ModelUnavailableError(errors);
  }
}

/** 默认模型链（R2：minimax 主 + 小米备；model id 经 probe 实测确认） */
export const DEFAULT_MODEL_CHAIN = 'minimax-cn/MiniMax-M2.7,xiaomi-token-plan-cn/mimo-v2.5-pro';

export function chainFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderConfig[] {
  const raw = env['REPORT_STUDIO_MODEL_CHAIN']?.trim() || DEFAULT_MODEL_CHAIN;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [provider, modelId] = s.split('/');
      if (!provider || !modelId) throw new Error(`REPORT_STUDIO_MODEL_CHAIN 项非法（应为 provider/modelId）：${s}`);
      return { provider, modelId };
    });
}
