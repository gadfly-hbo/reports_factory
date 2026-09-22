import type { ReportSpec } from '../schema/report-spec.js';
import type { SourceConflict } from '../schema/assets.js';
import type { ExportRecord } from '../schema/project.js';
import type { WorkspaceStore } from '../storage/workspace.js';
import { runChecks, exportGate, draftExportSpec, type CheckIssue, type CheckReport } from '../checks/engine.js';
import { checkPrivacy, type PrivacyReport } from '../checks/privacy.js';
import { renderReportHtml } from '../render/html.js';
import { renderReportPptx } from '../render/pptx.js';
import { renderReportPdf, closePdfBrowser } from '../render/pdf.js';

/**
 * 导出编排（F10/F11）：检查 → 门禁 → 渲染 → 冻结导出记录。
 * 正式导出前先落修订（快照），草稿导出使用带标识的 spec 变体。
 */

export interface ExportOptions {
  mode: 'formal' | 'draft';
  formats: ('pptx' | 'pdf' | 'html')[];
  conflicts?: SourceConflict[];
  exportScope?: 'internal' | 'external';
  /** 对外分享时图表底层数据的取舍（§12.2 明确选择） */
  chartDataMode?: 'keep_editable' | 'aggregate_only';
  /** 保留可编辑数据的用户显式确认 */
  ackEditableData?: boolean;
  /** 显式确认对外分享（报告默认禁止对外） */
  ackExternalShare?: boolean;
}

export interface ExportOutcome {
  gate: { allowed: boolean; reason: string };
  checks: CheckReport;
  revisionId: string;
  exports: ExportRecord[];
  specUsed: ReportSpec;
  privacy: PrivacyReport | null;
}

export async function exportReport(
  store: WorkspaceStore,
  projectId: string,
  spec: ReportSpec,
  opts: ExportOptions,
): Promise<ExportOutcome> {
  const scope = opts.exportScope ?? 'internal';
  let checks = runChecks(spec, {
    conflicts: opts.conflicts ?? [],
    exportScope: scope,
    ackExternalShare: opts.ackExternalShare,
  });

  // 对外导出的隐私检查（§12.2 对外导出行）：flag 项并入阻断
  let privacy: PrivacyReport | null = null;
  if (scope === 'external') {
    const sources = await store.listSourceAssets(projectId);
    privacy = checkPrivacy(spec, {
      sources,
      chartDataMode: opts.chartDataMode ?? 'keep_editable',
      ackEditableData: opts.ackEditableData ?? false,
    });
    const privacyIssues: CheckIssue[] = privacy.items
      .filter((i) => i.status === 'flag')
      .map((i) => ({
        id: `privacy_${i.item}`,
        severity: 'blocker',
        object_ref: i.item,
        message: i.detail ?? i.item,
      }));
    checks = {
      issues: [...checks.issues, ...privacyIssues],
      blockers: checks.blockers + privacyIssues.length,
      warnings: checks.warnings,
    };
  }

  const gate = exportGate(checks, { mode: opts.mode });
  if (!gate.allowed) {
    return { gate, checks, revisionId: '', exports: [], specUsed: spec, privacy };
  }

  const specUsed = opts.mode === 'draft' ? draftExportSpec(spec, checks) : spec;
  const revision = await store.saveRevision(projectId, specUsed, opts.mode === 'draft' ? '草稿导出' : '正式导出');

  const exports: ExportRecord[] = [];
  for (const format of opts.formats) {
    let artifact: Buffer | string;
    if (format === 'pptx')
      artifact = await renderReportPptx(specUsed, {
        chartDataMode: scope === 'external' ? (opts.chartDataMode ?? 'keep_editable') : 'keep_editable',
      });
    else if (format === 'pdf') artifact = await renderReportPdf(specUsed);
    else artifact = renderReportHtml(specUsed);
    const record = await store.saveExport(projectId, {
      revision_id: revision.revision_id,
      format,
      artifact: Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact),
      checks: { blockers: checks.blockers, warnings: checks.warnings, issues: checks.issues },
      is_draft: opts.mode === 'draft',
      export_scope: scope,
      chart_data_mode: scope === 'external' ? (opts.chartDataMode ?? 'keep_editable') : undefined,
      privacy_report: privacy,
    });
    exports.push(record);
  }
  await closePdfBrowser();
  return { gate, checks, revisionId: revision.revision_id, exports, specUsed, privacy };
}
