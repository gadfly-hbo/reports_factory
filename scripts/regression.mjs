// 回归样例集：样例再生成 → 一致性 → 可编辑对象断言 → golden 文本比对
// 用法：node dist/scripts/regression.js [--update]（先 npm run build）
import { retailReviewSpec } from '../dist/samples/retail-review.js';
import { compareWithGolden, updateGolden } from '../dist/samples/regression.js';
import { checkConsistency } from '../dist/render/consistency.js';
import { renderReportHtml } from '../dist/render/html.js';
import { renderReportPptx } from '../dist/render/pptx.js';
import { renderReportPdf, closePdfBrowser } from '../dist/render/pdf.js';
import JSZip from 'jszip';
import { join } from 'node:path';

const update = process.argv.includes('--update');
let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failed++; console.error(`  ✗ ${m}`); };

console.log('回归样例集（零售复盘 8 页）');

// 1) 再生成 + 三格式一致性
const html = renderReportHtml(retailReviewSpec);
const pptx = await renderReportPptx(retailReviewSpec);
const pdf = await renderReportPdf(retailReviewSpec);
await closePdfBrowser();
const cons = await checkConsistency(retailReviewSpec, { html, pptx, pdf });
if (cons.issues.length === 0 && !cons.pageCountMismatch) ok('三格式一致性（关键文本可定位、页数一致）');
else bad(`一致性失败: ${JSON.stringify(cons.issues.slice(0, 3))} ${cons.pageCountMismatch ? '页数不一致' : ''}`);

// 2) 可编辑对象断言（PPTX 原生对象 / PDF 页数）
const zip = await JSZip.loadAsync(pptx);
const files = Object.keys(zip.files);
const slideCount = files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
const chartCount = files.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)).length;
const slide3 = await zip.file('ppt/slides/slide3.xml')?.async('string') ?? '';
if (slideCount === 8 && chartCount === 1 && slide3.includes('<a:tbl>')) ok(`PPTX 可编辑对象（8 页 / 1 原生图表 / 原生表格）`);
else bad(`可编辑对象异常: slides=${slideCount} charts=${chartCount} tbl=${slide3.includes('<a:tbl>')}`);

// 3) golden 文本比对 / 更新
if (update) {
  await updateGolden(retailReviewSpec);
  ok('golden 基线已刷新（--update）');
} else {
  const r = await compareWithGolden(retailReviewSpec);
  if (r.ok) ok('golden 文本比对一致（html/pptx/pdf）');
  else for (const m of r.mismatches) bad(`[${m.format}] ${m.detail}`);
}

// 4) 研究报告样例（document 管线 golden：独立 HTML / DOCX / A4 PDF）
const { buildResearchSample } = await import('../dist/samples/research-report.js');
const { compareDocumentGolden, updateDocumentGolden } = await import('../dist/samples/regression.js');
const researchSpec = await buildResearchSample(join(process.cwd(), 'tests', 'fixtures', 'materials'));
const researchGoldenDir = join(process.cwd(), 'samples', 'research-report', 'golden');
if (update) {
  await updateDocumentGolden(researchSpec, researchGoldenDir);
  ok('研究报告 golden 基线已刷新（--update）');
} else {
  const r2 = await compareDocumentGolden(researchSpec, researchGoldenDir);
  if (r2.ok) ok('研究报告 golden（document 管线：html/docx/pdf）一致');
  else for (const m of r2.mismatches) bad(`[research/${m.format}] ${m.detail}`);
}

console.log(failed === 0 ? '\n回归样例集：全部通过 ✅' : `\n回归样例集：${failed} 项失败 ❌`);
process.exit(failed === 0 ? 0 : 1);
