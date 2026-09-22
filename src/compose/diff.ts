import type { ReportSpec } from '../schema/report-spec.js';

/**
 * 版本比较（§5.3 差异显示）：两个 ReportSpec 的结构化 diff。
 * 纯函数、确定性：同一对输入永远同一输出。
 * 对齐策略（M2-G1）：页按 page_id 精确匹配；同 id 逐字段比对。
 */

export interface FieldChange {
  field: string;
  /** 表格单元格的定位（如"销售额（万元）/6月"） */
  locator?: string;
  before?: string;
  after?: string;
}

export interface PageChange {
  page_id: string;
  changes: FieldChange[];
}

export interface SpecDiff {
  pages_added: string[];
  pages_removed: string[];
  pages_reordered: string[];
  pages_changed: PageChange[];
  metrics_changed: { metric_id: string; field: string; before?: string; after?: string }[];
  claims_changed: { claim_id: string; field: string; before?: string; after?: string }[];
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export function diffSpecs(a: ReportSpec, b: ReportSpec): SpecDiff {
  const aIds = a.pages.map((p) => p.page_id);
  const bIds = b.pages.map((p) => p.page_id);
  const aSet = new Set(aIds);
  const bSet = new Set(bIds);

  const pages_added = bIds.filter((id) => !aSet.has(id));
  const pages_removed = aIds.filter((id) => !bSet.has(id));
  const pages_reordered = aIds.filter((id) => bSet.has(id) && aIds.indexOf(id) !== bIds.indexOf(id));

  const pages_changed: PageChange[] = [];
  for (const id of aIds) {
    const pa = a.pages.find((p) => p.page_id === id)!;
    const pb = b.pages.find((p) => p.page_id === id);
    if (!pb) continue;
    const changes: FieldChange[] = [];
    for (const field of ['headline', 'subtitle', 'body', 'required_note', 'layout_id'] as const) {
      if (str(pa[field]) !== str(pb[field])) {
        changes.push({ field, before: str(pa[field]), after: str(pb[field]) });
      }
    }
    if (str(pa.locked) !== str(pb.locked)) {
      changes.push({ field: 'locked', before: str(pa.locked), after: str(pb.locked) });
    }
    // 要点：按序配对
    const ba = pa.bullets ?? [];
    const bb = pb.bullets ?? [];
    if (ba.length !== bb.length) {
      changes.push({ field: 'bullets', before: `${ba.length} 条`, after: `${bb.length} 条` });
    }
    const n = Math.min(ba.length, bb.length);
    for (let i = 0; i < n; i++) {
      if (ba[i]!.text !== bb[i]!.text || ba[i]!.status !== bb[i]!.status) {
        changes.push({
          field: 'bullets',
          locator: ba[i]!.label ? `${ba[i]!.label}#${i + 1}` : `#${i + 1}`,
          before: `${ba[i]!.text}${ba[i]!.status ? `（${ba[i]!.status}）` : ''}`,
          after: `${bb[i]!.text}${bb[i]!.status ? `（${bb[i]!.status}）` : ''}`,
        });
      }
    }
    // 表格：行按 key 配对、单元格按列位
    if (pa.table && pb.table) {
      const rowMap = new Map(pb.table.rows.map((r) => [r.key, r]));
      pa.table.rows.forEach((ra, i) => {
        const rb = rowMap.get(ra.key);
        if (!rb) {
          changes.push({ field: 'table', locator: `行「${ra.key}」`, before: '存在', after: '删除' });
          return;
        }
        ra.cells.forEach((cell, j) => {
          const cellB = rb.cells[j];
          if (cell !== cellB) {
            const colLabel = pa.table!.columns[j]?.label ?? `列${j + 1}`;
            // 定位到行/列：行展示名优先用首列值（表格约定首列为指标名），回退行键
            const rowLabel = typeof ra.cells[0] === 'string' && ra.cells[0] ? ra.cells[0] : ra.key;
            changes.push({ field: 'table', locator: `${rowLabel}/${colLabel}`, before: cell, after: cellB });
          }
        });
      });
      const rowKeysA = new Set(pa.table.rows.map((r) => r.key));
      for (const rb of pb.table.rows) {
        if (!rowKeysA.has(rb.key)) {
          changes.push({ field: 'table', locator: `行「${rb.key}」`, before: '无', after: '新增' });
        }
      }
    } else if (str(!!pa.table) !== str(!!pb.table)) {
      changes.push({ field: 'table', before: pa.table ? '有表格' : '无表格', after: pb.table ? '有表格' : '无表格' });
    }
    // 图表：配置 JSON 对比
    if (str(pa.chart) !== str(pb.chart)) {
      changes.push({ field: 'chart', before: pa.chart ? '有图表' : '无图表', after: pb.chart ? '有图表' : '无图表' });
    }
    // 引用绑定
    for (const field of ['claim_refs', 'metric_refs'] as const) {
      const ra = JSON.stringify(pa[field] ?? []);
      const rb = JSON.stringify(pb[field] ?? []);
      if (ra !== rb) changes.push({ field, before: ra, after: rb });
    }
    if (changes.length > 0) pages_changed.push({ page_id: id, changes });
  }

  const metrics_changed: SpecDiff['metrics_changed'] = [];
  const aMetrics = new Map(a.metrics.map((m) => [m.metric_id, m]));
  for (const mb of b.metrics) {
    const ma = aMetrics.get(mb.metric_id);
    if (!ma) continue;
    for (const field of ['value', 'unit', 'scope'] as const) {
      if (str(ma[field]) !== str(mb[field])) {
        metrics_changed.push({ metric_id: mb.metric_id, field, before: str(ma[field]), after: str(mb[field]) });
      }
    }
  }
  const claims_changed: SpecDiff['claims_changed'] = [];
  const aClaims = new Map(a.claims.map((c) => [c.claim_id, c]));
  for (const cb of b.claims) {
    const ca = aClaims.get(cb.claim_id);
    if (!ca) continue;
    for (const field of ['text', 'kind', 'verification_state'] as const) {
      if (str(ca[field]) !== str(cb[field])) {
        claims_changed.push({ claim_id: cb.claim_id, field, before: str(ca[field]), after: str(cb[field]) });
      }
    }
  }

  return { pages_added, pages_removed, pages_reordered, pages_changed, metrics_changed, claims_changed };
}
