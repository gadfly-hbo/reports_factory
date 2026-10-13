import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digitGuard, evalFormula } from '../src/agent/digit-guard.js';
import { qaDeck } from '../src/agent/qa-deck.js';
import { renderDeckTool } from '../src/agent/tools/render-deck-tool.js';

const MAT_TEXT = '本季度进店客流 12,400 人次（上季 11458），环比上升 8.2%。客单价 328 元。库存周转天数 46 天。会员复购率 41%。';
const PAGE = (nums: string, calcs = '') => `import pptxgen from 'pptxgenjs';
${calcs}
export function buildSlide(pptx) {
  const s = pptx.addSlide();
  s.addText('${nums}', { x: 1, y: 3, w: 11, h: 1, fontSize: 24 });
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
