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

    // 记录源 id（影响面断言用）
    const detail0 = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const csvSourceId = detail0.sources.find((x: any) => x.filename === 'sales.csv').source_id;

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

    // 6) 解决冲突（记录采用值）→ 正式导出放行
    const conflictId = blocked.checks.issues.find((i: any) => i.id === 'source_conflict_unresolved')?.object_ref;
    const resolveRes = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/resolve-conflict`,
      payload: { resolution: { [conflictId]: 'source_a' } },
    });
    expect(resolveRes.statusCode).toBe(200);
    // 采用的口径值被记录（§10.2 展示冲突并由用户确认处理）
    const resolutions = (await app.inject({ url: `/api/projects/${projectId}/conflict-resolutions` })).json();
    expect(resolutions[conflictId].resolution).toBe('source_a');
    expect([452, 455]).toContain(resolutions[conflictId].adopted_value);
    // manual_value 必须带数值
    const manualBad = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/resolve-conflict`,
      payload: { resolution: { [conflictId]: 'manual_value' } },
    });
    expect(manualBad.statusCode).toBe(400);
    const ok = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['pptx', 'pdf'] },
    })).json();
    expect(ok.allowed).toBe(true);
    expect(ok.exports).toHaveLength(2);

    // 7) 局部编辑（改第3页标题）→ 产生新修订（切片7验收）
    const revsBefore = (await app.inject({ url: `/api/projects/${projectId}` })).json().revisions.length;
    const editRes = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/edit`,
      payload: { op: { kind: 'edit_text', page_id: 'page_03', field: 'headline', text: 'API 改后的标题' } },
    });
    expect(editRes.statusCode).toBe(200);
    const revsAfter = (await app.inject({ url: `/api/projects/${projectId}` })).json().revisions.length;
    expect(revsAfter).toBe(revsBefore + 1); // 每次实质修改产生 ReportRevision

    // 7b) 来源替换影响面端点（§13.2 来源替换行）
    const impact = (await app.inject({ url: `/api/projects/${projectId}/impact` })).json().impact;
    expect(impact[csvSourceId]).toContain('page_03'); // 指标总览
    expect(impact[csvSourceId]).toContain('page_04'); // 趋势页

    // 8) 预览包含关键内容（改后标题生效、推断保留）
    const preview = await app.inject({ method: 'GET', url: `/api/projects/${projectId}/preview` });
    expect(preview.statusCode).toBe(200);
    expect(preview.body).toContain('API 改后的标题');
    expect(preview.body).toContain('尚未证实');
    // 检查问题清单可查询
    const checks = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks`, payload: {} })).json();
    expect(typeof checks.blockers).toBe('number');

    // 9) 导出记录绑定完整检查结果（§10.4：可事后重建问题清单）
    const detailEnd = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const formalExport = detailEnd.exports.find((e: any) => !e.is_draft);
    expect(formalExport).toBeTruthy(); // 冲突解决后的正式导出
    expect(Array.isArray(formalExport.checks?.issues)).toBe(true);
    expect(formalExport.checks.blockers).toBe(0);
  });
});
