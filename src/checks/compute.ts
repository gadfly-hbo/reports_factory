import Decimal from 'decimal.js';
import type { Metric } from '../schema/report-spec.js';

/**
 * 确定性计算复算（§10.2 简单计算行）：差额、占比、变化率由代码复算，
 * 保留公式与输入；不支持的公式显式返回 unsupported，不猜测。
 */

export interface RecomputeResult {
  ok: boolean;
  value?: Decimal;
  reason?: 'unsupported' | 'missing_inputs' | 'division_by_zero';
}

const FORMULAS: Record<string, (i: Record<string, Decimal>) => Decimal | null> = {
  '(current - previous) / previous': (i) => {
    const prev = i['previous'];
    const cur = i['current'];
    if (!prev || !cur) return null;
    if (prev.isZero()) return null;
    return cur.minus(prev).div(prev);
  },
  'current / previous - 1': (i) => {
    const prev = i['previous'];
    const cur = i['current'];
    if (!prev || !cur) return null;
    if (prev.isZero()) return null;
    return cur.div(prev).minus(1);
  },
  'current - previous': (i) => {
    const prev = i['previous'];
    const cur = i['current'];
    if (!prev || !cur) return null;
    return cur.minus(prev);
  },
  'current / total': (i) => {
    const total = i['total'];
    const cur = i['current'];
    if (!total || !cur) return null;
    if (total.isZero()) return null;
    return cur.div(total);
  },
};

export function recomputeMetric(m: Metric): RecomputeResult {
  const fn = FORMULAS[m.formula ?? ''];
  if (!fn) return { ok: false, reason: 'unsupported' };
  const inputs: Record<string, Decimal> = {};
  for (const [k, v] of Object.entries(m.inputs ?? {})) {
    if (typeof v === 'number') inputs[k] = new Decimal(v);
  }
  const value = fn(inputs);
  if (value === null) {
    return { ok: false, reason: 'missing_inputs' };
  }
  return { ok: true, value };
}

/** 复算值与声称值比对：容差按展示精度（0.05%）与数值比例取宽 */
export function valueMatches(claimed: number, computed: Decimal): boolean {
  const diff = new Decimal(claimed).minus(computed).abs();
  const tol = Decimal.max(new Decimal(0.0005), computed.abs().times(0.005));
  return diff.lte(tol);
}
