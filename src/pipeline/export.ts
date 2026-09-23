import { createHash } from 'node:crypto';
import type { ReportSpec } from '../schema/report-spec.js';
import type { SourceConflict } from '../schema/assets.js';
import type { ExportRecord } from '../schema/project.js';
import type { WorkspaceStore } from '../storage/workspace.js';
import { runChecks, exportGate, draftExportSpec, type CheckIssue, type CheckReport } from '../checks/engine.js';
import { checkPrivacy, type PrivacyReport } from '../checks/privacy.js';
import { renderReportHtml } from '../render/html.js';
import { renderReportPptx } from '../render/pptx.js';
import { renderReportPdf, closePdfBrowser } from '../render/pdf.js';
import { renderDocumentHtml } from '../render/document-html.js';
import { renderDocumentPdf, closeDocumentPdfBrowser } from '../render/document-pdf.js';
import { renderReportDocx } from '../render/docx.js';
import { deriveExecutiveSummary } from '../compose/summary.js';
import { checkCrossDeliverable } from '../checks/cross-deliverable.js';
import { EditorialStateSchema } from '../schema/editorial.js';
import { runEditorialChecks, affectedPagesForUpdates, isEditorialMode } from '../checks/editorial.js';
import type { ReportBrief } from '../schema/report-spec.js';

/**
 * 导出编排（F10/F11）：检查 → 门禁 → 渲染 → 冻结导出记录。
 * 正式导出前先落修订（快照），草稿导出使用带标识的 spec 变体。
 */

export interface ExportOptions {
  mode: 'formal' | 'draft';
  formats: ('pptx' | 'pdf' | 'html' | 'docx')[];
  conflicts?: SourceConflict[];
  exportScope?: 'internal' | 'external';
  /** 对外分享时图表底层数据的取舍（§12.2 明确选择） */
  chartDataMode?: 'keep_editable' | 'aggregate_only';
  /** 保留可编辑数据的用户显式确认 */
  ackEditableData?: boolean;
  /** 显式确认对外分享（报告默认禁止对外） */
  ackExternalShare?: boolean;
  /** M3：导出一页决策摘要（从主 spec 派生 + 跨交付物一致性校验） */
  deliverable?: 'executive_summary';
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
  // 一页决策摘要：从主 spec 派生（§4.1 独立形态），并与主报告做跨交付物一致性校验
  let specUsedBase = spec;
  if (opts.deliverable === 'executive_summary') {
    specUsedBase = deriveExecutiveSummary(spec);
  }
  let checks = runChecks(specUsedBase, {
    conflicts: opts.conflicts ?? [],
    exportScope: scope,
    ackExternalShare: opts.ackExternalShare,
  });
  if (opts.deliverable === 'executive_summary') {
    const cross = checkCrossDeliverable(spec, specUsedBase);
    checks = {
      issues: [...checks.issues, ...cross.issues],
      blockers: checks.blockers + cross.blockers,
      warnings: checks.warnings + cross.warnings,
    };
  }

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
        severity: 'blocker' as const,
        category: 'policy' as const,
        object_ref: i.item,
        message: i.detail ?? i.item,
      }));
    checks = {
      issues: [...checks.issues, ...privacyIssues],
      blockers: checks.blockers + privacyIssues.length,
      warnings: checks.warnings,
    };
  }

  // M4 G1 编审门（T07）：编审模式（isEditorialMode 单一口径）下未过 G1 的报告不能冒充正式稿；
  // 草稿仍可导出（带标识）——因此用 content 级（policy 级会连草稿一起阻断）
  const editorialRaw = await store.readEditorial(projectId);
  const editorialActive = isEditorialMode(editorialRaw as Parameters<typeof isEditorialMode>[0]);
  if (editorialActive) {
    const ed = EditorialStateSchema.parse(editorialRaw);
    const status = ed.status ?? 'organizing';
    if (opts.mode === 'formal' && status !== 'g1_approved' && status !== 'draft_editing' && status !== 'published') {
      const g1Issue: CheckIssue = {
        id: 'editorial_g1_not_approved',
        severity: 'blocker',
        category: 'content',
        object_ref: 'editorial.g1',
        message: 'G1 编审未批准：主线与逐页蓝图尚未人工确认，仅可导出带【草稿】标识的预览（T07）',
      };
      checks = { issues: [...checks.issues, g1Issue], blockers: checks.blockers + 1, warnings: checks.warnings };
    }
  }

  // M4 待复核阻断（T11）：新版本证据触及报告引用的发现时，正式发布阻断直到用户复核；
  // 锁定页同样被标记（锁 ≠ 掩盖错误）；草稿带标识仍可导（content 级）
  if (editorialActive) {
    const updates = (await store.readPendingUpdates(projectId)) as Parameters<typeof affectedPagesForUpdates>[1];
    const hitPages = affectedPagesForUpdates(specUsedBase, updates);
    if (hitPages.length > 0 && opts.mode === 'formal') {
      const issue: CheckIssue = {
        id: 'editorial_pending_review',
        severity: 'blocker',
        category: 'content',
        object_ref: hitPages.join(','),
        message: `新版本证据影响已确认内容，标记待复核（复核后放行）：${hitPages.join('、')}（T11，锁定不掩盖错误）`,
      };
      checks = { issues: [...checks.issues, issue], blockers: checks.blockers + 1, warnings: checks.warnings };
    }
  }

  // M4 编审检查（F08）：必要限制保留（T13）/ 因果措辞（T12）/ 重点覆盖 / 批准范围漂移（§12.3）
  {
    const ed = editorialRaw ? EditorialStateSchema.parse(editorialRaw) : undefined;
    const decisions = ed?.decisions?.[`report_${projectId}`] ?? [];
    const editorialIssues = runEditorialChecks(specUsedBase, {
      brief: ed?.brief as ReportBrief | undefined,
      decisions,
      approval: ed?.approval,
    });
    if (editorialIssues.length > 0) {
      checks = {
        issues: [...checks.issues, ...editorialIssues],
        blockers: checks.blockers + editorialIssues.filter((i) => i.severity === 'blocker').length,
        warnings: checks.warnings + editorialIssues.filter((i) => i.severity === 'warning').length,
      };
    }
  }

  const gate = exportGate(checks, { mode: opts.mode });
  if (!gate.allowed) {
    return { gate, checks, revisionId: '', exports: [], specUsed: specUsedBase, privacy };
  }

  const specUsed = opts.mode === 'draft' ? draftExportSpec(specUsedBase, checks) : specUsedBase;
  const revision = await store.saveRevision(projectId, specUsed, opts.mode === 'draft' ? '草稿导出' : '正式导出');

  const exports: ExportRecord[] = [];
  for (const format of opts.formats) {
    let artifact: Buffer | string;
    const isDocument = specUsed.brief.deliverable_type === 'research_report';
    if (format === 'pptx')
      artifact = await renderReportPptx(specUsed, {
        chartDataMode: scope === 'external' ? (opts.chartDataMode ?? 'keep_editable') : 'keep_editable',
      });
    else if (format === 'docx') artifact = await renderReportDocx(specUsed);
    else if (format === 'pdf') artifact = isDocument ? await renderDocumentPdf(specUsed) : await renderReportPdf(specUsed);
    else artifact = isDocument ? renderDocumentHtml(specUsed) : renderReportHtml(specUsed);
    const record = await store.saveExport(projectId, {
      revision_id: revision.revision_id,
      format,
      artifact: Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact),
      checks: { blockers: checks.blockers, warnings: checks.warnings, issues: checks.issues },
      is_draft: opts.mode === 'draft',
      export_scope: scope,
      chart_data_mode: scope === 'external' ? (opts.chartDataMode ?? 'keep_editable') : undefined,
      privacy_report: privacy,
      delivery_status: opts.mode === 'draft' ? 'draft' : 'formal',
    });
    exports.push(record);
  }
  await closePdfBrowser();
  await closeDocumentPdfBrowser();

  // 正式导出成功 = G2 发布确认（S4 简化机：G2 并入正式导出）→ published；
  // 旧正式交付标 superseded（T24，文件不动）；G2 记录绑定检查指纹（G14/T22）
  if (editorialActive && opts.mode === 'formal') {
    const ed = EditorialStateSchema.parse(editorialRaw);
    const fingerprint = createHash('sha256').update(JSON.stringify(checks.issues)).digest('hex');
    await store.markFormalExportsSuperseded(projectId, exports.map((e) => e.export_id));
    await store.writeEditorial(projectId, {
      ...ed,
      status: 'published',
      approval: ed.approval ? { ...ed.approval, revision_ids: [...new Set([...ed.approval.revision_ids, revision.revision_id])] } : undefined,
      g2: { revision_id: revision.revision_id, export_id: exports[0]?.export_id ?? '', checks_fingerprint: fingerprint, confirmed_at: new Date().toISOString() },
    });
  }
  return { gate, checks, revisionId: revision.revision_id, exports, specUsed, privacy };
}
