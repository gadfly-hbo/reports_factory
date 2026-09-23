/* 领域类型:与后端 schema 对齐的最小集(前端只声明用到的字段)。 */

export type StageKey = 'materials' | 'outline' | 'compose' | 'check' | 'export';
export type ProjectStage = 'materials' | 'outline' | 'draft' | 'checked' | 'exported';
export type DeliverableType = 'meeting_deck' | 'research_report' | 'executive_summary';

export const STAGES: { key: StageKey; title: string; n: number }[] = [
  { key: 'materials', title: '材料', n: 1 },
  { key: 'outline', title: '大纲', n: 2 },
  { key: 'compose', title: '组装', n: 3 },
  { key: 'check', title: '检查', n: 4 },
  { key: 'export', title: '导出', n: 5 },
];

export const STAGE_TITLE: Record<StageKey, string> = {
  materials: '材料',
  outline: '大纲',
  compose: '组装',
  check: '检查',
  export: '导出',
};

export const isStageKey = (v: string): v is StageKey =>
  v === 'materials' || v === 'outline' || v === 'compose' || v === 'check' || v === 'export';

export const DELIVERABLE_LABEL: Record<string, string> = {
  meeting_deck: '会议汇报',
  research_report: '研究报告',
  executive_summary: '一页摘要',
};

export const PROJECT_STAGE_LABEL: Record<string, string> = {
  materials: '材料',
  outline: '大纲',
  draft: '草稿',
  checked: '已检查',
  exported: '已导出',
};

export interface Project {
  project_id: string;
  title: string;
  purpose?: string;
  created_at: string;
  updated_at: string;
  privacy_policy: string;
  stage: ProjectStage;
  brand?: BrandConfig;
}

export interface BrandConfig {
  primary: string;
  accent: string;
  muted?: string;
  logo_data_url?: string;
  font_name?: string;
}

export interface SourceAsset {
  source_id: string;
  filename: string;
  kind: string;
  parse_status: 'pending' | 'parsed' | 'failed';
  parse_error?: string;
  has_data?: boolean;
  sensitivity?: string;
  imported_at: string;
}

export interface ConflictValue { source_id: string; value: string | number }
export interface Conflict {
  conflict_id: string;
  row_key: string;
  column_label: string;
  values: ConflictValue[];
  resolution: string;
}

export interface RevisionMeta { revision_id: string; created_at: string; note?: string }
export interface ExportRec { export_id: string; format: string; artifact_path: string; is_draft: boolean }

export interface Claim {
  claim_id: string;
  kind: string;
  text: string;
  verification_state: string;
  evidence_refs?: string[];
}

export interface Metric {
  metric_id: string;
  value: number;
  unit: string;
  display_format?: string;
  scope?: string;
  formula?: string;
}

export interface EvidenceRef { evidence_id: string; source_id: string; locator: string; excerpt: string }

export interface Spec {
  report_id: string;
  brief: { audience: string; purpose: string; page_budget: number; deliverable_type?: string };
  claims: Claim[];
  metrics: Metric[];
  pages: { page_id: string; type: string; headline: string; claim_refs: string[] }[];
  source_snapshot: { source_id: string; version: string; is_demo?: boolean }[];
}

export interface ProjectDetail {
  project: Project;
  sources: SourceAsset[];
  revisions: RevisionMeta[];
  exports: ExportRec[];
  conflicts: Conflict[];
  hasSpec: boolean;
  deliverable_type: string;
  spec: Spec | null;
}

export interface CheckIssue {
  id: string;
  severity: 'blocker' | 'warning';
  page_id?: string;
  object_ref: string;
  message: string;
}
export interface CheckReport { issues: CheckIssue[]; blockers: number; warnings: number }

export interface OpenQuestion { text: string; kind: 'conflict' | 'confirmation' | 'gap'; ref?: string }
export interface PagePlan {
  page_id: string;
  type: string;
  headline: string;
  intent: string;
  claim_refs: string[];
  table_ids: string[];
  gap_notes: string[];
  locked: boolean;
}
export interface OutlineDraft { pages: PagePlan[]; open_questions: OpenQuestion[] }

export interface PrivacyItem { item: string; status: string; detail?: string }
export interface ExportResult {
  allowed: boolean;
  reason: string;
  checks?: CheckReport;
  privacy?: { checked_count: number; not_checked_count: number; items: PrivacyItem[] };
  exports?: ExportRec[];
}

export const KIND_LABEL: Record<string, string> = {
  fact_statement: '事实',
  computed_statement: '计算结果',
  inference: '推断',
  recommendation: '建议',
  user_supplement: '人工补充',
  data_note: '口径',
};

export const VERIF_LABEL: Record<string, string> = {
  unverified: '待核实',
  bound_to_source: '已绑定来源',
  arithmetic_checked: '算术已校验',
  needs_review: '待复核',
  conflict: '存在冲突',
  source_updated: '来源已更新',
};

export const VERIF_CHIP: Record<string, string> = {
  unverified: 'chip-warn',
  needs_review: 'chip-warn',
  conflict: 'chip-fail',
  bound_to_source: 'chip-accent',
  arithmetic_checked: 'chip-ok',
  source_updated: 'chip-warn',
};
