import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { ingestAndSave } from '../src/ingest/index.js';
import { detectConflicts } from '../src/ingest/conflicts.js';
import { createDeterministicGateway, type OutlineContext } from '../src/model/gateway.js';
import { assembleReportSpec, type AssembleContext } from '../src/compose/assemble.js';
import { applyEdit } from '../src/compose/edit.js';
import { pagesImpactedBySource } from '../src/compose/impact.js';
import { exportReport } from '../src/pipeline/export.js';
import { checkConsistency } from '../src/render/consistency.js';
import type { Claim, ReportBrief } from '../src/schema/report-spec.js';
import type { TableAsset } from '../src/schema/assets.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const brief: ReportBrief = {
  audience: '商品经营负责人',
  purpose: '上半年经营复盘与方案讨论',
  page_budget: 8,
};

interface Pipeline {
  store: WorkspaceStore;
  dir: string;
  projectId: string;
  claims: Claim[];
  tables: TableAsset[];
  conflicts: ReturnType<typeof detectConflicts>;
}

async function runPipelineUntilSpec(): Promise<Pipeline & { spec: ReturnType<typeof assembleReportSpec>; ctx: AssembleContext }> {
  const dir = mkdtempSync(join(tmpdir(), 'rs-e2e-'));
  const store = new WorkspaceStore(dir);
  const project = await store.createProject({ title: 'Q3 复盘（E2E）' });

  const md = await ingestAndSave(store, project.project_id, {
    filename: 'conclusion.md',
    content: await readFile(join(MAT, 'conclusion.md')),
    kind: 'markdown', media_type: 'text/markdown',
  });
  const csv = await ingestAndSave(store, project.project_id, {
    filename: 'sales.csv',
    content: await readFile(join(MAT, 'sales.csv')),
    kind: 'csv', media_type: 'text/csv',
  });
  const conflictCsv = await ingestAndSave(store, project.project_id, {
    filename: 'sales-conflict.csv',
    content: await readFile(join(MAT, 'sales-conflict.csv')),
    kind: 'csv', media_type: 'text/csv',
  });
  const img = await ingestAndSave(store, project.project_id, {
    filename: 'chart.png', content: Buffer.from(PNG_1PX, 'base64'),
    kind: 'image', media_type: 'image/png',
  });
  expect([md, csv, conflictCsv, img].every((r) => r.ok)).toBe(true);

  const claims = md.claims as Claim[];
  const tables = [...(csv.tables as TableAsset[]), ...(conflictCsv.tables as TableAsset[])];
  const conflicts = detectConflicts(tables);

  const outlineCtx: OutlineContext = {
    brief, claims, tables, evidence: md.evidence, conflicts, notes: [], confirmations: csv.confirmations,
  };
  const draft = await createDeterministicGateway().composeOutline(outlineCtx);
  // 用户确认大纲（E2E：原样确认）
  const ctx: AssembleContext = {
    brief, claims, tables, evidence: md.evidence, conflicts, notes: [],
    pagePlans: draft.pages,
    sourceSnapshot: [
      { source_id: md.source_id, version: 'v1', is_demo: true },
      { source_id: csv.source_id, version: 'v1', is_demo: true },
      { source_id: conflictCsv.source_id, version: 'v1', is_demo: true },
      { source_id: img.source_id, version: 'v1', is_demo: true },
    ],
  };
  const spec = assembleReportSpec({ report_id: 'report_e2e_001', ctx });
  return { store, dir, projectId: project.project_id, claims, tables, conflicts, spec, ctx };
}

describe('E2E 主链路：材料 → 大纲 → 组装 → 检查 → 门禁 → 导出（§13.2 正常汇报行）', () => {
  it('完整闭环：冲突阻断 → 解决冲突 → 正式导出三格式且一致', async () => {
    const p = await runPipelineUntilSpec();
    try {
      // 1) 存在未解决冲突 → 正式导出被阻断
      const blocked = await exportReport(p.store, p.projectId, p.spec, {
        mode: 'formal', formats: ['pptx', 'pdf'], conflicts: p.conflicts,
      });
      expect(blocked.gate.allowed).toBe(false);
      expect(blocked.checks.blockers).toBeGreaterThan(0);
      expect((await p.store.listExports(p.projectId)).length).toBe(0); // 未落任何导出

      // 2) 用户解决冲突（采用 source_a）→ 检查通过
      const resolved = p.conflicts.map((c) => ({ ...c, resolution: 'source_a' as const }));
      const ok = await exportReport(p.store, p.projectId, p.spec, {
        mode: 'formal', formats: ['pptx', 'pdf'], conflicts: resolved,
      });
      expect(ok.gate.allowed).toBe(true);
      expect(ok.exports).toHaveLength(2);

      // 3) 导出物真实存在、哈希记录、内容一致（§13.2 导出一致性行）
      for (const rec of ok.exports) {
        const file = join(p.dir, p.projectId, rec.artifact_path);
        expect(existsSync(file)).toBe(true);
        expect(readFileSync(file).length).toBeGreaterThan(1000);
      }
      const pptxPath = join(p.dir, p.projectId, ok.exports.find((e) => e.format === 'pptx')!.artifact_path);
      const pdfPath = join(p.dir, p.projectId, ok.exports.find((e) => e.format === 'pdf')!.artifact_path);
      const html = await import('../src/render/html.js').then((m) => m.renderReportHtml(ok.specUsed));
      const cons = await checkConsistency(ok.specUsed, {
        html,
        pptx: readFileSync(pptxPath),
        pdf: readFileSync(pdfPath),
      });
      expect(cons.issues).toEqual([]);
      expect(cons.pageCounts).toEqual({ html: 8, pptx: 8, pdf: 8 });

      // PPTX 仍为原生对象（可编辑性不因链路变长而丢失）
      const zip = await JSZip.loadAsync(readFileSync(pptxPath));
      const chartFile = Object.keys(zip.files).find((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
      expect(chartFile).toBeDefined();
      expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('<a:t>');
    } finally {
      rmSync(p.dir, { recursive: true, force: true });
    }
  });

  it('局部修改后：旧修订与旧导出保持不变（§13.2 局部修改+冻结快照）', async () => {
    const p = await runPipelineUntilSpec();
    try {
      const resolved = p.conflicts.map((c) => ({ ...c, resolution: 'source_a' as const }));
      const first = await exportReport(p.store, p.projectId, p.spec, {
        mode: 'formal', formats: ['pdf'], conflicts: resolved,
      });
      const firstExport = first.exports[0]!;
      const firstExportRaw = readFileSync(join(p.dir, p.projectId, firstExport.artifact_path));

      // 只重写第 3 页标题 → 新修订 → 新导出
      const edited = applyEdit(p.spec, { kind: 'edit_text', page_id: 'page_03', field: 'headline', text: '改后的指标页标题' }, {});
      const second = await exportReport(p.store, p.projectId, edited, {
        mode: 'formal', formats: ['pdf'], conflicts: resolved,
      });
      expect(second.revisionId).not.toBe(first.revisionId);

      // 旧导出文件与记录未漂移
      expect(readFileSync(join(p.dir, p.projectId, firstExport.artifact_path)).equals(firstExportRaw)).toBe(true);
      const list = await p.store.listExports(p.projectId);
      expect(list).toHaveLength(2);
      expect(list[0]!.artifact_hash).toBe(firstExport.artifact_hash);
      // 旧修订内容可定位
      const rev1 = await p.store.getRevision(p.projectId, first.revisionId);
      expect(rev1!.spec.pages.find((x) => x.page_id === 'page_03')!.headline).not.toContain('改后');
    } finally {
      rmSync(p.dir, { recursive: true, force: true });
    }
  });

  it('来源替换：受影响页面提示、旧导出不变（§13.2 来源替换行）', async () => {
    const p = await runPipelineUntilSpec();
    try {
      const resolved = p.conflicts.map((c) => ({ ...c, resolution: 'source_a' as const }));
      const first = await exportReport(p.store, p.projectId, p.spec, {
        mode: 'formal', formats: ['pdf'], conflicts: resolved,
      });

      // 新版本销售表到来（6月数值变化）
      const newCsv = await ingestAndSave(p.store, p.projectId, {
        filename: 'sales-v2.csv',
        content: Buffer.from('月份,销售额（万元）\n1月,505\n2月,510\n3月,498\n4月,486\n5月,470\n6月,440\n'),
        kind: 'csv', media_type: 'text/csv',
        // replaces: 旧表来源
      });

      // 提示受影响页面（使用旧表来源）
      const oldTableSource = p.tables[0]!.source_id;
      const impacted = pagesImpactedBySource(p.spec, oldTableSource);
      expect(impacted.length).toBeGreaterThan(0);
      expect(impacted).toContain('page_03'); // 指标总览
      expect(impacted).toContain('page_04'); // 趋势页

      // 旧导出文件与记录不变
      const firstExport = first.exports[0]!;
      const before = readFileSync(join(p.dir, p.projectId, firstExport.artifact_path));
      const recBefore = JSON.stringify(await p.store.getExport(p.projectId, firstExport.export_id));
      expect(existsSync(join(p.dir, p.projectId, 'sources', newCsv.source_id + '.json'))).toBe(true);
      expect(readFileSync(join(p.dir, p.projectId, firstExport.artifact_path)).equals(before)).toBe(true);
      expect(JSON.stringify(await p.store.getExport(p.projectId, firstExport.export_id))).toBe(recBefore);
    } finally {
      rmSync(p.dir, { recursive: true, force: true });
    }
  });

  it('模型中断恢复：重启后已保存内容完整，可从失败步骤重试（§13.2 模型中断行）', async () => {
    const p = await runPipelineUntilSpec();
    try {
      // 中断前：大纲与修订已保存
      await p.store.saveRevision(p.projectId, p.spec, '中断前的修订');
      await p.store.updateProject(p.projectId, { stage: 'draft' });

      // “重启”：新 store 实例（模拟进程退出）
      const store2 = new WorkspaceStore(p.dir);
      const loaded = await store2.getProject(p.projectId);
      expect(loaded!.stage).toBe('draft');
      const revs = await store2.listRevisions(p.projectId);
      expect(revs.length).toBe(1);

      // 从失败步骤重试：导出成功
      const resolved = p.conflicts.map((c) => ({ ...c, resolution: 'source_a' as const }));
      const out = await exportReport(store2, p.projectId, revs[0]!.spec, {
        mode: 'formal', formats: ['pdf'], conflicts: resolved,
      });
      expect(out.gate.allowed).toBe(true);
      expect(existsSync(join(p.dir, p.projectId, out.exports[0]!.artifact_path))).toBe(true);
    } finally {
      rmSync(p.dir, { recursive: true, force: true });
    }
  });

  it('草稿导出：带阻断时可用草稿模式，封面明确标识（§10.3）', async () => {
    const p = await runPipelineUntilSpec();
    try {
      const out = await exportReport(p.store, p.projectId, p.spec, {
        mode: 'draft', formats: ['pdf'], conflicts: p.conflicts, // 冲突未解决
      });
      expect(out.gate.allowed).toBe(true);
      expect(out.specUsed.pages[0]!.subtitle).toContain('草稿');
      expect(out.exports[0]!.is_draft).toBe(true);
    } finally {
      rmSync(p.dir, { recursive: true, force: true });
    }
  });
});
