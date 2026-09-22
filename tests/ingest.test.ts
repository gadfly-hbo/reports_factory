import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ingestMarkdown, ingestCsv } from '../src/ingest/index.js';
import { detectConflicts } from '../src/ingest/conflicts.js';
import { ingestAndSave } from '../src/ingest/persist.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import type { TableAsset } from '../src/schema/assets.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

describe('Markdown 显式标记解析（F04）', () => {
  it('结论/推断/建议/口径 → 对应 kind 与验证状态，推断不得升级', async () => {
    const md = await readFile(join(MAT, 'conclusion.md'), 'utf-8');
    const r = ingestMarkdown(md, 'src_test');
    expect(r.ok).toBe(true);
    const kinds = Object.fromEntries(r.claims.map((c: any) => [c.kind, c]));
    expect(kinds.fact_statement).toBeTruthy();
    expect(kinds.inference).toBeTruthy();
    expect(kinds.recommendation).toBeTruthy();
    expect(kinds.data_note).toBeTruthy();
    // 推断必须保留未证实状态（proposal §10.1）
    expect(kinds.inference.verification_state).toBe('unverified');
    expect(kinds.inference.source_truth_verified).toBe(false);
    expect(kinds.inference.text).toContain('尚未证实');
    // 事实陈述绑定来源但真实性不因此成立
    expect(kinds.fact_statement.verification_state).toBe('bound_to_source');
    expect(kinds.fact_statement.source_truth_verified).toBe(false);
  });

  it('每条主张携带 EvidenceRef（来源/定位/摘录）', async () => {
    const md = await readFile(join(MAT, 'conclusion.md'), 'utf-8');
    const r = ingestMarkdown(md, 'src_test');
    expect(r.evidence.length).toBeGreaterThanOrEqual(5);
    const ev = r.evidence[0]!;
    expect(ev.source_id).toBe('src_test');
    expect(ev.locator).toContain('结论');
    expect(ev.excerpt.length).toBeGreaterThan(0);
    // claim 引用的 evidence_id 可定位
    const claim = r.claims[0] as any;
    expect(claim.evidence_refs.length).toBeGreaterThan(0);
    const ids = new Set(r.evidence.map((e) => e.evidence_id));
    for (const id of claim.evidence_refs) expect(ids.has(id)).toBe(true);
  });

  it('恶意材料指令作为普通文本处理，不执行、不改身份（§13.2）', async () => {
    const md = await readFile(join(MAT, 'malicious.md'), 'utf-8');
    const r = ingestMarkdown(md, 'src_evil');
    expect(r.ok).toBe(true);
    const texts = r.claims.map((c: any) => c.text).join('\n');
    // 指令文本被原样保留为材料内容（没有被删除，也没有被执行产生副作用）
    expect(texts).toContain('~/.ssh/id_rsa');
    expect(texts).toContain('开发者模式');
    // 全部是普通主张，没有任何被提升为"系统确认"的状态
    for (const c of r.claims as any[]) {
      expect(c.verification_state).not.toBe('arithmetic_checked');
      expect(c.source_truth_verified).toBe(false);
    }
  });
});

describe('CSV 表格解析与口径确认（F02）', () => {
  it('列结构化、单位从表头推断、无单位列生成待确认问题', async () => {
    const csv = await readFile(join(MAT, 'sales.csv'), 'utf-8');
    const r = ingestCsv(csv, 'src_csv');
    expect(r.ok).toBe(true);
    expect(r.tables).toHaveLength(1);
    const table = r.tables[0] as TableAsset;
    expect(table.rows).toHaveLength(6);
    const salesCol = table.columns.find((c) => c.label.includes('销售额'))!;
    expect(salesCol.unit).toBe('万元');
    const yoyCol = table.columns.find((c) => c.label === '同比')!;
    expect(yoyCol.unit).toBe('%');
    // 客单价列无单位线索 → 生成确认问题而非猜测
    const ticketCol = table.columns.find((c) => c.label === '客单价')!;
    expect(ticketCol.unit).toBeUndefined();
    expect(r.confirmations).toEqual([
      { field: 'columns.客单价.unit', question: '列「客单价」的单位是什么？（无法从表头判断，不猜测）' },
    ]);
    // 6月数值保留为可追溯数据
    const jun = table.rows.find((row) => row.key === '6月')!;
    expect(jun.cells).toContain(452);
  });

  it('同口径不同数值 → 冲突展示，不静默择一（§13.2）', async () => {
    const a = ingestCsv(await readFile(join(MAT, 'sales.csv'), 'utf-8'), 'src_a');
    const b = ingestCsv(await readFile(join(MAT, 'sales-conflict.csv'), 'utf-8'), 'src_b');
    const conflicts = detectConflicts([
      ...(a.tables as TableAsset[]),
      ...(b.tables as TableAsset[]),
    ]);
    expect(conflicts.length).toBeGreaterThan(0);
    const c = conflicts[0]!;
    expect(c.row_key).toBe('6月');
    expect(c.column_label).toContain('销售额');
    expect(c.values.map((v) => v.value)).toEqual([452, 455]);
    expect(c.resolution).toBe('unresolved');
  });

  it('坏 CSV：解析失败被隔离，给出原因（不清空项目）', async () => {
    const r = ingestCsv('月份,销售额\n"未闭合引号,123\n', 'src_bad');
    expect(r.ok).toBe(false);
    expect(r.failure_reason).toBeTruthy();
    expect(r.claims).toEqual([]);
  });
});

describe('导入并入库（F02 集成）', () => {
  it('图片导入：标记无底层数据；MD/CSV 解析结果持久化，重启可读', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-ingest-'));
    try {
      const store = new WorkspaceStore(dir);
      const p = await store.createProject({ title: '导入测试' });

      // 1x1 PNG
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      );
      const md = await readFile(join(MAT, 'conclusion.md'), 'utf-8');
      const csv = await readFile(join(MAT, 'sales.csv'), 'utf-8');

      const imgAsset = await ingestAndSave(store, p.project_id, {
        filename: 'chart.png', content: png, kind: 'image', media_type: 'image/png',
      });
      const mdRes = await ingestAndSave(store, p.project_id, {
        filename: 'conclusion.md', content: Buffer.from(md), kind: 'markdown', media_type: 'text/markdown',
      });
      const csvRes = await ingestAndSave(store, p.project_id, {
        filename: 'sales.csv', content: Buffer.from(csv), kind: 'csv', media_type: 'text/csv',
      });

      expect(imgAsset.parse_status).toBe('parsed');
      expect(imgAsset.has_data).toBe(false); // 无底层数据
      expect(mdRes.claims.length).toBeGreaterThanOrEqual(5);
      expect(csvRes.tables).toHaveLength(1);

      // 派生资产落盘（sources/<id>.assets.json）
      const store2 = new WorkspaceStore(dir); // 模拟重启
      const assetsFile = join(dir, p.project_id, 'sources', `${mdRes.source_id}.assets.json`);
      expect(existsSync(assetsFile)).toBe(true);
      const sources = await store2.listSourceAssets(p.project_id);
      expect(sources).toHaveLength(3);
      expect(sources.every((s) => s.parse_status === 'parsed')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
