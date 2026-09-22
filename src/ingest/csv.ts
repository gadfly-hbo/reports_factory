import { parse } from 'csv-parse/sync';
import { IngestResultSchema, type IngestResult, type TableColumn, type TableRow } from '../schema/assets.js';

/**
 * CSV 解析：列口径登记 + 数值保留。单位从表头括号或 % 推断；
 * 推断不出的生成待确认问题（不猜测）。数值单元格去千分位转数字，
 * 其余保留原文。
 */

const NUMERIC_RE = /^-?[\d,]+(\.\d+)?$/;

function inferUnit(label: string, sampleValues: string[] = []): string | undefined {
  const paren = label.match(/[（(](.+?)[)）]/);
  if (paren) return paren[1];
  if (label.includes('%') || label.includes('％')) return '%';
  // 表头无线索时看数据样本：全部为百分比样式 → 单位为 %
  if (sampleValues.length > 0 && sampleValues.every((v) => /^-?\d+(\.\d+)?[%％]$/.test(v.trim()))) {
    return '%';
  }
  return undefined;
}

export function ingestCsv(text: string, sourceId: string): IngestResult {
  try {
    const records: Record<string, string>[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    if (records.length === 0) throw new Error('表格为空');
    const headers = Object.keys(records[0]!);

    const columns: TableColumn[] = [];
    for (const h of headers) {
      const sample = records.slice(0, 5).map((r) => r[h] ?? '');
      const unit = inferUnit(h, sample);
      columns.push({
        key: h,
        label: h,
        unit,
        needs_confirmation: unit ? undefined : `columns.${h}.unit`,
      });
    }

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

    return IngestResultSchema.parse({
      source_id: sourceId,
      ok: true,
      claims: [],
      evidence: [],
      tables: [
        {
          table_id: `tbl_${sourceId}`,
          source_id: sourceId,
          title: undefined,
          columns,
          rows,
        },
      ],
      notes: [],
      conflicts: [],
      confirmations,
    });
  } catch (e) {
    return IngestResultSchema.parse({
      source_id: sourceId,
      ok: false,
      failure_reason: `CSV 解析失败：${e instanceof Error ? e.message : String(e)}`,
      claims: [],
      evidence: [],
      tables: [],
      notes: [],
      conflicts: [],
      confirmations: [],
    });
  }
}
