import type { Metric, ReportSpec } from '../schema/report-spec.js';
import type { CheckIssue, CheckReport } from './engine.js';

/** 指标展示值（value × display_format）：ratio → 百分比；其余原样 */
function formatMetricValue(m: Metric): string {
  if (m.unit === 'ratio' && (m.display_format ?? '').includes('%')) {
    const decimals = (m.display_format!.match(/\.(0+)/)?.[1] ?? '').length;
    return `${(m.value * 100).toFixed(decimals)}%`;
  }
  return String(m.value);
}

/**
 * 跨交付物一致性（§4.1：不能在不同文件中分别生成互相矛盾的数字）。
 * 共享 metric_id 的指标在两个交付物中 value/unit/scope 必须一致，否则阻断。
 */
export function checkCrossDeliverable(a: ReportSpec, b: ReportSpec): CheckReport {
  const issues: CheckIssue[] = [];
  const aMetrics = new Map(a.metrics.map((m) => [m.metric_id, m]));
  for (const mb of b.metrics) {
    const ma = aMetrics.get(mb.metric_id);
    if (!ma) continue;
    for (const field of ['value', 'unit', 'scope'] as const) {
      if (String(ma[field]) !== String(mb[field])) {
        issues.push({
          id: 'cross_deliverable_metric_mismatch',
          severity: 'blocker',
          category: 'content',
          object_ref: mb.metric_id,
          message: `指标 ${mb.metric_id} 的 ${field} 在两个交付物中不一致：${String(ma[field])} vs ${String(mb[field])}（§4.1 不同文件不得出现矛盾数字）`,
        });
      }
    }
    // display：读者看到的展示值也必须一致（M3-G6）
    if (formatMetricValue(ma) !== formatMetricValue(mb)) {
      issues.push({
        id: 'cross_deliverable_metric_mismatch',
        severity: 'blocker',
        category: 'content',
        object_ref: mb.metric_id,
        message: `指标 ${mb.metric_id} 的展示值在两个交付物中不一致：${formatMetricValue(ma)} vs ${formatMetricValue(mb)}（§4.1）`,
      });
    }
  }
  return {
    issues,
    blockers: issues.filter((i) => i.severity === 'blocker').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
  };
}
