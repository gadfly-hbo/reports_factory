import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retailReviewSpec } from '../src/samples/retail-review.js';
import { checkConsistency } from '../src/render/consistency.js';
import { generateSample } from '../src/cli/samples.js';
import { renderReportHtml } from '../src/render/html.js';
import { renderReportPdf } from '../src/render/pdf.js';
import { renderReportPptx } from '../src/render/pptx.js';

describe('跨格式一致性校验（proposal §11.4）', () => {
  it('零售样例三产物：全部关键内容一致，无缺失项', async () => {
    const artifacts = {
      html: renderReportHtml(retailReviewSpec),
      pptx: await renderReportPptx(retailReviewSpec),
      pdf: await renderReportPdf(retailReviewSpec),
    };
    const result = await checkConsistency(retailReviewSpec, artifacts);
    expect(result.issues).toEqual([]);
    expect(result.pageCounts).toEqual({ html: 8, pptx: 8, pdf: 8 });
  });

  it('伪造不一致（表格数字被篡改）→ 定位到具体页面与字段', async () => {
    const artifacts = {
      html: renderReportHtml(retailReviewSpec),
      pptx: await renderReportPptx(retailReviewSpec),
      pdf: await renderReportPdf(retailReviewSpec),
    };
    // 声称的 spec 与实际产物不同：模拟"产物里的数字与 spec 矛盾"
    const tampered = structuredClone(retailReviewSpec);
    tampered.pages[2]!.table!.rows[0]!.cells[1] = '9,999';
    const result = await checkConsistency(tampered, artifacts);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.page_id === 'page_metrics' && i.field === 'table' && i.missing_in.length > 0)).toBe(true);
  });

  it('页数不一致 → 报告 pageCounts 偏差', async () => {
    const artifacts = {
      html: renderReportHtml(retailReviewSpec),
      pptx: await renderReportPptx(retailReviewSpec),
      pdf: await renderReportPdf(retailReviewSpec),
    };
    const tampered = structuredClone(retailReviewSpec);
    tampered.pages = tampered.pages.slice(0, 6); // spec 声称 6 页，产物是 8 页
    const result = await checkConsistency(tampered, artifacts);
    expect(result.pageCounts.html).toBe(8);
    expect(result.pageCountMismatch).toBe(true);
  });
});

describe('零售复盘样例产物生成（M0 交付物）', () => {
  it('生成 html/pptx/pdf 三文件，非空且一致性通过', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-sample-'));
    try {
      const out = await generateSample(dir, retailReviewSpec);
      for (const f of [out.html, out.pptx, out.pdf]) {
        expect(readFileSync(f).length).toBeGreaterThan(1000);
      }
      const result = await checkConsistency(retailReviewSpec, {
        html: readFileSync(out.html, 'utf-8'),
        pptx: readFileSync(out.pptx),
        pdf: readFileSync(out.pdf),
      });
      expect(result.issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
