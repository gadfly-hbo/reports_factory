import ExcelJS from 'exceljs';
import { emptyIngestResult, type IngestResult } from '../schema/assets.js';
import { recordsToTable } from './table-core.js';

/**
 * XLSX 导入（§4.2 表格限制）：
 * - 必须显式选择工作表（不猜测默认第一表）
 * - 只读单元格值；exceljs 是纯数据解析器，宏/脚本不执行（§12.2 文件导入行）
 * - 公式取缓存值；无缓存值 → 空值 + 待确认提示（不执行不猜测）
 */

function cellText(cell: ExcelJS.Cell): { text: string; isUncachedFormula: boolean } {
  const v = cell.value;
  if (v === null || v === undefined) return { text: '', isUncachedFormula: false };
  if (typeof v === 'object' && 'formula' in v) {
    const r = (v as ExcelJS.CellFormulaValue).result;
    return r === undefined || r === null
      ? { text: '', isUncachedFormula: true }
      : { text: String(r), isUncachedFormula: false };
  }
  if (typeof v === 'object' && 'text' in v) return { text: String((v as { text: unknown }).text), isUncachedFormula: false };
  if (v instanceof Date) return { text: v.toISOString().slice(0, 10), isUncachedFormula: false };
  return { text: String(v), isUncachedFormula: false };
}

function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export async function listXlsxSheets(buffer: Buffer): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets.map((w) => w.name);
}

export async function ingestXlsx(buffer: Buffer, sourceId: string, sheet?: string): Promise<IngestResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (e) {
    return emptyIngestResult(sourceId, {
      ok: false,
      failure_reason: `XLSX 解析失败：${e instanceof Error ? e.message : String(e)}`,
    });
  }
  const names = wb.worksheets.map((w) => w.name);
  if (!sheet) {
    return emptyIngestResult(sourceId, {
      ok: false,
      failure_reason: 'XLSX 工作簿需显式选择工作表（§4.2：不猜测）',
      available_sheets: names,
    });
  }
  const ws = wb.getWorksheet(sheet);
  if (!ws) {
    return emptyIngestResult(sourceId, {
      ok: false,
      failure_reason: `工作表不存在：${sheet}（可用：${names.join('、')}）`,
      available_sheets: names,
    });
  }

  // 表头在第一行；空表头补列字母；列数取全部行的最大 cellCount（公式可能在表头空位）
  let maxCol = 1;
  ws.eachRow((row) => { maxCol = Math.max(maxCol, row.cellCount); });
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= maxCol; c++) {
    const t = cellText(headerRow.getCell(c)).text;
    headers.push(t || colLetter(c));
  }

  const records: Record<string, string>[] = [];
  let hasUncachedFormula = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec: Record<string, string> = {};
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      const { text, isUncachedFormula } = cellText(cell);
      if (isUncachedFormula) hasUncachedFormula = true;
      rec[headers[c - 1]!] = text;
    }
    records.push(rec);
  });

  if (records.length === 0) {
    return emptyIngestResult(sourceId, { ok: false, failure_reason: `工作表「${sheet}」无数据行` });
  }

  const { table, confirmations } = recordsToTable(records, sourceId, `工作表「${sheet}」`);
  if (hasUncachedFormula) {
    confirmations.push({
      field: `sheet.${sheet}.formulas`,
      question: `工作表「${sheet}」含公式且无缓存值，未执行公式（不猜测结果）——请补充数值或确认空值`,
    });
  }
  return emptyIngestResult(sourceId, { tables: [table], confirmations });
}
