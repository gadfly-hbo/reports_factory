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

  // 第 2 步 读取理解：{source_id?} 缺省=全部待理解文件（G11 checkpoint 跳过已完成）
  app.post('/api/projects/:id/understand', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { source_id?: string };
    try {
      if (body.source_id) {
        const understanding = await workbench.understandSource(id, body.source_id);
        return { ok: true, understanding };
      }
      const result = await workbench.understandAllPending(id);
      return { ok: result.failed.length === 0, ...result };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number; needsApproval?: boolean });
    }
  });

  // 理解摘要读取（S4 框架生成 / S5 语义投影消费）
  app.get('/api/projects/:id/understanding', async (req) => {
    const { id } = req.params as { id: string };
    const work = await workbench.readWork(id);
    return { understanding: work.understanding ?? {} };
  });

  // 资料移除（M-U1）：原件+派生+摘要一并删；失败文件移除后解锁框架确认
  app.delete('/api/projects/:id/sources/:sid', async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    try {
      await workbench.removeSource(id, sid);
      return { ok: true };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 第 3 步 框架：生成（单发工人）/ 编辑（确认前）/ 确认（人决策点 1，锁定）
  app.post('/api/projects/:id/framework/generate', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const framework = await workbench.generateFramework(id);
      return { ok: true, framework };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number; needsApproval?: boolean });
    }
  });

  app.put('/api/projects/:id/framework', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = parseBody(z.object({ pages: z.array(z.object({
        page_id: z.string().optional(),
        title: z.string().min(1),
        page_type: z.string().min(1),
        intent: z.string().optional(),
        source_hint: z.array(z.string()).optional(),
      })).min(2).max(24) }), req.body);
      const framework = await workbench.updateFramework(id, body.pages);
      return { ok: true, framework };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number; needsApproval?: boolean });
    }
  });

  app.post('/api/projects/:id/framework/confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const framework = await workbench.confirmFramework(id);
      return { ok: true, framework };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 第 4 步 生成：{page_id?} 缺省=整套（checkpoint 跳过已完成页；指定页=页级重试）
  app.post('/api/projects/:id/pages/generate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { page_id?: string };
    try {
      const result = await workbench.generatePages(id, { page_id: body.page_id });
      return { ok: result.failed === 0, ...result };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number; needsApproval?: boolean });
    }
  });

  // 第 5 步 逐页编辑：手工直改（纯文字字段）/ agent 整页重写 / 删页
  app.put('/api/projects/:id/pages/:pid', async (req, reply) => {
    const { id, pid } = req.params as { id: string; pid: string };
    try {
      const body = parseBody(z.object({
        headline: z.string().min(1).optional(),
        bullets: z.array(z.object({ text: z.string().min(1), source_hint: z.string().optional() })).max(6).optional(),
        body: z.string().optional(),
        table_note: z.string().optional(),
      }), req.body);
      const draft = await workbench.updatePageManual(id, pid, body);
      return { ok: true, draft };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  app.post('/api/projects/:id/pages/:pid/rewrite', async (req, reply) => {
    const { id, pid } = req.params as { id: string; pid: string };
    try {
      const body = parseBody(z.object({ instruction: z.string().min(2).max(500) }), req.body);
      const draft = await workbench.rewritePage(id, pid, body.instruction);
      return { ok: true, draft };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number; needsApproval?: boolean });
    }
  });

  app.delete('/api/projects/:id/pages/:pid', async (req, reply) => {
    const { id, pid } = req.params as { id: string; pid: string };
    try {
      await workbench.deletePage(id, pid);
      return { ok: true };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 第 6 步 审核发布：隐私检查 + 批准 + 失效判定 + 三格式导出
  app.post('/api/projects/:id/privacy-check', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const report = await workbench.privacyCheck(id);
      return { ok: true, report };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  app.post('/api/projects/:id/approve-formal', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await workbench.approveFormalExport(id);
      return { ok: true };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  app.get('/api/projects/:id/approval-state', async (req) => {
    const { id } = req.params as { id: string };
    return workbench.approvalState(id);
  });

  app.post('/api/projects/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = parseBody(z.object({
        formats: z.array(z.enum(['pptx', 'html', 'pdf'])).min(1),
        level: z.enum(['internal', 'external']),
      }), req.body);
      const result = await workbench.exportPublish(id, { formats: body.formats, level: body.level });
      return { ok: true, ...result };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 导出产物文件下载
  app.get('/api/projects/:id/exports/:eid/file', async (req, reply) => {
    const { id, eid } = req.params as { id: string; eid: string };
    const rec = await store.getExport(id, eid);
    if (!rec) throw httpError(404, '导出记录不存在');
    try {
      const data = await readFile(join(store.root, id, rec.artifact_path));
      const mime = rec.format === 'html' ? 'text/html' : rec.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml';
      reply.type(mime);
      return reply.send(data);
    } catch (e) {
      throw httpError(404, `导出文件丢失：${(e as Error).message}`);
    }
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
