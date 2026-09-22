import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { listXlsxSheets, ingestXlsx } from '../src/ingest/xlsx.js';
import { detectConflicts } from '../src/ingest/conflicts.js';
import { ingestCsv } from '../src/ingest/index.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 现场生成多表工作簿（§4.2 表格限制：显式选表、不执行宏/脚本） */
async function buildWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet('汇总');
  summary.addRow(['月份', '销售额（万元）', '同比', '客单价']);
  const rows = [
    ['1月', 505, '-2.9%', 86.1], ['2月', 510, '-4.7%', 86.3], ['3月', 498, '-9.1%', 86.0],
    ['4月', 486, '-8.3%', 86.4], ['5月', 470, '-8.2%', 86.6], ['6月', 452, '-9.2%', 86.5],
  ];
  for (const r of rows) summary.addRow(r);
  const detail = wb.addWorksheet('明细');
  detail.addRow(['SKU', '数量']);
  detail.addRow(['A-001', 12]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildWorkbookWithFormula(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('计算');
  ws.addRow(['月份', '销售额（万元）']);
  ws.addRow(['1月', 505]);
  ws.addRow(['2月', 510]);
  const c = ws.getCell('C2');
  c.value = { formula: 'SUM(B2:B3)', result: undefined } as ExcelJS.CellFormulaValue;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('XLSX 导入（A1 回收；§4.2 表格限制）', () => {
  it('列出工作表清单', async () => {
    const buf = await buildWorkbook();
    expect(await listXlsxSheets(buf)).toEqual(['汇总', '明细']);
  });

  it('未显式选表 → 拒绝并列出选项（不做默认第一表猜测）', async () => {
    const buf = await buildWorkbook();
    const r = await ingestXlsx(buf, 'src_x');
    expect(r.ok).toBe(false);
    expect(r.failure_reason).toContain('选择工作表');
    expect(r.available_sheets).toEqual(['汇总', '明细']);
  });

  it('显式选表 → 列口径/待确认/数值与 CSV 一致', async () => {
    const buf = await buildWorkbook();
    const r = await ingestXlsx(buf, 'src_x', '汇总');
    expect(r.ok).toBe(true);
    expect(r.tables).toHaveLength(1);
    const t = r.tables[0]!;
    expect(t.rows).toHaveLength(6);
    expect(t.columns.find((c) => c.label.includes('销售额'))!.unit).toBe('万元');
    expect(t.columns.find((c) => c.label === '同比')!.unit).toBe('%');
    expect(r.confirmations[0]!.question).toContain('客单价');
    const jun = t.rows.find((row) => row.key === '6月')!;
    expect(jun.cells).toContain(452);
  });

  it('XLSX 与 CSV 产出的表格可直接做冲突检测（口径逻辑复用）', async () => {
    const buf = await buildWorkbook();
    const x = await ingestXlsx(buf, 'src_x', '汇总');
    const csv = ingestCsv(readFileSync(join(import.meta.dirname, 'fixtures/materials/sales-conflict.csv'), 'utf-8'), 'src_b');
    const conflicts = detectConflicts([...x.tables, ...csv.tables]);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]!.row_key).toBe('6月');
  });

  it('公式单元格取缓存值；无缓存值 → 空值 + 待确认提示（不执行不猜测）', async () => {
    const buf = await buildWorkbookWithFormula();
    const r = await ingestXlsx(buf, 'src_f', '计算');
    expect(r.ok).toBe(true);
    const ws = r.tables[0]!;
    // 公式列无缓存值 → 该列生成待确认问题
    expect(r.confirmations.some((c) => c.question.includes('C'))).toBe(true);
  });
});
