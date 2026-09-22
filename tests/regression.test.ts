import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  compareWithGolden,
  generateNormalizedTexts,
  GOLDEN_DIR,
} from '../src/samples/regression.js';
import { retailReviewSpec } from '../src/samples/retail-review.js';

describe('回归 golden 机制（红队约束①：归一化文本而非字节）', () => {
  it('golden 基线文件存在且非空（文本进 git）', () => {
    for (const f of ['html.txt', 'pptx.txt', 'pdf.txt']) {
      const p = join(GOLDEN_DIR, f);
      expect(existsSync(p), p).toBe(true);
      expect(readFileSync(p, 'utf-8').length).toBeGreaterThan(100);
    }
  });

  it('spec 未变 → 归一化文本与 golden 完全一致', async () => {
    const result = await compareWithGolden(retailReviewSpec);
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('篡改表格单元 → 比对失败并点名该值', async () => {
    const tampered = structuredClone(retailReviewSpec);
    tampered.pages[2]!.table!.rows[0]!.cells[1] = '9,999'; // 销售额 2,921 → 9,999
    const result = await compareWithGolden(tampered);
    expect(result.ok).toBe(false);
    const all = result.mismatches.map((m) => m.detail).join('\n');
    expect(all).toContain('9,999');
  });

  it('同一 spec 两次生成的归一化文本一致（字节不等不构成失败）', async () => {
    const a = await generateNormalizedTexts(retailReviewSpec);
    const b = await generateNormalizedTexts(retailReviewSpec);
    expect(a.html.text).toBe(b.html.text);
    expect(a.pptx.text).toBe(b.pptx.text);
    expect(a.pdf.text).toBe(b.pdf.text);
    expect(a.pptx.pages).toBe(a.pages_expected);
  });
});
