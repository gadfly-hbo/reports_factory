import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { join as pjoin } from 'node:path';
import type { FastifyInstance } from 'fastify';

const MAT = join(import.meta.dirname, 'fixtures/materials');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
describe('工作台 API：无 UI 也能完成完整闭环', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-api-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('建项目 → 传材料 → 出大纲 → 组装 → 检查 → 门禁导出 → 预览', async () => {
    // 1) 建项目
    const createRes = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'API 闭环测试' } });
    expect(createRes.statusCode).toBe(200);
    const projectId = createRes.json().project.project_id;

    // 2) 传 MD + CSV + 冲突 CSV 材料
    const files = [
      { filename: 'conclusion.md', path: pjoin(MAT, 'conclusion.md'), kind: 'markdown', media_type: 'text/markdown' },
      { filename: 'sales.csv', path: pjoin(MAT, 'sales.csv'), kind: 'csv', media_type: 'text/csv' },
      { filename: 'sales-conflict.csv', path: pjoin(MAT, 'sales-conflict.csv'), kind: 'csv', media_type: 'text/csv' },
    ] as const;
    for (const f of files) {
      const content_base64 = (await readFile(f.path)).toString('base64');
      const res = await app.inject({
        method: 'POST', url: `/api/projects/${projectId}/sources`,
        payload: { filename: f.filename, content_base64, kind: f.kind, media_type: f.media_type },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    }

    // 3) 大纲（确定性模式）
    const outlineRes = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/outline`,
      payload: { brief: { audience: '商品经营负责人', purpose: '上半年复盘', page_budget: 8 } },
    });
    expect(outlineRes.statusCode).toBe(200);
    const draft = outlineRes.json().draft;
    expect(draft.pages).toHaveLength(8);
    expect(draft.open_questions.some((q: string) => q.includes('冲突'))).toBe(true);

    // 4) 组装
    const assembleRes = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });
    expect(assembleRes.statusCode).toBe(200);
    expect(assembleRes.json().spec.pages).toHaveLength(8);

    // 5) 冲突未解决 → 正式导出被阻断
    const blocked = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['pdf'] },
    })).json();
    expect(blocked.allowed).toBe(false);
    expect(blocked.checks.blockers).toBeGreaterThan(0);

    // 6) 解决冲突 → 正式导出放行
    const conflictId = blocked.checks.issues.find((i: any) => i.id === 'source_conflict_unresolved')?.object_ref;
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/resolve-conflict`,
      payload: { resolution: { [conflictId]: 'source_a' } },
    });
    const ok = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['pptx', 'pdf'] },
    })).json();
    expect(ok.allowed).toBe(true);
    expect(ok.exports).toHaveLength(2);

    // 7) 局部编辑（锁定演示：改第3页标题）
    const editRes = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/edit`,
      payload: { op: { kind: 'edit_text', page_id: 'page_03', field: 'headline', text: 'API 改后的标题' } },
    });
    expect(editRes.statusCode).toBe(200);

    // 8) 预览包含关键内容（改后标题生效、推断保留）
    const preview = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('API 改后的标题');
    expect(preview.body).toContain('尚未证实');
    // 检查问题清单可查询
    const checks = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks`, payload: {} })).json();
    expect(typeof checks.blockers).toBe('number');
  });
});
