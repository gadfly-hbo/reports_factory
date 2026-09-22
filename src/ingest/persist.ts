import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { IngestResult } from '../schema/assets.js';
import type { SourceAsset } from '../schema/project.js';
import type { WorkspaceStore } from '../storage/workspace.js';
import { ingestCsv } from './csv.js';
import { ingestMarkdown } from './markdown.js';

export interface IngestInput {
  filename: string;
  content: Buffer;
  kind: SourceAsset['kind'];
  media_type: string;
  sensitivity?: SourceAsset['sensitivity'];
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
  const asset = await store.saveSourceAsset(projectId, {
    filename: input.filename,
    content: input.content,
    media_type: input.media_type,
    kind: input.kind,
    sensitivity: input.sensitivity,
    has_data: input.kind !== 'image',
  });

  let result: IngestResult;
  if (input.kind === 'markdown' || input.kind === 'text') {
    result = ingestMarkdown(input.content.toString('utf-8'), asset.source_id, asset.version);
  } else if (input.kind === 'csv') {
    result = ingestCsv(input.content.toString('utf-8'), asset.source_id);
  } else if (input.kind === 'image') {
    result = {
      source_id: asset.source_id,
      ok: true,
      claims: [],
      evidence: [],
      tables: [],
      notes: ['图片材料：无底层数据，作为图片保留；修改数值需补充原始表格'],
      conflicts: [],
      confirmations: [],
    };
  } else {
    result = {
      source_id: asset.source_id,
      ok: false,
      failure_reason: `暂不支持的类型：${input.kind}`,
      claims: [],
      evidence: [],
      tables: [],
      notes: [],
      conflicts: [],
      confirmations: [],
    };
  }

  await store.markSourceParse(projectId, asset.source_id, result.ok ? 'parsed' : 'failed', result.failure_reason);
  if (result.ok) {
    const derived = {
      claims: result.claims,
      evidence: result.evidence,
      tables: result.tables,
      notes: result.notes,
      confirmations: result.confirmations,
    };
    await writeFile(
      join(store.root, projectId, 'sources', `${asset.source_id}.assets.json`),
      JSON.stringify(derived, null, 2),
    );
  }
  return {
    ...asset,
    parse_status: result.ok ? 'parsed' : 'failed',
    parse_error: result.failure_reason,
    ...result,
  };
}
