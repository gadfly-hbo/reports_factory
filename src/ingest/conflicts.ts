import type { SourceConflict, TableAsset } from '../schema/assets.js';

/**
 * 同口径冲突检测（proposal §10.2 材料冲突行）：
 * 不同来源的表格中，同一行键 + 同一列标签出现不同数值 → 记录冲突，
 * 不静默择一；解决状态默认 unresolved，由用户确认处理。
 */
export function detectConflicts(tables: TableAsset[]): SourceConflict[] {
  const cellIndex = new Map<string, { source_id: string; value: number }[]>();
  for (const table of tables) {
    for (const row of table.rows) {
      table.columns.forEach((col, colIdx) => {
        const cell = row.cells[colIdx];
        if (typeof cell !== 'number') return;
        const key = `${row.key}\u0000${col.label}`;
        const list = cellIndex.get(key) ?? [];
        list.push({ source_id: table.source_id, value: cell });
        cellIndex.set(key, list);
      });
    }
  }

  const conflicts: SourceConflict[] = [];
  let n = 0;
  for (const [key, entries] of cellIndex) {
    const distinct = new Set(entries.map((e) => e.value));
    if (distinct.size > 1) {
      n += 1;
      const [rowKey, colLabel] = key.split('\u0000');
      conflicts.push({
        conflict_id: `conflict_${n}`,
        row_key: rowKey!,
        column_label: colLabel!,
        values: entries,
        resolution: 'unresolved',
      });
    }
  }
  return conflicts;
}
