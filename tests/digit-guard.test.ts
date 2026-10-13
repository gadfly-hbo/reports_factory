import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digitGuard, evalFormula } from '../src/agent/digit-guard.js';
import { qaDeck } from '../src/agent/qa-deck.js';
import { renderDeckTool } from '../src/agent/tools/render-deck-tool.js';
import { logReadPath } from '../src/agent/read-log.js';

const MAT_TEXT = '本季度进店客流 12,400 人次（上季 11458），环比上升 8.2%。客单价 328 元。库存周转天数 46 天。会员复购率 41%。';
const PAGE = (nums: string, calcs = '', headline = '') => `import pptxgen from 'pptxgenjs';
${calcs}
${headline}
export function buildSlide(pptx) {
  const s = pptx.addSlide();
  s.addText('${nums}', { x: 1, y: 3, w: 11, h: 1, fontSize: 24 });
}`;
const CHART_PAGE = (values: number[], calcs = '', headline = '', text = '') => `import pptxgen from 'pptxgenjs';
${calcs}
${headline}
export function buildSlide(pptx) {
  const s = pptx.addSlide();
  s.addChart(pptx.ChartType.bar, [{ name: '系列', labels: ${JSON.stringify(values.map((_, i) => `项${i + 1}`))}, values: ${JSON.stringify(values)} }], { x: 1, y: 1, w: 8, h: 4, showValue: true });${text ? `\n  s.addText('${text}', { x: 1, y: 5.5, w: 11, h: 0.8, fontSize: 20 });` : ''}
}`;

async function seed(root: string, pages: Record<string, string>) {
  await mkdir(join(root, 'sources'), { recursive: true });
  await mkdir(join(root, 'deck', 'pages'), { recursive: true });
  await writeFile(join(root, 'materials.json'), JSON.stringify({ version: 1, materials: [{ source_id: 'src_1', filename: 'm.md', kind: 'markdown', status: 'ready', extract_file: 'sources/src_1.extract.md', original_file: 'sources/src_1__m.md', size: 100, chars: MAT_TEXT.length, updated_at: '2026-10-13T00:00:00Z' }] }));
  await writeFile(join(root, 'sources', 'src_1.extract.md'), `# m\n\n${MAT_TEXT}\n`);
  for (const [name, content] of Object.entries(pages)) {
    await writeFile(join(root, 'deck', 'pages', name), content);
    await writeFile(join(root, 'deck', 'pages', name.replace(/\.mjs$/, '.html')), '<html><body>x</body></html>');
  }
  const deck = `import pptxgen from 'pptxgenjs';\n${Object.keys(pages).map((n, i) => `import { buildSlide as p${i + 1} } from './pages/${n}';`).join('\n')}\nconst pptx = new pptxgen();\npptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });\npptx.layout = 'W';\n${Object.keys(pages).map((_, i) => `p${i + 1}(pptx);`).join('\n')}\nawait pptx.writeFile({ fileName: 'deck/deck.pptx' });`;
  await writeFile(join(root, 'deck', 'deck.mjs'), deck);
  const r = await renderDeckTool(root).execute({ expected_slides: Object.keys(pages).length }, new AbortController().signal);
  if (!(r as { ok: boolean }).ok) throw new Error(`seed render 失败：${JSON.stringify(r).slice(0, 200)}`);
}

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-dg-${tag}-`));
  const root = join(base, 'proj_d');
  await mkdir(root, { recursive: true });
  return root;
}

describe('数字护栏 v2（flow-8 D1）', () => {
  it('公式求值：白名单文法/百分号/负数/拒绝函数与变量', () => {
    expect(evalFormula('(12400-11458)/12400*100')?.toNumber()).toBeCloseTo(7.58, 1);
    expect(evalFormula('50%')?.toNumber()).toBeCloseTo(0.5, 6);
    expect(evalFormula('-3+5')?.toNumber()).toBe(2);
    expect(evalFormula('alert(1)')).toBeNull();
    expect(evalFormula('Math.pow(2,3)')).toBeNull();
    expect(evalFormula('1/0')).toBeNull();
  });

  it('三级判定：raw 通过 / calc 推导通过 / 无解释 FLAG / 豁免', async () => {
    const root = await tmpRoot('tiers');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('客流 12400 人次 增幅 8.2% 2026 年 07', ''),
        'page_02.mjs': PAGE('增幅 7.6% 环比 -7.6% 客单 328 元',
          '// calc: (12400-11458)/12400*100 = 7.6\n// calc: (11458-12400)/12400*100 = -7.6'),
        'page_03.mjs': PAGE('增幅 99.9% 业绩 8888 万元', ''),
      });
      const r = await digitGuard(root, [
        '客流 12400 人次 增幅 8.2% 2026 年 07',
        '增幅 7.6% 环比 -7.6% 客单 328 元',
        '增幅 99.9% 业绩 8888 万元',
      ]);
      expect(r.raw).toBeGreaterThanOrEqual(3); // 12400 / 8.2 / 328
      expect(r.derived).toBe(2); // 7.6 与 -7.6（calc 声明输入 12400/11458 均在材料）
      expect(r.violations.map((v) => v.number).sort()).toEqual(['8888', '99.9']);
      expect(r.exempt).toBeGreaterThanOrEqual(2); // 2026 年份 + 07 序号
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('calc 坏例：输入非 raw / 算术错 / 套娃 → FLAG', async () => {
    const root = await tmpRoot('bad');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('占比 50% 汇总 99999 增速 15%',
          '// calc: (6200+6200)/24800*100 = 50  ← 6200/24800 不在材料\n// calc: 12400*8 = 99999  ← 算术错\n// calc: 7.6*2 = 15  ← 7.6 非 raw（套娃）'),
      });
      const r = await digitGuard(root, ['占比 50% 汇总 99999 增速 15%']);
      // 50%：6200 非 raw → FLAG；99999：12400*8=99200≠99999 算术错 → FLAG；15：7.6 非 raw 套娃 → FLAG
      expect(r.violations.map((v) => v.number).sort()).toEqual(['15', '50', '99999']);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('qa_deck 集成：digit_guard 项存在且状态正确', async () => {
    const root = await tmpRoot('qa');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('神秘数字 777 万元', ''),
      });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'digit_guard')!;
      expect(item.status).toBe('flag');
      expect(item.detail).toContain('777');
      expect(report.digit?.violations).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('图表数字溯源（B1 / 痛点 #2）', () => {
  it('图表值无出处 → flag 且归属持有图表的页（第 2 页），不受小整数豁免', async () => {
    const root = await tmpRoot('chartflag');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('客流 12400 人次', ''),
        'page_02.mjs': CHART_PAGE([67, 8888]),
      });
      const report = await qaDeck(root);
      const chartV = report.digit?.violations.filter((v) => v.source === 'chart') ?? [];
      expect(chartV.map((v) => v.number).sort()).toEqual(['67', '8888']);
      expect(chartV.every((v) => v.slide === 2)).toBe(true);
      const item = report.items.find((i) => i.item === 'digit_guard')!;
      expect(item.status).toBe('flag');
      expect(item.detail).toContain('(图表)');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('图表值 raw 出处 → 通过；年份豁免沿用；calc 声明可救', async () => {
    const root = await tmpRoot('chartok');
    try {
      await seed(root, {
        'page_01.mjs': CHART_PAGE([12400, 2024, 942],
          '// calc: 12400-11458 = 942'),
      });
      const report = await qaDeck(root);
      const r = report.digit!;
      const chartV = r.violations.filter((v) => v.source === 'chart');
      expect(chartV).toHaveLength(0);
      expect(r.raw).toBeGreaterThanOrEqual(1); // 12400
      expect(r.derived).toBeGreaterThanOrEqual(1); // 942
      expect(r.exempt).toBeGreaterThanOrEqual(1); // 2024
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('结论行校验 headline_check（B1 / 痛点 #1+#7）', () => {
  it('缺声明 → flag 列页清单，图表页带后缀点名', async () => {
    const root = await tmpRoot('hlmiss');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('客流 12400 人次', ''),
        'page_02.mjs': CHART_PAGE([12400]),
      });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'headline_check')!;
      expect(item.status).toBe('flag');
      expect(item.detail).toContain('page_01');
      expect(item.detail).toContain('page_02');
      expect(item.detail).toContain('含图表');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('声明且上页 → 通过；@skip 豁免；图表页 @skip → flag', async () => {
    const root = await tmpRoot('hlok');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('客流环比上升：12400 人次', '', '// headline: 客流环比上升'),
        'page_02.mjs': PAGE('目录', '', '// headline: @skip'),
        'page_03.mjs': CHART_PAGE([12400], '', '// headline: @skip'),
      });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'headline_check')!;
      expect(item.status).toBe('flag');
      expect(item.detail).toContain('page_03'); // 图表页禁豁免
      expect(item.detail).not.toContain('page_01');
      expect(item.detail).not.toContain('page_02');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('声明但结论未上页 → flag', async () => {
    const root = await tmpRoot('hloff');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('客流 12400 人次', '', '// headline: 完全不同的结论'),
      });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'headline_check')!;
      expect(item.status).toBe('flag');
      expect(item.detail).toContain('page_01');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('全部合规 → pass 含通过/豁免计数', async () => {
    const root = await tmpRoot('hlpass');
    try {
      await seed(root, {
        'page_01.mjs': CHART_PAGE([12400], '', '// headline: 客流领先', '客流领先：全年表现回顾'),
        'page_02.mjs': PAGE('目录', '', '// headline: @skip'),
      });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'headline_check')!;
      expect(item.status).toBe('pass');
      expect(item.detail).toContain('1 页');
      expect(item.detail).toContain('1 页豁免');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('缩进标记识别；空文本标记归缺声明；旧 deck（无图表无 headline）→ headline_check 因缺声明 flag', async () => {
    const root = await tmpRoot('hledge');
    try {
      await seed(root, {
        'page_01.mjs': `import pptxgen from 'pptxgenjs';\nexport function buildSlide(pptx) {\n  const s = pptx.addSlide();\n  s.addText('客流 12400 人次', { x: 1, y: 3, w: 11, h: 1, fontSize: 24 });\n}\n\n  // headline: 客流 12400 人次`,
        'page_02.mjs': PAGE('目录', '', '// headline:'),
      });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'headline_check')!;
      expect(item.status).toBe('flag');
      expect(item.detail).toContain('page_02'); // 空文本 → 缺声明
      expect(item.detail).not.toContain('page_01'); // 缩进标记识别（空 marker 修复前 page_01 也会误入）
      // 旧 deck 等价：除新增 headline_check 外其余 items 语义不变
      expect(report.items.find((i) => i.item === 'digit_guard')!.status).toBe('pass');
      expect(report.items.find((i) => i.item === 'slide_structure')!.status).toBe('pass');
      expect(report.ok).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('取图来源清单 image_sources（B3 / 痛点 #9）', () => {
  it('标记+裸 URL 同图去重；裸 URL 兜底；跨页归属正确；无图 pass', async () => {
    const root = await tmpRoot('imgsrc');
    try {
      await seed(root, {
        'page_01.mjs': PAGE('封面', "// image: https://img.example.com/a.jpg\n// curl -L -o deck/assets/a.jpg 'https://img.example.com/a.jpg'"),
        'page_02.mjs': PAGE('内容', "// curl -L -o deck/assets/b.jpg 'https://img.example.com/b.jpg'"),
        'page_03.mjs': PAGE('纯文字', ''),
      });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'image_sources')!;
      expect(item.status).toBe('info');
      expect(item.detail).toContain('https://img.example.com/a.jpg');
      expect(item.detail).toContain('https://img.example.com/b.jpg');
      expect(item.detail.match(/img\.example\.com\/a\.jpg/g)).toHaveLength(1); // 去重
      expect(item.detail).toContain('page_01');
      expect(item.detail).toContain('page_02');
      expect(item.detail).not.toContain('page_03');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('无任何 URL → pass 无联网取图', async () => {
    const root = await tmpRoot('imgnone');
    try {
      await seed(root, { 'page_01.mjs': PAGE('纯文字页', '') });
      const report = await qaDeck(root);
      const item = report.items.find((i) => i.item === 'image_sources')!;
      expect(item.status).toBe('pass');
      expect(item.detail).toContain('无联网取图');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('材料覆盖复核 material_coverage（B5 / 痛点 #16）', () => {
  it('从未触达 → flag 列 filename 与补读指令；补读后 → pass', async () => {
    const root = await tmpRoot('cov');
    try {
      await seed(root, { 'page_01.mjs': PAGE('内容页', '', '// headline: 内容页') });
      let report = await qaDeck(root);
      let item = report.items.find((i) => i.item === 'material_coverage')!;
      expect(item.status).toBe('flag');
      expect(item.detail).toContain('m.md'); // seed 材料文件名
      expect(item.detail).toContain('read');

      await logReadPath(root, 'sources/src_1.extract.md'); // read 工具补读
      report = await qaDeck(root);
      item = report.items.find((i) => i.item === 'material_coverage')!;
      expect(item.status).toBe('pass');
      expect(item.detail).toContain('1 份');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });
});
