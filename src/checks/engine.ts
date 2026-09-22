import type { Claim, ReportSpec } from '../schema/report-spec.js';
import type { SourceConflict } from '../schema/assets.js';
import { recomputeMetric, valueMatches } from './compute.js';

/**
 * 质量检查引擎 v1（G13 / proposal §10.2–10.3）。
 * 阻断项未清零不得生成正式定稿；草稿可导出但必须明确标识。
 */

export type Severity = 'blocker' | 'warning';

export interface CheckIssue {
  id: string;
  severity: Severity;
  page_id?: string;
  object_ref: string;
  message: string;
}

export interface CheckContext {
  conflicts: SourceConflict[];
  /** 导出范围（对外导出时检查外发策略） */
  exportScope?: 'internal' | 'external';
}

export interface CheckReport {
  issues: CheckIssue[];
  blockers: number;
  warnings: number;
}

/** 表头括号里的单位 → 归一指标名（销售额（元）/销售额（万元） 同名） */
function normalizeColumnLabel(label: string): { name: string; unit?: string } {
  const m = label.match(/^(.+?)[（(](.+?)[)）]$/);
  if (m) return { name: m[1]!.trim(), unit: m[2]!.trim() };
  return { name: label.trim() };
}

const CURRENCY_UNITS = new Set(['元', '万元', '千元', '百元', '亿元']);

/** 文本中"变化幅度"表述：(方向, 数字, 单位) */
function extractChangeStatements(text: string): { dir: string; num: number; unit: 'pp' | 'pct' }[] {
  const out: { dir: string; num: number; unit: 'pp' | 'pct' }[] = [];
  const re = /(上升|下降|增长|减少|提高|降低)[^\d%.]{0,6}(\d+(?:\.\d+)?)\s*(个百分点|百分点|％|%)/g;
  for (const m of text.matchAll(re)) {
    const unit = m[3]!.startsWith('个') || m[3] === '百分点' ? 'pp' : 'pct';
    out.push({ dir: m[1]!, num: Number(m[2]!), unit });
  }
  return out;
}

export function runChecks(spec: ReportSpec, ctx: CheckContext): CheckReport {
  const issues: CheckIssue[] = [];
  const claimById = new Map(spec.claims.map((c) => [c.claim_id, c]));
  const metricById = new Map(spec.metrics.map((m) => [m.metric_id, m]));

  // 1) 指标复算（§10.2）
  for (const m of spec.metrics) {
    if (!m.formula) continue;
    const r = recomputeMetric(m);
    if (!r.ok) {
      if (r.reason === 'unsupported') {
        issues.push({
          id: 'metric_formula_unsupported', severity: 'warning',
          object_ref: m.metric_id,
          message: `指标 ${m.metric_id} 的公式「${m.formula}」不在可复算清单内，无法自动校验`,
        });
      }
      continue;
    }
    if (!valueMatches(m.value, r.value!)) {
      issues.push({
        id: 'metric_recompute_failed', severity: 'blocker',
        object_ref: m.metric_id,
        message: `指标 ${m.metric_id} 声称值 ${m.value} 与公式复算 ${r.value!.toFixed(4)} 矛盾`,
      });
    }
  }

  // 2) 百分比 vs 百分点（§13.2）
  for (const page of spec.pages) {
    const texts: string[] = [
      ...(page.body ? [page.body] : []),
      ...(page.bullets?.map((b) => b.text) ?? []),
    ];
    const claims: Claim[] = page.claim_refs.map((id) => claimById.get(id)!).filter(Boolean);
    const textToClaims = new Map<string, Claim>();
    for (const c of claims) if (c.text) textToClaims.set(c.text, c);
    for (const text of texts) {
      const claim = textToClaims.get(text);
      const metricIds = claim?.metric_refs?.length ? claim.metric_refs : page.metric_refs;
      for (const mid of metricIds) {
        const metric = metricById.get(mid);
        if (!metric?.inputs || !metric.formula?.includes('/')) continue;
        const prev = metric.inputs['previous'];
        const cur = metric.inputs['current'];
        if (typeof prev !== 'number' || typeof cur !== 'number') continue;
        const ppChange = Math.abs((cur - prev) * 100);
        const relChange = Math.abs(((cur - prev) / prev) * 100);
        for (const st of extractChangeStatements(text)) {
          const expected = st.unit === 'pp' ? ppChange : relChange;
          if (Math.abs(st.num - expected) > 0.05 + expected * 0.002) {
            issues.push({
              id: 'percent_unit_misuse', severity: 'blocker',
              page_id: page.page_id,
              object_ref: `${page.page_id}#${mid}`,
              message: `「${text}」中"${st.dir}${st.num}${st.unit === 'pp' ? '个百分点' : '%'}"与指标 ${mid} 不符：百分点变化应为 ${ppChange.toFixed(1)}，相对变化应为 ${relChange.toFixed(1)}%`,
            });
          }
        }
      }
    }
  }

  // 3) 单位矛盾：同名列跨页使用互斥货币单位（§13.2 元/万元）
  const unitByName = new Map<string, { unit: string; page_id: string }[]>();
  for (const page of spec.pages) {
    for (const col of page.table?.columns ?? []) {
      const { name, unit } = normalizeColumnLabel(col.label);
      if (!unit || !CURRENCY_UNITS.has(unit)) continue;
      const list = unitByName.get(name) ?? [];
      list.push({ unit, page_id: page.page_id });
      unitByName.set(name, list);
    }
  }
  for (const [name, list] of unitByName) {
    const distinct = new Set(list.map((x) => x.unit));
    if (distinct.size > 1) {
      issues.push({
        id: 'unit_contradiction', severity: 'blocker',
        object_ref: [...distinct].join('/'),
        message: `指标「${name}」在不同页面使用了互斥单位：${[...distinct].join(' 与 ')}（${list.map((x) => x.page_id).join(', ')}）`,
      });
    }
  }

  // 4) 材料冲突未解决（§10.2 材料冲突行）
  for (const c of ctx.conflicts) {
    if (c.resolution === 'unresolved') {
      issues.push({
        id: 'source_conflict_unresolved', severity: 'blocker',
        object_ref: c.conflict_id,
        message: `材料冲突未解决：${c.row_key}「${c.column_label}」存在 ${c.values.map((v) => v.value).join(' vs ')}，未确认采用口径前不得正式导出`,
      });
    }
  }

  // 5) 外部分享策略（F12 对外导出行）；未声明策略默认禁止对外（proposal §12.3）
  if (ctx.exportScope === 'external' && spec.export_policy?.external_share_allowed !== true) {
    issues.push({
      id: 'external_share_violation', severity: 'blocker',
      object_ref: 'export_policy',
      message: '报告导出策略禁止对外分享（external_share_allowed=false）',
    });
  }

  // 警告区 ---------------------------------------------------------------

  // 6) 关键陈述缺证据绑定（F09）
  for (const c of spec.claims) {
    if ((c.evidence_refs?.length ?? 0) === 0 && c.kind !== 'user_supplement') {
      issues.push({
        id: 'claim_missing_evidence', severity: 'warning',
        object_ref: c.claim_id,
        message: `陈述「${c.text.slice(0, 24)}…」缺少证据绑定`,
      });
    }
  }

  // 7) 来源待核实
  for (const c of spec.claims) {
    if (c.verification_state === 'unverified' || c.verification_state === 'needs_review') {
      issues.push({
        id: 'claim_unverified', severity: 'warning',
        object_ref: c.claim_id,
        message: `陈述「${c.text.slice(0, 24)}…」为${c.verification_state === 'unverified' ? '未核实' : '待复核'}状态`,
      });
    }
  }

  // 8) 页面密度（§10.3 警告：页面较密）
  for (const page of spec.pages) {
    const density = (page.bullets?.length ?? 0) + (page.body ? 1 : 0);
    if (density > 6) {
      issues.push({
        id: 'page_too_dense', severity: 'warning',
        page_id: page.page_id,
        object_ref: page.page_id,
        message: `页面 ${page.page_id} 内容较密（${density} 项），建议拆页或精简`,
      });
    }
  }

  return {
    issues,
    blockers: issues.filter((i) => i.severity === 'blocker').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
  };
}

export interface ExportGateInput {
  mode: 'formal' | 'draft';
}

export interface ExportGateDecision {
  allowed: boolean;
  reason: string;
}

/** 发布门禁（§10.3）：阻断未清零禁止正式定稿；草稿允许但需标识 */
export function exportGate(report: CheckReport, input: ExportGateInput): ExportGateDecision {
  if (input.mode === 'draft') return { allowed: true, reason: '草稿导出（带未解决问题标识）' };
  if (report.blockers > 0) {
    return {
      allowed: false,
      reason: `存在 ${report.blockers} 个未解决阻断项，修复前不得生成正式定稿（可导出草稿）`,
    };
  }
  return { allowed: true, reason: '检查通过' };
}

/** 草稿导出的 spec 变体：封面明确标识草稿与未解决问题（§10.3 草稿导出行） */
export function draftExportSpec(spec: ReportSpec, report: CheckReport): ReportSpec {
  const s = structuredClone(spec);
  const unresolved = report.issues.filter((i) => i.severity === 'blocker');
  const cover = s.pages[0]!;
  cover.subtitle = `【草稿】${cover.subtitle ?? ''}`.trim();
  cover.required_note = `草稿：仍有 ${unresolved.length} 项阻断、${report.warnings} 项警告未解决，不可用于正式会议`;
  return s;
}
