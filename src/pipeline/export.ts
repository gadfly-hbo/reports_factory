import type { ReportSpec } from '../schema/report-spec.js';
import type { SourceConflict } from '../schema/assets.js';
import type { ExportRecord } from '../schema/project.js';
import type { WorkspaceStore } from '../storage/workspace.js';
import { runChecks, exportGate, draftExportSpec, type CheckReport } from '../checks/engine.js';
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
}

export interface ExportOutcome {
  gate: { allowed: boolean; reason: string };
  checks: CheckReport;
  revisionId: string;
  exports: ExportRecord[];
  specUsed: ReportSpec;
}

export async function exportReport(
  store: WorkspaceStore,
  projectId: string,
  spec: ReportSpec,
  opts: ExportOptions,
): Promise<ExportOutcome> {
  const checks = runChecks(spec, {
    conflicts: opts.conflicts ?? [],
    exportScope: opts.exportScope ?? 'internal',
  });
  const gate = exportGate(spec, checks, { mode: opts.mode });
  if (!gate.allowed) {
    return { gate, checks, revisionId: '', exports: [], specUsed: spec };
  }

  const specUsed = opts.mode === 'draft' ? draftExportSpec(spec, checks) : spec;
  const revision = await store.saveRevision(projectId, specUsed, opts.mode === 'draft' ? '草稿导出' : '正式导出');

  const exports: ExportRecord[] = [];
  for (const format of opts.formats) {
    let artifact: Buffer | string;
    if (format === 'pptx') artifact = await renderReportPptx(specUsed);
    else if (format === 'pdf') artifact = await renderReportPdf(specUsed);
    else artifact = renderReportHtml(specUsed);
    const record = await store.saveExport(projectId, {
      revision_id: revision.revision_id,
      format,
      artifact: Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact),
      checks: { blockers: checks.blockers, warnings: checks.warnings, issues: checks.issues },
      is_draft: opts.mode === 'draft',
    });
    exports.push(record);
  }
  await closePdfBrowser();
  return { gate, checks, revisionId: revision.revision_id, exports, specUsed };
}
