import type { ModelGateway, OutlineContext, OutlineDraft } from './gateway.js';
import type { PrivacyPolicy } from '../schema/project.js';

/**
 * 出站隐私门禁（F12，proposal §12.2）：
 * - local_only：外部网关全部阻断（本地确定性网关不受影响）
 * - allow_external_with_approval：每次调用需显式 approval
 * - allow_external：放行并记录出站摘要
 * 日志只记元信息（数量/大小），不记录完整敏感内容。
 */

export class OutboundBlockedError extends Error {
  constructor(
    public readonly gatewayId: string,
    public readonly reason: string,
  ) {
    super(`出站调用被阻止：${reason}（网关 ${gatewayId}）。本地编辑与确定性功能不受影响。`);
    this.name = 'OutboundBlockedError';
  }
}

export interface OutboundLogEntry {
  at: string;
  gateway_id: string;
  operation: string;
  blocked: boolean;
  reason?: string;
  summary: { claim_count: number; table_count: number };
}

export class PrivacyGate implements ModelGateway {
  readonly id: string;
  readonly external: boolean;
  readonly outboundLog: OutboundLogEntry[] = [];

  constructor(
    private readonly inner: ModelGateway,
    private readonly config: { policy: () => PrivacyPolicy },
  ) {
    this.id = inner.id;
    this.external = inner.external;
  }

  async composeOutline(
    ctx: OutlineContext,
    opts?: { approval?: string },
  ): Promise<OutlineDraft> {
    const policy = this.config.policy();
    const summary = { claim_count: ctx.claims.length, table_count: ctx.tables.length };

    if (!this.inner.external) {
      // 本地网关：内容不出本机，直接执行
      return this.inner.composeOutline(ctx, opts);
    }

    let blocked = false;
    let reason: string | undefined;
    if (policy === 'local_only') {
      blocked = true;
      reason = '项目设置为禁止外部模型（local_only）';
    } else if (policy === 'allow_external_with_approval' && opts?.approval !== 'approved-by-user') {
      blocked = true;
      reason = '项目要求逐次批准外部调用，未收到用户批准';
    }

    if (blocked) {
      this.outboundLog.push({
        at: new Date().toISOString(),
        gateway_id: this.inner.id,
        operation: 'composeOutline',
        blocked: true,
        reason,
        summary,
      });
      throw new OutboundBlockedError(this.inner.id, reason!);
    }

    this.outboundLog.push({
      at: new Date().toISOString(),
      gateway_id: this.inner.id,
      operation: 'composeOutline',
      blocked: false,
      summary,
    });
    return this.inner.composeOutline(ctx, opts);
  }
}
