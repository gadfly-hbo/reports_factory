import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { ingestAndSave } from '../src/ingest/persist.js';
import { detectConflicts } from '../src/ingest/conflicts.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { exportReport } from '../src/pipeline/export.js';
import { deriveExecutiveSummary } from '../src/compose/summary.js';
import { checkCrossDeliverable } from '../src/checks/cross-deliverable.js';
import { extractDocxText } from '../src/samples/regression.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

describe('M3 三交付物 E2E：同一资产 → 会议汇报 + 研究报告 + 一页摘要', () => {
  it('三管线各自导出物契约通过，跨交付物一致性全绿', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-m3-'));
    try {
      const store = new WorkspaceStore(dir);
      const wb = new WorkbenchService(store);
      const project = await store.createProject({ title: 'M3 三交付物' });
      const pid = project.project_id;

      // 导入材料（结论 + 汇总表）
      for (const f of [
        { filename: 'conclusion.md', kind: 'markdown' as const, mt: 'text/markdown' },
        { filename: 'sales.csv', kind: 'csv' as const, mt: 'text/csv' },
      ]) {
        await ingestAndSave(store, pid, {
          filename: f.filename, content: readFileSync(join(MAT, f.filename)), kind: f.kind, media_type: f.mt,
        });
      }
      const conflicts = detectConflicts((await wb.getConflicts(pid)));

      // 1) 会议汇报（deck 管线）
      await wb.composeOutline(pid, { audience: '商品经营负责人', purpose: '上半年经营复盘', page_budget: 8 });
      const deckSpec = await wb.assemble(pid);
      expect(deckSpec.brief.deliverable_type).toBeUndefined(); // 缺省 meeting_deck
      const deckOut = await exportReport(store, pid, deckSpec, { mode: 'formal', formats: ['pptx', 'pdf'], conflicts });
      expect(deckOut.gate.allowed).toBe(true);

      // 2) 研究报告（document 管线）：brief 换类型重出大纲
      await wb.composeOutline(pid, { audience: '商品经营负责人', purpose: '上半年销售变化分析（供传阅复核）', page_budget: 9, deliverable_type: 'research_report' });
      const researchSpec = await wb.assemble(pid);
      expect(researchSpec.brief.deliverable_type).toBe('research_report');
      expect(researchSpec.pages.some((p) => p.headline.includes('限制与不确定性'))).toBe(true);
      const researchOut = await exportReport(store, pid, researchSpec, { mode: 'formal', formats: ['docx', 'html', 'pdf'], conflicts });
      expect(researchOut.gate.allowed).toBe(true);
      // 契约：docx 原生表格与来源行
      const docxPath = join(dir, pid, researchOut.exports.find((e) => e.format === 'docx')!.artifact_path);
      const docxZip = await JSZip.loadAsync(readFileSync(docxPath));
      const docXml = await docxZip.file('word/document.xml')!.async('string');
      expect(docXml).toContain('<w:tbl>');
      expect(docXml).toContain('来源');
      // 契约：独立 HTML 自包含
      const htmlPath = join(dir, pid, researchOut.exports.find((e) => e.format === 'html')!.artifact_path);
      const htmlStr = readFileSync(htmlPath, 'utf-8');
      expect(htmlStr).not.toMatch(/(src|href)="https?:\/\//);
      expect(htmlStr).toContain('限制与不确定性');

      // 3) 一页摘要（从主报告派生）
      const summaryOut = await exportReport(store, pid, deckSpec, { mode: 'formal', formats: ['pptx'], conflicts, deliverable: 'executive_summary' });
      expect(summaryOut.gate.allowed).toBe(true);
      expect(summaryOut.specUsed.brief.deliverable_type).toBe('executive_summary');

      // 4) 跨交付物一致性：共享指标在三交付物中不矛盾（§4.1）
      const summarySpec = deriveExecutiveSummary(deckSpec);
      expect(checkCrossDeliverable(deckSpec, researchSpec).blockers).toBe(0);
      expect(checkCrossDeliverable(deckSpec, summarySpec).blockers).toBe(0);
      expect(checkCrossDeliverable(researchSpec, summarySpec).blockers).toBe(0);

      // 5) 三管线产物都存在
      for (const out of [...deckOut.exports, ...researchOut.exports, ...summaryOut.exports]) {
        expect(existsSync(join(dir, pid, out.artifact_path))).toBe(true);
      }

      // 6) docx 文本抽取与报告内容一致（关键文本可定位）
      const docxText = await extractDocxText(readFileSync(docxPath));
      expect(docxText.text).toContain('限制与不确定性');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
