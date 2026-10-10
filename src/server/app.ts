import Fastify, { type FastifyInstance } from 'fastify';
import { readFile, unlink } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { WorkspaceStore } from '../storage/workspace.js';
import { ingestAndSave } from '../ingest/persist.js';
import { CreateProjectRequestSchema, SourceUploadRequestSchema } from '../schema/requests.js';
import { ZodError } from 'zod';
import { PrivacyPolicySchema } from '../schema/project.js';
import { candidateChain, modelChainAvailable, hasApiKey, MINIMAX_M3, MIMO_FLASH } from '../agent/model.js';
import { SessionHost } from '../agent/session-host.js';
import { indexMaterial, readManifest, removeMaterial } from '../agent/materials.js';
import { readOutline, updateOutlinePages, confirmOutline, validatePages } from '../agent/outline.js';
import { composeChatPrompt } from '../agent/prompts.js';
import { FileBudgetStore } from '../agent/budget-store.js';
import { qaDeck } from '../agent/qa-deck.js';
import { listDeckPages } from '../agent/deck-files.js';
import { buildDeckExports } from '../agent/export-deck.js';


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

/** 浏览器对 md/csv 等扩展名常给空 MIME；存储合同要求非空——按 kind 兜底。 */
const DEFAULT_MIME: Record<string, string> = {
  markdown: 'text/markdown', text: 'text/plain', csv: 'text/csv',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  image: 'image/png', table: 'application/octet-stream', bundle: 'application/json',
};

function replyGateError(reply: import('fastify').FastifyReply, err: Error & { statusCode?: number }) {
  reply.code(err.statusCode ?? 500);
  return { ok: false, error: err.message };
}

/** 本地服务（M10 纯 PPT 报告生成器）：六步 API + 静态托管构建后的 UI（web-dist） */
export function buildServer(store: WorkspaceStore, webDist?: string): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/projects', async () => {
    const projects = await store.listProjects();
    // M10 G6：只列 PPT 项目——旧报告项目（无 kind 字段）数据保留但不出现
    return { projects: projects.filter((p) => p.kind === 'ppt') };
  });

  app.post('/api/projects', async (req, reply) => {
    const body = parseBody(CreateProjectRequestSchema, req.body);
    const project = await store.createProject({ title: body.title, purpose: body.purpose });
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

  // 上传资料（S1 保留既有 ingest 通道；移除与理解在 S3 补齐）
  app.post('/api/projects/:id/sources', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(SourceUploadRequestSchema, req.body);
    const content = Buffer.from(body.content_base64, 'base64');
    const result = await ingestAndSave(store, id, {
      filename: body.filename,
      content,
      kind: body.kind,
      media_type: body.media_type || DEFAULT_MIME[body.kind] || 'application/octet-stream',
      sheet: body.sheet,
    });
    // T1 材料通道：提取文本落盘 + manifest 索引（单文件失败不牵连；图片走 vision 预理解）
    // vision 候选尽力而为：无密钥时文字材料仍可提取，图片按单文件失败明示
    const chain = (() => { try { return candidateChain().find((c) => c.model.input?.includes('image')); } catch { return undefined; } })();
    const material = await indexMaterial({
      projectRoot: resolve(store.root, id),
      asset: result,
      content,
      mediaType: body.media_type,
      ...(chain ? { vision: { transport: chain.transport, model: chain.model } } : {}),
    });
    const { ok, failure_reason, claims, evidence, tables, notes, confirmations, available_sheets } = result;
    return { source: { ...result, claims: undefined, evidence: undefined, tables: undefined, notes: undefined, confirmations: undefined, available_sheets: undefined }, ok, failure_reason, counts: { claims: claims.length, tables: tables.length, evidence: evidence.length, notes: notes.length }, confirmations, available_sheets, material };
  });

  // 材料索引（agent read 面 + UI 附件解析状态）
  app.get('/api/projects/:id/materials', async (req) => {
    const { id } = req.params as { id: string };
    return readManifest(resolve(store.root, id));
  });

  // ---- T2 框架提案（D9：提案卡 + 确认流）----
  app.get('/api/projects/:id/outline', async (req) => {
    const { id } = req.params as { id: string };
    return readOutline(resolve(store.root, id));
  });

  // 用户在提案卡编辑保存（同版本更新，G4）
  app.put('/api/projects/:id/outline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(z.object({ pages: z.unknown() }), req.body);
    try {
      const pages = validatePages(body.pages);
      const proposal = await updateOutlinePages(resolve(store.root, id), pages);
      return { ok: true, proposal };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 确认（人决策点）：快照基线 + 注入会话（注入尽力：无密钥时确认态仍持久，前端明示）
  app.post('/api/projects/:id/outline/confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const confirmed = await confirmOutline(resolve(store.root, id));
      let injected = false;
      let inject_error: string | undefined;
      try {
        const host = await getAgentHost(id);
        const r = await host.notifyOutlineConfirmed(confirmed.version, confirmed.pages);
        injected = true;
        void r;
      } catch (e) {
        inject_error = (e as Error).message.slice(0, 160);
      }
      return reply.code(injected ? 200 : 202).send({ ok: true, confirmed: true, ...confirmed, injected, ...(inject_error ? { inject_error } : {}) });
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 资料移除：原件+派生+manifest 一并删
  app.delete('/api/projects/:id/sources/:sid', async (req, reply) => {
    const { id, sid } = req.params as { id: string; sid: string };
    try {
      const asset = (await store.listSourceAssets(id)).find((a) => a.source_id === sid);
      if (!asset) throw httpError(404, `资料不存在：${sid}`);
      await store.deleteSourceAsset(id, sid);
      await removeMaterial(resolve(store.root, id), sid);
      return { ok: true };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // T5 deck 导出：三格式入 exports 记录（pptx=agent 工件直出；qa 建议随记录保存，不阻断）
  app.post('/api/projects/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const body = parseBody(z.object({ formats: z.array(z.enum(['pptx', 'html', 'pdf'])).min(1) }), req.body);
      const projectRoot = resolve(store.root, id);
      const qa = await qaDeck(projectRoot);
      const artifacts = await buildDeckExports(projectRoot, body.formats);
      const exports: Array<{ format: string; export_id: string }> = [];
      for (const e of artifacts) {
        const rec = await store.saveExport(id, {
          revision_id: 'deck',
          format: e.format,
          artifact: e.artifact,
          checks: { qa },
          is_draft: false,
        });
        exports.push({ format: e.format, export_id: rec.export_id });
      }
      return { ok: true, exports, qa };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // T5 质检（UI 质检卡数据源；agent 侧走 qa_deck 工具）
  app.get('/api/projects/:id/qa', async (req) => {
    const { id } = req.params as { id: string };
    return qaDeck(resolve(store.root, id));
  });

  app.get('/api/projects/:id/exports', async (req) => {
    const { id } = req.params as { id: string };
    return { exports: await store.listExports(id) };
  });

  // 导出产物文件下载
  app.get('/api/projects/:id/exports/:eid/file', async (req, reply) => {
    const { id, eid } = req.params as { id: string; eid: string };
    const rec = await store.getExport(id, eid);
    if (!rec) throw httpError(404, '导出记录不存在');
    try {
      const data = await readFile(join(store.root, id, rec.artifact_path));
      const mime = rec.format === 'html' ? 'text/html' : rec.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml';
      const ext = rec.format === 'html' ? 'html' : rec.format === 'pdf' ? 'pdf' : 'pptx';
      reply.type(mime);
      reply.header('content-disposition', `attachment; filename="report-${rec.export_id}.${ext}"`);
      return reply.send(data);
    } catch (e) {
      throw httpError(404, `导出文件丢失：${(e as Error).message}`);
    }
  });

  // AI 状态（设置页展示）：模型链 + 密钥存在性（零密钥内容）
  app.get('/api/ai/status', async () => {
    const models = [MINIMAX_M3, MIMO_FLASH];
    return {
      chain: models.map((m) => `${m.provider}/${m.id}`),
      providers: models.map((m) => ({ provider: m.provider, modelId: m.id, key: hasApiKey(m) })),
      modelAvailable: modelChainAvailable(),
    };
  });

  // ---- S2 Agent 会话宿主路由（聊天式入口；六步路由保留至 S6 清理）----

  const agentHosts = new Map<string, Promise<SessionHost>>();

  const getAgentHost = (projectId: string): Promise<SessionHost> => {
    let host = agentHosts.get(projectId);
    if (!host) {
      host = (async () => {
        const project = await store.getProject(projectId);
        if (!project) throw httpError(404, '项目不存在');
        const chain = candidateChain();
        return SessionHost.create({
          projectRoot: resolve(store.root, projectId),
          skillsDir: resolve(process.cwd(), 'assets', 'skills', 'ppt'),
          model: chain[0]!.model,
          transport: chain[0]!.transport,
          fallbacks: chain.slice(1).map((c) => ({ model: c.model, transport: c.transport })),
        });
      })();
      agentHosts.set(projectId, host);
      host.catch(() => agentHosts.delete(projectId));
    }
    return host;
  };

  // 发消息：无活动 run 开新 run（立即返回），活动 run 转 steer（对话式插话）
  app.post('/api/projects/:id/chat', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = parseBody(z.object({ text: z.string().min(1).max(20_000), page: z.string().regex(/^page_\d+$/).optional() }), req.body);
    try {
      const host = await getAgentHost(id);
      const r = await host.send(composeChatPrompt(body.text, body.page));
      return { ok: true, mode: r.mode, sessionId: host.sessionId };
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode === 404 ? 404 : err.message.includes('密钥') ? 503 : 500);
      return { ok: false, error: err.message };
    }
  });

  app.get('/api/projects/:id/agent/status', async (req) => {
    const { id } = req.params as { id: string };
    const pending = agentHosts.get(id);
    if (!pending) return { started: false, busy: false };
    const host = await pending;
    return { started: true, busy: host.isBusy(), sessionId: host.sessionId };
  });

  // 当前/最近一次 run 结果（前端轮询；R1-2：无活动 run 时返回最近 outcome 而非恒 active）
  app.get('/api/projects/:id/agent/result', async (req) => {
    const { id } = req.params as { id: string };
    const pending = agentHosts.get(id);
    if (!pending) return { active: false, status: 'idle' };
    const host = await pending;
    const r = await host.currentResult();
    if (r) return { active: true };
    const last = host.outcome();
    if (!last) return { active: false, status: 'idle' };
    return {
      active: false,
      status: last.status,
      reason: last.status === 'succeeded' || last.status === 'waiting' || last.status === 'suspended' ? undefined : last.reason,
      value: last.status === 'succeeded' ? last.value : undefined,
      usage: last.usage,
      usageKnown: last.usageKnown,
    };
  });

  // R1-3/R1-4 宿主恢复：释放残留 lease + 批准配置迁移 + 清理陈旧会话写锁（崩溃后可达）
  app.post('/api/projects/:id/agent/recover', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      if (!(await store.getProject(id))) throw httpError(404, '项目不存在');
      const budget = new FileBudgetStore(join(store.root, 'agent-budget.json'));
      const taskId = `task_${id}`;
      const usage = budget.usageOf(taskId);
      await budget.releaseActive(taskId, 'api-recover');
      budget.forceNextClaim(taskId, 'api-recover');
      // 陈旧会话写锁：持锁进程已死则清理（活锁不动）
      const lockPath = join(store.root, id, 'session', '.writer-lock');
      let lockCleaned = false;
      try {
        const pid = Number.parseInt((await readFile(lockPath, 'utf-8')).trim(), 10);
        try { process.kill(pid, 0); } catch { await unlink(lockPath); lockCleaned = true; }
      } catch { /* 无锁或读失败 */ }
      return { ok: true, had_usage: !!usage, lock_cleaned: lockCleaned };
    } catch (e) {
      return replyGateError(reply, e as Error & { statusCode?: number });
    }
  });

  // 任务用量快照（W7 运行详情：调用/工具/token/时长）
  app.get('/api/projects/:id/agent/usage', async (req) => {
    const { id } = req.params as { id: string };
    try {
      const budget = new FileBudgetStore(join(store.root, 'agent-budget.json'));
      return { usage: budget.usageOf(`task_${id}`) };
    } catch {
      return { usage: null };
    }
  });

  app.post('/api/projects/:id/agent/stop', async (req) => {
    const { id } = req.params as { id: string };
    const pending = agentHosts.get(id);
    if (!pending) return { ok: true };
    await (await pending).control({ kind: 'abort' });
    return { ok: true };
  });

  // T6：历史惰性建 host——服务重启后无需先发消息即可恢复线程（host.list 找回 JSONL 会话）
  app.get('/api/projects/:id/agent/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const host = await getAgentHost(id);
      return { entries: await host.history() };
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      reply.code(err.statusCode === 404 ? 404 : err.message.includes('密钥') ? 503 : 500);
      return { entries: [], error: err.message };
    }
  });

  // SSE：真实运行事件流（零内容——工具名/模型/原因，不含 prompt 与回复）
  app.get('/api/projects/:id/agent/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const host = await getAgentHost(id);
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    reply.raw.write('retry: 2000\n\n');
    for (const e of host.recentEvents()) reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    const unsub = host.subscribe((e) => {
      try { reply.raw.write(`data: ${JSON.stringify(e)}\n\n`); } catch { /* 连接已关闭 */ }
    });
    req.raw.on('close', () => unsub());
  });

  // ---- T3 deck 产物：页列表 + 页预览 PNG ----
  app.get('/api/projects/:id/deck', async (req) => {
    const { id } = req.params as { id: string };
    const deckDir = join(resolve(store.root, id), 'deck');
    const pptxPath = join(deckDir, 'deck.pptx');
    const pages = (await listDeckPages(resolve(store.root, id))).map((p) => ({ name: p.name, preview_ready: !!p.html, bytes: p.bytes }));
    let pptx: { exists: boolean; bytes: number } | null = null;
    if (existsSync(pptxPath)) {
      pptx = { exists: true, bytes: statSync(pptxPath).size };
    }
    return { pages, pptx };
  });

  app.get('/api/projects/:id/deck/preview/:page', async (req, reply) => {
    const { id, page } = req.params as { id: string; page: string };
    if (!/^page_[\w-]+$/.test(page)) { reply.code(400); return { ok: false, error: '页名非法' }; }
    const projectRoot = resolve(store.root, id);
    const pages = await listDeckPages(projectRoot);
    const entry = pages.find((p) => p.name === page);
    const htmlPath = entry?.html ? join(projectRoot, entry.html) : join(projectRoot, 'deck', 'pages', `${page}.html`);
    const mjsPath = entry ? join(projectRoot, entry.code) : join(projectRoot, 'deck', 'pages', `${page}.mjs`);
    if (!existsSync(htmlPath) && !existsSync(mjsPath)) { reply.code(404); return { ok: false, error: '该页不存在' }; }
    try {
      const { renderHtmlFilePng, fallbackPreviewHtml } = await import('../agent/deck-preview.js');
      const { readFile } = await import('node:fs/promises');
      const png = existsSync(htmlPath)
        ? await renderHtmlFilePng(htmlPath)
        : await (await import('../agent/deck-preview.js')).shootHtml(fallbackPreviewHtml(await readFile(mjsPath, 'utf-8'), page));
      reply.type('image/png');
      reply.header('cache-control', 'no-store');
      return reply.send(png);
    } catch (e) {
      reply.code(500);
      return { ok: false, error: (e as Error).message.slice(0, 160) };
    }
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
