import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { chromium } from 'playwright';
import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { buildDeckExports, buildDeckHtml, buildDeckPdf } from '../src/agent/export-deck.js';
import { exportDeckTool } from '../src/agent/tools/export-deck-tool.js';

/** 回流两项中立导出修复的永久回归（2026-10-17）：
 *  修复一：HTML/PDF 完整页面保留（head/style/body 属性）+ iframe srcdoc 逐页 CSS 隔离；
 *  修复二：PPTX 原生图表嵌入工作簿 table ref 尾部多引号修复（仅导出副本，幂等）。
 *  全部走真实导出入口（buildDeckHtml/Pdf/Exports、export_deck 工具），合成数据，无模型调用。 */

const WORKSHEET = /^ppt\/embeddings\/Microsoft_Excel_Worksheet\d+\.xlsx$/;

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-x-${tag}-`));
  const root = join(base, 'proj_x');
  await mkdir(join(root, 'deck', 'pages'), { recursive: true });
  return root;
}

/** 两页合成文档：不同背景/位置/字号、同名 class .card 与 id #shared、:root 变量、* 选择器、
 *  print 媒体规则（卡片底色/字号/可见性）、body 属性、中文+实体+引号+</iframe> 闭合攻击、内嵌 SVG。 */
function pageMarkup(i: 1 | 2): string {
  const accent = i === 1 ? 'rgb(12,76,144)' : 'rgb(20,130,60)';
  const printCard = i === 1 ? 'rgb(140,20,40)' : 'rgb(30,40,150)';
  const left = i === 1 ? 40 : 400;
  const bg = i === 1 ? 'rgb(238,245,255)' : 'rgb(255,245,238)';
  const size = i === 1 ? 40 : 32;
  const printSize = i === 1 ? 44 : 36;
  const marker = i === 1 ? 'P1MARK 页一合成' : 'P2MARK 页二合成';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>合成页 ${i} &amp; 引号</title><style>
*{box-sizing:border-box}html,body{margin:0;width:1280px;height:720px;background:${bg};font-family:'PingFang SC',sans-serif}:root{--accent:${accent}}
.card{position:absolute;left:${left}px;top:100px;width:300px;height:180px;padding:16px;background:var(--accent);color:white}#shared{font-size:${size}px}
.print-only{display:none}@media print{.card{background:${printCard}}#shared{font-size:${printSize}px}.print-only{display:block}.screen-only{display:none}}
</style></head><body style="color:rgb(${i},2,3)" data-page="${i}"><div class="card" id="shared"><span>${marker} 100 120 135</span></div><p class="print-only">打印专属 ${i}</p><p class="screen-only">屏幕专属 ${i}</p><div style="position:absolute;top:500px;left:40px">来源：synthetic.md；引号 &quot; &amp; &lt; &gt; &lt;/iframe&gt;</div><svg width="20" height="20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" fill="red"/></svg></body></html>`;
}

async function seedPages(root: string): Promise<void> {
  for (const i of [1, 2] as const) {
    await writeFile(join(root, 'deck', 'pages', `page_0${i}.html`), pageMarkup(i), 'utf-8');
    await writeFile(join(root, 'deck', 'pages', `page_0${i}.mjs`), '// synthetic marker; not executed', 'utf-8');
  }
}

/** 从合集 HTML 提取 (title, 原文还原) 序列——验证 srcdoc 属性转义可完整往返。 */
function extractSrcdoc(deckHtml: string): Array<{ title: string; html: string }> {
  const out: Array<{ title: string; html: string }> = [];
  for (const m of deckHtml.matchAll(/<iframe title="([^"]*)" srcdoc="([^"]*)"/g)) {
    const html = m[2]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    out.push({ title: m[1]!, html });
  }
  return out;
}

interface FrameMetrics {
  title: string;
  bg: string;
  font: string;
  box: string;
  x: number;
  y: number;
  w: number;
  bodyColor: string;
  bodyBg: string;
  bodyAttr: string | null;
  printOnly: string;
  screenOnly: string;
  text: string;
}

async function frameMetrics(page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newPage']>>): Promise<FrameMetrics[]> {
  await page.waitForTimeout(500); // srcdoc 解析/样式稳定（探针实证 200ms 足够，取宽裕值）
  return page.evaluate(() => {
    return [...document.querySelectorAll('section iframe')].map((f) => {
      const d = f.contentDocument!;
      const card = d.querySelector('.card')!;
      const s = getComputedStyle(card);
      const r = card.getBoundingClientRect();
      return {
        title: f.title,
        bg: s.backgroundColor,
        font: s.fontSize,
        box: s.boxSizing,
        x: r.x,
        y: r.y,
        w: r.width,
        bodyColor: getComputedStyle(d.body).color,
        bodyBg: getComputedStyle(d.body).backgroundColor,
        bodyAttr: d.body.getAttribute('data-page'),
        printOnly: getComputedStyle(d.querySelector('.print-only')!).display,
        screenOnly: getComputedStyle(d.querySelector('.screen-only')!).display,
        text: d.body.textContent ?? '',
      };
    });
  });
}

describe('导出中立修复回流：HTML/PDF 完整页面与逐页隔离', () => {
  it('buildDeckExports html：完整页面文档入 iframe srcdoc，转义可往返，页序与分页语义保留', async () => {
    const root = await tmpRoot('neutral-html');
    try {
      await seedPages(root);
      const before = await Promise.all([readFile(join(root, 'deck', 'pages', 'page_01.html'), 'utf-8'), readFile(join(root, 'deck', 'pages', 'page_02.html'), 'utf-8')]);
      const deckHtml = await buildDeckHtml(root);
      const values = await buildDeckExports(root, ['html']);
      expect(values[0]!.artifact.toString('utf-8')).toBe(deckHtml); // 导出入口与 buildDeckHtml 同一合集

      const docs = extractSrcdoc(deckHtml);
      expect(docs.map((d) => d.title)).toEqual(['page_01', 'page_02']); // 页序
      expect(docs[0]!.html).toBe(before[0]); // 完整往返：head/style/body 属性/实体/引号/中文/SVG 逐字节保留
      expect(docs[1]!.html).toBe(before[1]);
      expect(docs[0]!.html).toContain('<style>'); // head 不再被丢弃
      expect(deckHtml).toContain('width:1280px;height:720px'); // 1280×720 页面容器保留
      expect(deckHtml).toContain('page-break-after: always'); // 原分页语义保留
      expect(deckHtml).toContain('@page { size: 1280px 720px; margin: 0; }');
      await expect(Promise.all([readFile(join(root, 'deck', 'pages', 'page_01.html'), 'utf-8'), readFile(join(root, 'deck', 'pages', 'page_02.html'), 'utf-8')])).resolves.toEqual(before); // 源页面文件不动
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('真实 headless 浏览器：同名 class/id、:root 变量、* 选择器、body 属性逐页生效互不污染（屏幕 + print 仿真）', async () => {
    const root = await tmpRoot('neutral-browser');
    const browser = await chromium.launch();
    try {
      await seedPages(root);
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.setContent(await buildDeckHtml(root), { waitUntil: 'load', timeout: 60_000 });
      const screen = await frameMetrics(page);
      expect(screen).toHaveLength(2);
      expect(screen[0]!.title).toBe('page_01');
      expect(screen[0]!.bg).toBe('rgb(12, 76, 144)'); // 本页 --accent 变量解析（同名 .card 不被页二覆盖）
      expect(screen[0]!.font).toBe('40px'); // 本页 #shared 字号（同名 id 隔离）
      expect(screen[0]!.box).toBe('border-box'); // 本页 * 选择器生效
      expect(screen[0]!.x).toBe(40);
      expect(screen[0]!.y).toBe(100);
      expect(screen[0]!.w).toBe(300); // 位置/尺寸按本页规则
      expect(screen[0]!.bodyColor).toBe('rgb(1, 2, 3)'); // body 属性样式保留
      expect(screen[0]!.bodyBg).toBe('rgb(238, 245, 255)');
      expect(screen[0]!.bodyAttr).toBe('1'); // body 属性本体保留
      expect(screen[0]!.printOnly).toBe('none');
      expect(screen[0]!.screenOnly).toBe('block');
      expect(screen[0]!.text).toContain('引号 " & < > </iframe>'); // 实体解码正确，内容未提前闭合外层属性
      expect(screen[1]!.title).toBe('page_02');
      expect(screen[1]!.bg).toBe('rgb(20, 130, 60)');
      expect(screen[1]!.font).toBe('32px');
      expect(screen[1]!.x).toBe(400);
      expect(screen[1]!.bodyBg).toBe('rgb(255, 245, 238)');
      expect(screen[1]!.bodyAttr).toBe('2');

      await page.emulateMedia({ media: 'print' }); // print 媒体规则仍只作用本页
      const print = await frameMetrics(page);
      expect(print[0]!.bg).toBe('rgb(140, 20, 40)');
      expect(print[0]!.font).toBe('44px');
      expect(print[0]!.printOnly).toBe('block');
      expect(print[0]!.screenOnly).toBe('none');
      expect(print[1]!.bg).toBe('rgb(30, 40, 150)');
      expect(print[1]!.font).toBe('36px');
    } finally {
      await browser.close();
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('buildDeckPdf：实际 PDF 两页、顺序正确，打印媒体规则逐页生效（文本可见性 + 栅格像素）', async () => {
    const root = await tmpRoot('neutral-pdf');
    try {
      await seedPages(root);
      const raw = await buildDeckPdf(root);
      const doc = await getDocumentProxy(new Uint8Array(raw)); // 注意：pdfjs 会转移传入缓冲，各调用用独立副本
      expect(doc.numPages).toBe(2);
      const viewport = (await doc.getPage(1)).getViewport({ scale: 1 });
      expect(viewport.width).toBeCloseTo(960, 0); // 1280×720 px → 960×540 pt
      expect(viewport.height).toBeCloseTo(540, 0);

      const text = await extractText(new Uint8Array(raw), { mergePages: false });
      expect(text.totalPages).toBe(2);
      const page1 = text.text[0]!.normalize('NFKC');
      const page2 = text.text[1]!.normalize('NFKC');
      // 注：Chromium PDF ToUnicode 可能把「页」等映射成形近部首码位（NFKC 不还原），故页序断言用 ASCII 标记
      expect(page1).toContain('P1MARK'); // 顺序正确
      expect(page1).not.toContain('P2MARK');
      expect(page2).toContain('P2MARK');
      expect(page2).not.toContain('P1MARK');
      expect(page1).toContain('打印专属 1'); // print 规则让 screen 隐藏元素进入实际 PDF
      expect(page2).toContain('打印专属 2');
      expect(page1).not.toContain('屏幕专属'); // print 规则在真实 PDF 中隐藏 screen-only
      expect(page2).not.toContain('屏幕专属');
      expect(page1).toContain('synthetic.md');
      expect(page2).toContain('synthetic.md');

      // 依赖锁内既有传递依赖 @napi-rs/canvas（pdfjs-dist/unpdf 共用），离线栅格化实际 PDF
      const canvasImport = () => import('@napi-rs/canvas');
      const canvas = await import('@napi-rs/canvas');
      const pixel = async (n: number, x: number, y: number) => {
        const image = await renderPageAsImage(doc, n, { width: 1280, canvasImport });
        const img = await canvas.loadImage(image);
        const c = canvas.createCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        expect([c.width, c.height]).toEqual([1280, 720]);
        return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
      };
      expect(await pixel(1, 190, 190), '页一卡片打印底色').toEqual([140, 20, 40]);
      expect(await pixel(1, 5, 5), '页一页面背景').toEqual([238, 245, 255]);
      expect(await pixel(2, 560, 190), '页二卡片打印底色').toEqual([30, 40, 150]);
      expect(await pixel(2, 5, 5), '页二页面背景').toEqual([255, 245, 238]);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('原契约保留：空目录/缺 pptx 按原错误处理，无 HTML 页走 fallback，页面源文件不动', async () => {
    const root = await tmpRoot('neutral-contract');
    try {
      await expect(buildDeckHtml(root)).rejects.toThrow(/没有页面/);
      await expect(buildDeckPdf(root)).rejects.toThrow(/没有页面/);
      await expect(buildDeckExports(root, ['pptx'])).rejects.toThrow(/不存在/);
      const code = 'export function buildSlide(p){const s=p.addSlide();s.addText("合成fallback 100",{x:1,y:1,w:6,h:1,fontSize:30});}';
      await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), code, 'utf-8');
      const html = await buildDeckHtml(root);
      expect(html).toContain('合成fallback'); // 近似预览 fallback 仍完整入合集
      expect(await readFile(join(root, 'deck', 'pages', 'page_01.mjs'), 'utf-8')).toBe(code);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});

async function makeChartDeck(dir: string): Promise<void> {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
  pptx.layout = 'W';
  const slide = pptx.addSlide();
  slide.addText('中文原生图表验收', { x: 1, y: 0.2, w: 8, h: 1 });
  slide.addChart('bar', [{ name: '合成值', labels: ['一季度', '二季度', '三季度'], values: [100, 120, 135] }], { x: 4, y: 1, w: 5, h: 4 });
  await pptx.writeFile({ fileName: join(dir, 'deck.pptx') });
}

async function embeddedSheet(zip: Awaited<ReturnType<typeof JSZip.loadAsync>>): Promise<{ name: string; sheet: Awaited<ReturnType<typeof JSZip.loadAsync>> }> {
  const name = Object.keys(zip.files).find((n) => WORKSHEET.test(n));
  if (!name) throw new Error('测试夹具缺少嵌入工作簿');
  return { name, sheet: await JSZip.loadAsync(await zip.files[name]!.async('nodebuffer')) };
}

describe('导出中立修复回流：PPTX 原生图表 table ref 修复', () => {
  it('buildDeckExports pptx：导出副本修复坏 ref，其余部件逐字节不变，源文件不动，幂等', async () => {
    const root = await tmpRoot('neutral-pptx');
    try {
      await makeChartDeck(join(root, 'deck'));
      const pptxPath = join(root, 'deck', 'deck.pptx');
      const original = await readFile(pptxPath);

      const sourceZip = await JSZip.loadAsync(original);
      const sourceEmb = await embeddedSheet(sourceZip);
      expect(await sourceEmb.sheet.file('xl/tables/table1.xml')!.async('string')).toMatch(/ref="A1:B4'"/); // 先核实锁定 PptxGenJS 的真实坏 ref

      const exported = (await buildDeckExports(root, ['pptx']))[0]!.artifact;
      const zip = await JSZip.loadAsync(exported);
      expect(Object.keys(zip.files).sort()).toEqual(Object.keys(sourceZip.files).sort()); // 部件集合不变，不删不改名

      const emb = await embeddedSheet(zip);
      expect(await emb.sheet.file('xl/tables/table1.xml')!.async('string')).toMatch(/ref="A1:B4"/); // 正确合法范围
      expect(await emb.sheet.file('xl/tables/table1.xml')!.async('string')).not.toMatch(/'/);

      for (const [name, part] of Object.entries(sourceZip.files)) {
        if (part.dir || name === sourceEmb.name) continue;
        expect((await zip.files[name]!.async('nodebuffer')).equals(await part.async('nodebuffer')), `pptx 部件被改动：${name}`).toBe(true);
      }
      for (const [name, part] of Object.entries(sourceEmb.sheet.files)) {
        if (part.dir || name === 'xl/tables/table1.xml') continue;
        expect((await emb.sheet.files[name]!.async('nodebuffer')).equals(await part.async('nodebuffer')), `工作簿部件被改动：${name}`).toBe(true);
      }
      expect((await readFile(pptxPath)).equals(original), '工作中的 deck.pptx 不得被覆写').toBe(true);

      await writeFile(pptxPath, exported); // 已修复产物二次处理保持幂等
      expect(((await buildDeckExports(root, ['pptx']))[0]!.artifact).equals(exported)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('无图表导出字节不变；坏 ZIP 按导出错误处理；export_deck 工具入口同样修复', async () => {
    const root = await tmpRoot('neutral-pptx-2');
    try {
      const pptx = new pptxgen();
      pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
      pptx.layout = 'W';
      pptx.addSlide().addText('无图表页', { x: 1, y: 1, w: 6, h: 1 });
      await pptx.writeFile({ fileName: join(root, 'deck', 'deck.pptx') });
      const pptxPath = join(root, 'deck', 'deck.pptx');
      const plain = await readFile(pptxPath);
      expect(((await buildDeckExports(root, ['pptx']))[0]!.artifact).equals(plain), '合法产物保持原字节').toBe(true);

      await mkdir(join(root, 'chart'), { recursive: true });
      await makeChartDeck(join(root, 'chart'));
      const chartDeck = join(root, 'chart', 'deck.pptx');
      await mkdir(join(root, 'proj_chart', 'deck', 'pages'), { recursive: true });
      await writeFile(join(root, 'proj_chart', 'deck', 'deck.pptx'), await readFile(chartDeck));
      await writeFile(join(root, 'proj_chart', 'deck', 'pages', 'page_01.mjs'), 'export function buildSlide(p){p.addSlide()}', 'utf-8');
      const r = (await exportDeckTool(join(root, 'proj_chart')).execute({ formats: ['pptx'] }, new AbortController().signal)) as { ok: boolean; files: string[] };
      expect(r.ok).toBe(true); // 工具（agent 侧正常入口）导出的副本同样修复
      const toolZip = await JSZip.loadAsync(await readFile(join(root, 'proj_chart', 'deck', 'export', 'deck.pptx')));
      const toolEmb = await embeddedSheet(toolZip);
      expect(await toolEmb.sheet.file('xl/tables/table1.xml')!.async('string')).toMatch(/ref="A1:B4"/);
      expect((await readFile(join(root, 'proj_chart', 'deck', 'deck.pptx'))).equals(await readFile(chartDeck)), '工具导出不改源文件').toBe(true);

      await writeFile(join(root, 'deck', 'deck.pptx'), 'not a zip', 'utf-8');
      await expect(buildDeckExports(root, ['pptx']), '坏 ZIP 不得伪造成功产物').rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
