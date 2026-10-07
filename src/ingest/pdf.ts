import { extractText, getDocumentProxy } from 'unpdf';
import { ingestMarkdown } from './markdown.js';
import { emptyIngestResult, type IngestResult } from '../schema/assets.js';

/**
 * PDF 文本提取（M10 M-U5）：unpdf（内置 pdf.js，自动接线 CJK CMap——中文 CID 字体开箱可用）。
 * 提取文本按页拼接（页标记保留来源定位）后走 markdown 提炼管线（claims/evidence/notes）。
 * ToUnicode 映射损坏的 PDF：提取结果为乱码/空 → ok=false 明示失败；兜底（渲染成图走 vision）为后续增强。
 */
export async function ingestPdf(content: Buffer, sourceId: string, version = 'v1'): Promise<IngestResult> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(content));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    // NFKC 归一化：部分 PDF 的 ToUnicode 把汉字映射为康熙部首码位（⽉ U+2F49），NFKC 归一回统一表意文字（月 U+6708）
    const trimmed = text.normalize('NFKC').replace(/\u0000/g, '').trim();
    // 全空或几乎全空：可能是扫描件/ToUnicode 损坏——明示失败，不静默产空摘要
    if (totalPages === 0 || trimmed.replace(/\s/g, '').length < 10) {
      return emptyIngestResult(sourceId, {
        ok: false,
        failure_reason: 'PDF 未提取到有效文本（可能是扫描件或字体映射损坏）；可尝试转为图片上传',
      });
    }
    const withPages = `【PDF 共 ${totalPages} 页】\n\n${trimmed}`;
    return ingestMarkdown(withPages, sourceId, version);
  } catch (e) {
    return emptyIngestResult(sourceId, {
      ok: false,
      failure_reason: `PDF 解析失败：${e instanceof Error ? e.message.slice(0, 120) : '未知错误'}`,
    });
  }
}
