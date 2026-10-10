// 通过 mock pptxgenjs，import 每个 page_XX.mjs 的 buildSlide，记录所有 addText/addShape 调用，
// 按 1280×720 渲染为同名 .html 静态预览
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGES_DIR = path.resolve('./pages');
const SCALE = 96; // 13.33in × 7.5in → 1280 × 720

const COLOR_MAP = {
  '263442': '#263442',
  'B44626': '#b44626',
  '5A6675': '#5a6675',
  'F7F6F3': '#f7f6f3',
  '242830': '#242830',
  '9AA3AE': '#9aa3ae',
  '626773': '#626773',
  'DEDCD6': '#dedcd6',
  'FFFFFF': '#ffffff',
  'F4D9CD': '#f4d9cd',
  '3D4A5A': '#3d4a5a',
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderShape(rec) {
  const opts = rec.opts || {};
  const left = (opts.x || 0) * SCALE;
  const top = (opts.y || 0) * SCALE;
  const w = (opts.w || 0) * SCALE;
  const h = (opts.h || 0) * SCALE;
  const fill = opts.fill && opts.fill.color ? (COLOR_MAP[opts.fill.color] || `#${opts.fill.color.toLowerCase()}`) : 'transparent';
  const lineColor = opts.line && opts.line.color ? (COLOR_MAP[opts.line.color] || `#${opts.line.color.toLowerCase()}`) : null;
  const lineW = opts.line && opts.line.width ? opts.line.width : (lineColor && lineColor !== 'none' ? 0.75 : 0);
  const isNone = opts.line && opts.line.type === 'none';
  const border = lineColor && !isNone ? `${lineW}px solid ${lineColor}` : 'none';
  const radius = rec.type === 'ellipse' ? '50%' : '0';
  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;background:${fill};border:${border};border-radius:${radius};box-sizing:border-box"></div>`;
}

function renderText(rec) {
  const opts = rec.opts || {};
  const left = (opts.x || 0) * SCALE;
  const top = (opts.y || 0) * SCALE;
  const w = (opts.w || 0) * SCALE;
  const h = (opts.h || 0) * SCALE;
  const fontSize = opts.fontSize || 12;
  const bold = opts.bold ? '700' : '400';
  const align = opts.align || 'left';
  const valign = opts.valign === 'middle' ? 'middle' : (opts.valign === 'bottom' ? 'bottom' : 'top');
  const charSpacing = opts.charSpacing ? `${opts.charSpacing / 100}em` : 'normal';
  const lineHeight = opts.lineSpacingMultiple || 1.3;

  let html = '';
  if (rec.kind === 'rich') {
    html = rec.parts.map((p) => {
      const c = p.options && p.options.color ? (COLOR_MAP[p.options.color] || `#${p.options.color.toLowerCase()}`) : '#242830';
      const b = (p.options && p.options.bold) ? '700' : '400';
      return `<span style="color:${c};font-weight:${b}">${esc(p.text)}</span>`;
    }).join('');
  } else {
    const color = opts.color ? (COLOR_MAP[opts.color] || `#${opts.color.toLowerCase()}`) : '#242830';
    html = `<span style="color:${color}">${esc(rec.text)}</span>`;
  }

  return `<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;font-size:${fontSize}px;font-weight:${bold};text-align:${align};vertical-align:${valign};letter-spacing:${charSpacing};line-height:${lineHeight};font-family:'PingFang SC','Microsoft YaHei',Arial,sans-serif;white-space:pre-wrap;overflow:hidden;box-sizing:border-box">${html}</div>`;
}

function buildMock() {
  const records = { shapes: [], texts: [] };
  const slide = {
    background: null,
    addShape(type, opts) {
      records.shapes.push({ type, opts: opts || {} });
      return {};
    },
    addText(textOrParts, opts) {
      if (Array.isArray(textOrParts)) {
        records.texts.push({ kind: 'rich', parts: textOrParts, opts: opts || {} });
      } else {
        records.texts.push({ kind: 'simple', text: String(textOrParts), opts: opts || {} });
      }
      return {};
    },
    addImage() { return {}; },
  };
  const pptx = {
    addSlide() { return slide; },
  };
  return { pptx, records, slide };
}

async function buildOne(filename, pageNum) {
  const fileUrl = pathToFileURL(path.join(PAGES_DIR, filename)).href;
  const mod = await import(fileUrl);
  const { pptx, records, slide } = buildMock();
  mod.buildSlide(pptx);
  // buildSlide 执行完后，读取 slide.background（slide 已被代码赋值为 { color: '...' }）
  if (slide.background && slide.background.color) {
    records.background = COLOR_MAP[slide.background.color] || `#${slide.background.color.toLowerCase()}`;
  }

  const layer = records.shapes.map(renderShape).join('\n') + '\n' + records.texts.map(renderText).join('\n');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${filename}</title>
<style>
  body { margin: 0; background: #f0f1f3; font-family: -apple-system, 'Segoe UI', sans-serif; }
  .stage { position: relative; width: 1280px; height: 720px; background: ${records.background}; margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.15); overflow: hidden; }
  .label { position: fixed; top: 10px; right: 12px; font-size: 11px; color: #888; background: rgba(255,255,255,0.85); padding: 3px 9px; border-radius: 4px; border: 1px solid #dedcd6; z-index: 10; }
</style>
</head>
<body>
<div class="label">agent HTML · ${filename} · p${pageNum}/9</div>
<div class="stage">
${layer}
</div>
</body></html>`;
}

const files = fs.readdirSync(PAGES_DIR).filter((f) => /^page_\d{2}\.mjs$/.test(f)).sort();
for (const f of files) {
  const num = parseInt(f.match(/page_(\d{2})/)[1], 10);
  const html = await buildOne(f, num);
  const outPath = path.join(PAGES_DIR, f.replace('.mjs', '.html'));
  fs.writeFileSync(outPath, html);
  console.log(`OK · ${outPath}`);
}