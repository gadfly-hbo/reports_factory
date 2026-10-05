import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { TemplateConfigSchema, listTemplates, getTemplate, DEFAULT_TEMPLATE_ID } from '../src/schema/template.js';

describe('模版注册表与选择（S1）', () => {
  it('注册表含 3 个模版，页型序列全部合法，id 唯一', () => {
    const templates = listTemplates();
    expect(templates).toHaveLength(3);
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
    for (const t of templates) {
      expect(() => TemplateConfigSchema.parse(t)).not.toThrow();
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.page_plan.length).toBeGreaterThan(0);
    }
    // 首批模版：经营复盘 deck / 执行摘要 deck / 研究报告 doc
    expect(ids).toContain(DEFAULT_TEMPLATE_ID);
    expect(templates.map((t) => t.deliverable_type).sort()).toEqual(
      ['executive_summary', 'meeting_deck', 'research_report'],
    );
  });

  it('非法页型的模版被 schema 拒绝（注册不被污染）', () => {
    const bad = {
      id: 'bad',
      name: '坏模版',
      description: 'desc',
      deliverable_type: 'meeting_deck',
      page_plan: ['cover', 'no_such_page_type'],
    };
    expect(() => TemplateConfigSchema.parse(bad)).toThrow();
  });

  it('查不存在的模版返回 undefined', () => {
    expect(getTemplate('nope')).toBeUndefined();
    expect(getTemplate(DEFAULT_TEMPLATE_ID)).toBeDefined();
  });
});

describe('模版选择 API（S1）', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-tpl-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/templates 返回模版列表（含结构预览与适用场景）', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/templates' });
    expect(res.statusCode).toBe(200);
    const { templates } = res.json();
    expect(templates).toHaveLength(3);
    for (const t of templates) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
      expect(Array.isArray(t.page_plan)).toBe(true);
    }
  });

  it('建项目时可选模版并持久化，详情回显 template_id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '选模版测试', template_id: 'research_doc' },
    });
    expect(createRes.statusCode).toBe(200);
    const project = createRes.json().project;
    expect(project.template_id).toBe('research_doc');
    const detail = (await app.inject({ url: `/api/projects/${project.project_id}` })).json();
    expect(detail.project.template_id).toBe('research_doc');
  });

  it('未指定模版时缺省回退经营复盘 deck', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '缺省模版' } });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json().project.template_id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('不存在的 template_id 被拒（400）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '坏模版', template_id: 'no_such_template' },
    });
    expect(res.statusCode).toBe(400);
  });
});
