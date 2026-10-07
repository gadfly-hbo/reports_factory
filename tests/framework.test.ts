import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import type { FastifyInstance } from 'fastify';

/**
 * M10 S4：框架生成 → 编辑 → 确认锁定（人决策点 1）。
 * LLM 调用走录制回放（S3 理解 + S4 框架两份夹具，合成 fixture 数据）。
 */
const S3 = join(import.meta.dirname, 'fixtures/recordings/m10-s3-understand.json');
const S4 = join(import.meta.dirname, 'fixtures/recordings/m10-s4-framework.json');
const FIXTURE_MD = join(import.meta.dirname, 'fixtures/materials/m10-understand-fixture.md');

describe('S4 框架生成与确认锁定（录制回放）', () => {
  let app: FastifyInstance;
  let dir: string;
  let projectId: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-fw-'));
    savedEnv['REPLAY'] = process.env['REPORT_STUDIO_MODEL_REPLAY'];
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = `${S3},${S4}`;
    const store = new WorkspaceStore(dir);
    app = buildServer(store);
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '理解测试' } });
    projectId = create.json().project.project_id;
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: {} });
  });
  afterEach(() => {
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = savedEnv['REPLAY'];
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('生成 → 编辑（改题/删页/调序）→ 确认锁定 → generate 步解锁', async () => {
    // 未生成前 PUT 被拒（框架只能由生成产生）
    const earlyPut = await app.inject({ method: 'PUT', url: `/api/projects/${projectId}/framework`, payload: { pages: [{ title: 'x', page_type: 'cover' }, { title: 'y', page_type: 'summary' }] } });
    expect(earlyPut.statusCode).toBe(400);

    const gen = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/framework/generate`, payload: {} });
    expect(gen.statusCode).toBe(200);
    const pages = gen.json().framework.pages;
    expect(pages.length).toBeGreaterThanOrEqual(5);
    expect(pages[0]!.page_id).toBe('page_01');
    for (const p of pages) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.intent?.length ?? 0).toBeGreaterThan(3);
    }
    // source_hint 是语义标签（S5 投影依据）
    const withHints = pages.filter((p: { source_hint?: string[] }) => (p.source_hint ?? []).length > 0);
    expect(withHints.length).toBeGreaterThan(0);

    // 编辑：改首题 + 删第二页 → page_id 重排
    const edited = [...pages];
    edited[0] = { ...edited[0]!, title: '改后的封面题' };
    const removed = edited.splice(1, 1);
    const put = await app.inject({ method: 'PUT', url: `/api/projects/${projectId}/framework`, payload: { pages: edited } });
    expect(put.statusCode).toBe(200);
    const after = put.json().framework.pages;
    expect(after[0]!.title).toBe('改后的封面题');
    expect(after.map((p: { page_id: string }) => p.page_id)).toEqual(after.map((_: unknown, i: number) => `page_${String(i + 1).padStart(2, '0')}`));
    expect(after.find((p: { title: string }) => p.title === removed[0]!.title)).toBeUndefined();

    // 确认 → 锁定 + generate 步解锁
    const confirm = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/framework/confirm`, payload: {} });
    expect(confirm.statusCode).toBe(200);
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const byKey = Object.fromEntries(detail.steps.map((s: { key: string; unlocked: boolean }) => [s.key, s.unlocked]));
    expect(byKey.generate).toBe(true);
    expect(detail.framework_confirmed).toBe(true);

    // 确认后：编辑与重生成均 422（N1 围栏）
    const putLocked = await app.inject({ method: 'PUT', url: `/api/projects/${projectId}/framework`, payload: { pages: edited } });
    expect(putLocked.statusCode).toBe(422);
    const genLocked = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/framework/generate`, payload: {} });
    expect(genLocked.statusCode).toBe(422);
  });
});
