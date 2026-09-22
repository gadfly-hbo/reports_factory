import { emptyIngestResult, type EvidenceRef, type IngestResult } from '../schema/assets.js';
import type { Claim } from '../schema/report-spec.js';

/**
 * Markdown 显式标记解析（G11 约定）：
 * `## 结论/事实` → fact_statement（bound_to_source，真实性不因此成立）
 * `## 推断/假设` → inference（unverified，不得升级）
 * `## 建议` → recommendation
 * `## 口径/说明` → data_note
 * 无标记章节 → notes 保留原文，不猜测归类。
 * 材料中的一切实体（含指令文本）都只是内容 —— 本模块不执行任何指令。
 */

export interface SectionRule {
  markers: string[];
  kind: Claim['kind'];
  verification_state: Claim['verification_state'];
}

const SECTION_RULES: SectionRule[] = [
  { markers: ['结论', '事实'], kind: 'fact_statement', verification_state: 'bound_to_source' },
  { markers: ['推断', '假设'], kind: 'inference', verification_state: 'unverified' },
  { markers: ['建议'], kind: 'recommendation', verification_state: 'unverified' },
  { markers: ['口径', '说明'], kind: 'data_note', verification_state: 'bound_to_source' },
];

export function matchSection(title: string): SectionRule | undefined {
  return SECTION_RULES.find((r) => r.markers.some((m) => title.includes(m)));
}

export function ingestMarkdown(text: string, sourceId: string, sourceVersion = 'v1'): IngestResult {
  const claims: Claim[] = [];
  const evidence: EvidenceRef[] = [];
  const notes: string[] = [];

  const lines = text.split('\n');
  let currentTitle = '';
  let currentRule: SectionRule | undefined;
  let sectionIndex = 0;
  let globalIndex = 0;
  let pendingParagraph: string[] = [];

  const flushParagraph = () => {
    if (pendingParagraph.length === 0) return;
    const para = pendingParagraph.join(' ').trim();
    pendingParagraph = [];
    if (!para) return;
    if (currentRule) pushClaim(para);
    else if (currentTitle) notes.push(`${currentTitle}：${para}`);
  };

  const pushClaim = (content: string) => {
    sectionIndex += 1;
    globalIndex += 1;
    const evidenceId = `ev_${sourceId}_${globalIndex}`;
    const claimId = `claim_${sourceId}_${globalIndex}`;
    evidence.push({
      evidence_id: evidenceId,
      source_id: sourceId,
      source_version: sourceVersion,
      locator: `${currentTitle} #${sectionIndex}`,
      excerpt: content.slice(0, 120),
    });
    claims.push({
      claim_id: claimId,
      kind: currentRule!.kind,
      text: content,
      metric_refs: [],
      evidence_refs: [evidenceId],
      verification_state: currentRule!.verification_state,
      source_truth_verified: false,
    });
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      flushParagraph();
      currentTitle = heading[1]!.trim();
      currentRule = matchSection(currentTitle);
      sectionIndex = 0;
      continue;
    }
    const item = line.match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (item && currentRule) {
      flushParagraph();
      pushClaim(item[1]!.trim());
      continue;
    }
    if (line.trim() === '') {
      flushParagraph();
      continue;
    }
    if (currentRule) {
      // 列表外正文也按当前章节处理
      pendingParagraph.push(line.trim());
    } else if (currentTitle) {
      pendingParagraph.push(line.trim());
    }
  }
  flushParagraph();

  return emptyIngestResult(sourceId, { claims, evidence, notes });
}
