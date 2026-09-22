import mammoth from 'mammoth';
import { parse, HTMLElement } from 'node-html-parser';
import { emptyIngestResult, type IngestResult } from '../schema/assets.js';
import { matchSection, ingestMarkdown } from './markdown.js';
import { recordsToTable } from './table-core.js';

/**
 * DOCX 导入：mammoth → HTML → 结构化内容（标题章节 / 段落 / 列表 / 表格）。
 * mammoth 是纯数据解析器——宏与脚本不执行（§12.2 文件导入行），
 * 材料中的指令文本只作为内容处理。
 * 章节分类复用 markdown 的标记规则（结论/推断/建议/口径）。
 */

interface ParsedSection {
  title: string;
  items: string[]; // 列表项或段落文本（按出现顺序）
  tables: Record<string, string>[][];
}

function parseHtmlSections(html: string): ParsedSection[] {
  const root = parse(html);
  const sections: ParsedSection[] = [];
  let current: ParsedSection = { title: '', items: [], tables: [] };
  for (const el of root.childNodes) {
    if (!(el instanceof HTMLElement)) continue;
    const tag = el.rawTagName?.toLowerCase();
    if (!tag) continue;
    if (/^h[1-6]$/.test(tag)) {
      if (current.title || current.items.length || current.tables.length) sections.push(current);
      current = { title: el.text.trim(), items: [], tables: [] };
    } else if (tag === 'ul' || tag === 'ol') {
      for (const li of (el as unknown as { childNodes: { text: string }[] }).childNodes) {
        const t = li.text?.trim();
        if (t) current.items.push(t);
      }
    } else if (tag === 'p') {
      const t = el.text.trim();
      if (t) current.items.push(t);
    } else if (tag === 'table') {
      const rows: Record<string, string>[] = [];
      const trs = el.querySelectorAll('tr');
      let headers: string[] = [];
      trs.forEach((tr, i) => {
        const cells = tr.querySelectorAll('th, td').map((c) => c.text.trim());
        if (i === 0) {
          headers = cells;
          return;
        }
        const rec: Record<string, string> = {};
        cells.forEach((c, j) => {
          rec[headers[j] ?? `列${j + 1}`] = c;
        });
        rows.push(rec);
      });
      if (rows.length > 0) current.tables.push(rows);
    }
  }
  if (current.title || current.items.length || current.tables.length) sections.push(current);
  return sections;
}

export async function ingestDocx(buffer: Buffer, sourceId: string): Promise<IngestResult> {
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const sections = parseHtmlSections(html);

    // 章节文本 → 复用 markdown 的主张/证据构建器（转成 md 文本再走同一通道）
    const mdText = sections
      .map((sec) => {
        const lines = [`## ${sec.title || '未命名章节'}`];
        for (const item of sec.items) lines.push(`- ${item}`);
        return lines.join('\n');
      })
      .join('\n\n');
    const textResult = mdText.trim() ? ingestMarkdown(mdText, sourceId) : emptyIngestResult(sourceId);

    // 表格 → recordsToTable（与 CSV/XLSX 同一口径逻辑）
    const tables = [];
    const confirmations = [...textResult.confirmations];
    for (const sec of sections) {
      for (const rows of sec.tables) {
        const { table, confirmations: conf } = recordsToTable(rows, `${sourceId}_t${tables.length}`, sec.title || undefined);
        tables.push(table);
        confirmations.push(...conf);
      }
    }

    return emptyIngestResult(sourceId, {
      claims: textResult.claims,
      evidence: textResult.evidence,
      notes: textResult.notes,
      tables,
      confirmations,
    });
  } catch (e) {
    return emptyIngestResult(sourceId, {
      ok: false,
      failure_reason: `DOCX 解析失败：${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
