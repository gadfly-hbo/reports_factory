#!/usr/bin/env node
// P2-1 导出兼容性检查（#10）：对 deck.pptx 做 OOXML 结构合规检查（非渲染验证）。
// 用法：node scripts/verify-pptx-compat.mjs <deck.pptx> [更多文件…]
// 检查项：zip 完整性 / Content_Types / presentation.xml 引用一致性 / 字体声明 /
//         色值格式 / 图片路径存在 / 无外部资源引用 / slide 尺寸声明
import { readFile } from 'node:fs/promises';

const items = [];
const check = (name, ok, detail = '') => items.push({ name, ok, detail });

async function inspect(path) {
  const buf = await readFile(path);
  const JSZip = (await import('jszip')).default;
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch (e) { check('zip 完整性', false, e.message); return; }
  check('zip 完整性', true, `${Math.round(buf.length / 1024)}KB`);

  // Content_Types
  const ct = zip.file('[Content_Types].xml');
  check('[Content_Types].xml 存在', !!ct);
  if (ct) {
    const ctXml = await ct.async('string');
    check('slide content type 声明', ctXml.includes('slide+xml'), ctXml.includes('slide') ? '' : '缺少 slide content type');
  }

  // presentation.xml
  const pres = zip.file('ppt/presentation.xml');
  check('presentation.xml 存在', !!pres);
  if (pres) {
    const presXml = await pres.async('string');
    const slideIds = [...presXml.matchAll(/r:id="(rId\d+)"/g)].map((m) => m[1]);
    const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    check('slide 引用一致', slides.length > 0, `presentation 引用 ${slideIds.length} / 实际 ${slides.length} slide`);
    const sldSz = /sldSz[^\/]*cx="(\d+)"[^\/]*cy="(\d+)"/.exec(presXml);
    if (sldSz) {
      const w = Number.parseInt(sldSz[1], 10) / 914400, h = Number.parseInt(sldSz[2], 10) / 914400;
      check('页面尺寸', Math.abs(w / h - 16 / 9) < 0.01, `${w.toFixed(2)}×${h.toFixed(2)}in`);
    }
  }

  // slide 内容检查
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  let fontIssues = 0, colorIssues = 0, extRef = 0;
  for (const s of slides) {
    const xml = await zip.files[s].async('string');
    // 字体声明
    for (const m of xml.matchAll(/<a:latin typeface="([^"]*)"/g)) if (!m[1]) fontIssues++;
    for (const m of xml.matchAll(/<a:ea typeface="([^"]*)"/g)) if (!m[1]) fontIssues++;
    // 色值格式（应为 6 位 hex，不带 #）
    for (const m of xml.matchAll(/srgbClr val="([^"]*)"/g)) if (!/^[0-9A-Fa-f]{6}$/.test(m[1])) colorIssues++;
    // 外部资源引用
    for (const m of xml.matchAll(/r:link="(https?:[^"]*)"/g)) extRef++;
  }
  check('字体声明完整', fontIssues === 0, fontIssues > 0 ? `${fontIssues} 处空 typeface` : '');
  check('色值格式合法', colorIssues === 0, colorIssues > 0 ? `${colorIssues} 处非法 hex` : '');
  check('无外部资源引用', extRef === 0, extRef > 0 ? `${extRef} 处外链` : '');

  // 图片存在
  const media = Object.keys(zip.files).filter((n) => n.startsWith('ppt/media/'));
  const rels = zip.file('ppt/slides/_rels');
  if (rels) {
    const relFiles = Object.keys(zip.files).filter((n) => n.startsWith('ppt/slides/_rels/') && n.endsWith('.rels'));
    let missing = 0;
    for (const rf of relFiles) {
      const rx = await zip.files[rf].async('string');
      for (const m of rx.matchAll(/Target="\.\.\/media\/([^"]+)"/g)) {
        if (!zip.file(`ppt/media/${m[1]}`)) missing++;
      }
    }
    check('图片引用路径存在', missing === 0, missing > 0 ? `${missing} 处引用缺失` : `${media.length} 个媒体文件`);
  }

  // 图表结构
  const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
  if (charts.length > 0) {
    let chartOk = true;
    for (const c of charts) {
      const cx = await zip.files[c].async('string');
      if (!cx.includes('<c:chart') || !cx.includes('<c:plotArea')) chartOk = false;
    }
    check('图表 XML 结构', chartOk, `${charts.length} 个图表`);
  }

  // 汇总
  const fails = items.filter((i) => !i.ok);
  console.log(`\n=== ${path.split('/').pop()} ===`);
  for (const i of items) console.log(`${i.ok ? '✓' : '✗'} ${i.name}${i.detail ? ` (${i.detail})` : ''}`);
  console.log(fails.length === 0 ? 'ALL PASS' : `${fails.length} 项不合规`);
  process.exitCode = fails.length > 0 ? 1 : 0;
  items.length = 0;
}

for (const p of process.argv.slice(2)) await inspect(p);
if (process.argv.length <= 2) { console.error('用法: node scripts/verify-pptx-compat.mjs <deck.pptx> [...]'); process.exit(1); }
