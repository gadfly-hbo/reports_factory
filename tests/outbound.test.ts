import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildPayload, resolveOutboundPolicy, type OutboundCtx } from '../src/model/outbound.js';
import type { WorkspaceStore as Store } from '../src/storage/workspace.js';

/**
 * S2（M5）：出站治理。
 * L3：structure-only payload 断言零 claim 原文、零表格数值；
 * 会话批准（projectId|mode，进程内，重启失效）；outboundLog 零内容可审计；
 * local_only → AI 出口关闭。
 */

const FINDING_TEXT = '重点门店销售额同比下降 12%';
const TABLE_VALUE = 880.5;

const ctx: OutboundCtx = {
  brief: {
    audience: '商品与运营负责人',
    purpose: '补货试点评审',
    pageBudget: 5,
    coreQuestion: '问题集中在哪里、是否值得试点',
    nonGoals: ['全面复盘'],
    requiredBoundaries: ['缺货尚未被证明为主因'],
  },
  assets: {
    claimKinds: { fact_statement: 2, inference: 1 },
    tables: [{ label: 'sales', columns: ['月份', '销售额（万元）'], rowCount: 6 }],
  },
  findings: [
    { logicalKey: 'bundle:x::F01', kind: 'computed_statement', text: FINDING_TEXT, verificationState: 'arithmetic_checked', limitations: [], counterEvidence: [], sensitive: false },
    { logicalKey: 'bundle:x::F09', kind: 'fact_statement', text: '敏感来源的发现', verificationState: 'unverified', limitations: [], counterEvidence: [], sensitive: true },
  ],
};

describe('S2 出站治理', () => {
  let app: FastifyInstance;
  let dir: string;
  let projectId: string;
  let store: Store;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-outbound-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
    projectId = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '出站测试' } })).json().project.project_id;
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('L3：structure-only payload 零发现原文、零表格数值；描述符给出可预览的分节', () => {
    const { user, descriptor } = buildPayload('structure-only', ctx);
    expect(user).not.toContain(FINDING_TEXT);
    expect(user).not.toContain('敏感来源的发现');
    expect(user).not.toContain(String(TABLE_VALUE));
    expect(user).toContain('fact_statement'); // 类型清单可出站
    expect(user).toContain('缺货尚未被证明为主因'); // 任务书字段可出站（编制者自己写的沟通目标）
    expect(descriptor.sections.some((s) => s.label === '发现文本')).toBe(false);

    const full = buildPayload('authorized-summary', ctx);
    expect(full.user).toContain(FINDING_TEXT); // 非敏感发现进入
    expect(full.user).not.toContain('敏感来源的发现'); // sensitive 默认排除（K3）
    expect(full.descriptor.sections.find((s) => s.label === '发现文本')?.count).toBe(1);
    // 显式包含 sensitive
    const withSensitive = buildPayload('authorized-summary', ctx, { includeSensitive: true });
    expect(withSensitive.user).toContain('敏感来源的发现');
  });

  it('隐私策略映射：local_only 关闭全部出站；with_approval 需批准；allow_external 免批准', () => {
    expect(resolveOutboundPolicy('local_only')).toEqual({ disabled: true });
    expect(resolveOutboundPolicy('allow_external_with_approval')).toEqual({ disabled: false, needsApproval: true });
    expect(resolveOutboundPolicy('allow_external')).toEqual({ disabled: false, needsApproval: false });
  });

  it('L2：预览可见；未批准调用被拒；按 projectId|mode 批准；服务重启（新实例）批准失效', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });

    // 预览：未批准也可查看（知情是批准的前提）
    const preview = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/preview`, payload: { mode: 'authorized-summary' } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().descriptor.mode).toBe('authorized-summary');

    // 未批准 → 出站门拒绝
    const gateBefore = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/check`, payload: { mode: 'authorized-summary' } })).json();
    expect(gateBefore.allowed).toBe(false);

    // 批准（会话级）→ 放行；另一 mode 仍被拒（G2：按 projectId|mode 分）
    const approve = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/approve`, payload: { mode: 'authorized-summary' } });
    expect(approve.statusCode).toBe(200);
    const gateAfter = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/check`, payload: { mode: 'authorized-summary' } })).json();
    expect(gateAfter.allowed).toBe(true);
    const otherMode = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/check`, payload: { mode: 'structure-only' } })).json();
    expect(otherMode.allowed).toBe(false);

    // 服务重启（新 Workbench 实例）→ 会话批准失效（安全默认）
    const app2 = buildServer(new WorkspaceStore(dir));
    const gateRestart = (await app2.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/check`, payload: { mode: 'authorized-summary' } })).json();
    expect(gateRestart.allowed).toBe(false);
    await app2.close();
  });

  it('local_only：预览与批准均被拒；capabilities 显示 AI 关闭', async () => {
    const preview = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/preview`, payload: { mode: 'structure-only' } });
    expect(preview.statusCode).toBe(403);
    const approve = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/approve`, payload: { mode: 'structure-only' } });
    expect(approve.statusCode).toBe(403);
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    expect(detail.capabilities.ai.enabled).toBe(false);
  });

  it('allow_external：免批准放行；capabilities 显示已启用', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const gate = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/check`, payload: { mode: 'structure-only' } })).json();
    expect(gate.allowed).toBe(true);
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    expect(detail.capabilities.ai.enabled).toBe(true);
    expect(detail.capabilities.ai.needsApproval).toBe(false);
  });

  it('outboundLog：append 记录零内容可审计（provider/条数/cost），成本可聚合', async () => {
    mkdirSync(join(dir, projectId, 'work'), { recursive: true });
    await store.appendOutboundLog(projectId, { at: 't1', stage: 'outline', provider: 'minimax-cn', modelId: 'MiniMax-M2.7', mode: 'structure-only', itemCount: 3, bytes: 420, cost: 0.0003 });
    await store.appendOutboundLog(projectId, { at: 't2', stage: 'recommend', provider: 'minimax-cn', modelId: 'MiniMax-M2.7', mode: 'authorized-summary', itemCount: 5, bytes: 900, cost: 0.0005 });
    const log = await store.readOutboundLog(projectId);
    expect(log).toHaveLength(2);
    expect(JSON.stringify(log)).not.toContain(FINDING_TEXT); // 零内容
    expect(log[0]).toMatchObject({ provider: 'minimax-cn', itemCount: 3 });
    const total = log.reduce((s, e) => s + (e['cost'] as number), 0);
    expect(total).toBeCloseTo(0.0008, 6);
  });
});
