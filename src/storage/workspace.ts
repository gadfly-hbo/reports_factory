import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ProjectSchema,
  ReportRevisionSchema,
  SourceAssetSchema,
  ExportRecordSchema,
  type ExportRecord,
  type Project,
  type ReportRevisionMeta,
  type SourceAsset,
} from '../schema/project.js';
import { ReportSpecSchema, type ReportSpec } from '../schema/report-spec.js';

/**
 * 本地 workspace 存储（proposal §9.1：结构化文件 + 轻量索引）。
 * 布局：<root>/<project_id>/{project.json, sources/, revisions/, exports/}
 * 修订与导出记录一经写入不被改写（冻结快照的基础）。
 */

function nowIso(): string {
  return new Date().toISOString();
}

function shortId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

interface RevisionFile extends ReportRevisionMeta {
  spec: ReportSpec;
}

export interface SaveSourceInput {
  filename: string;
  content: Buffer;
  media_type: string;
  kind: SourceAsset['kind'];
  sensitivity?: SourceAsset['sensitivity'];
  replaces?: string;
  has_data?: boolean;
}

export interface SaveExportInput {
  revision_id: string;
  format: ExportRecord['format'];
  artifact: Buffer;
  checks: unknown;
  is_draft: boolean;
  export_scope?: 'internal' | 'external';
  chart_data_mode?: 'keep_editable' | 'aggregate_only';
  privacy_report?: unknown;
}

export class WorkspaceStore {
  constructor(readonly root: string) {}

  /** 读目录 JSON 列表的单一实现（此前在四个 list* 方法重复四次） */
  private async listJsonDir<T>(dir: string, schema: { parse: (x: unknown) => T }, exclude?: string): Promise<T[]> {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    const out: T[] = [];
    for (const f of files.filter((x) => x.endsWith('.json') && (!exclude || !x.endsWith(exclude)))) {
      out.push(schema.parse(JSON.parse(await readFile(join(dir, f), 'utf-8'))));
    }
    return out;
  }

  /** 默认打开：env REPORT_STUDIO_HOME，缺省 ./data（G12） */
  static open(): WorkspaceStore {
    return new WorkspaceStore(process.env['REPORT_STUDIO_HOME'] ?? './data');
  }

  private projectDir(projectId: string): string {
    return join(this.root, projectId);
  }

  // ---- 布局收口：派生资产 / 工作状态 / 冲突解决（此前路径知识泄漏在 persist/app/workbench 三处） ----

  async saveDerivedAssets(projectId: string, sourceId: string, derived: unknown): Promise<void> {
    await writeFile(
      join(this.projectDir(projectId), 'sources', `${sourceId}.assets.json`),
      JSON.stringify(derived, null, 2),
    );
  }

  async readDerivedAssets(projectId: string, sourceId: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await readFile(join(this.projectDir(projectId), 'sources', `${sourceId}.assets.json`), 'utf-8'));
    } catch {
      return null;
    }
  }

  async readWorkState(projectId: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await readFile(join(this.projectDir(projectId), 'work', 'state.json'), 'utf-8'));
    } catch {
      return null;
    }
  }

  async writeWorkState(projectId: string, state: unknown): Promise<void> {
    const dir = join(this.projectDir(projectId), 'work');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2));
  }

  async readConflictResolutions(projectId: string): Promise<Record<string, { resolution: string; adopted_value?: number }>> {
    try {
      return JSON.parse(await readFile(join(this.projectDir(projectId), 'work', 'conflict-resolutions.json'), 'utf-8'));
    } catch {
      return {};
    }
  }

  async writeConflictResolutions(
    projectId: string,
    records: Record<string, { resolution: string; adopted_value?: number }>,
  ): Promise<void> {
    const dir = join(this.projectDir(projectId), 'work');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'conflict-resolutions.json'), JSON.stringify(records, null, 2));
  }

  async createProject(input: { title: string; purpose?: string }): Promise<Project> {
    const project = ProjectSchema.parse({
      project_id: shortId('proj'),
      title: input.title,
      purpose: input.purpose,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    const dir = this.projectDir(project.project_id);
    await mkdir(join(dir, 'sources'), { recursive: true });
    await mkdir(join(dir, 'revisions'), { recursive: true });
    await mkdir(join(dir, 'exports'), { recursive: true });
    await writeFile(join(dir, 'project.json'), JSON.stringify(project, null, 2));
    return project;
  }

  async listProjects(): Promise<Project[]> {
    let entries: string[];
    try {
      entries = await readdir(this.root);
    } catch {
      return [];
    }
    const projects: Project[] = [];
    for (const id of entries) {
      const p = await this.getProject(id);
      if (p) projects.push(p);
    }
    return projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const raw = await readFile(join(this.projectDir(projectId), 'project.json'), 'utf-8');
      return ProjectSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private async touch(projectId: string): Promise<void> {
    const p = await this.getProject(projectId);
    if (!p) throw new Error(`project not found: ${projectId}`);
    p.updated_at = nowIso();
    await writeFile(join(this.projectDir(projectId), 'project.json'), JSON.stringify(p, null, 2));
  }

  async updateProject(
    projectId: string,
    patch: Partial<Pick<Project, 'title' | 'purpose' | 'privacy_policy' | 'stage'>>,
  ): Promise<Project> {
    const p = await this.getProject(projectId);
    if (!p) throw new Error(`project not found: ${projectId}`);
    const updated = ProjectSchema.parse({ ...p, ...patch, updated_at: nowIso() });
    await writeFile(join(this.projectDir(projectId), 'project.json'), JSON.stringify(updated, null, 2));
    return updated;
  }

  async copyProject(projectId: string, newTitle?: string): Promise<Project> {
    const src = await this.getProject(projectId);
    if (!src) throw new Error(`project not found: ${projectId}`);
    const copy = await this.createProject({ title: newTitle ?? `${src.title}（副本）`, purpose: src.purpose });
    await this.updateProject(copy.project_id, { privacy_policy: src.privacy_policy, stage: src.stage });
    const srcDir = this.projectDir(projectId);
    const copyDir = this.projectDir(copy.project_id);
    for (const sub of ['sources', 'revisions', 'exports']) {
      let files: string[];
      try {
        files = await readdir(join(srcDir, sub));
      } catch {
        continue;
      }
      for (const f of files) {
        await copyFile(join(srcDir, sub, f), join(copyDir, sub, f));
      }
    }
    return (await this.getProject(copy.project_id))!;
  }

  /** 删除范围：原件、派生、临时与整个项目目录（proposal §12.2 删除行） */
  async deleteProject(projectId: string): Promise<void> {
    await rm(this.projectDir(projectId), { recursive: true, force: true });
  }

  async saveSourceAsset(projectId: string, input: SaveSourceInput): Promise<SourceAsset> {
    const dir = join(this.projectDir(projectId), 'sources');
    const sourceId = shortId('src');
    const fileHash = createHash('sha256').update(input.content).digest('hex');
    const stored = `${sourceId}__${input.filename}`;
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, stored), input.content);
    const asset = SourceAssetSchema.parse({
      source_id: sourceId,
      version: 'v1',
      filename: input.filename,
      media_type: input.media_type,
      kind: input.kind,
      file_hash: fileHash,
      size: input.content.length,
      imported_at: nowIso(),
      sensitivity: input.sensitivity,
      parse_status: 'pending',
      replaces: input.replaces,
      has_data: input.has_data ?? true,
    });
    await writeFile(join(dir, `${sourceId}.json`), JSON.stringify(asset, null, 2));
    await this.touch(projectId);
    return asset;
  }

  async listSourceAssets(projectId: string): Promise<SourceAsset[]> {
    const dir = join(this.projectDir(projectId), 'sources');
    const assets = await this.listJsonDir(dir, SourceAssetSchema, '.assets.json');
    return assets.sort((a, b) => a.imported_at.localeCompare(b.imported_at));
  }

  async readSourceContent(projectId: string, sourceId: string): Promise<Buffer> {
    const assets = await this.listSourceAssets(projectId);
    const asset = assets.find((a) => a.source_id === sourceId);
    if (!asset) throw new Error(`source not found: ${sourceId}`);
    const dir = join(this.projectDir(projectId), 'sources');
    const stored = (await readdir(dir)).find((f) => f.startsWith(`${sourceId}__`));
    if (!stored) throw new Error(`source content missing: ${sourceId}`);
    return readFile(join(dir, stored));
  }

  async markSourceParse(
    projectId: string,
    sourceId: string,
    status: SourceAsset['parse_status'],
    error?: string,
  ): Promise<void> {
    const dir = join(this.projectDir(projectId), 'sources');
    const path = join(dir, `${sourceId}.json`);
    const asset = SourceAssetSchema.parse(JSON.parse(await readFile(path, 'utf-8')));
    asset.parse_status = status;
    asset.parse_error = error;
    await writeFile(path, JSON.stringify(asset, null, 2));
  }

  async saveRevision(projectId: string, spec: ReportSpec, note?: string): Promise<ReportRevisionMeta> {
    ReportSpecSchema.parse(spec); // 写入前校验，坏 spec 不落盘
    const existing = await this.listRevisions(projectId);
    const seq = String(existing.length + 1).padStart(3, '0');
    const revision: RevisionFile = {
      revision_id: `rev_${seq}`,
      parent_revision: existing.at(-1)?.meta.revision_id,
      created_at: nowIso(),
      note,
      spec: { ...spec, revision_id: `rev_${seq}` },
    };
    const dir = join(this.projectDir(projectId), 'revisions');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${revision.revision_id}.json`), JSON.stringify(revision, null, 2));
    await this.touch(projectId);
    const { spec: _omit, ...meta } = revision;
    return meta;
  }

  async listRevisions(projectId: string): Promise<{ meta: ReportRevisionMeta; spec: ReportSpec }[]> {
    const dir = join(this.projectDir(projectId), 'revisions');
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return [];
    }
    const out: { meta: ReportRevisionMeta; spec: ReportSpec }[] = [];
    for (const f of files.filter((x) => x.endsWith('.json')).sort()) {
      const raw = JSON.parse(await readFile(join(dir, f), 'utf-8')) as RevisionFile;
      const { spec, ...meta } = raw;
      out.push({ meta: ReportRevisionSchema.parse(meta), spec: ReportSpecSchema.parse(spec) });
    }
    return out;
  }

  async getRevision(projectId: string, revisionId: string): Promise<ReportRevisionMeta & { spec: ReportSpec } | null> {
    try {
      const raw = JSON.parse(
        await readFile(join(this.projectDir(projectId), 'revisions', `${revisionId}.json`), 'utf-8'),
      ) as RevisionFile;
      return raw;
    } catch {
      return null;
    }
  }

  async saveExport(projectId: string, input: SaveExportInput): Promise<ExportRecord> {
    const dir = join(this.projectDir(projectId), 'exports');
    await mkdir(dir, { recursive: true });
    const existing = (await readdir(dir)).filter((f) => f.endsWith('.json')).length;
    const seq = String(existing + 1).padStart(3, '0');
    const exportId = `exp_${seq}`;
    const artifactName = `${exportId}.${input.format}`;
    await writeFile(join(dir, artifactName), input.artifact);
    const record = ExportRecordSchema.parse({
      export_id: exportId,
      revision_id: input.revision_id,
      format: input.format,
      artifact_path: join('exports', artifactName),
      artifact_hash: createHash('sha256').update(input.artifact).digest('hex'),
      checks: input.checks,
      is_draft: input.is_draft,
      created_at: nowIso(),
      export_scope: input.export_scope,
      chart_data_mode: input.chart_data_mode,
      privacy_report: input.privacy_report,
    });
    await writeFile(join(dir, `${exportId}.json`), JSON.stringify(record, null, 2));
    await this.touch(projectId);
    return record;
  }

  async listExports(projectId: string): Promise<ExportRecord[]> {
    const dir = join(this.projectDir(projectId), 'exports');
    const out = await this.listJsonDir(dir, ExportRecordSchema);
    return out.sort((a, b) => a.export_id.localeCompare(b.export_id));
  }

  async getExport(projectId: string, exportId: string): Promise<ExportRecord | null> {
    try {
      return ExportRecordSchema.parse(
        JSON.parse(await readFile(join(this.projectDir(projectId), 'exports', `${exportId}.json`), 'utf-8')),
      );
    } catch {
      return null;
    }
  }
}
