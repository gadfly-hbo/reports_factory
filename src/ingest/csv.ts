import { parse } from 'csv-parse/sync';
import { emptyIngestResult, type IngestResult } from '../schema/assets.js';
import { recordsToTable } from './table-core.js';

/**
 * CSV 解析（列口径登记与数值保留逻辑在 table-core.ts，与 XLSX 共用）。
 */

export function ingestCsv(text: string, sourceId: string): IngestResult {
  try {
    const records: Record<string, string>[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    if (records.length === 0) throw new Error('表格为空');
    const { table, confirmations } = recordsToTable(records, sourceId);
    return emptyIngestResult(sourceId, { tables: [table], confirmations });
  } catch (e) {
    return emptyIngestResult(sourceId, {
      ok: false,
      failure_reason: `CSV 解析失败：${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
