import Fastify, { type FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WorkspaceStore } from '../storage/workspace.js';
import { ingestAndSave } from '../ingest/persist.js';
import { importAnalysisBundle } from '../ingest/bundle.js';
import { exportReport } from '../pipeline/export.js';
import { WorkbenchService } from './workbench.js';
import {
  ApproveG1RequestSchema,
  AssembleRequestSchema,
  BrandRequestSchema,
  CreateProjectRequestSchema,
  DecidePlacementRequestSchema,
  EditRequestSchema,
  EvidenceApproveRequestSchema,
  EvidenceRequestCreateSchema,
  ExportRequestSchema,
  OutlineRequestSchema,
  ProposeRequestSchema,
  ResolveConflictRequestSchema,
  ResolvePendingRequestSchema,
  SourceUploadRequestSchema,
} from '../schema/requests.js';
import { ZodError } from 'zod';

/** 请求体校验：zod 失败即抛 400（替代裸 cast 边界） */
function parseBody<T>(schema: { parse: (x: unknown) => T }, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (e) {
    if (e instanceof ZodError) throw httpError(400, '请求体非法');
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
    const body = parseBody(CreateProjectRequestSchema, req.body);
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
    const [sources, revisions, exports, conflicts, spec, editorial] = await Promise.all([
      store.listSourceAssets(id),
      store.listRevisions(id),
      store.listExports(id),
      workbench.getResolvedConflicts(id),
      workbench.getSpec(id),
      workbench.editorial(id),
    ]);
    const editorialActive = editorial.decisions.length > 0 || !!editorial.approval;
    return {
      project, sources, revisions: revisions.map((r) => r.meta), exports, conflicts, hasSpec: !!spec, spec: spec ?? null,
      // M4 编审摘要（状态栏显示；编审模式=存在编排决定或已推进状态）
      editorial: editorialActive
        ? {
            status: editorial.status,
            pending_pages: editorial.pending_review.affected_pages.length,
            pending_updates: editorial.pending_review.updates.length,
            g1: !!editorial.approval,
            g2: !!editorial.g2,
          }
        : null,
    };
  });

  app.post('/api/projects/:id/sources', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(SourceUploadRequestSchema, req.body);
    const result = await ingestAndSave(store, id, {
      filename: body.filename,
      content: Buffer.from(body.content_base64, 'base64'),
      kind: body.kind,
      media_type: body.media_type,
      sheet: body.sheet,
    });
    const { ok, failure_reason, claims, evidence, tables, notes, confirmations, available_sheets } = result;
    return { source: { ...result, claims: undefined, evidence: undefined, tables: undefined, notes: undefined, confirmations: undefined, available_sheets: undefined }, ok, failure_reason, counts: { claims: claims.length, tables: tables.length, evidence: evidence.length, notes: notes.length }, confirmations, available_sheets };
  });

  // M4：授权分析成果包导入（AnalysisBundle 合同 §11.1；未知版本/结构非法即 400 拒绝）
  app.post('/api/projects/:id/bundle', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await importAnalysisBundle(store, id, req.body);
      const { ok, counts, deduped, update, ...source } = result;
      return { ok, counts, deduped, update, source };
    } catch (e) {
      if (e instanceof ZodError) {
        const version = (req.body as Record<string, unknown>)?.['schema_version'];
        const hint =
          version !== undefined && version !== '1.0'
            ? `不支持的成果包 schema_version：${String(version)}（当前支持 1.0）`
            : '成果包结构不符合 AnalysisBundle 合同';
        reply.code(400);
        return { ok: false, error: hint };
      }
      throw e;
    }
  });

  // M4 编审层：发现卡片（组合视图）与编排决定（§7.2/§7.3）
  app.get('/api/projects/:id/findings', async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as { report_id?: string };
    return { findings: await workbench.findings(id, q.report_id) };
  });

  app.post('/api/projects/:id/decisions', async (req) => {
    const { id } = req.params as { id: string };
    const body = parseBody(DecidePlacementRequestSchema, req.body);
    const decisions = await workbench.saveDecisions(id, body);
    return { ok: true, decisions };
  });

  // M4 G1 人工编审（§8.1）：冻结蓝图/任务书/来源快照并绑定批准人
  app.post('/api/projects/:id/approve-g1', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(ApproveG1RequestSchema, req.body);
    try {
      const result = await workbench.approveG1(id, { approver: body.approver, scope: body.scope });
      return { ok: true, ...result };
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode ?? 500);
      return { ok: false, error: err.message };
    }
  });

  // M4 补证管理（F07/§11.2）：草拟→批准→导出→结果回流
  app.post('/api/projects/:id/evidence-requests', async (req) => {
    const { id } = req.params as { id: string };
    const body = parseBody(EvidenceRequestCreateSchema, req.body);
    const request = await workbench.createEvidenceRequest(id, body);
    return { request };
  });

  app.get('/api/projects/:id/evidence-requests', async (req) => {
    const { id } = req.params as { id: string };
    return { requests: await workbench.listEvidenceRequests(id) };
  });

  app.post('/api/projects/:id/evidence-requests/:rid/approve', async (req, reply) => {
    const { id, rid } = req.params as { id: string; rid: string };
    const body = parseBody(EvidenceApproveRequestSchema, req.body);
    try {
      return { request: await workbench.approveEvidenceRequest(id, rid, body.approver) };
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode ?? 500);
      return { ok: false, error: err.message };
    }
  });

  app.get('/api/projects/:id/evidence-requests/:rid/export', async (req, reply) => {
    const { id, rid } = req.params as { id: string; rid: string };
    try {
      return await workbench.exportEvidenceRequest(id, rid);
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode ?? 500);
      return { ok: false, error: err.message };
    }
  });

  // M4 待复核解除（§7.7）：用户复核新版本影响后放行正式发布
  app.post('/api/projects/:id/pending-updates/resolve', async (req) => {
    const { id } = req.params as { id: string };
    const body = parseBody(ResolvePendingRequestSchema, req.body);
    await workbench.resolvePendingUpdates(id, { logical_keys: body.logical_keys, affected_pages: body.affected_pages });
    return { ok: true };
  });

  // M4 取舍推荐（F03）：确定性规则给正文/附录/不采用建议与理由，人工只调整例外
  app.post('/api/projects/:id/recommend', async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as { report_id?: string };
    return { recommendations: await workbench.recommend(id, q.report_id) };
  });

  // M4 任务书（F01）：核心问题/非重点/必要边界/交付隐私，草稿持久化
  app.post('/api/projects/:id/brief', async (req) => {
    const { id } = req.params as { id: string };
    const body = parseBody(OutlineRequestSchema, req.body);
    await workbench.saveBrief(id, body.brief);
    return { ok: true };
  });

  app.get('/api/projects/:id/editorial', async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as { report_id?: string };
    return workbench.editorial(id, q.report_id);
  });

  app.post('/api/projects/:id/outline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(OutlineRequestSchema, req.body);
    const draft = await workbench.composeOutline(id, body.brief);
    return { draft };
  });

  app.post('/api/projects/:id/assemble', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(AssembleRequestSchema, req.body ?? {});
    const spec = await workbench.assemble(id, body.pages);
    return { spec };
  });

  app.post('/api/projects/:id/edit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(EditRequestSchema, req.body);
    const spec = await workbench.edit(id, body.op);
    return { spec };
  });

  // M4 变更提案（§12）：expected_revision + 原子应用；stale=409，锁定/范围拒绝=422（附原因）
  app.post('/api/projects/:id/propose', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(ProposeRequestSchema, req.body);
    const outcome = await workbench.propose(id, { op: body.op, expected_revision: body.expected_revision });
    if (outcome.state === 'stale') reply.code(409);
    else if (outcome.state === 'rejected') reply.code(422);
    return {
      ok: outcome.ok,
      state: outcome.state,
      reason: outcome.reason,
      proposal: outcome.proposal,
      current_revision: outcome.state === 'stale' ? (await workbench.getSpec(id))?.revision_id : undefined,
      spec: outcome.spec ?? null,
    };
  });

  app.get('/api/projects/:id/proposals', async (req) => {
    const { id } = req.params as { id: string };
    return { proposals: await workbench.proposals(id) };
  });

  // M4 导出回执（§11.3）：修订/文件/哈希/检查/来源映射/交付状态（幂等重取，T23）
  app.get('/api/projects/:id/exports/:eid/receipt', async (req, reply) => {
    const { id, eid } = req.params as { id: string; eid: string };
    try {
      return await workbench.exportReceipt(id, eid);
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode ?? 500);
      return { ok: false, error: err.message };
    }
  });

  app.post('/api/projects/:id/checks', async (req) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { exportScope?: 'internal' | 'external' };
    return workbench.checks(id, body.exportScope);
  });

  app.post('/api/projects/:id/resolve-conflict', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(ResolveConflictRequestSchema, req.body);
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

  // 品牌配置（M3：token 级，换品牌不重生成内容）
  app.put('/api/projects/:id/brand', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(BrandRequestSchema, req.body);
    try {
      const spec = await workbench.applyBrand(id, body.brand);
      return { ok: true, spec_theme: spec.theme };
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode ?? 500);
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
    const body = parseBody(ExportRequestSchema, req.body);
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
      deliverable: body.deliverable,
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
