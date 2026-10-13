import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildImpactMap, readImpactMap, detectDrift } from '../src/agent/data-drift.js';

async function seed(root: string, matText: string, pageCode: string) {
  await mkdir(join(root, 'sources'), { recursive: true });
  await mkdir(join(root, 'deck', 'pages'), { recursive: true });
  await writeFile(join(root, 'materials.json'), JSON.stringify({ version: 1, materials: [
    { source_id: 'src_1', filename: 'sales.csv', kind: 'csv', status: 'ready', extract_file: 'sources/src_1.extract.md', original_file: 'sources/src_1__sales.csv', size: 100, chars: matText.length, updated_at: '2026-10-13T00:00:00Z' },
  ] }));
  await writeFile(join(root, 'sources', 'src_1.extract.md'), `# sales\n\n${matText}\n`);
  await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), pageCode);
  await writeFile(join(root, 'deck', 'pages', 'page_02.mjs'), `import pptxgen from 'pptxgenjs';\nexport function buildSlide(p){p.addSlide();}`); // 不引用数据
}

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-dd-${tag}-`));
  const root = join(base, 'proj_d');
  await mkdir(root, { recursive: true });
  return root;
}

describe('数据联动（flow-11 P3）', () => {
  it('impact-map：页→材料数字映射；不引用数据的页不进映射', async () => {
    const root = await tmpRoot('map');
    try {
      await seed(root, '销售额 100 万元，客流 200 人次', `import pptxgen from 'pptxgenjs';\nexport function buildSlide(p){const s=p.addSlide();s.addText('销售 100 万元', {x:1,y:3});}`);
      const map = await buildImpactMap(root);
      expect(map).toHaveLength(1); // page_02 不引用数据
      expect(map[0]!.page).toBe('page_01');
      expect(map[0]!.numbers.some((n) => n.value === '100' && n.source_file === 'sales.csv')).toBe(true);
      // 持久化
      const persisted = await readImpactMap(root);
      expect(persisted).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('detectDrift：改材料后受影响页命中；不改→空', async () => {
    const root = await tmpRoot('drift');
    try {
      const code = `import pptxgen from 'pptxgenjs';\nexport function buildSlide(p){const s=p.addSlide();s.addText('销售 100 万元', {x:1,y:3});}`;
      await seed(root, '销售额 100 万元', code);
      await buildImpactMap(root);

      // 未变更 → 无漂移
      let d = await detectDrift(root);
      expect(d.changed_sources).toEqual([]);
      expect(d.affected_pages).toEqual([]);

      // 变更：100 → 200
      await writeFile(join(root, 'sources', 'src_1.extract.md'), '# sales\n\n销售额 200 万元\n');
      d = await detectDrift(root);
      expect(d.changed_sources).toHaveLength(1);
      expect(d.changed_sources[0]!.changed_numbers).toContain('100');
      expect(d.affected_pages).toContain('page_01');
      expect(d.affected_pages).not.toContain('page_02');
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });
});
