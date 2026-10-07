import type { ReportSpec } from '../schema/report-spec.js';

/**
 * PPTX → 单文件 HTML 幻灯片（M10 S7，US11）。
 * 形态：16:9 / 键盘与按钮翻页 / 无外部依赖 / 内联样式（无需服务端渲染）。
 * 复用 render/pptx.ts 的 layout 语义：每页 = 一个 .slide-section，含 eyebrow/headline/bullets/chart。
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' })[c]!);
}

function slideSection(spec: ReportSpec, idx: number): string {
  const p = spec.pages[idx]!;
  const bullets = (p.bullets ?? []).map((b) => `<li>${escapeHtml(b.text)}</li>`).join('');
  const chart = p.chart
    ? `<svg viewBox="0 0 600 220" class="chart" role="img" aria-label="${escapeHtml(p.chart.title ?? '')}">
         ${bars(p.chart.series[0]?.data ?? [], p.chart.title ?? '')}
       </svg>`
    : '';
  return `<section class="slide-section" data-index="${idx}">
    <div class="eyebrow">${escapeHtml(`${spec.report_id} · ${String(idx + 1).padStart(2, '0')}`)}</div>
    <div class="band"></div>
    <h2 class="slide-headline">${escapeHtml(p.headline)}</h2>
    ${p.body ? `<p class="slide-body">${escapeHtml(p.body)}</p>` : ''}
    ${bullets ? `<ul class="slide-bullets">${bullets}</ul>` : ''}
    ${chart}
    <div class="slide-foot"><span>REPORT STUDIO</span><span>${escapeHtml(p.type)}</span></div>
  </section>`;
}

function bars(data: { label: string; value: number }[], title: string): string {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barH = 18, gap = 6, w = 600, left = 90, labelW = 60;
  const contentH = data.length * (barH + gap);
  return `
    <text x="${left - 6}" y="14" text-anchor="end" font-size="11" fill="#626773">${escapeHtml(title)}</text>
    ${data.map((d, i) => {
      const y = 24 + i * (barH + gap);
      const bw = ((w - left - 10) * d.value) / max;
      return `
        <text x="${left - 6}" y="${y + barH - 4}" text-anchor="end" font-size="10" fill="#242830">${escapeHtml(d.label)}</text>
        <rect x="${left}" y="${y}" width="${Math.max(2, bw)}" height="${barH - 4}" fill="#b44626" rx="2" />
        <text x="${left + bw + 4}" y="${y + barH - 4}" font-size="10" fill="#242830">${d.value}</text>`;
    }).join('')}
    <rect x="${left}" y="0" width="${w - left - 10}" height="${contentH + 18}" fill="none" stroke="#dedcd6" />
  `;
}

export function renderDeckHtml(spec: ReportSpec): string {
  const title = escapeHtml(spec.brief.purpose || spec.brief.audience || spec.report_id);
  const pages = spec.pages.map((_, i) => slideSection(spec, i)).join('');
  const total = spec.pages.length;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --bg:#f7f6f3; --panel:#ffffff; --ink:#242830; --muted:#626773; --line:#dedcd6; --accent:#b44626; --accent-soft:#fcf0e9; --navy:#263442; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.6; }
  .deck { max-width: 1180px; margin: 0 auto; padding: 26px clamp(12px,3vw,30px) 50px; }
  header.deck-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  header.deck-head h1 { font-size: 1.375rem; font-weight: 650; }
  header.deck-head .nav { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.875rem; color: var(--muted); }
  .slide-section { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 5% 6%; margin: 14px 0; aspect-ratio: 16/9; display: flex; flex-direction: column; box-shadow: 0 1px 0 var(--line); }
  .eyebrow { font-family: ui-monospace, Menlo, monospace; font-size: 0.7rem; letter-spacing: 0.14em; color: var(--accent); font-weight: 650; }
  .band { width: 56px; height: 4px; background: var(--navy); border-radius: 2px; margin: 6px 0 12px; }
  .slide-headline { font-size: clamp(1.05rem, 1.7vw, 1.55rem); font-weight: 650; letter-spacing: -0.01em; margin-bottom: 8px; }
  .slide-body { color: var(--muted); font-size: 0.95rem; margin-bottom: 12px; max-width: 80ch; }
  .slide-bullets { display: flex; flex-direction: column; gap: 6px; padding-left: 0; list-style: none; }
  .slide-bullets li { display: flex; gap: 8px; align-items: flex-start; font-size: 0.92rem; }
  .slide-bullets li::before { content: ""; width: 18px; height: 3px; background: var(--accent); border-radius: 2px; flex: none; margin-top: 0.6em; }
  .chart { width: 100%; max-width: 560px; margin-top: auto; }
  .slide-foot { display: flex; justify-content: space-between; font-family: ui-monospace, Menlo, monospace; font-size: 0.7rem; color: var(--muted); margin-top: 12px; }
  nav.deck-nav { position: sticky; top: 0; background: var(--bg); padding: 8px 0; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); z-index: 10; }
  nav.deck-nav button { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; cursor: pointer; font-size: 0.875rem; }
  nav.deck-nav button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
</head>
<body>
<nav class="deck-nav">
  <button id="prev" type="button">← 上一页</button>
  <span class="mono" id="pos" style="font-family: ui-monospace, Menlo, monospace; font-size: 0.875rem; color: var(--muted);">1 / ${total}</span>
  <button id="next" type="button">下一页 →</button>
</nav>
<div class="deck">
  <header class="deck-head"><h1>${title}</h1><span class="nav">REPORT STUDIO · ${total} 页</span></header>
  ${pages}
</div>
<script>
  var cur = 1, total = ${total};
  function show(i) {
    i = Math.max(1, Math.min(total, i));
    cur = i;
    document.getElementById('pos').textContent = i + ' / ' + total;
    document.getElementById('prev').disabled = (i === 1);
    document.getElementById('next').disabled = (i === total);
    document.querySelectorAll('.slide-section').forEach(function(s, idx) { s.style.display = (idx + 1 === i) ? '' : 'none'; });
  }
  document.getElementById('prev').onclick = function() { show(cur - 1); };
  document.getElementById('next').onclick = function() { show(cur + 1); };
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(cur + 1); }
  });
  show(1);
</script>
</body>
</html>`;
}
