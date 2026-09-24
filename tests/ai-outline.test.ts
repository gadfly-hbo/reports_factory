import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transportKey, type RecordedCall } from '../src/model/recording.js';

/**
 * S3（M5）：蓝图编排 AI 接入。
 * 全离线：REPORT_STUDIO_MODEL_REPLAY 指向手写录制文件（键经 transportKey 计算）。
 * 断言：批准流（L2）、模型蓝图生效、失败自动回退规则版（L4）、outboundLog 零内容审计。
 */

const OUTLINE_SYSTEM =
  '你是汇报蓝图设计师。基于任务书与资产清单设计页计划，只输出 JSON：{"pages":[{"type":"cover|summary|metrics_overview|trend|issue_breakdown|option_comparison|action_items|evidence_appendix","headline":string,"purpose":string}],"open_questions":[{"text":string,"kind":"conflict|confirmation|gap"}]}。页数不超过任务书预算；不要输出其他文字。';

function outlineRecording(user: string, text: string, provider = 'minimax-cn', modelId = 'MiniMax-M2.7'): RecordedCall {
  return {
    key: transportKey({ provider, modelId }, { system: OUTLINE_SYSTEM, user }),
    request: { provider, modelId, system: OUTLINE_SYSTEM, user },
    response: { text, cost: 0.0004 },
  };
}

const MODEL_OUTPUT = JSON.stringify({
  pages: [
    { type: 'cover', headline: '补货试点评审（商品与运营负责人）', purpose: '开场：明确本次待决事项' },
    { type: 'summary', headline: '重点门店下降集中，建议评估补货试点', purpose: '结论：呈现主线' },
    { type: 'option_comparison', headline: '试点方案与停止条件', purpose: '决策：方案比较' },
  ],
  open_questions: [],
});

const BRIEF = {
  audience: '商品与运营负责人',
  purpose: '讨论是否批准有限范围的补货试点',
  page_budget: 5,
  core_question: '问题集中在哪里、是否值得试点、怎样控制风险',
};

describe('S3 蓝图编排 AI 接入', () => {
  let dir: string;
  let projectId: string;
  let app: ReturnType<typeof buildServer>;
  let replayPath: string;
  let store: WorkspaceStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-ai-'));
    store = new WorkspaceStore(dir);
    replayPath = join(dir, 'replay.json');
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = replayPath;
    app = buildServer(store);
    projectId = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'AI 蓝图' } })).json().project.project_id;
  });
  afterEach(async () => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('L2：with_approval 未批准 → 403 需批准；批准后调用成功且模型蓝图生效', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: BRIEF } });

    const denied = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline/ai`, payload: { brief: BRIEF } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().needsApproval).toBe(true);

    // 批准 structure-only（会话级）→ 重试成功
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/approve`, payload: { mode: 'structure-only' } });
    writeFileSync(replayPath, JSON.stringify({ calls: [outlineRecording(JSON.stringify({
      task: 'structure-only',
      brief: { audience: BRIEF.audience, purpose: BRIEF.purpose, pageBudget: BRIEF.page_budget, coreQuestion: BRIEF.core_question },
      assets: { claimKinds: {}, tables: [] },
    }, null, 1), MODEL_OUTPUT)] }));

    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline/ai`, payload: { brief: BRIEF } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ai.used).toBe(true);
    expect(body.ai.usedFallback).toBe(false);
    expect(body.ai.provider).toBe('minimax-cn');
    expect(body.draft.pages).toHaveLength(3); // 模型给的 3 页结构
    expect(body.draft.pages[0].blueprint.page_purpose).toContain('待决');

    // 审计：outboundLog 零内容、记条数与成本；被拒尝试也留痕（R2-4 阻断审计）
    const log = JSON.parse(readFileSync(join(dir, projectId, 'work', 'outbound-log.json'), 'utf-8'));
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ stage: 'outline', blocked: true, provider: 'none' });
    expect(log[1]).toMatchObject({ stage: 'outline', provider: 'minimax-cn', mode: 'structure-only' });
    expect(JSON.stringify(log)).not.toContain(BRIEF.audience); // 零内容（日志只有计数与元数据）
  });

  it('L4：replay 未命中（模型不可用）→ 自动回退确定性 8 页并标记 usedFallback', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/approve`, payload: { mode: 'structure-only' } });
    // 空录制文件 = 全部未命中
    writeFileSync(replayPath, JSON.stringify({ calls: [] }));

    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline/ai`, payload: { brief: BRIEF } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ai.used).toBe(true);
    expect(body.ai.usedFallback).toBe(true);
    expect(body.ai.provider).toBeUndefined();
    expect(body.draft.pages).toHaveLength(8); // 确定性兜底
  });

  it('local_only → 403 且不产生调用；allow_external 免批准', async () => {
    const local = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline/ai`, payload: { brief: BRIEF } });
    expect(local.statusCode).toBe(403);
    expect(local.json().needsApproval).toBeUndefined();

    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    writeFileSync(replayPath, JSON.stringify({ calls: [outlineRecording('{}', MODEL_OUTPUT)] }));
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline/ai`, payload: { brief: BRIEF } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ai.usedFallback).toBe(true); // '{}' schema 不合格 → 兜底，但不阻断
  });
});
