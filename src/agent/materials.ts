import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelConfig, ModelTransport } from 'pi-agent-runtime';
import type { SourceAsset } from '../schema/project.js';

/**
 * 材料通道（T1，G3）：上传后为每份材料产出 **agent 可读的提取文本**（sources/<id>.extract.md）
 * 与项目级材料索引（materials.json）。agent 用原生 read 工具读提取文本与索引，不读二进制原件。
 * - md/csv/text：原文直读
 * - pdf/docx/xlsx：提取文本（unpdf / mammoth / exceljs，沿既有 ingest 依赖）
 * - 图片：vision 预理解 → 文字描述落盘（单发 transport，不进工具面）
 * 单文件失败只影响自身（manifest.status=failed + error），不牵连其他材料。
 */

export interface MaterialEntry {
  source_id: string;
  filename: string;
  kind: SourceAsset['kind'];
  status: 'ready' | 'failed';
  extract_file: string;
  chars: number;
  updated_at: string;
  error?: string;
}

export interface MaterialsManifest {
  version: 1;
  materials: MaterialEntry[];
}

const VISION_PROMPT = '请用中文客观描述这张图片的内容：图表请读出结构与关键数值，文字页请转写要点，照片请概括信息。只描述可见内容，不要推测。';

/** 图片 vision 预理解（单发 transport 调用；失败上抛由调用方标记单文件失败）。 */
export async function describeImage(
  transport: ModelTransport,
  model: ModelConfig,
  image: { data: Buffer; mimeType: string },
): Promise<string> {
  const reply = await transport({
    model,
    messages: [{ role: 'user', text: VISION_PROMPT, images: [{ data: image.data.toString('base64'), mimeType: image.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' }] }],
    maxOutputTokens: 2_048,
    signal: AbortSignal.timeout(180_000),
  });
  const text = reply.content.filter((b) => b.kind === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('vision 描述为空');
  return text;
}

/** 单份材料 → 提取文本（不落盘）。 */
export async function extractToText(input: {
  kind: SourceAsset['kind'];
  filename: string;
  content: Buffer;
}): Promise<string> {
  const { kind, content } = input;
  if (kind === 'markdown' || kind === 'text' || kind === 'csv' || kind === 'table') {
    return content.toString('utf-8');
  }
  if (kind === 'pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(content));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.normalize('NFKC').replace(/\u0000/g, '').trim();
  }
  if (kind === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(content) });
    return value.trim();
  }
  if (kind === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(content as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0]);
    const out: string[] = [];
    wb.eachSheet((sheet) => {
      out.push(`## 工作表：${sheet.name}`);
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value;
          cells.push(v == null ? '' : typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') : String(v));
        });
        out.push(cells.join('\t'));
      });
    });
    return out.join('\n').trim();
  }
  throw new Error(`该类型暂无文本提取：${kind}`);
}

/** 为一份已入库材料生成提取文件并更新 manifest（upload 路由与重试共用）。 */
export async function indexMaterial(input: {
  projectRoot: string;
  asset: Pick<SourceAsset, 'source_id' | 'filename' | 'kind'>;
  content: Buffer;
  mediaType?: string;
  vision?: { transport: ModelTransport; model: ModelConfig };
}): Promise<MaterialEntry> {
  const { projectRoot, asset, content } = input;
  const base: MaterialEntry = {
    source_id: asset.source_id,
    filename: asset.filename,
    kind: asset.kind,
    status: 'ready',
    extract_file: `sources/${asset.source_id}.extract.md`,
    chars: 0,
    updated_at: new Date().toISOString(),
  };
  try {
    let text: string;
    if (asset.kind === 'image') {
      if (!input.vision) throw new Error('图片材料需要 vision 模型（密钥未配置或不可用）');
      const mime = (input.mediaType || 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      const description = await describeImage(input.vision.transport, input.vision.model, { data: content, mimeType: mime });
      text = `<!-- 图片 ${asset.filename} 的 vision 预理解描述（模型生成，非原文） -->\n${description}\n`;
    } else {
      text = await extractToText({ kind: asset.kind, filename: asset.filename, content });
    }
    if (!text) throw new Error('提取结果为空');
    await mkdir(join(projectRoot, 'sources'), { recursive: true });
    await writeFile(join(projectRoot, base.extract_file), `# ${asset.filename}\n\n${text}\n`, 'utf-8');
    base.chars = text.length;
  } catch (e) {
    base.status = 'failed';
    base.error = (e instanceof Error ? e.message : String(e)).slice(0, 200);
  }
  await upsertManifest(projectRoot, base);
  return base;
}

export async function readManifest(projectRoot: string): Promise<MaterialsManifest> {
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(join(projectRoot, 'materials.json'), 'utf-8')) as MaterialsManifest;
    if (raw.version === 1 && Array.isArray(raw.materials)) return raw;
  } catch { /* 首次/缺失 */ }
  return { version: 1, materials: [] };
}

async function upsertManifest(projectRoot: string, entry: MaterialEntry): Promise<void> {
  const manifest = await readManifest(projectRoot);
  const idx = manifest.materials.findIndex((m) => m.source_id === entry.source_id);
  if (idx >= 0) manifest.materials[idx] = entry;
  else manifest.materials.push(entry);
  await writeFile(join(projectRoot, 'materials.json'), JSON.stringify(manifest, null, 1), 'utf-8');
}

/** 材料移除时同步清理 manifest 条目（M-U1 语义延续）。 */
export async function removeMaterial(projectRoot: string, sourceId: string): Promise<void> {
  const manifest = await readManifest(projectRoot);
  manifest.materials = manifest.materials.filter((m) => m.source_id !== sourceId);
  await writeFile(join(projectRoot, 'materials.json'), JSON.stringify(manifest, null, 1), 'utf-8');
}
