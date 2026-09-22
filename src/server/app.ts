import Fastify, { type FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspaceStore } from '../storage/workspace.js';
import { ingestAndSave } from '../ingest/persist.js';
import { exportReport } from '../pipeline/export.js';
import { WorkbenchService } from './workbench.js';
import {
  AssembleRequestSchema,
  CreateProjectRequestSchema,
  EditRequestSchema,
  ExportRequestSchema,
  OutlineRequestSchema,
  ResolveConflictRequestSchema,
  SourceUploadRequestSchema,
} from '../schema/requests.js';
import type { EditOp } from '../compose/edit.js';
import { ZodError } from 'zod';

/** 请求体校验：zod 失败 → 400（替代裸 cast 边界） */
function parseBody<T>(schema: { parse: (x: unknown) => T }, body: unknown, reply: { code: (n: number) => unknown }): T | null {
  try {
    return schema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) {
      reply.code(400);
      throw Object.assign(new Error('请求体非法'), { statusCode: 400 });
    }
    throw e;
  }
}

function httpError(statusCode: number, message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/** 本地服务（F 界面）：API + 静态托管构建后的 UI（web-dist） */
export function buildServer(store: WorkspaceStore, webDist?: string): FastifyInstance {
  const app = Fastify({ logger: false });
  const workbench = new WorkbenchService(store);

  app.get('/api/projects', async () => {
    const projects = await store.listProjects();
    return { projects };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = parseBody(CreateProjectRequestSchema, req.body, reply);
    if (!body) return { error: '请求体非法' };
    const project = await store.createProject({ title: body.title, purpose: body.purpose });
    if (body.privacy_policy) await store.updateProject(project.project_id, { privacy_policy: body.privacy_policy });
    return { project };
  });

  app.delete('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    await store.deleteProject(id);
    return { ok: true };
  });

  app.get('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    const project = await store.getProject(id);
    if (!project) throw httpError(404, '项目不存在');
    const [sources, revisions, exports, conflicts, spec] = await Promise.all([
      store.listSourceAssets(id),
      store.listRevisions(id),
      store.listExports(id),
      workbench.getResolvedConflicts(id),
      workbench.getSpec(id),
    ]);
    return { project, sources, revisions: revisions.map((r) => r.meta), exports, conflicts, hasSpec: !!spec };
  });

  app.post('/api/projects/:id/sources', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(SourceUploadRequestSchema, req.body, reply);
    if (!body) return { error: '请求体非法' };
    const result = await ingestAndSave(store, id, {
      filename: body.filename,
      content: Buffer.from(body.content_base64, 'base64'),
      kind: body.kind,
      media_type: body.media_type,
    });
    const { ok, failure_reason, claims, evidence, tables, notes, confirmations } = result;
    return { source: { ...result, claims: undefined, evidence: undefined, tables: undefined, notes: undefined, confirmations: undefined }, ok, failure_reason, counts: { claims: claims.length, tables: tables.length, evidence: evidence.length, notes: notes.length }, confirmations };
  });

  app.post('/api/projects/:id/outline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(OutlineRequestSchema, req.body, reply);
    if (!body) return { error: '请求体非法' };
    const draft = await workbench.composeOutline(id, body.brief);
    return { draft };
  });

  app.post('/api/projects/:id/assemble', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(AssembleRequestSchema, req.body ?? {}, reply);
    if (!body) return { error: '请求体非法' };
    const spec = await workbench.assemble(id, body.pages as never);
    return { spec };
  });

  app.post('/api/projects/:id/edit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(EditRequestSchema, req.body, reply);
    if (!body) return { error: '请求体非法' };
    const spec = await workbench.edit(id, body.op as EditOp);
    return { spec };
  });

  app.post('/api/projects/:id/checks', async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { exportScope?: 'internal' | 'external' };
    return workbench.checks(id, body.exportScope);
  });

  app.post('/api/projects/:id/resolve-conflict', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(ResolveConflictRequestSchema, req.body, reply);
    if (!body) return { error: '请求体非法' };
    const { resolution } = body;
    try {
      await workbench.resolveConflict(id, resolution);
      return { ok: true };
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      if (err.statusCode) reply.code(err.statusCode);
      return { ok: false, error: err.message };
    }
  });

  // 版本比较（§5.3：差异显示；数字/绑定变化时重触发检查）
  app.get('/api/projects/:id/diff', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { a?: string; b?: string };
    if (!q.a || !q.b) return reply.code(400).send({ error: '需要 a 与 b 两个修订 id' });
    try {
      return await workbench.diff(id, q.a, q.b);
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode ?? 500);
      return { error: err.message };
    }
  });

  // 来源替换影响面（§13.2：新材料版本到来后提示受影响页面）
  app.get('/api/projects/:id/impact', async (req) => {
    const { id } = req.params as { id: string };
    return { impact: await workbench.impactMap(id) };
  });

  app.get('/api/projects/:id/conflict-resolutions', async (req) => {
    const { id } = req.params as { id: string };
    return store.readConflictResolutions(id);
  });

  app.post('/api/projects/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(ExportRequestSchema, req.body, reply);
    if (!body) return { error: '请求体非法' };
    const spec = await workbench.getSpec(id);
    if (!spec) throw httpError(400, '尚未组装报告，无法导出');
    const outcome = await exportReport(store, id, spec, {
      mode: body.mode,
      formats: body.formats,
      conflicts: await workbench.getResolvedConflicts(id),
      exportScope: body.exportScope ?? 'internal',
      chartDataMode: body.chart_data_mode,
      ackEditableData: body.ack_editable_data,
      ackExternalShare: body.ack_external_share,
    });
    return {
      allowed: outcome.gate.allowed,
      reason: outcome.gate.reason,
      checks: outcome.checks,
      privacy: outcome.privacy && {
        checked_count: outcome.privacy.checked_count,
        not_checked_count: outcome.privacy.not_checked_count,
        items: outcome.privacy.items,
      },
      exports: outcome.exports.map((e) => ({ export_id: e.export_id, format: e.format, artifact_path: e.artifact_path, is_draft: e.is_draft })),
    };
  });

  app.get('/api/projects/:id/preview', async (req, reply) => {
    const { id } = req.params as { id: string };
    reply.type('text/html; charset=utf-8');
    return workbench.previewHtml(id);
  });

  // 静态 UI（构建产物）
  if (webDist && existsSync(webDist)) {
    app.get('/', async (_req, reply) => reply.type('text/html').send(await readFile(join(webDist, 'index.html'))));
    app.get('/assets/:file', async (req, reply) => {
      const { file } = req.params as { file: string };
      const path = join(webDist, 'assets', file);
      if (!existsSync(path)) throw httpError(404, 'not found');
      const ext = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      return reply.type(ext).send(await readFile(path));
    });
  }

  return app;
}
