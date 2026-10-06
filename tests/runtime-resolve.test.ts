import { describe, expect, it } from 'vitest';
import { resolveModelFor } from '../src/model/pi-transport.js';

/**
 * M8 收尾：标准 §3.4（v1.1）反向配置——小米 model id 一律走 token-plan-cn 端点，
 * 不依赖 pi 内置清单是否收录当前 id（pi 0.86.1 内置只有 v2.5 系）。
 */

describe('Agent Runtime 反向配置（M8 收尾）', () => {
  it('小米内置 id（v2.5-pro）走 token-plan-cn 端点与 openai-completions', () => {
    const m = resolveModelFor({ provider: 'xiaomi-token-plan-cn', modelId: 'mimo-v2.5-pro' });
    expect(m.baseUrl).toBe('https://token-plan-cn.xiaomimimo.com/v1');
    expect(m.api).toBe('openai-completions');
    expect(m.id).toBe('mimo-v2.5-pro');
  });

  it('小米非内置 id（v2.6-flash）仍走 §3.4 端点（不被内置清单缺失阻断）', () => {
    const m = resolveModelFor({ provider: 'xiaomi-token-plan-cn', modelId: 'mimo-v2.6-flash' });
    expect(m.baseUrl).toBe('https://token-plan-cn.xiaomimimo.com/v1');
    expect(m.api).toBe('openai-completions');
    expect(m.id).toBe('mimo-v2.6-flash');
  });

  it('调用方显式提供 baseUrl/api 时优先（§7.2 端点怪癖收敛）', () => {
    const m = resolveModelFor({
      provider: 'xiaomi-token-plan-cn',
      modelId: 'mimo-v2.6-flash',
      baseUrl: 'https://custom.example/v1',
      api: 'anthropic-messages',
    });
    expect(m.baseUrl).toBe('https://custom.example/v1');
    expect(m.api).toBe('anthropic-messages');
  });
});
