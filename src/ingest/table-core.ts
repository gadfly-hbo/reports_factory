import type { TableColumn, TableAsset, TableRow } from '../schema/assets.js';

/**
 * 表格构建核心（CSV 与 XLSX 共用）：列口径登记、单位推断、数值保留。
 * 单位从表头括号或 % 推断；推断不出的生成待确认问题（不猜测）。
 */

const NUMERIC_RE = /^-?[\d,]+(\.\d+)?$/;

function inferUnit(label: string, sampleValues: string[] = []): string | undefined {
  const paren = label.match(/[（(](.+?)[)）]/);
  if (paren) return paren[1];
  if (label.includes('%') || label.includes('％')) return '%';
  if (sampleValues.length > 0 && sampleValues.every((v) => /^-?\d+(\.\d+)?[%％]$/.test(v.trim()))) {
    return '%';
  }
  return undefined;
}

export function recordsToTable(
  records: Record<string, string>[],
  sourceId: string,
  title?: string,
): { table: TableAsset; confirmations: { field: string; question: string }[] } {
  const headers = Object.keys(records[0] ?? {});
  const columns: TableColumn[] = headers.map((h) => {
    const sample = records.slice(0, 5).map((r) => r[h] ?? '');
    const unit = inferUnit(h, sample);
    return { key: h, label: h, unit, needs_confirmation: unit ? undefined : `columns.${h}.unit` };
  });
  const confirmations = columns
    .slice(1) // 首列是维度键（行名），不问单位
    .filter((c) => !c.unit)
    .map((c) => ({
      field: `columns.${c.label}.unit`,
      question: `列「${c.label}」的单位是什么？（无法从表头判断，不猜测）`,
    }));
  const rows: TableRow[] = records.map((rec, i) => ({
    key: String(rec[headers[0]!] ?? `行${i + 1}`),
    cells: headers.map((h) => {
      const v = rec[h] ?? '';
      return NUMERIC_RE.test(v) ? Number(v.replace(/,/g, '')) : v;
    }),
  }));
  return {
    table: { table_id: `tbl_${sourceId}`, source_id: sourceId, title, columns, rows },
    confirmations,
  };
}
