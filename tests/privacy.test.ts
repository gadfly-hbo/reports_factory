import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { checkPrivacy } from '../src/checks/privacy.js';
import { renderReportPptx } from '../src/render/pptx.js';
import { retailReviewSpec } from '../src/samples/retail-review.js';
import { runChecks, exportGate, type CheckIssue } from '../src/checks/engine.js';
import type { SourceAsset } from '../src/schema/project.js';

const sensitiveSource: SourceAsset = {
  // 使用 spec source_snapshot 实际引用的来源 id——敏感材料确实进入了报告
  source_id: 'src_sales_summary',
  version: 'v1',
  filename: '内部薪酬.csv',
  media_type: 'text/csv',
  kind: 'csv',
  file_hash: 'x',
  size: 10,
  imported_at: '2026-09-22T00:00:00Z',
  sensitivity: 'sensitive',
  parse_status: 'parsed',
  has_data: true,
};

const normalSource: SourceAsset = { ...sensitiveSource, source_id: 'src_normal', sensitivity: 'normal' };

describe('隐私检查器（§12.2 对外导出行，逐项可测 + 明示未覆盖）', () => {
  it('保留可编辑图表 + 未确认 → chart_underlying_data 标记 flag', () => {
    const r = checkPrivacy(retailReviewSpec, { sources: [normalSource], chartDataMode: 'keep_editable', ackEditableData: false });
    const item = r.items.find((i) => i.item === 'chart_underlying_data')!;
    expect(item.status).toBe('flag');
  });

  it('聚合降级 → chart_underlying_data 通过；用户显式确认 → 也放行', () => {
    const agg = checkPrivacy(retailReviewSpec, { sources: [normalSource], chartDataMode: 'aggregate_only', ackEditableData: false });
    expect(agg.items.find((i) => i.item === 'chart_underlying_data')!.status).toBe('pass');
    const acked = checkPrivacy(retailReviewSpec, { sources: [normalSource], chartDataMode: 'keep_editable', ackEditableData: true });
    expect(acked.items.find((i) => i.item === 'chart_underlying_data')!.status).toBe('pass');
  });

  it('sensitive 来源被对外导出 → sensitive_sources flag（阻断）', () => {
    const r = checkPrivacy(retailReviewSpec, { sources: [sensitiveSource], chartDataMode: 'aggregate_only', ackEditableData: false });
    const item = r.items.find((i) => i.item === 'sensitive_sources')!;
    expect(item.status).toBe('flag');
    expect(item.detail).toContain('内部薪酬.csv');
  });

  it('隐藏内容与备注当前无对应概念 → not_checked 且明示', () => {
    const r = checkPrivacy(retailReviewSpec, { sources: [], chartDataMode: 'aggregate_only', ackEditableData: false });
    const notChecked = r.items.filter((i) => i.status === 'not_checked');
    expect(notChecked.map((i) => i.item)).toContain('hidden_content');
    expect(notChecked.map((i) => i.item)).toContain('speaker_notes');
    for (const i of notChecked) expect(i.detail).toBeTruthy();
  });

  it('元数据项：渲染时中性化 → pass（附实证说明）', () => {
    const r = checkPrivacy(retailReviewSpec, { sources: [], chartDataMode: 'aggregate_only', ackEditableData: false });
    expect(r.items.find((i) => i.item === 'doc_metadata')!.status).toBe('pass');
  });
});

describe('PPTX 元数据中性化（实证：默认含 PptxGenJS 字样）', () => {
  it('内部导出产物元数据不含工具名/作者', async () => {
    const buf = await renderReportPptx(retailReviewSpec);
    const zip = await JSZip.loadAsync(buf);
    const core = (await zip.file('docProps/core.xml')!.async('string'))!;
    expect(core).not.toContain('PptxGenJS');
    expect(core).not.toMatch(/<dc:creator>[^<]+<\/dc:creator>/);
  });
});

describe('聚合降级导出（图表→图片，底层数据不可提取）', () => {
  it('aggregate_only：无 chart 部件、有图片部件、标题文本仍在', async () => {
    const buf = await renderReportPptx(retailReviewSpec, { chartDataMode: 'aggregate_only' });
    const zip = await JSZip.loadAsync(buf);
    const files = Object.keys(zip.files);
    expect(files.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(0);
    expect(files.filter((f) => /^ppt\/media\/image[-\d]*\.png$/.test(f)).length).toBeGreaterThan(0);
    const slide4 = await zip.file('ppt/slides/slide4.xml')!.async('string');
    expect(slide4).toContain('销售额出现下降');
  });

  it('keep_editable（默认）：原生 chart 部件存在（回归保护）', async () => {
    const buf = await renderReportPptx(retailReviewSpec);
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(1);
  });
});

describe('导出门禁的隐私集成（external scope）', () => {
  const baseChecks = runChecks(retailReviewSpec, { conflicts: [] });

  it('external + sensitive 来源 → 阻断项进检查报告', () => {
    const privacy = checkPrivacy(retailReviewSpec, {
      sources: [sensitiveSource], chartDataMode: 'aggregate_only', ackEditableData: false,
    });
    const issues: CheckIssue[] = [
      ...baseChecks.issues,
      ...privacy.items.filter((i) => i.status === 'flag').map((i) => ({
        id: `privacy_${i.item}`, severity: 'blocker' as const, object_ref: i.item, message: i.detail ?? i.item,
      })),
    ];
    const merged = { issues, blockers: issues.filter((i) => i.severity === 'blocker').length, warnings: issues.filter((i) => i.severity === 'warning').length };
    expect(exportGate(merged, { mode: 'formal' }).allowed).toBe(false);
  });

  it('internal scope 不产生隐私阻断（行为不变）', () => {
    expect(exportGate(baseChecks, { mode: 'formal' }).allowed).toBe(true);
  });
});
