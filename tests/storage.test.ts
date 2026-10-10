import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../src/storage/workspace.js';

function tempStore(): { store: WorkspaceStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'rs-store-'));
  return { store: new WorkspaceStore(dir), dir };
}

describe('workspace 存储（T7 现行合同）', () => {
  it('项目 CRUD：kind=ppt、列表排序、更新、删除整目录', async () => {
    const { store, dir } = tempStore();
    try {
      const a = await store.createProject({ title: '甲', purpose: '复盘' });
      expect(a.kind).toBe('ppt');
      const b = await store.createProject({ title: '乙' });
      const list = await store.listProjects();
      expect(list.map((p) => p.project_id).sort()).toEqual([a.project_id, b.project_id].sort());

      const updated = await store.updateProject(a.project_id, { title: '甲改' });
      expect(updated.title).toBe('甲改');
      expect((await store.getProject(a.project_id))!.title).toBe('甲改');

      await store.deleteProject(b.project_id);
      expect(await store.getProject(b.project_id)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('材料资产：保存/列表/读取/派生/删除', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '材料' });
      const asset = await store.saveSourceAsset(p.project_id, {
        filename: '结论.md', content: Buffer.from('# 结论'), media_type: 'text/markdown', kind: 'markdown', logical_key: 'source:local:结论',
      });
      expect(asset.parse_status).toBe('pending');
      expect((await store.listSourceAssets(p.project_id))).toHaveLength(1);
      expect((await store.readSourceContent(p.project_id, asset.source_id)).toString()).toContain('结论');

      await store.saveDerivedAssets(p.project_id, asset.source_id, { claims: [1, 2, 3] });
      expect((await store.readDerivedAssets(p.project_id, asset.source_id))!.claims).toHaveLength(3);

      await store.deleteSourceAsset(p.project_id, asset.source_id);
      expect((await store.listSourceAssets(p.project_id))).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('导出记录：保存/列表/读取；新导出不改写旧记录', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '导出' });
      const r1 = await store.saveExport(p.project_id, { revision_id: 'deck', format: 'pptx', artifact: Buffer.from('PK-first'), checks: { qa: true }, is_draft: false, export_scope: 'internal' });
      const r2 = await store.saveExport(p.project_id, { revision_id: 'deck', format: 'html', artifact: Buffer.from('<html>'), checks: {}, is_draft: false, export_scope: 'internal' });
      expect(r1.export_id).not.toBe(r2.export_id);
      expect((await store.listExports(p.project_id))).toHaveLength(2);
      expect((await store.getExport(p.project_id, r1.export_id))!.format).toBe('pptx');
      expect((await store.getExport(p.project_id, 'exp_99'))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('复制项目：独立副本（sources 随拷，互不影响）', async () => {
    const { store, dir } = tempStore();
    try {
      const p = await store.createProject({ title: '原' });
      await store.saveSourceAsset(p.project_id, { filename: 'a.md', content: Buffer.from('x'), media_type: 'text/markdown', kind: 'markdown' });
      const copy = await store.copyProject(p.project_id, '副本');
      expect(copy.project_id).not.toBe(p.project_id);
      expect((await store.listSourceAssets(copy.project_id))).toHaveLength(1);
      await store.deleteSourceAsset(copy.project_id, (await store.listSourceAssets(copy.project_id))[0]!.source_id);
      expect((await store.listSourceAssets(p.project_id))).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
