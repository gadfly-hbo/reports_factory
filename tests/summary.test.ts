import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { ingestCsv, ingestMarkdown } from '../src/ingest/index.js';
import { assembleReportSpec, type AssembleContext } from '../src/compose/assemble.js';
import { createDeterministicGateway, type OutlineContext } from '../src/model/gateway.js';
import { deriveExecutiveSummary } from '../src/compose/summary.js';
import { checkCrossDeliverable } from '../src/checks/cross-deliverable.js';
import { validateReportSpec, type Claim } from '../src/schema/report-spec.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { exportReport } from '../src/pipeline/export.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

async function buildMainSpec() {
  const md = await readFile(join(MAT, 'conclusion.md'), 'utf-8');
  const csv = await readFile(join(MAT, 'sales.csv'), 'utf-8');
  const mdRes = ingestMarkdown(md, 'src_md');
  const csvRes = ingestCsv(csv, 'src_csv');
  const brief = { audience: '商品经营负责人', purpose: '上半年经营复盘', page_budget: 8 };
  const outlineCtx: OutlineContext = {
    brief, claims: mdRes.claims as Claim[], tables: csvRes.tables,
    evidence: mdRes.evidence, conflicts: [], notes: [], confirmations: csvRes.confirmations,
  };
  const draft = await createDeterministicGateway().composeOutline(outlineCtx);
  const ctx: AssembleContext = {
    brief, claims: outlineCtx.claims, tables: csvRes.tables, evidence: mdRes.evidence,
    conflicts: [], notes: [], pagePlans: draft.pages,
    sourceSnapshot: [
      { source_id: 'src_md', version: 'v1', is_demo: true },
      { source_id: 'src_csv', version: 'v1', is_demo: true },
    ],
  };
  return validateReportSpec(assembleReportSpec({ report_id: 'report_main', ctx }));
}

describe('一页决策摘要（executive_summary，§4.1 独立形态）', () => {
  it('五段结构：问题/选择/建议/风险/需要谁决定，全部绑定、无编造', async () => {
    const main = await buildMainSpec();
    const summary = validateReportSpec(deriveExecutiveSummary(main));
    expect(summary.brief.deliverable_type).toBe('executive_summary');
    expect(summary.pages).toHaveLength(1);
    const labels = summary.pages[0]!.bullets!.map((b) => b.label);
    expect(labels).toEqual(['问题', '选择', '建议', '风险', '需要谁决定']);
    // 推断（未证实）进"风险"段，不进"建议"
    const risk = summary.pages[0]!.bullets!.find((b) => b.label === '风险')!;
    expect(risk.status).toBe('unverified');
    expect(risk.text).toContain('缺货');
    // 有内容的段落必须绑定 claim
    const bound = summary.pages[0]!.bullets!.filter((b) => !b.text.includes('待补充'));
    for (const b of bound) expect(b.claim_ref).toBeTruthy();
  });

  it('材料缺失的段标待补充，不编造', async () => {
    const main = await buildMainSpec();
    const noRecs = structuredClone(main);
    noRecs.claims = noRecs.claims.filter((c) => c.kind !== 'recommendation');
    const summary = validateReportSpec(deriveExecutiveSummary(noRecs));
    const advice = summary.pages[0]!.bullets!.find((b) => b.label === '建议')!;
    expect(advice.text).toContain('待补充');
  });

  it('共享指标对象：摘要与主报告同源（一致性可机器校验）', async () => {
    const main = await buildMainSpec();
    const summary = deriveExecutiveSummary(main);
    expect(main.metrics.length).toBeGreaterThan(0);
    expect(summary.metrics).toEqual(main.metrics);
  });
});

describe('跨交付物一致性（红队约束③：不同文件不出现矛盾数字）', () => {
  it('派生的摘要与主报告一致 → 无阻断', async () => {
    const main = await buildMainSpec();
    const summary = deriveExecutiveSummary(main);
    const r = checkCrossDeliverable(main, summary);
    expect(r.blockers).toBe(0);
  });

  it('摘要指标被篡改 → 阻断并点名 metric_id', async () => {
    const main = await buildMainSpec();
    const tampered = structuredClone(deriveExecutiveSummary(main));
    tampered.metrics[0]!.value = 999;
    const r = checkCrossDeliverable(main, tampered);
    expect(r.blockers).toBeGreaterThan(0);
    expect(r.issues[0]!.id).toBe('cross_deliverable_metric_mismatch');
    expect(r.issues[0]!.object_ref).toBe(main.metrics[0]!.metric_id);
  });
});

describe('一页摘要导出（deck 管线单页）', () => {
  it('deliverable=executive_summary → PPTX 单页 + 跨交付物校验并入', async () => {
    const main = await buildMainSpec();
    const dir = mkdtempSync(join(tmpdir(), 'rs-summary-'));
    try {
      const store = new WorkspaceStore(dir);
      const project = await store.createProject({ title: '摘要导出' });
      await store.saveRevision(project.project_id, main, '主报告');
      const outcome = await exportReport(store, project.project_id, main, {
        mode: 'formal',
        formats: ['pptx'],
        deliverable: 'executive_summary',
      });
      expect(outcome.gate.allowed).toBe(true);
      const pptxPath = join(dir, project.project_id, outcome.exports[0]!.artifact_path);
      const zip = await JSZip.loadAsync(await readFile(pptxPath));
      const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
      expect(slides).toHaveLength(1);
      const slideXml = await zip.file(slides[0]!)!.async('string');
      expect(slideXml).toContain('需要谁决定');
      // 摘要 spec 类型正确
      expect(outcome.specUsed.brief.deliverable_type).toBe('executive_summary');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
