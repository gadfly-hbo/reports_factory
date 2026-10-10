import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listDeckPages } from './deck-files.js';

/**
 * deck 质检（T5，D7/G8）：结构校验 + 隐私建议性输出——全部不阻断，结果给 agent（交付前自检）
 * 与 UI（质检卡）共用。结构项来自真实产物解析（JSZip slide/textbox/chart 计数）；
 * 隐私项沿 checks/privacy.ts 语义精简（敏感材料标记、原生图表可编辑提醒）。
 */

export interface QaItem {
  item: string;
  status: 'pass' | 'flag' | 'info';
  detail: string;
}

export interface QaReport {
  ok: boolean; // 结构是否成立（deck 存在且可解析）；建议项不影响 ok
  slides: number;
  text_boxes: number;
  charts: number;
  empty_slides: string[];
  missing_previews: string[];
  items: QaItem[];
  message: string;
}

export async function qaDeck(projectRoot: string): Promise<QaReport> {
  const deckDir = join(projectRoot, 'deck');
  const pptxPath = join(deckDir, 'deck.pptx');
  if (!existsSync(pptxPath)) {
    return {
      ok: false, slides: 0, text_boxes: 0, charts: 0, empty_slides: [], missing_previews: [],
      items: [{ item: 'deck_artifact', status: 'flag', detail: 'deck/deck.pptx 不存在：先完成生成与 render_deck' }],
      message: '质检失败：没有可检的 deck 工件。',
    };
  }
  const buf = await readFile(pptxPath);
  const JSZip = (await import('jszip')).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return {
      ok: false, slides: 0, text_boxes: 0, charts: 0, empty_slides: [], missing_previews: [],
      items: [{ item: 'zip_integrity', status: 'flag', detail: 'deck.pptx 无法解包（zip 损坏）' }],
      message: '质检失败：deck 工件损坏，请重新 render_deck。',
    };
  }
  const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  const empty: string[] = [];
  let text_boxes = 0;
  for (const n of slideNames) {
    const xml = await zip.files[n].async('string');
    const count = (xml.match(/<a:t>/g) ?? []).length;
    text_boxes += count;
    if (count === 0) empty.push(n.split('/').pop()!.replace('.xml', ''));
  }
  const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)).length;

  const missingPreviews = (await listDeckPages(projectRoot)).filter((p) => !p.html).map((p) => p.name);

  // 敏感材料标记（sources/src_*.json 元数据）
  const sensitive: string[] = [];
  const sourcesDir = join(projectRoot, 'sources');
  if (existsSync(sourcesDir)) {
    for (const f of (await readdir(sourcesDir)).filter((f) => f.endsWith('.json') && !f.endsWith('.assets.json') && !f.includes('__'))) {
      try {
        const meta = JSON.parse(await readFile(join(sourcesDir, f), 'utf-8')) as { filename?: string; sensitivity?: string };
        if (meta.sensitivity === 'sensitive') sensitive.push(meta.filename ?? f);
      } catch { /* 坏元数据不计 */ }
    }
  }

  const items: QaItem[] = [
    { item: 'zip_integrity', status: 'pass', detail: `zip 可解包，${Math.round(buf.length / 1024)}KB` },
    {
      item: 'slide_structure',
      status: slideNames.length > 0 && empty.length === 0 ? 'pass' : 'flag',
      detail: slideNames.length === 0 ? '没有任何 slide' : empty.length > 0 ? `空 slide（无文本框）：${empty.join(', ')}` : `${slideNames.length} slide 均含文本`,
    },
    ...(charts > 0 ? [{ item: 'chart_underlying_data' as const, status: 'info' as const, detail: `含 ${charts} 个原生可编辑图表（外发前请确认底层数据可接受）` }] : []),
    {
      item: 'sensitive_sources',
      status: sensitive.length > 0 ? 'flag' : 'pass',
      detail: sensitive.length > 0 ? `敏感标记材料：${sensitive.join(', ')}——外发前需脱敏或确认` : '无敏感标记材料',
    },
    ...(missingPreviews.length > 0 ? [{ item: 'page_preview', status: 'info' as const, detail: `${missingPreviews.length} 页缺 agent HTML 预览（UI 以近似预览展示）` }] : []),
  ];
  const hasFlag = items.some((i) => i.status === 'flag');
  return {
    ok: slideNames.length > 0 && empty.length === 0,
    slides: slideNames.length,
    text_boxes,
    charts,
    empty_slides: empty,
    missing_previews: missingPreviews,
    items,
    message: hasFlag ? '质检有 flag 项（见明细）；建议修复后再导出。' : `结构检查通过：${slideNames.length} 页 / ${text_boxes} 文本框。`,
  };
}
