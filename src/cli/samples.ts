import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReportSpec } from '../schema/report-spec.js';
import { renderReportHtml } from '../render/html.js';
import { renderReportPdf, closePdfBrowser } from '../render/pdf.js';
import { renderReportPptx } from '../render/pptx.js';

/**
 * M0 样例产物生成：把手工样例 ReportSpec 渲染为三种格式文件。
 * 用法：node dist/cli/samples.js [输出目录]（默认 samples/retail-review）
 */
export async function generateSample(
  outDir: string,
  spec: ReportSpec,
): Promise<{ html: string; pptx: string; pdf: string }> {
  await mkdir(outDir, { recursive: true });
  const html = renderReportHtml(spec);
  const pptx = await renderReportPptx(spec);
  const pdf = await renderReportPdf(spec);
  const base = join(outDir, 'report');
  const htmlPath = `${base}.html`;
  const pptxPath = `${base}.pptx`;
  const pdfPath = `${base}.pdf`;
  await writeFile(htmlPath, html, 'utf-8');
  await writeFile(pptxPath, pptx);
  await writeFile(pdfPath, pdf);
  await closePdfBrowser();
  return { html: htmlPath, pptx: pptxPath, pdf: pdfPath };
}

async function main() {
  const { retailReviewSpec } = await import('../samples/retail-review.js');
  const outDir = process.argv[2] ?? 'samples/retail-review';
  const out = await generateSample(outDir, retailReviewSpec);
  console.log(`样例产物已生成（${retailReviewSpec.pages.length} 页 × 3 格式）：`);
  for (const f of Object.values(out)) console.log(`  ${f}`);
}

if (process.argv[1] && process.argv[1].endsWith('samples.js')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
