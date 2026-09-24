import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { LlmStageClient } from '../src/model/client.js';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { retailBundle, retailBundleRich, retailBrief } from './helpers/retail.js';

/**
 * S4（M5）：AI 取舍推荐（授权摘要模式）。
 * 服务层 happy path 用注入的 fake client（transport seam，离线）；
 * 路由层用 replay env 验证门禁与兜底。
 * 断言：sensitive 默认不出站（K3）、粘性不翻案（T06/L7）、出站审计、L4 回退。
 */

const SENSITIVE_TEXT = '门店店长口头反馈的敏感渠道信息（不应出站）';

async function setupProject(app: FastifyInstance, store: WorkspaceStore): Promise<string> {
  const pid = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'AI 推荐' } })).json().project.project_id;
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/bundle`, payload: retailBundleRich() });
  // 敏感来源的独立成果包（F09）
  await app.inject({
    method: 'POST', url: `/api/projects/${pid}/bundle`,
    payload: retailBundle({
      bundle_id: 'bundle_hr_sensitive',
      upstream: { task_id: 'task_hr', result_revision: 'r1' },
      permissions: { sensitivity: 'sensitive', external_share: 'none' },
      findings: [{ finding_id: 'F09', kind: 'fact_statement', text: SENSITIVE_TEXT, verification: 'unverified' }],
      metrics: [],
      evidence: [],
    }),
  });
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/brief`, payload: { brief: retailBrief } });
  await store.updateProject(pid, { privacy_policy: 'allow_external_with_approval' });
  return pid;
}

describe('S4 AI 取舍推荐', () => {
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-ai-rec-'));
    store = new WorkspaceStore(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('服务层：模型建议 + 粘性合并（L7）+ sensitive 默认不出站（K3）+ 出站审计', async () => {
    const app = buildServer(store);
    const pid = await setupProject(app, store);
    // 用户已排除 F02（因果未证实）
    await app.inject({
      method: 'POST', url: `/api/projects/${pid}/decisions`,
      payload: { decisions: [{ logical_key: 'bundle:xanthil:task_sales::F02', placement: 'excluded', reason: '因果未证实' }] },
    });

    const captured: { user: string }[] = [];
    const fakeClient = new LlmStageClient({
      chain: [{ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }],
      transport: async (_cfg, req) => {
        captured.push({ user: req.user });
        const placements = [
          { id: 'bundle:xanthil:task_sales::F01', placement: 'body', reason: '核心问题相关' },
          { id: 'bundle:xanthil:task_sales::F02', placement: 'body', reason: '模型想放进正文' }, // 应被粘性覆盖
          { id: 'bundle:xanthil:task_sales::F04', placement: 'body', reason: '待决建议' },
          { id: 'bundle:xanthil:task_sales::F05', placement: 'excluded', reason: '无关维度' },
          { id: 'bundle:xanthil:task_sales::F06', placement: 'appendix', reason: '口径说明' },
          { id: 'bundle:xanthil:task_hr::F09', placement: 'body', reason: '不应出现：sensitive 默认已排除，模型看不到它' },
          { id: 'bundle:invented::XX', placement: 'body', reason: '模型发明 id，应被丢弃' },
        ];
        return { text: JSON.stringify({ placements }), cost: 0.0006 };
      },
    });

    const workbench = new WorkbenchService(store);
    await workbench.approveOutbound(pid, 'authorized-summary'); // 会话批准（服务层测试前置）
    const r = await workbench.aiRecommend(pid, { client: fakeClient });

    expect(r.source).toBe('ai');
    expect(r.ai.usedFallback).toBe(false);
    expect(r.ai.provider).toBe('minimax-cn');
    const byKey = Object.fromEntries(r.recommendations.map((x) => [x.logical_key, x]));
    // 粘性：模型建议 body，但用户 excluded 决定胜出
    expect(byKey['bundle:xanthil:task_sales::F02']).toMatchObject({ placement: 'excluded', sticky: true });
    // 发明 id 被丢弃；模型建议正常映射
    expect(byKey['bundle:invented::XX']).toBeUndefined();
    expect(byKey['bundle:xanthil:task_sales::F01']).toMatchObject({ placement: 'body' });
    // F09（sensitive）默认不出站 → 模型看不到它 → 无推荐；但已有决定也不存在 → 不在结果里
    expect(byKey['bundle:xanthil:task_hr::F09']).toBeUndefined();
    // K3：出站 payload 不含 sensitive 文本，含普通发现文本
    expect(captured[0]!.user).not.toContain(SENSITIVE_TEXT);
    expect(captured[0]!.user).toContain('重点门店销售额同比下降 12%');

    // 出站审计：零内容 + 条数
    const log = JSON.parse(readFileSync(join(dir, pid, 'work', 'outbound-log.json'), 'utf-8'));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ stage: 'recommend', mode: 'authorized-summary', itemCount: 5 });
    expect(JSON.stringify(log)).not.toContain('重点门店');

    // 持久化采纳：AI 推荐照常走 decisions 通道
    const saved = await app.inject({ method: 'POST', url: `/api/projects/${pid}/decisions`, payload: { decisions: r.recommendations } });
    expect(saved.statusCode).toBe(200);
    await app.close();
  });

  it('模型失败 → 自动回退规则版（L4），来源标记 rules', async () => {
    const app = buildServer(store);
    const pid = await setupProject(app, store);
    const failing = new LlmStageClient({
      chain: [{ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }],
      transport: async () => {
        throw new Error('429 rate limit');
      },
    });
    const workbench = new WorkbenchService(store);
    await workbench.approveOutbound(pid, 'authorized-summary');
    const r = await workbench.aiRecommend(pid, { client: failing });
    expect(r.source).toBe('rules');
    expect(r.ai.usedFallback).toBe(true);
    expect(r.recommendations.length).toBeGreaterThan(0); // 规则版推荐可用
    expect(r.recommendations.some((x) => x.reason.includes('核心问题'))).toBe(true);
    await app.close();
  });

  it('路由门禁：local_only 403；with_approval 未批准 403(needsApproval)；批准后放行', async () => {
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = join(dir, 'empty-replay.json');
    writeFileSync(join(dir, 'empty-replay.json'), JSON.stringify({ calls: [] }));
    const app = buildServer(store);
    // 独立的 local_only 项目
    const localPid = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '仅本地' } })).json().project.project_id;
    const localDenied = await app.inject({ method: 'POST', url: `/api/projects/${localPid}/recommend/ai` });
    expect(localDenied.statusCode).toBe(403);
    expect(localDenied.json().needsApproval).toBeUndefined();

    const pid = await setupProject(app, store);

    const notApproved = await app.inject({ method: 'POST', url: `/api/projects/${pid}/recommend/ai` });
    expect(notApproved.statusCode).toBe(403);
    expect(notApproved.json().needsApproval).toBe(true);

    await app.inject({ method: 'POST', url: `/api/projects/${pid}/outbound/approve`, payload: { mode: 'authorized-summary' } });
    const ok = await app.inject({ method: 'POST', url: `/api/projects/${pid}/recommend/ai` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().source).toBe('rules'); // 空录制=模型不可用 → 兜底
    expect(ok.json().ai.usedFallback).toBe(true);

    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
  });
});
