import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
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
    expect(draft.open_questions.some((q: any) => q.kind === 'conflict')).toBe(true);

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

describe('多冲突逐次解决（回归：之前的决定不被覆盖）', () => {
  let app: import('fastify').FastifyInstance;
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-api2-'));
    app = buildServer(new WorkspaceStore(dir));
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it('两个冲突一次解决一个，历史决定保留，最终可正式导出', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '多冲突测试' } });
    const id = createRes.json().project.project_id;

    for (const f of ['sales.csv', 'sales-conflict-2rows.csv']) {
      const content_base64 = readFileSync(join(MAT, f)).toString('base64');
      await app.inject({
        method: 'POST', url: `/api/projects/${id}/sources`,
        payload: { filename: f, content_base64, kind: 'csv', media_type: 'text/csv' },
      });
    }
    await app.inject({
      method: 'POST', url: `/api/projects/${id}/outline`,
      payload: { brief: { audience: '商品经营负责人', purpose: '复盘', page_budget: 8 } },
    });
    await app.inject({ method: 'POST', url: `/api/projects/${id}/assemble`, payload: {} });

    const blocked = (await app.inject({
      method: 'POST', url: `/api/projects/${id}/export`, payload: { mode: 'formal', formats: ['pdf'] },
    })).json();
    const ids = blocked.checks.issues
      .filter((i: any) => i.id === 'source_conflict_unresolved')
      .map((i: any) => i.object_ref);
    expect(ids.length).toBe(2); // 5月与6月两行口径冲突

    // 模拟 UI 逐次点击解决
    await app.inject({
      method: 'POST', url: `/api/projects/${id}/resolve-conflict`,
      payload: { resolution: { [ids[0]!]: 'source_a' } },
    });
    await app.inject({
      method: 'POST', url: `/api/projects/${id}/resolve-conflict`,
      payload: { resolution: { [ids[1]!]: 'source_b' } },
    });

    const res = (await app.inject({ url: `/api/projects/${id}/conflict-resolutions` })).json();
    expect(res[ids[0]!].resolution).toBe('source_a'); // 回归点：曾被第二次调用整文件覆盖
    expect(res[ids[1]!].resolution).toBe('source_b');
    expect(res[ids[0]!].adopted_value).toBeDefined();
    expect(res[ids[1]!].adopted_value).toBeDefined();

    const ok = (await app.inject({
      method: 'POST', url: `/api/projects/${id}/export`, payload: { mode: 'formal', formats: ['pdf'] },
    })).json();
    expect(ok.allowed).toBe(true);
  });
});

describe('对外导出隐私链（§12.2 端到端）', () => {
  let app: import('fastify').FastifyInstance;
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-privacy-'));
    app = buildServer(new WorkspaceStore(dir));
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('外发需显式确认链；聚合降级后图表数据不可提取；敏感来源阻断', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '外发测试' } });
    const id = createRes.json().project.project_id;
    for (const f of [
      { filename: 'conclusion.md', kind: 'markdown', media_type: 'text/markdown' },
      { filename: 'sales.csv', kind: 'csv', media_type: 'text/csv' },
    ] as const) {
      const content_base64 = readFileSync(join(MAT, f.filename)).toString('base64');
      await app.inject({ method: 'POST', url: `/api/projects/${id}/sources`, payload: { filename: f.filename, content_base64, kind: f.kind, media_type: f.media_type } });
    }
    await app.inject({ method: 'POST', url: `/api/projects/${id}/outline`, payload: { brief: { audience: '负责人', purpose: '复盘', page_budget: 8 } } });
    await app.inject({ method: 'POST', url: `/api/projects/${id}/assemble`, payload: {} });

    // 1) 外发 + 任何确认都没有 → 阻断（外发策略 + 图表底层数据）
    const blocked1 = (await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external' } })).json();
    expect(blocked1.allowed).toBe(false);
    const ids1 = blocked1.checks.issues.map((i: any) => i.id);
    expect(ids1).toContain('external_share_violation');
    expect(ids1).toContain('privacy_chart_underlying_data');
    expect(blocked1.privacy.not_checked_count).toBeGreaterThan(0); // 明示未覆盖项

    // 2) 确认外发 + 保留可编辑但不确认 → 仍被图表项阻断
    const blocked2 = (await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external', ack_external_share: true } })).json();
    expect(blocked2.allowed).toBe(false);
    expect(blocked2.checks.issues.map((i: any) => i.id)).toContain('privacy_chart_underlying_data');

    // 3) 确认外发 + 聚合降级 → 放行，PPTX 无 chart 部件
    const ok = (await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external', ack_external_share: true, chart_data_mode: 'aggregate_only' } })).json();
    expect(ok.allowed).toBe(true);
    const rec = ok.exports[0];
    expect(rec.artifact_path).toBeTruthy();
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(readFileSync(join(dir, id, rec.artifact_path)));
    expect(Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(0);

    // 4) 敏感来源对外 → 阻断（构造：另存 sensitive 材料并重新导入/组装）
    const sensitiveCsv = readFileSync(join(MAT, 'sales.csv')).toString('base64');
    // 直接把已有来源标记为 sensitive（模拟敏感材料进入快照）
    const detail = (await app.inject({ url: `/api/projects/${id}` })).json();
    const srcId = detail.sources[0].source_id;
    const metaPath = join(dir, id, 'sources', `${srcId}.json`);
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    meta.sensitivity = 'sensitive';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    const blocked3 = (await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external', ack_external_share: true, chart_data_mode: 'aggregate_only' } })).json();
    expect(blocked3.allowed).toBe(false);
    expect(blocked3.checks.issues.map((i: any) => i.id)).toContain('privacy_sensitive_sources');
  });
});

describe('XLSX 上传的显式选表流程（API）', () => {
  let app: import('fastify').FastifyInstance;
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-xlsx-'));
    app = buildServer(new WorkspaceStore(dir));
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('未选表 → 返回工作表清单；显式选表 → 解析成功', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'XLSX 测试' } });
    const id = createRes.json().project.project_id;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('汇总');
    ws.addRow(['月份', '销售额（万元）']);
    ws.addRow(['1月', 505]);
    ws.addRow(['2月', 510]);
    wb.addWorksheet('明细').addRow(['SKU', '数量']);
    const content_base64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');

    // 未选表
    const r1 = (await app.inject({
      method: 'POST', url: `/api/projects/${id}/sources`,
      payload: { filename: 'sales.xlsx', content_base64, kind: 'xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    })).json();
    expect(r1.ok).toBe(false);
    expect(r1.available_sheets).toEqual(['汇总', '明细']);
    expect(r1.source.parse_status).toBe('pending'); // 待选表，不算失败

    // 显式选表
    const r2 = (await app.inject({
      method: 'POST', url: `/api/projects/${id}/sources`,
      payload: { filename: 'sales.xlsx', content_base64, kind: 'xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sheet: '汇总' },
    })).json();
    expect(r2.ok).toBe(true);
    expect(r2.counts.tables).toBe(1);

    const detail = (await app.inject({ url: `/api/projects/${id}` })).json();
    expect(detail.sources.filter((x: any) => x.kind === 'xlsx').map((x: any) => x.parse_status)).toContain('parsed');
  });
});
