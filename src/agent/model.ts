import { createPiTransport, type ModelConfig, type ModelTransport } from 'pi-agent-runtime';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * 模型接入（AGENT-RUNTIME §INTEGRATION 输入 1）：显式 provider/id/protocol/endpoint + 显式 apiKey。
 * SDK 不发现本机认证文件——密钥发现是宿主行为：环境变量优先，缺省从本机凭据文件读取后显式传入，
 * 凭据不进入 SDK 配置模型、审计或日志。本文件是 src/agent/ 适配层的一部分（业务代码唯一
 * 允许触达 pi-agent-runtime 的位置）。
 */

/** 启动时从本机凭据文件加载模型密钥（macmini / MacBook 双端通用）：
 *   - MiniMax: ~/.pi/agent/auth.json → providers["minimax-cn"].key
 *   - Xiaomi MIMO: 优先 ~/.pi/agent/auth.json → providers["xiaomi-token-plan-cn"].key；
 *     缺省回退 ~/.zcode/v2/config.json → providers[?].options.baseURL 含 xiaomimimo → apiKey
 * 仅在进程环境变量未设置时注入，不覆盖显式值。 */
export function loadKeysFromDisk(): void {
  const home = homedir();
  const authJson = join(home, '.pi', 'agent', 'auth.json');
  if (!process.env['MINIMAX_CN_API_KEY'] && !process.env['MINIMAX_API_KEY']) {
    if (existsSync(authJson)) {
      try {
        const a = JSON.parse(readFileSync(authJson, 'utf-8')) as Record<string, { key?: string }>;
        const k = a['minimax-cn']?.key ?? a['minimax']?.key;
        if (k) {
          process.env['MINIMAX_CN_API_KEY'] = k;
          process.env['MINIMAX_API_KEY'] = k;
        }
      } catch { /* 静默：文件不可读不阻塞启动 */ }
    }
  }
  if (!process.env['XIAOMI_TOKEN_PLAN_CN_API_KEY']) {
    let found = false;
    if (existsSync(authJson)) {
      try {
        const a = JSON.parse(readFileSync(authJson, 'utf-8')) as Record<string, { key?: string }>;
        const k = a['xiaomi-token-plan-cn']?.key;
        if (k) {
          process.env['XIAOMI_TOKEN_PLAN_CN_API_KEY'] = k;
          found = true;
        }
      } catch { /* 静默 */ }
    }
    if (!found) {
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
}
loadKeysFromDisk();

/** 主模型（探针实测 pin）：MiniMax-M3，anthropic-messages 协议，vision 可用。 */
export const MINIMAX_M3: ModelConfig = {
  provider: 'minimax-cn',
  id: 'MiniMax-M3',
  protocol: 'anthropic-messages',
  endpoint: 'https://api.minimaxi.com/anthropic',
  contextWindow: 1_048_576,
  maxOutputTokens: 32_768, // 写整页代码+长回复的单次输出需求（注册表上限 512000；T3 真调 8192 打满→INVALID_OUTPUT）
  reasoning: true,
  input: ['text', 'image'],
};

/** 备模型：小米 mimo-v2.6-flash，openai-completions 协议（§3.4 反向配置端点）。
 *  thinking 已验证（flow-2 U0 probe 真调 medium 通过；pi 注册表全系 reasoning=true、
 *  用户 pi 日常以 medium 跑 mimo-v2.5-pro）——链上候选齐备，可开 thinkingLevel。 */
export const MIMO_FLASH: ModelConfig = {
  provider: 'xiaomi-token-plan-cn',
  id: 'mimo-v2.6-flash',
  protocol: 'openai-completions',
  endpoint: 'https://token-plan-cn.xiaomimimo.com/v1',
  contextWindow: 128_000,
  maxOutputTokens: 16_384,
  reasoning: true,
  input: ['text'],
};

/** provider → 环境变量名（密钥只从环境/凭据文件来，不进配置文件与日志）。 */
export function envKeyFor(provider: string): string {
  const map: Record<string, string> = {
    'minimax-cn': 'MINIMAX_CN_API_KEY',
    'xiaomi-token-plan-cn': 'XIAOMI_TOKEN_PLAN_CN_API_KEY',
  };
  return map[provider] ?? `${provider.replace(/-/g, '_').toUpperCase()}_API_KEY`;
}

export function hasApiKey(cfg: ModelConfig): boolean {
  return !!process.env[envKeyFor(cfg.provider)];
}

/** 单个 provider 的显式凭据 transport（缺密钥返回 null，不抛错——驱动 capabilities 展示）。 */
export function transportFor(cfg: ModelConfig): ModelTransport | null {
  const apiKey = process.env[envKeyFor(cfg.provider)];
  if (!apiKey) return null;
  return createPiTransport({ model: cfg, apiKey });
}

export interface Candidate {
  model: ModelConfig;
  transport: ModelTransport;
}

/** 按主备顺序返回有密钥的候选链；一个都没有时抛错（驱动 ai/status 与启动检查）。 */
export function candidateChain(): Candidate[] {
  const out: Candidate[] = [];
  for (const cfg of [MINIMAX_M3, MIMO_FLASH]) {
    const transport = transportFor(cfg);
    if (transport) out.push({ model: cfg, transport });
  }
  if (out.length === 0) {
    throw new Error('无可用模型密钥：请设置 MINIMAX_CN_API_KEY 或 XIAOMI_TOKEN_PLAN_CN_API_KEY');
  }
  return out;
}

/** 密钥存在性（不发起网络请求），驱动 /api/ai/status。 */
export function modelChainAvailable(): boolean {
  return hasApiKey(MINIMAX_M3) || hasApiKey(MIMO_FLASH);
}
