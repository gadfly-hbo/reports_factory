/* 领域类型:与后端 schema 对齐的最小集(前端只声明用到的字段)。M10 六步。 */

/** 六步主流程（proposal D2，顺序不可变）：解锁规则由后端 steps 推导下发 */
export type StageKey = 'upload' | 'understand' | 'framework' | 'generate' | 'page-edit' | 'publish';

export const STAGES: { key: StageKey; title: string; n: number }[] = [
  { key: 'upload', title: '上传资料', n: 1 },
  { key: 'understand', title: '读取理解', n: 2 },
  { key: 'framework', title: '确认框架', n: 3 },
  { key: 'generate', title: '生成', n: 4 },
  { key: 'page-edit', title: '逐页编辑', n: 5 },
  { key: 'publish', title: '审核发布', n: 6 },
];

export const STAGE_TITLE: Record<StageKey, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.title]),
) as Record<StageKey, string>;

export const isStageKey = (v: string): v is StageKey => STAGES.some((s) => s.key === v);

export interface Project {
  project_id: string;
  kind?: 'ppt';
  title: string;
  purpose?: string;
  created_at: string;
  updated_at: string;
  privacy_policy: string;
  brand?: BrandConfig;
  template_id: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  page_plan: string[];
  brand?: { primary: string; accent: string };
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

export interface ExportRec {
  export_id: string;
  format: string;
  artifact_path: string;
  is_draft: boolean;
  export_scope?: 'internal' | 'external';
  created_at?: string;
  delivery_status?: 'draft' | 'formal' | 'superseded';
}

export interface StepState { key: StageKey; unlocked: boolean }

export interface FrameworkPage { page_id: string; title: string; page_type: string; intent?: string; source_hint?: string[] }

export interface ProjectDetail {
  project: Project;
  sources: SourceAsset[];
  exports: ExportRec[];
  steps: StepState[];
  capabilities?: {
    ai: { enabled: boolean; needsApproval: boolean; modelAvailable: boolean; approvedModes: string[] };
  };
  /** S3 理解摘要（source_id → 摘要） */
  understanding?: Record<string, { points: { text: string; topic_tag: string; kind: string; value?: number; unit?: string; locator?: string }[]; uncovered: boolean; gist: string }>;
  /** S4 框架（确认后不可变） */
  framework?: { pages: FrameworkPage[] } | null;
  framework_confirmed?: boolean;
  /** S7 发布门审批态（含失效判定） */
  approval_state?: { approved_at?: string; revoked?: boolean; reason?: string };
  /** S5 页内容与逐页 checkpoint */
  pages?: Record<string, PageDraftT>;
  page_states?: Record<string, 'pending' | 'running' | 'done' | 'failed'>;
  generation?: { status: 'running' | 'done' | 'failed'; stale_at?: string; note?: string } | null;
}

export interface PageDraftT {
  headline: string;
  bullets: { text: string; source_hint?: string }[];
  body?: string;
  chart?: { title: string; type: string; categories: string[]; series: { name: string; values: number[] }[] };
  table_note?: string;
  uncovered: boolean;
}

/** 发布状态徽（ui-contract S0.3；S7 接真实语义） */
export type PublishState = '未发布' | '内用草稿' | '已外发';
export function publishStateOf(d: ProjectDetail | null): PublishState {
  if (!d) return '未发布';
  const formal = d.exports.some((e) => e.export_scope === 'external' || e.delivery_status === 'formal');
  if (formal) return '已外发';
  return d.exports.length > 0 ? '内用草稿' : '未发布';
}
