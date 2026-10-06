import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { TemplateConfigSchema, listTemplates, getTemplate, DEFAULT_TEMPLATE_ID } from '../src/schema/template.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { ingestAndSave } from '../src/ingest/persist.js';

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

  it('三模版各带合法 brand 预设（G4 色值）；非法色值注册被拒', () => {
    for (const t of listTemplates()) {
      expect(t.brand).toBeDefined();
      expect(t.brand!.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.brand!.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(getTemplate('ops_review_deck')!.brand!.primary).toBe('#b44626');
    expect(getTemplate('exec_summary_deck')!.brand!.primary).toBe('#263442');
    expect(getTemplate('research_doc')!.brand!.primary).toBe('#1f3a3d');
    const bad = { id: 'bad', name: '坏', description: 'd', deliverable_type: 'meeting_deck', page_plan: ['cover'], brand: { primary: 'red', accent: '#8f3820' } };
    expect(() => TemplateConfigSchema.parse(bad)).toThrow();
  });
});

describe('brand 预设应用优先级（S2）', () => {
  it('未自定义 brand 的项目生成后用模版预设；自定义覆盖预设', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'rs-brand-tpl-'));
    const store = new WorkspaceStore(dir);
    try {
      const wb = new WorkbenchService(store);
      const p1 = await store.createProject({ title: '预设生效' });
      await ingestAndSave(store, p1.project_id, {
        filename: 'conclusion.md',
        content: Buffer.from('## 结论\n上半年销售额同比下降 7.1%', 'utf-8'),
        kind: 'markdown', media_type: 'text/markdown',
      });
      await wb.generate(p1.project_id, { audience: 'a', purpose: 'p' });
      const work1 = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(join(dir, p1.project_id, 'work', 'state.json'), 'utf-8')));
      expect(work1.spec.theme?.brand?.primary).toBe('#b44626'); // ops_review_deck 预设

      // 自定义覆盖预设
      const p2 = await store.createProject({ title: '自定义覆盖', template_id: 'research_doc' });
      await store.updateProject(p2.project_id, { brand: { primary: '#123456', accent: '#654321' } });
      await wb.generate(p2.project_id, { audience: 'a', purpose: 'p' });
      const work2 = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(join(dir, p2.project_id, 'work', 'state.json'), 'utf-8')));
      expect(work2.spec.theme?.brand?.primary).toBe('#123456');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
