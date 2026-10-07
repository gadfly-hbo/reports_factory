import Fastify, { type FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { WorkspaceStore } from '../storage/workspace.js';
import { ingestAndSave } from '../ingest/persist.js';
import { WorkbenchService } from './workbench.js';
import { CreateProjectRequestSchema, OutboundModeRequestSchema, SourceUploadRequestSchema } from '../schema/requests.js';
import { ZodError } from 'zod';
import { PrivacyPolicySchema } from '../schema/project.js';
import { listTemplates, getTemplate } from '../schema/template.js';
import { chainFromEnv } from '../model/client.js';
import { hasApiKey, modelChainAvailable } from '../model/pi-transport.js';

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

function replyGateError(reply: import('fastify').FastifyReply, err: Error & { statusCode?: number; needsApproval?: boolean }) {
  if (err.statusCode === 403 && err.needsApproval) { reply.code(403); return { ok: false, error: err.message, needsApproval: true }; }
  if (err.statusCode === 403) { reply.code(403); return { ok: false, error: err.message, needsApproval: false }; }
  reply.code(err.statusCode ?? 500);
  return { ok: false, error: err.message };
}

/** 本地服务（M10 纯 PPT 报告生成器）：六步 API + 静态托管构建后的 UI（web-dist） */
export function buildServer(store: WorkspaceStore, webDist?: string): FastifyInstance {
  const app = Fastify({ logger: false });
  const workbench = new WorkbenchService(store);

  app.get('/api/projects', async () => {
    const projects = await store.listProjects();
    // M10 G6：只列 PPT 项目——旧报告项目（无 kind 字段）数据保留但不出现
    return { projects: projects.filter((p) => p.kind === 'ppt') };
  });

  app.get('/api/templates', async () => {
    return { templates: listTemplates() };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = parseBody(CreateProjectRequestSchema, req.body);
    if (body.template_id && !getTemplate(body.template_id)) {
      throw httpError(400, `unknown template_id: ${body.template_id}`);
    }
    const project = await store.createProject({
      title: body.title,
      purpose: body.purpose,
      template_id: body.template_id,
    });
    if (body.privacy_policy) {
      return { project: await store.updateProject(project.project_id, { privacy_policy: body.privacy_policy }) };
    }
    return { project };
  });

  app.delete('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    await store.deleteProject(id);
    return { ok: true };
  });

  app.get('/api/projects/:id', async (req) => {
    const { id } = req.params as { id: string };
    return workbench.projectDetail(id);
  });

  // M9 收尾保留：改项目隐私策略（M-U2：项目级隐私语义保留，Inspector/创建区可设）
  app.put('/api/projects/:id/privacy', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(z.object({ privacy_policy: PrivacyPolicySchema }), req.body);
    try {
      const project = await store.updateProject(id, { privacy_policy: body.privacy_policy });
      return { project };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 上传资料（S1 保留既有 ingest 通道；移除与理解在 S3 补齐）
  app.post('/api/projects/:id/sources', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(SourceUploadRequestSchema, req.body);
    const result = await ingestAndSave(store, id, {
      filename: body.filename,
      content: Buffer.from(body.content_base64, 'base64'),
      kind: body.kind,
      media_type: body.media_type ?? '',
      sheet: body.sheet,
    });
    const { ok, failure_reason, claims, evidence, tables, notes, confirmations, available_sheets } = result;
    return { source: { ...result, claims: undefined, evidence: undefined, tables: undefined, notes: undefined, confirmations: undefined, available_sheets: undefined }, ok, failure_reason, counts: { claims: claims.length, tables: tables.length, evidence: evidence.length, notes: notes.length }, confirmations, available_sheets };
  });

  // 出站治理：批准 + 门检查（预览载荷随 S7 发布门重设计重建）
  app.post('/api/projects/:id/outbound/approve', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(OutboundModeRequestSchema, req.body);
    try {
      await workbench.approveOutbound(id, body.mode);
      return { ok: true };
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode ?? 500);
      return { ok: false, error: err.message };
    }
  });

  app.post('/api/projects/:id/outbound/check', async (req) => {
    const { id } = req.params as { id: string };
    const body = parseBody(OutboundModeRequestSchema, req.body);
    return workbench.checkOutbound(id, body.mode);
  });

  // AI 状态（设置页展示）：模型链 + 密钥存在性（零密钥内容）
  app.get('/api/ai/status', async () => {
    const chain = chainFromEnv();
    return {
      chain: chain.map((c) => `${c.provider}/${c.modelId}`),
      providers: chain.map((c) => ({ provider: c.provider, modelId: c.modelId, key: hasApiKey(c.provider) })),
      modelAvailable: modelChainAvailable(),
    };
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
