import Decimal from 'decimal.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listDeckPages } from './deck-files.js';
import { readManifest } from './materials.js';

/**
 * 数字护栏 v2（flow-8 D1，用户修正口径）：输出数字 = 原始数据 ∪ 可验证的推导值。
 * 三级判定：① 逐字见于材料提取文本（raw）② 页代码 `// calc: 公式 = 值` 声明且通过
 * 验证（输入必须 raw、白名单文法求值、按展示位数容差）③ 无解释 → 违规。
 * 豁免：年份 19xx/20xx；无单位上下文的 0–99 整数（结构数/页码/序号）。
 */

export interface DigitViolation {
  slide: number;
  number: string;
  source?: 'chart';
}

export interface DigitGuardReport {
  raw: number;
  derived: number;
  exempt: number;
  violations: DigitViolation[];
}

/** 图表数据输入（B1 #2）：slide 持有图表，numbers 为其 `<c:val>` 数据值。 */
export interface ChartDataInput {
  slide: number;
  numbers: string[];
}

const NUM_RE = /(?<![\d.])(\d{1,12}(?:\.\d+)?)(?![\d])/g;
const DATA_UNIT_RE = /[%％¥$]|元|万|亿|倍|人|次|天|点|月|件|台|单|客|店/;
const FORMULA_ALLOWED = /^[0-9+\-*/().\s]+$/;
/** 数学常数豁免：*100 等百分比换算不应要求 raw 出处 */
const MATH_CONSTANTS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '100', '1000', '10000', '100000000']);

function norm(n: string): string {
  return n.replace(/^0+(?=\d)/, '');
}

function decimalsOf(s: string): number {
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** 展示位数容差：±0.51 个末位单位（8.1996≈8.2 ✓；8.36→8.3 ✗）。 */
function closeEnough(a: Decimal, b: Decimal, displayed: string): boolean {
  const tol = new Decimal('0.51').mul(new Decimal(10).pow(-decimalsOf(displayed)));
  return a.sub(b).abs().lte(tol);
}

/** 白名单文法求值（递归下降，无函数无变量；% 与 万/亿 已在预处理展开）。失败返回 null。 */
export function evalFormula(input: string): Decimal | null {
  const s = input.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
  if (!FORMULA_ALLOWED.test(s)) return null;
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i]!)) i++; };
  const parseExpr = (): Decimal | null => {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      ws();
      const op = s[i];
      if (op !== '+' && op !== '-') return left;
      i++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left.add(right) : left.sub(right);
    }
  };
  const parseTerm = (): Decimal | null => {
    let left = parseFactor();
    if (left === null) return null;
    for (;;) {
      ws();
      const op = s[i];
      if (op !== '*' && op !== '/') return left;
      i++;
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/') {
        if (right.isZero()) return null;
        left = left.div(right);
      } else {
        left = left.mul(right);
      }
    }
  };
  const parseFactor = (): Decimal | null => {
    ws();
    if (s[i] === '(') {
      i++;
      const v = parseExpr();
      if (v === null) return null;
      ws();
      if (s[i] !== ')') return null;
      i++;
      return v;
    }
    if (s[i] === '-') { i++; const v = parseFactor(); return v === null ? null : v.neg(); }
    const start = i;
    while (i < s.length && /[\d.]/.test(s[i]!)) i++;
    if (start === i) return null;
    const num = s.slice(start, i);
    if (!/^\d+(?:\.\d+)?$/.test(num)) return null;
    try { return new Decimal(num); } catch { return null; }
  };
  const v = parseExpr();
  if (v === null) return null;
  ws();
  return i === s.length ? v : null;
}

interface CalcClaim {
  value: Decimal;
  claimed: string;
  verified: boolean;
}

/** 解析页代码中的 calc 声明并验证（输入溯源 + 算术复核）。 */
async function collectCalcs(projectRoot: string, raw: Set<string>): Promise<CalcClaim[]> {
  const claims: CalcClaim[] = [];
  for (const page of await listDeckPages(projectRoot)) {
    let code: string;
    try {
      code = await readFile(join(projectRoot, page.code), 'utf-8');
    } catch { continue; }
    for (const line of code.split('\n')) {
      const m = /(?:\/\/|#)\s*calc:\s*(.+?)\s*=\s*(-?\d+(?:\.\d+)?)(?:\s|$)/.exec(line);
      if (!m) continue;
      const formulaRaw = m[1]!;
      const claimed = m[2]!;
      const formula = formulaRaw.replace(/万/g, '*10000').replace(/亿/g, '*100000000').replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
      let verified = FORMULA_ALLOWED.test(formula);
      if (verified) {
        for (const nm of formula.matchAll(NUM_RE)) {
          if (!raw.has(norm(nm[1]!)) && !MATH_CONSTANTS.has(norm(nm[1]!))) { verified = false; break; } // 输入必须 raw（数学常数豁免；禁套娃）
        }
      }
      const value = verified ? evalFormula(formula) : null;
      if (value !== null) verified = closeEnough(value, new Decimal(claimed), claimed);
      claims.push({ value: value ?? new Decimal(0), claimed, verified: verified && value !== null });
    }
  }
  return claims;
}

/** 数字护栏主入口。slideTexts: 每页的 <a:t> 文本拼接（1 基序）；chartData: 图表 <c:val> 数据值。 */
export async function digitGuard(projectRoot: string, slideTexts: string[], chartData: ChartDataInput[] = []): Promise<DigitGuardReport> {
  const raw = new Set<string>();
  const manifest = await readManifest(projectRoot);
  for (const entry of manifest.materials) {
    if (entry.status !== 'ready') continue;
    try {
      const text = await readFile(join(projectRoot, entry.extract_file), 'utf-8');
      for (const m of text.replace(/,/g, '').matchAll(NUM_RE)) raw.add(norm(m[1]!));
    } catch { /* 材料缺失按空处理 */ }
  }
  const calcs = await collectCalcs(projectRoot, raw);

  let rawHits = 0, derivedHits = 0, exempt = 0;
  const violations: DigitViolation[] = [];
  slideTexts.forEach((text, idx) => {
    const clean = text.replace(/,/g, '');
    for (const m of clean.matchAll(NUM_RE)) {
      const n = m[1]!;
      const after = clean.slice((m.index ?? 0) + n.length, (m.index ?? 0) + n.length + 1);
      if (/^(19|20)\d\d$/.test(n)) { exempt++; continue; } // 年份
      const isInteger = !n.includes('.');
      if (isInteger && Number.parseInt(n, 10) <= 99 && !DATA_UNIT_RE.test(after)) { exempt++; continue; } // 结构数
      const nn = norm(n);
      if (raw.has(nn)) { rawHits++; continue; }
      const hit = calcs.find((c) => c.verified && closeEnough(c.value, new Decimal(nn), n));
      if (hit) { derivedHits++; continue; }
      violations.push({ slide: idx + 1, number: n });
    }
  });
  // 图表数据（B1 #2）：数据即数据——年份豁免沿用，结构性小整数豁免不适用
  for (const chart of chartData) {
    for (const rawVal of chart.numbers) {
      const n = rawVal.trim().replace(/^-/, '');
      if (!/^\d{1,12}(?:\.\d+)?$/.test(n)) continue;
      if (/^(19|20)\d\d$/.test(n)) { exempt++; continue; }
      const nn = norm(n);
      if (raw.has(nn)) { rawHits++; continue; }
      const hit = calcs.find((c) => c.verified && closeEnough(c.value, new Decimal(nn), n));
      if (hit) { derivedHits++; continue; }
      violations.push({ slide: chart.slide, number: n, source: 'chart' });
    }
  }
  return { raw: rawHits, derived: derivedHits, exempt, violations };
}
