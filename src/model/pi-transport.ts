import { type Api, type Model } from '@earendil-works/pi-ai';
import { getBuiltinModel } from '@earendil-works/pi-ai/providers/all';
import { DEFAULT_TIMEOUT_MS, chainFromEnv } from './client.js';
import type { ModelTransport, ProviderConfig } from './client.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * 启动时自动从本机凭据文件加载模型密钥（macmini / MacBook 双端通用）：
 *   - MiniMax: ~/.pi/agent/auth.json  →  providers["minimax-cn"].key
 *   - Xiaomi MIMO: ~/.zcode/v2/config.json  →  providers[?].options.baseURL 含 xiaomimimo → apiKey
 * 仅在进程环境变量未设置时注入，不覆盖显式值。
 */
function loadKeysFromDisk(): void {
  const home = homedir();
  // MiniMax
  if (!process.env['MINIMAX_CN_API_KEY'] && !process.env['MINIMAX_API_KEY']) {
    const p = join(home, '.pi', 'agent', 'auth.json');
    if (existsSync(p)) {
      try {
        const a = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, { key?: string }>;
        const k = a['minimax-cn']?.key ?? a['minimax']?.key;
        if (k) {
          process.env['MINIMAX_CN_API_KEY'] = k;
          process.env['MINIMAX_API_KEY'] = k;
        }
      } catch { /* 静默：文件不可读不阻塞启动 */ }
    }
  }
  // Xiaomi MIMO token-plan
  if (!process.env['XIAOMI_TOKEN_PLAN_CN_API_KEY']) {
    const p = join(home, '.zcode', 'v2', 'config.json');
    if (existsSync(p)) {
      try {
        const cfg = JSON.parse(readFileSync(p, 'utf-8')) as { provider?: Record<string, { options?: { baseURL?: string; apiKey?: string } }> };
        for (const v of Object.values(cfg.provider ?? {})) {
          const base = v?.options?.baseURL ?? '';
          if (typeof base === 'string' && base.includes('xiaomimimo')) {
            const k = v?.options?.apiKey;
            if (k) { process.env['XIAOMI_TOKEN_PLAN_CN_API_KEY'] = k; break; }
          }
        }
      } catch { /* 静默 */ }
    }
  }
}
loadKeysFromDisk();

/**
 * pi-ai 真实 transport（M5 D1）：模型调用的唯一出站点。
 * 密钥只从环境变量取（启动器 with-model-env.sh 注入），不进配置文件与日志。
 * pi sdk 类型封在本文件内，对外只暴露 ModelTransport。
 */

const ENV_KEY_BY_PROVIDER: Record<string, string> = {
  'minimax-cn': 'MINIMAX_CN_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  moonshotai: 'MOONSHOT_API_KEY',
  'moonshotai-cn': 'MOONSHOT_API_KEY',
  'kimi-coding': 'KIMI_API_KEY',
  zai: 'ZAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  'xiaomi-token-plan-cn': 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
  'xiaomi-token-plan-ams': 'XIAOMI_TOKEN_PLAN_AMS_API_KEY',
  'xiaomi-token-plan-sgp': 'XIAOMI_TOKEN_PLAN_SGP_API_KEY',
  'volcengine-plan': 'VOLCENGINE_PLAN_API_KEY',
};

export function envApiKey(provider: string): string {
  const envName = ENV_KEY_BY_PROVIDER[provider] ?? `${provider.replace(/-/g, '_').toUpperCase()}_API_KEY`;
  const key = process.env[envName];
  if (!key) throw new Error(`缺少模型密钥:请设置环境变量 ${envName}（密钥不进配置文件与日志）`);
  return key;
}

/** 密钥存在性检查（不抛错）：驱动 capabilities.modelAvailable 与前端入口渲染 */
export function hasApiKey(provider: string): boolean {
  const envName = ENV_KEY_BY_PROVIDER[provider] ?? `${provider.replace(/-/g, '_').toUpperCase()}_API_KEY`;
  return !!process.env[envName];
}

/** 默认链上任一 provider 有密钥即可用（不发起网络请求） */
export function modelChainAvailable(): boolean {
  try {
    return chainFromEnv().some((c) => hasApiKey(c.provider));
  } catch {
    return false;
  }
}

type StreamFn = (
  model: Model<Api>,
  context: unknown,
  options?: Record<string, unknown>,
) => AsyncIterable<{ type: string; delta?: string; message?: { usage?: { cost?: { total?: number } } }; error?: { errorMessage?: string } }>;

async function streamFnFor(model: Model<Api>): Promise<StreamFn> {
  if (model.api === 'anthropic-messages') {
    const mod = await import('@earendil-works/pi-ai/api/anthropic-messages');
    return mod.streamSimple as unknown as StreamFn;
  }
  if (model.api === 'openai-completions') {
    const mod = await import('@earendil-works/pi-ai/api/openai-completions');
    return mod.streamSimple as unknown as StreamFn;
  }
  throw new Error(`不支持的 pi-ai api=${model.api}（当前支持 anthropic-messages / openai-completions）`);
}

export function resolveModelFor(cfg: ProviderConfig): Model<Api> {
  return resolveModelImpl(cfg);
}

function resolveModelImpl(cfg: ProviderConfig): Model<Api> {
  // 自定义 Model：调用方显式提供 baseUrl/api 时优先（§7.2 端点怪癖在适配层收敛）
  if (cfg.baseUrl && cfg.api) {
    return {
      id: cfg.modelId,
      name: cfg.modelId,
      api: cfg.api,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8_192,
    } as Model<Api>;
  }
  // 标准 §3.4 反向配置（v1.1）：小米端点统一为 token-plan-cn.xiaomimimo.com/v1（openai-completions），
  // 不依赖 pi 内置清单是否收录当前 model id（pi 0.86.1 内置只有 v2.5 系，v2.6-flash 等新 id 必须走本兜底）
  if (cfg.provider === 'xiaomi-token-plan-cn') {
    return {
      id: cfg.modelId,
      name: cfg.modelId,
      api: 'openai-completions',
      provider: 'xiaomi-token-plan-cn',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 8_192,
    } as Model<Api>;
  }
  // getBuiltinModel 泛型面向编译期字面量；配置驱动的取值在适配器边界收敛一次
  return getBuiltinModel(cfg.provider as never, cfg.modelId as never) as Model<Api>;
}

export interface PiTransportOptions {
  timeoutMs?: number;
  /** 测试注入；缺省从 env 解析 */
  apiKeyFor?: (provider: string) => string;
}

/** 坑表 #7（标准 v1.1）：剥离 MiniMax-M3 思考标签（导出供测试） */
export function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export function piTransport(opts: PiTransportOptions = {}): ModelTransport {
  const apiKeyFor = opts.apiKeyFor ?? envApiKey;
  return async (cfg, req) => {
    const model = resolveModelFor(cfg);
    const streamSimple = await streamFnFor(model);
    const apiKey = apiKeyFor(cfg.provider);
    // MIMO 等端点不遵循 system 通道（deep-research 实测），指令并入 user 消息，各 provider 兼容；
    // 图片输入（M-U4）：文本块在前 + image 块（base64），anthropic-messages 与 openai-completions 两协议均接受
    const blocks: Array<Record<string, string>> = [{ type: 'text', text: `${req.system}\n\n${req.user}` }];
    for (const img of req.images ?? []) {
      blocks.push({ type: 'image', data: img.data, mimeType: img.mimeType });
    }
    const context = {
      messages: [
        {
          role: 'user',
          timestamp: Date.now(),
          content: blocks,
        },
      ],
    };
    let text = '';
    let cost = 0;
    const startedAt = Date.now();
    for await (const event of streamSimple(model, context, {
      apiKey,
      // 重试与故障转移归主备链路管，不让 pi-ai 内部重试吃掉超时预算
      maxRetries: 1,
      maxRetryDelayMs: 5_000,
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })) {
      if (event.type === 'text_delta') {
        text += event.delta ?? '';
      } else if (event.type === 'done' && event.message) {
        const usage = event.message.usage;
        if (typeof usage?.cost?.total === 'number') cost = usage.cost.total;
      } else if (event.type === 'error') {
        throw new Error(`模型调用失败(${cfg.provider}/${cfg.modelId}): ${event.error?.errorMessage ?? JSON.stringify(event).slice(0, 300)}`);
      }
    }
    // 坑表 #7（标准 v1.1）：MiniMax-M3 输出前附 <think>...</think> 思考标签——剥离后再进下游 JSON 解析
    text = stripThinkTags(text);
    if (process.env['REPORT_STUDIO_MODEL_DEBUG']) {
      console.error(`[model] ${cfg.provider}/${cfg.modelId} ok ${((Date.now() - startedAt) / 1000).toFixed(1)}s text=${text.length} cost=${cost}`);
    }
    return { text, cost };
  };
}
