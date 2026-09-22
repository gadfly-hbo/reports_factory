import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { retailReviewSpec } from '../src/samples/retail-review.js';

function tempStore(): { store: WorkspaceStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'rs-store-'));
  return { store: new WorkspaceStore(dir), dir };
}

describe('项目 CRUD 与存储布局（F01）', () => {
  it('创建项目：目录结构与 project.json 就位', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: 'Q3 经营复盘', purpose: '经营例会' });
      expect(p.title).toBe('Q3 经营复盘');
      expect(p.privacy_policy).toBe('local_only');
      for (const sub of ['sources', 'revisions', 'exports']) {
        expect(existsSync(join(dir, p.project_id, sub))).toBe(true);
      }
      const manifest = JSON.parse(readFileSync(join(dir, p.project_id, 'project.json'), 'utf-8'));
      expect(manifest.project_id).toBe(p.project_id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('复制项目：独立副本，互不影响', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '原项目' });
      await store.saveRevision(p.project_id, retailReviewSpec, '初稿');
      const copy = await store.copyProject(p.project_id, '副本');
      expect(copy.project_id).not.toBe(p.project_id);
      expect(copy.title).toBe('副本');
      const origRevs = await store.listRevisions(p.project_id);
      const copyRevs = await store.listRevisions(copy.project_id);
      expect(copyRevs.length).toBe(origRevs.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('删除项目：原件、派生结果与目录一并清理', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '将删除' });
      await store.saveSourceAsset(p.project_id, {
        filename: 'summary.csv',
        content: Buffer.from('月份,销售额\n1月,505\n'),
        media_type: 'text/csv',
        kind: 'csv',
      });
      const projectDir = join(dir, p.project_id);
      expect(existsSync(projectDir)).toBe(true);
      await store.deleteProject(p.project_id);
      expect(existsSync(projectDir)).toBe(false);
      expect(await store.getProject(p.project_id)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('材料原件与哈希（F02 基础）', () => {
  it('保存来源：原件落盘、sha256 一致、可重新读取', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '材料' });
      const content = Buffer.from('# 结论\n\n销售额下降。', 'utf-8');
      const asset = await store.saveSourceAsset(p.project_id, {
        filename: 'conclusion.md',
        content,
        media_type: 'text/markdown',
        kind: 'markdown',
      });
      const expected = createHash('sha256').update(content).digest('hex');
      expect(asset.file_hash).toBe(expected);
      const read = await store.readSourceContent(p.project_id, asset.source_id);
      expect(read.toString('utf-8')).toContain('销售额下降');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('修订与导出记录（F10/F11 基础）', () => {
  it('保存修订 → 新进程（新 store 实例）读回完整状态（重启恢复）', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '恢复测试' });
      await store.saveSourceAsset(p.project_id, {
        filename: 'a.md', content: Buffer.from('材料'), media_type: 'text/markdown', kind: 'markdown',
      });
      await store.saveRevision(p.project_id, retailReviewSpec, '初稿');
      await store.saveExport(p.project_id, {
        revision_id: 'rev_001',
        format: 'pdf',
        artifact: Buffer.from('%PDF-fake'),
        checks: { issues: 0 },
        is_draft: false,
      });

      // 模拟重启：新实例读回
      const store2 = new WorkspaceStore(dir);
      const loaded = await store2.getProject(p.project_id);
      expect(loaded!.title).toBe('恢复测试');
      const revs = await store2.listRevisions(p.project_id);
      expect(revs.length).toBe(1);
      expect(revs[0]!.spec.report_id).toBe('report_m0_page_types');
      const exportsList = await store2.listExports(p.project_id);
      expect(exportsList.length).toBe(1);
      const sources = await store2.listSourceAssets(p.project_id);
      expect(sources.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('新修订不改写旧修订；新导出不改写旧导出记录', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '版本冻结' });
      const r1 = await store.saveRevision(p.project_id, retailReviewSpec, '初稿');
      const modified = structuredClone(retailReviewSpec);
      modified.pages[0]!.headline = '改后的封面';
      await store.saveRevision(p.project_id, modified, '改标题');
      const readBack = await store.getRevision(p.project_id, r1.revision_id);
      expect(readBack!.spec.pages[0]!.headline).toContain('经营复盘'); // 旧修订未漂移

      const e1 = await store.saveExport(p.project_id, {
        revision_id: r1.revision_id, format: 'pdf',
        artifact: Buffer.from('%PDF-1'), checks: { issues: 0 }, is_draft: false,
      });
      const before = JSON.stringify(await store.getExport(p.project_id, e1.export_id));
      await store.saveExport(p.project_id, {
        revision_id: r1.revision_id, format: 'pptx',
        artifact: Buffer.from('PK-fake'), checks: { issues: 0 }, is_draft: false,
      });
      expect(JSON.stringify(await store.getExport(p.project_id, e1.export_id))).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
