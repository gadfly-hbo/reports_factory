import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transportKey } from '../src/model/recording.js';
import { buildProposalRequest } from '../src/model/ai-proposal.js';
import { retailBundleRich, retailBrief } from './helpers/retail.js';

/**
 * S5（M5）：自然语言 → 变更提案（授权摘要）。
 * 起草 ≠ 应用：模型只产 EditOp 草案（强校验，仅 edit_text），应用仍走既有 /propose
 * 单一控制器——锁（L6）、版本冲突（G7）、审计（模型起草标记）全部由程序约束。
 * AI 路径离线：replay 文件键经 buildProposalRequest + transportKey 精确构造。
 */

async function setupEditorialProject(app: ReturnType<typeof buildServer>, pid: string): Promise<void> {
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/bundle`, payload: retailBundleRich() });
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/brief`, payload: { brief: retailBrief } });
  const recs = (await app.inject({ method: 'POST', url: `/api/projects/${pid}/recommend` })).json().recommendations;
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/decisions`, payload: { decisions: recs } });
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/outline`, payload: { brief: retailBrief } });
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/approve-g1`, payload: { approver: '张编制' } });
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/assemble`, payload: {} });
}

const INTENT = '把第 2 页标题改得更精简：下降集中在部分重点门店';
const MODEL_OUTPUT = JSON.stringify({
  op: { kind: 'edit_text', page_id: 'page_02', field: 'headline', text: '下降集中在部分重点门店' },
  note: '按意图精简标题措辞，不改动数字与限制',
});

describe('S5 自然语言→变更提案', () => {
  let dir: string;
  let app: ReturnType<typeof buildServer>;
  let store: WorkspaceStore;
  let projectId: string;
  let replayPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-ai-prop-'));
    store = new WorkspaceStore(dir);
    replayPath = join(dir, 'replay.json');
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = replayPath;
    app = buildServer(store);
    projectId = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'AI 提案' } })).json().project.project_id;
    await setupEditorialProject(app, projectId);
  });
  afterEach(async () => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** 写入一条与当前 spec/intent 精确匹配的 replay 录制，并切到 allow_external */
  async function stageHappyReplay(): Promise<string> {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const { system, user } = buildProposalRequest(spec, INTENT);
    writeFileSync(replayPath, JSON.stringify({ calls: [{
      key: transportKey({ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }, { system, user }),
      request: { provider: 'minimax-cn', modelId: 'MiniMax-M2.7', system, user },
      response: { text: MODEL_OUTPUT, cost: 0.0008 },
    }] }));
    return spec.revision_id;
  }

  it('起草→确认→应用：op 强校验、expected_revision 捕获、审计含 model-draft 标记', async () => {
    const expected = await stageHappyReplay();
    const draft = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/proposal/draft`,
      payload: { intent: INTENT },
    });
    expect(draft.statusCode).toBe(200);
    const body = draft.json();
    expect(body.op).toMatchObject({ kind: 'edit_text', page_id: 'page_02', field: 'headline' });
    expect(body.source).toBe('model-draft');
    expect(body.expected_revision).toBe(expected);

    const applied = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: body.op, expected_revision: body.expected_revision, source: 'model-draft' },
    });
    expect(applied.statusCode).toBe(200);
    const proposals = (await app.inject({ url: `/api/projects/${projectId}/proposals` })).json().proposals;
    expect(proposals.at(-1).source).toBe('model-draft');
    // 应用后审计的 before/after 真实
    expect(proposals.at(-1).changes[0].before).not.toBe(proposals.at(-1).changes[0].after);
  });

  it('L6：锁定字段的提案在应用时被控制器拒绝（模型不绕过锁，与来源无关）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'set_locks', page_id: 'page_02', locks: { headline: true } }, expected_revision: spec.revision_id },
    });
    const applied = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'edit_text', page_id: 'page_02', field: 'headline', text: '被锁标题的新文案' }, expected_revision: (await app.inject({ url: `/api/projects/${projectId}` })).json().spec.revision_id, source: 'model-draft' },
    });
    expect(applied.statusCode).toBe(422);
  });

  it('G7/L7：起草后修订前进 → 按旧 expected_revision 应用被 409 拒绝', async () => {
    const expected = await stageHappyReplay();
    const draft = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/proposal/draft`, payload: { intent: INTENT } });
    expect(draft.statusCode).toBe(200);
    // 期间另一笔修改先落地（修订前进）
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'edit_text', page_id: 'page_02', field: 'body', text: '先落地的另一笔修改' }, expected_revision: expected },
    });
    const stale = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: draft.json().op, expected_revision: expected, source: 'model-draft' },
    });
    expect(stale.statusCode).toBe(409);
  });

  it('模型不可用 → 503，报告无半状态', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    writeFileSync(replayPath, JSON.stringify({ calls: [] }));
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/proposal/draft`, payload: { intent: '随便改改' } });
    expect(res.statusCode).toBe(503);
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    expect(spec.revision_id).toBe((await app.inject({ url: `/api/projects/${projectId}` })).json().spec.revision_id);
  });

  it('local_only → 403', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/proposal/draft`, payload: { intent: '改一下标题' } });
    expect(res.statusCode).toBe(403);
  });
});
