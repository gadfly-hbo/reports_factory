import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listDeckPages } from './deck-files.js';
import { digitGuard, type DigitGuardReport } from './digit-guard.js';
import { buildImpactMap } from './data-drift.js';

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
  digit?: DigitGuardReport;
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
  const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number.parseInt(a.match(/\d+/)![0], 10) - Number.parseInt(b.match(/\d+/)![0], 10));
  const empty: string[] = [];
  let text_boxes = 0;
  for (const n of slideNames) {
    const xml = await zip.files[n].async('string');
    const count = (xml.match(/<a:t>/g) ?? []).length;
    text_boxes += count;
    if (count === 0) empty.push(n.split('/').pop()!.replace('.xml', ''));
  }
  const charts = Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)).length;

  // 数字护栏 v2（flow-8 D1）：slideTexts 供三级判定
  const slideTexts = await Promise.all(slideNames.map(async (n) => (await zip.files[n]!.async('string')).match(/<a:t>([^<]*)<\/a:t>/g)?.map((t) => t.replace(/<[^>]+>/g, '')).join(' ') ?? ''));

  // 图表数字溯源（B1 #2）：slide rels 建 chart→slide 映射，提取 <c:val> 数据值
  const chartData: { slide: number; numbers: string[] }[] = [];
  for (const n of slideNames) {
    const relsFile = zip.files[n.replace('slides/', 'slides/_rels/') + '.rels'];
    if (!relsFile) continue;
    const relsXml = await relsFile.async('string');
    const slideIdx = Number.parseInt(n.match(/\d+/)![0], 10);
    for (const rel of relsXml.matchAll(/Type="[^"]*\/chart"\s+Target="([^"]+)"/g)) {
      const chartPath = `ppt/${rel[1]!.replace(/^\//, '').split('/').slice(-2).join('/')}`;
      const chartFile = zip.files[chartPath];
      if (!chartFile) continue;
      const chartXml = await chartFile.async('string');
      const numbers: string[] = [];
      for (const valBlock of chartXml.matchAll(/<c:val>([\s\S]*?)<\/c:val>/g)) {
        for (const v of valBlock[1]!.matchAll(/<c:v>([^<]*)<\/c:v>/g)) numbers.push(v[1]!);
      }
      if (numbers.length > 0) chartData.push({ slide: slideIdx, numbers });
    }
  }

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

  const digit = await digitGuard(projectRoot, slideTexts, chartData);
  void buildImpactMap(projectRoot).catch(() => {}); // 数据联动依赖图（异步不阻塞 QA）

  // 结论行校验（B1 #1+#7）：页代码 `// headline: <结论>` 声明 + 上页匹配；@skip 豁免但图表页禁豁免
  const chartSlides = new Set(chartData.map((c) => c.slide));
  const pages = await listDeckPages(projectRoot);
  const missingHeadline: string[] = [];
  const notOnSlide: string[] = [];
  const chartSkip: string[] = [];
  let headlinePass = 0;
  let headlineSkip = 0;
  const pageCount = Math.min(pages.length, slideTexts.length); // 页序=slide 序（listDeckPages 排序约定）
  for (let i = 0; i < pageCount; i++) {
    const page = pages[i]!;
    const hasChart = chartSlides.has(i + 1);
    let marker: string | null = null;
    try {
      const code = await readFile(join(projectRoot, page.code), 'utf-8');
      marker = /^[ \t]*\/\/\s*headline:\s*(.*)$/m.exec(code)?.[1]?.trim() || null;
    } catch { /* 页代码缺失按缺声明处理 */ }
    if (marker === null) {
      missingHeadline.push(page.name + (hasChart ? '(含图表)' : ''));
      continue;
    }
    if (marker === '@skip') {
      if (hasChart) chartSkip.push(page.name);
      else headlineSkip++;
      continue;
    }
    if ((slideTexts[i] ?? '').replace(/\s+/g, '').includes(marker.replace(/\s+/g, ''))) headlinePass++;
    else notOnSlide.push(page.name);
  }
  const headlineProblems = [...missingHeadline, ...notOnSlide, ...chartSkip];
  const headlineItem: QaItem = pages.length === 0
    ? { item: 'headline_check', status: 'info', detail: '无页代码可校验（deck 为外部导入或页文件缺失）' }
    : headlineProblems.length > 0
      ? {
          item: 'headline_check',
          status: 'flag',
          detail: [
            missingHeadline.length > 0 ? `缺声明：${missingHeadline.join('、')}` : '',
            notOnSlide.length > 0 ? `结论未上页：${notOnSlide.join('、')}` : '',
            chartSkip.length > 0 ? `图表页不可 @skip（必须有解读）：${chartSkip.join('、')}` : '',
          ].filter(Boolean).join('；') + '——内容页补 // headline: 一句话结论 并渲染上页',
        }
      : { item: 'headline_check', status: 'pass', detail: `结论行校验通过：${headlinePass} 页（${headlineSkip} 页豁免）` };

  // 取图来源清单（B3 #9）：页代码 `// image: <url>` 标记主源 + 裸 URL 兜底，按页归属去重
  const imageSources = new Map<string, Set<string>>();
  const collectUrls = (code: string, owner: string) => {
    const urls = new Set<string>();
    for (const m of code.matchAll(/\/\/\s*image:\s*(https?:\/\/\S+)/g)) urls.add(m[1]!.replace(/['"）)]+$/, ''));
    for (const m of code.matchAll(/https?:\/\/[^\s'")]+/g)) urls.add(m[0]!);
    for (const u of urls) {
      if (!imageSources.has(u)) imageSources.set(u, new Set());
      imageSources.get(u)!.add(owner);
    }
  };
  for (const page of pages) {
    try { collectUrls(await readFile(join(projectRoot, page.code), 'utf-8'), page.name); } catch { /* 页代码缺失跳过 */ }
  }
  try { collectUrls(await readFile(join(deckDir, 'deck.mjs'), 'utf-8'), 'deck.mjs'); } catch { /* 无 deck.mjs */ }
  const imageEntries = [...imageSources.entries()];
  const imageItem: QaItem = imageEntries.length > 0
    ? { item: 'image_sources', status: 'info', detail: `联网取图 ${imageEntries.length} 张（外发前请核版权）：${imageEntries.slice(0, 8).map(([u, ps]) => `${[...ps].join('/')}: ${u}`).join('；')}${imageEntries.length > 8 ? ' 等' : ''}` }
    : { item: 'image_sources', status: 'pass', detail: '无联网取图' };

  const digitItem: QaItem = {
    item: 'digit_guard',
    status: digit.violations.length > 0 ? 'flag' : 'pass',
    detail: digit.violations.length > 0
      ? `${digit.violations.length} 处数字无出处：${digit.violations.slice(0, 5).map((v) => `第${v.slide}页「${v.number}」${v.source === 'chart' ? '(图表)' : ''}`).join('、')}${digit.violations.length > 5 ? ' 等' : ''}——补材料、改回材料原值，或加 // calc: 公式 = 值 声明后重渲`
      : `数字验证通过：原始 ${digit.raw} + 推导 ${digit.derived}${digit.exempt ? `（豁免结构数/年份 ${digit.exempt}）` : ''}`,
  };

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
    digitItem,
    headlineItem,
    imageItem,
  ];
  const hasFlag = items.some((i) => i.status === 'flag');
  return {
    ok: slideNames.length > 0 && empty.length === 0,
    slides: slideNames.length,
    text_boxes,
    charts,
    empty_slides: empty,
    missing_previews: missingPreviews,
    digit,
    items,
    message: hasFlag ? '质检有 flag 项（见明细）；建议修复后再导出。' : `结构检查通过：${slideNames.length} 页 / ${text_boxes} 文本框。`,
  };
}
