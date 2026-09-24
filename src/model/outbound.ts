import { createHash } from 'node:crypto';

/**
 * 出站治理（M5 D2，模块方案 §14.2 三分模式 + §13.3 调用前可查看）。
 * 白名单式构造：structure-only 从"类型清单"生成，发现原文根本不进入构造输入路径；
 * authorized-summary 只携带编审工作区已可见的发现文本，sensitive 来源默认排除（红队 K3）。
 */

/** 出站模式单一来源（R2）：枚举/数组/请求 schema 均由此派生 */
export const OUTBOUND_MODES = ['structure-only', 'authorized-summary'] as const;

export type OutboundMode = (typeof OUTBOUND_MODES)[number];

export function resolveOutboundPolicy(privacyPolicy: string): { disabled: true } | { disabled: false; needsApproval: boolean } {
  if (privacyPolicy === 'local_only') return { disabled: true };
  if (privacyPolicy === 'allow_external_with_approval') return { disabled: false, needsApproval: true };
  return { disabled: false, needsApproval: false }; // allow_external
}

export interface OutboundBriefCtx {
  audience: string;
  purpose: string;
  pageBudget: number;
  coreQuestion?: string;
  nonGoals?: string[];
  requiredBoundaries?: string[];
}

export interface OutboundFindingCtx {
  logicalKey: string;
  kind: string;
  text: string;
  verificationState: string;
  limitations: string[];
  counterEvidence: string[];
  /** 来源 sensitivity=sensitive 的发现（默认排除出站） */
  sensitive: boolean;
}

export interface OutboundCtx {
  brief: OutboundBriefCtx;
  assets: {
    claimKinds: Record<string, number>;
    tables: Array<{ label: string; columns: string[]; rowCount: number }>;
  };
  findings: OutboundFindingCtx[];
}

export interface PayloadSection {
  label: string;
  /** 该节携带的条目数（任务书/清单恒为 1；发现文本为条数） */
  count: number;
  bytes: number;
}

export interface PayloadDescriptor {
  mode: OutboundMode;
  sections: PayloadSection[];
  totalBytes: number;
}

export interface BuiltPayload {
  /** 发送给模型的 user 消息（JSON 字符串，白名单字段） */
  user: string;
  descriptor: PayloadDescriptor;
  /** 实际包含的发现条数（审计用） */
  itemCount: number;
}

export function buildPayload(
  mode: OutboundMode,
  ctx: OutboundCtx,
  opts: { includeSensitive?: boolean } = {},
): BuiltPayload {
  const included = mode === 'authorized-summary'
    ? ctx.findings.filter((f) => (opts.includeSensitive ? true : !f.sensitive))
    : [];

  const payload =
    mode === 'structure-only'
      ? {
          task: 'structure-only',
          brief: ctx.brief,
          assets: ctx.assets,
        }
      : {
          task: 'authorized-summary',
          brief: ctx.brief,
          assets: ctx.assets,
          findings: included.map((f) => ({
            id: f.logicalKey,
            kind: f.kind,
            text: f.text,
            verification: f.verificationState,
            ...(f.limitations.length > 0 ? { limitations: f.limitations } : {}),
            ...(f.counterEvidence.length > 0 ? { counter_evidence: f.counterEvidence } : {}),
          })),
        };

  const user = JSON.stringify(payload, null, 1);
  const sections: PayloadSection[] = [
    { label: '任务书', count: 1, bytes: JSON.stringify(payload['brief']).length },
    { label: '资产清单', count: 1, bytes: JSON.stringify(payload['assets']).length },
  ];
  if (mode === 'authorized-summary') {
    sections.push({ label: '发现文本', count: included.length, bytes: JSON.stringify(payload['findings']).length });
  }
  return { user, descriptor: { mode, sections, totalBytes: user.length }, itemCount: included.length };
}

/** 会话批准键：projectId|mode（G2：不同发送类别分开批准） */
export function approvalKey(projectId: string, mode: OutboundMode): string {
  return `${projectId}|${mode}`;
}

/** 录制/审计键（与 recording.ts 的 key 语义一致的最小版，此处仅用于日志去重展示） */
export function shortHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}
