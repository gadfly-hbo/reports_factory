import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestCsv, ingestMarkdown } from '../ingest/index.js';
import { createDeterministicGateway, type OutlineContext } from '../model/gateway.js';
import { assembleReportSpec, type AssembleContext } from '../compose/assemble.js';
import { ReportSpecSchema, type Claim, type ReportSpec } from '../schema/report-spec.js';

/**
 * M3 研究报告手工样例：与零售复盘同一演示数据，走 research_report 交付物类型
 * （document 管线回归 golden 的数据源）。
 */
export async function buildResearchSample(fixturesDir?: string): Promise<ReportSpec> {
  const dir = fixturesDir ?? join(process.cwd(), 'tests', 'fixtures', 'materials');
  const md = await readFile(join(dir, 'conclusion.md'), 'utf-8');
  const csv = await readFile(join(dir, 'sales.csv'), 'utf-8');
  const mdRes = ingestMarkdown(md, 'src_md');
  const csvRes = ingestCsv(csv, 'src_csv');

  const brief = {
    audience: '商品经营负责人',
    purpose: '上半年销售变化分析（供传阅复核）',
    page_budget: 9,
    language: 'zh-CN',
    deliverable_type: 'research_report' as const,
  };
  const outlineCtx: OutlineContext = {
    brief,
    claims: mdRes.claims as Claim[],
    tables: csvRes.tables,
    evidence: mdRes.evidence,
    conflicts: [],
    notes: [],
    confirmations: csvRes.confirmations,
  };
  const draft = await createDeterministicGateway().composeOutline(outlineCtx);
  const ctx: AssembleContext = {
    brief,
    claims: outlineCtx.claims,
    tables: csvRes.tables,
    evidence: mdRes.evidence,
    conflicts: [],
    notes: [],
    pagePlans: draft.pages,
    sourceSnapshot: [
      { source_id: 'src_md', version: 'v1', is_demo: true },
      { source_id: 'src_csv', version: 'v1', is_demo: true },
    ],
  };
  return ReportSpecSchema.parse(assembleReportSpec({ report_id: 'report_m3_research_sample', ctx }));
}
