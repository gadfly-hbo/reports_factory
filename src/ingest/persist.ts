import { createHash } from 'node:crypto';
import { emptyIngestResult, type IngestResult } from '../schema/assets.js';
import type { SourceAsset } from '../schema/project.js';
import type { WorkspaceStore } from '../storage/workspace.js';
import { ingestCsv } from './csv.js';
import { ingestXlsx } from './xlsx.js';
import { ingestDocx } from './docx.js';
import { ingestMarkdown } from './markdown.js';

export interface IngestInput {
  filename: string;
  content: Buffer;
  kind: SourceAsset['kind'];
  media_type: string;
  sensitivity?: SourceAsset['sensitivity'];
  sheet?: string; // XLSX 显式选表
}

/**
 * 导入 + 解析 + 入库：单份材料失败只影响自身（parse_status=failed + 原因），
 * 不影响项目与其他材料。派生资产写入 sources/<id>.assets.json。
 * 图片：无底层数据标记 has_data=false，不做 OCR/数值恢复。
 */
export async function ingestAndSave(
  store: WorkspaceStore,
  projectId: string,
  input: IngestInput,
): Promise<SourceAsset & IngestResult> {
  // M4 普通材料逻辑身份（G4）：source:local:<stem>，资产按解析顺序派生；
  // 同文件重导产生同逻辑键的新实例，编审决定按逻辑键保持有效
  const stem = input.filename.replace(/\.[^.]+$/, '');
  const sourceLogical = `source:local:${stem}`;

  // D1 同文件重导幂等：同逻辑身份 + 同内容哈希 → 复用既有来源（编审决定不丢）；
  // XLSX 例外（选表重导是显式流程，不做去重）
  const contentHash = createHash('sha256').update(input.content).digest('hex');
  if (input.kind !== 'xlsx') {
    const existing = (await store.listSourceAssets(projectId)).find(
      (s) => s.logical_key === sourceLogical && s.file_hash === contentHash && s.parse_status === 'parsed',
    );
    if (existing) {
      const derived = (await store.readDerivedAssets(projectId, existing.source_id)) as Record<string, any> | null;
      return {
        ...existing,
        ok: true,
        deduped: true,
        claims: derived?.claims ?? [],
        evidence: derived?.evidence ?? [],
        tables: derived?.tables ?? [],
        notes: derived?.notes ?? [],
        conflicts: [],
        confirmations: derived?.confirmations ?? [],
      };
    }
  }

  const asset = await store.saveSourceAsset(projectId, {
    filename: input.filename,
    content: input.content,
    media_type: input.media_type,
    kind: input.kind,
    sensitivity: input.sensitivity,
    has_data: input.kind !== 'image',
    logical_key: sourceLogical,
  });

  let result: IngestResult;
  if (input.kind === 'markdown' || input.kind === 'text') {
    result = ingestMarkdown(input.content.toString('utf-8'), asset.source_id, asset.version);
  } else if (input.kind === 'csv') {
    result = ingestCsv(input.content.toString('utf-8'), asset.source_id);
  } else if (input.kind === 'docx') {
    result = await ingestDocx(input.content, asset.source_id);
  } else if (input.kind === 'xlsx') {
    result = await ingestXlsx(input.content, asset.source_id, input.sheet);
    if (!result.ok && result.available_sheets) {
      // 待选表：保持 pending（不算解析失败），用户选表后重试
      await store.markSourceParse(projectId, asset.source_id, 'pending');
      return { ...asset, parse_status: 'pending', ...result };
    }
  } else if (input.kind === 'image') {
    result = emptyIngestResult(asset.source_id, {
      notes: ['图片材料：无底层数据，作为图片保留；修改数值需补充原始表格'],
    });
  } else {
    result = emptyIngestResult(asset.source_id, {
      ok: false,
      failure_reason: `暂不支持的类型：${input.kind}`,
    });
  }

  await store.markSourceParse(projectId, asset.source_id, result.ok ? 'parsed' : 'failed', result.failure_reason);
  if (result.ok) {
    const claims = (result.claims as Array<Record<string, unknown>>).map((c, i) => ({
      ...c,
      logical_key: `${sourceLogical}::c${i + 1}`,
    }));
    await store.saveDerivedAssets(projectId, asset.source_id, {
      claims,
      evidence: result.evidence,
      tables: result.tables,
      notes: result.notes,
      confirmations: result.confirmations,
    });
    result.claims = claims as typeof result.claims;
  }
  return {
    ...asset,
    parse_status: result.ok ? 'parsed' : 'failed',
    parse_error: result.failure_reason,
    ...result,
  };
}
