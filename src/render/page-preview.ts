import type { WorkspaceStore } from '../storage/workspace.js';

/**
 * B3 编辑节点预览：单页渲染为 PNG（近似）。
 * 无 LibreOffice，用纯 JS：把该页内容渲染为单页 HTML（内联样式 16:9）→ Playwright 截图。
 * 工具 Agent 页（有 pptx_buffer）用其文字内容近似；数据页用 deck-html 的版式语义。
 * 预览为近似渲染，实际以导出 PPTX 为准（GB5）。
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

interface PptWorkLike {
  pages?: Record<string, { headline?: string; bullets?: Array<{ text: string }>; body?: string; layout?: string; subtitle?: string; highlight?: string }>;
  framework?: { pages: Array<{ page_id: string; title: string; intent?: string; page_type?: string }> };
  pptx_buffers?: Record<string, string>;
}

export async function renderPagePreviewPng(store: WorkspaceStore, projectId: string, pageId: string): Promise<Buffer> {
  const work = (await store.readWorkState(projectId)) as PptWorkLike | null;
  if (!work?.framework) throw new Error('框架不存在');
  const fp = work.framework.pages.find((p) => p.page_id === pageId);
  if (!fp) throw new Error(`页不存在：${pageId}`);
  const draft = work.pages?.[page_id_key(pageId)];
  const hasAgent = !!work.pptx_buffers?.[page_id_key(pageId)];

  const headline = draft?.headline ?? fp.title;
  const bullets = (draft?.bullets ?? []).map((b) => b.text);
  const subtitle = draft?.subtitle ?? fp.intent ?? '';
  const body = draft?.body ?? '';
  const layout = draft?.layout ?? 'title_bullets';

  // 单页 16:9 HTML（近似版式）
  const bulletsHtml = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 1280px; height: 720px; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #fff; color: #242830; display: flex; flex-direction: column; padding: 48px 56px; position: relative; overflow: hidden; }
    .eyebrow { font-size: 13px; letter-spacing: .12em; color: #b44626; font-weight: 700; }
    .band { width: 56px; height: 5px; background: #263442; margin: 10px 0 18px; border-radius: 2px; }
    h1 { font-size: 34px; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; margin-bottom: 10px; }
    .sub { font-size: 17px; color: #626773; margin-bottom: 22px; }
    ul { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    li { display: flex; gap: 10px; font-size: 16px; line-height: 1.5; }
    li::before { content: ""; width: 20px; height: 4px; background: #b44626; border-radius: 2px; flex: none; margin-top: 10px; }
    .body { margin-top: auto; font-size: 14px; color: #626773; line-height: 1.6; }
    .agent-tag { position: absolute; top: 48px; right: 56px; font-size: 12px; color: #626773; border: 1px solid #dedcd6; padding: 4px 10px; border-radius: 4px; }
    .layout-cover { background: #263442; color: #fff; }
    .layout-cover .eyebrow, .layout-cover .sub { color: #d6dde4; }
    .layout-cover .band { background: #b44626; }
    .layout-cover li::before { background: #d6dde4; }
  </style></head>
  <body class="layout-${escapeHtml(layout)}">
    ${hasAgent ? '<div class="agent-tag">工具 Agent 渲染</div>' : ''}
    <div class="eyebrow">${escapeHtml(pageId.toUpperCase())}</div>
    <div class="band"></div>
    <h1>${escapeHtml(headline)}</h1>
    ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
    ${bulletsHtml ? `<ul>${bulletsHtml}</ul>` : ''}
    ${body ? `<div class="body">${escapeHtml(body)}</div>` : ''}
  </body></html>`;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const png = await page.screenshot({ type: 'png', fullPage: false });
  await browser.close();
  return png;
}

function page_id_key(pageId: string): string {
  return pageId;
}
