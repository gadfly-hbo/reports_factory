import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { LlmStageClient } from '../src/model/client.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { retailBundleRich, retailBrief } from './helpers/retail.js';

/**
 * S6（M5）：语义检查（warning-only，模型辅助）+ 补证建议（EvidenceRequest 草稿）。
 * 断言：语义结果永不进 blockers（L9）、门禁行为不变、补证草稿走既有幂等通道、出站审计。
 */

const MODEL_ISSUES = JSON.stringify({
  issues: [
    { page_id: 'page_02', kind: 'evidence_mismatch', message: '标题的确定性强于所引用证据' },
    { kind: 'redundancy', message: '第 3 页与第 5 页存在重复表述' },
  ],
});

const MODEL_GAPS = JSON.stringify({
  gaps: [
    { question: '缺货对销售下降的贡献需要量化验证', gap: '当前仅有相关性证据', required_evidence: '同期缺货率分组对比，不限定结论方向' },
  ],
});

describe('S6 语义检查 + 补证建议', () => {
  let dir: string;
  let app: ReturnType<typeof buildServer>;
  let store: WorkspaceStore;
  let projectId: string;
  let replayPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-ai-check-'));
    store = new WorkspaceStore(dir);
    replayPath = join(dir, 'replay.json');
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = replayPath;
    app = buildServer(store);
    projectId = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'AI 检查' } })).json().project.project_id;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundleRich() });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });
    const recs = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` })).json().recommendations;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/decisions`, payload: { decisions: recs } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline`, payload: { brief: retailBrief } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '张编制' } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });
  });
  afterEach(async () => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('L9：语义问题只产 warning/semantic，不改 blockers；门禁行为不变', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const before = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks`, payload: {} })).json();

    // 服务层 + fake client（transport seam，离线）：语义问题映射
    const workbench = new WorkbenchService(store);
    await workbench.approveOutbound(projectId, 'authorized-summary');
    const fake = new LlmStageClient({
      chain: [{ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }],
      transport: async () => ({ text: MODEL_ISSUES, cost: 0.0007 }),
    });
    const r = await workbench.aiSemanticChecks(projectId, { client: fake });
    expect(r.issues).toHaveLength(2);
    for (const i of r.issues) {
      expect(i.severity).toBe('warning');
      expect(i.category).toBe('semantic');
    }
    expect(r.ai.provider).toBe('minimax-cn');

    // 确定性检查结果不受影响：/checks 无 semantic 项，blockers 一致
    const after = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks`, payload: {} })).json();
    expect(after.blockers).toBe(before.blockers);
    expect(after.issues.some((i: any) => i.category === 'semantic')).toBe(false);
  });

  it('local_only → 403；未批准 → 403 needsApproval；模型不可用 → 503', async () => {
    const local = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks/ai`, payload: {} });
    expect(local.statusCode).toBe(403);
    expect(local.json().needsApproval).toBeUndefined();

    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });
    const denied = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks/ai`, payload: {} });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().needsApproval).toBe(true);

    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/approve`, payload: { mode: 'authorized-summary' } });
    writeFileSync(replayPath, JSON.stringify({ calls: [] }));
    const fail = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks/ai`, payload: {} });
    expect(fail.statusCode).toBe(503);
  });

  it('补证建议：一键生成 EvidenceRequest 草稿（走既有幂等通道），需批准', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });
    const denied = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/evidence-requests/ai-draft`, payload: {} });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().needsApproval).toBe(true);

    // 服务层 + fake client：建议映射为草稿
    const workbench = new WorkbenchService(store);
    await workbench.approveOutbound(projectId, 'authorized-summary');
    const fake = new LlmStageClient({
      chain: [{ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }],
      transport: async () => ({ text: MODEL_GAPS, cost: 0.0006 }),
    });
    const r = await workbench.aiDraftEvidenceGaps(projectId, { client: fake });
    expect(r.created).toHaveLength(1);
    expect(r.created[0]).toMatchObject({ state: 'draft', question: '缺货对销售下降的贡献需要量化验证' });
    // 草稿进入既有请求清单（批准/导出/回流通道复用）
    const list = (await app.inject({ url: `/api/projects/${projectId}/evidence-requests` })).json().requests;
    expect(list).toHaveLength(1);
    // 出站审计
    const log = JSON.parse(readFileSync(join(dir, projectId, 'work', 'outbound-log.json'), 'utf-8'));
    expect(log.at(-1)).toMatchObject({ stage: 'evidence-gaps', mode: 'authorized-summary' });
  });
});
