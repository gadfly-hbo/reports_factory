#!/usr/bin/env node
// 结构度量：pptx → 每页形状/文本/图片/颜色（用于产物对比，不评判主观美感）
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const [, , path] = process.argv;
if (!path) { console.error('用法: node scripts/deck-metrics.mjs <deck.pptx>'); process.exit(1); }
const zip = await JSZip.loadAsync(await readFile(path));
const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => a.match(/\d+/)[0] - b.match(/\d+/)[0]);
const media = Object.keys(zip.files).filter((n) => n.startsWith('ppt/media/'));
const all = { slides: slides.length, sp: 0, pic: 0, txt: 0, colors: new Set(), tables: 0, charts: 0 };
const per = [];
for (const s of slides) {
  const xml = await zip.files[s].async('string');
  const sp = (xml.match(/<p:sp>/g) || []).length, pic = (xml.match(/<p:pic>/g) || []).length, txt = (xml.match(/<a:t>/g) || []).length;
  const geom = {}; for (const m of xml.matchAll(/prstGeom prst="(\w+)"/g)) geom[m[1]] = (geom[m[1]] || 0) + 1;
  xml.match(/srgbClr val="([0-9A-Fa-f]{6})"/g)?.forEach((c) => all.colors.add(c.slice(-6).toUpperCase()));
  all.sp += sp; all.pic += pic; all.txt += txt;
  all.tables += (xml.match(/<a:tbl>/g) || []).length;
  all.charts += (xml.match(/graphicFrame/g) || []).length;
  per.push({ slide: +s.match(/\d+/)[0], sp, pic, txt, geom });
}
console.log(JSON.stringify({
  ...all, colors: [...all.colors].length,
  avg: { sp: Math.round(all.sp / slides.length), txt: Math.round(all.txt / slides.length), pic: +(all.pic / slides.length).toFixed(1) },
  media: media.length,
  geomMix: per.reduce((acc, p) => { for (const [k, v] of Object.entries(p.geom)) acc[k] = (acc[k] || 0) + v; return acc; }, {}),
}, null, 1));
