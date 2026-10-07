import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import type { FastifyInstance } from 'fastify';

/**
 * M10 S3：上传 → 读取理解 → 移除。
 * LLM 调用走录制回放（合成 fixture 材料录制，tests/fixtures/recordings/m10-s3-understand.json）。
 * PDF 提取为确定性路径（unpdf），无需录制。
 */

const REPLAY = join(import.meta.dirname, 'fixtures/recordings/m10-s3-understand.json');
const FIXTURE_MD = join(import.meta.dirname, 'fixtures/materials/m10-understand-fixture.md');

function replayEnv() {
  return { REPORT_STUDIO_MODEL_REPLAY: REPLAY, REPORT_STUDIO_HOME: '' };
}

describe('S3 读取理解（录制回放）', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;
  let projectId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-u3-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '理解测试' } });
    projectId = create.json().project.project_id;
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = REPLAY;
  });
  afterEach(() => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('上传合成材料 → 理解 → 摘要落盘 + framework 步解锁（G11/语义索引）', async () => {
    const up = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    expect(up.statusCode).toBe(200);
    const sourceId = up.json().source.source_id;

    const run = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: {} });
    expect(run.statusCode).toBe(200);
    expect(run.json().failed).toEqual([]);

    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const byKey = Object.fromEntries(detail.steps.map((s: { key: string; unlocked: boolean }) => [s.key, s.unlocked]));
    expect(byKey.framework).toBe(true); // 全部资料理解完成

    const ud = (await app.inject({ url: `/api/projects/${projectId}/understanding` })).json().understanding;
    const summary = ud[sourceId];
    expect(summary.points.length).toBeGreaterThan(3);
    expect(summary.uncovered).toBe(false);
    expect(summary.gist.length).toBeGreaterThan(5);
    // 语义索引：每条要点带主题标签，数据要点带数值
    for (const p of summary.points) {
      expect(p.topic_tag.length).toBeGreaterThan(0);
    }
    expect(summary.points.some((p: { kind: string; value?: number }) => p.kind === 'data' && typeof p.value === 'number')).toBe(true);
  });

  it('checkpoint：已完成文件重跑不重复调用（replay 只命中一次录制，第二次直接跳过）', async () => {
    const up = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    const sourceId = up.json().source.source_id;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: {} });
    // 第二次：全部已有摘要 → done 直接返回，不触发任何模型调用（无录制也不会 miss）
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    const again = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: {} });
    expect(again.statusCode).toBe(200);
    expect(again.json().done).toEqual([sourceId]);
  });

  it('移除资料（M-U1）：原件与摘要一并清除，失败/多余资料不再阻塞框架', async () => {
    const up = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    const sourceId = up.json().source.source_id;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: {} });

    const del = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/sources/${sourceId}` });
    expect(del.statusCode).toBe(200);
    expect((await store.listSourceAssets(projectId)).find((a) => a.source_id === sourceId)).toBeUndefined();
    const ud = (await app.inject({ url: `/api/projects/${projectId}/understanding` })).json().understanding;
    expect(ud[sourceId]).toBeUndefined();
    // 全部资料移除后 framework 回到锁定（无可理解资料）
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const byKey = Object.fromEntries(detail.steps.map((s: { key: string; unlocked: boolean }) => [s.key, s.unlocked]));
    expect(byKey.framework).toBe(false);
  });

  it('local_only 项目理解被围栏拒绝（403，N8）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'local_only' });
    const up = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'a.md', content_base64: Buffer.from('# x\n内容').toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    const sourceId = up.json().source.source_id;
    const run = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: { source_id: sourceId } });
    expect(run.statusCode).toBe(403);
  });
});

describe('S3 PDF 提取（unpdf，确定性）', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-pdf-'));
    app = buildServer(new WorkspaceStore(dir));
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('中文 PDF：文本提取（NFKC 部首归一）+ parse_status=parsed（M-U5）', async () => {
    // 直取提取层：断言中文文本可提取且康熙部首变体归一（⽉→月）
    const { extractText, getDocumentProxy } = await import('unpdf');
    const buf = readFileSync(join(import.meta.dirname, 'fixtures/materials/m10-sample-cn.pdf'));
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    expect(text.normalize('NFKC')).toContain('复购率');
    expect(text.normalize('NFKC')).toContain('库存周转天数');

    // 路由层：kind=pdf 走通 ingest，解析成功
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'PDF 测试' } });
    const id = create.json().project.project_id;
    const up = await app.inject({
      method: 'POST', url: `/api/projects/${id}/sources`,
      payload: { filename: 'm10-sample-cn.pdf', content_base64: buf.toString('base64'), kind: 'pdf', media_type: 'application/pdf' },
    });
    expect(up.statusCode).toBe(200);
    expect(up.json().source.parse_status).toBe('parsed');
  });

  it('垃圾字节：解析失败明示原因，不静默产空摘要', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'PDF 坏件' } });
    const id = create.json().project.project_id;
    const up = await app.inject({
      method: 'POST', url: `/api/projects/${id}/sources`,
      payload: { filename: 'broken.pdf', content_base64: Buffer.from('this is not a pdf').toString('base64'), kind: 'pdf', media_type: 'application/pdf' },
    });
    expect(up.json().source.parse_status).toBe('failed');
    expect(up.json().failure_reason).toContain('PDF');
  });
});
