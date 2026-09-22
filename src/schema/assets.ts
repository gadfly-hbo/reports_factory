import { z } from 'zod';

/** 导入层资产（proposal §9.1 EvidenceRef + 表格材料的结构化形态）。 */

export const EvidenceRefSchema = z.object({
  evidence_id: z.string().min(1),
  source_id: z.string().min(1),
  source_version: z.string().min(1),
  /** 定位：标题路径 + 段内序号（M1 不要求向量库/图谱） */
  locator: z.string().min(1),
  excerpt: z.string(),
});

export const TableColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
  period: z.string().optional(),
  /** 无法从表头推断的口径，生成待确认问题 */
  needs_confirmation: z.string().optional(),
});

export const TableRowSchema = z.object({
  key: z.string().min(1),
  cells: z.array(z.union([z.string(), z.number(), z.null()])),
});

export const TableAssetSchema = z.object({
  table_id: z.string().min(1),
  source_id: z.string().min(1),
  title: z.string().optional(),
  columns: z.array(TableColumnSchema).min(1),
  rows: z.array(TableRowSchema),
});

export const SourceConflictSchema = z.object({
  conflict_id: z.string().min(1),
  /** 同一行 + 同一列（同口径）在不同来源中的数值矛盾 */
  row_key: z.string(),
  column_label: z.string(),
  values: z.array(
    z.object({
      source_id: z.string(),
      value: z.union([z.string(), z.number()]),
    }),
  ),
  resolution: z.enum(['unresolved', 'source_a', 'source_b', 'manual_value']).default('unresolved'),
});

export const IngestResultSchema = z.object({
  source_id: z.string().min(1),
  ok: z.boolean(),
  failure_reason: z.string().optional(),
  claims: z.array(z.unknown()).default([]),
  evidence: z.array(EvidenceRefSchema).default([]),
  tables: z.array(TableAssetSchema).default([]),
  notes: z.array(z.string()).default([]),
  conflicts: z.array(SourceConflictSchema).default([]),
  confirmations: z
    .array(z.object({ field: z.string(), question: z.string() }))
    .default([]),
  /** XLSX 未选表时返回工作表清单（§4.2 显式选表） */
  available_sheets: z.array(z.string()).optional(),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type TableColumn = z.infer<typeof TableColumnSchema>;
export type TableRow = z.infer<typeof TableRowSchema>;
export type TableAsset = z.infer<typeof TableAssetSchema>;
export type SourceConflict = z.infer<typeof SourceConflictSchema>;
export type IngestResult = z.infer<typeof IngestResultSchema>;

/** 空导入结果的单一构造点（此前在 csv/persist/markdown 三处拼写字面量五次） */
export function emptyIngestResult(sourceId: string, overrides: Partial<IngestResult> = {}): IngestResult {
  return IngestResultSchema.parse({
    source_id: sourceId,
    ok: true,
    claims: [],
    evidence: [],
    tables: [],
    notes: [],
    conflicts: [],
    confirmations: [],
    ...overrides,
  });
}
