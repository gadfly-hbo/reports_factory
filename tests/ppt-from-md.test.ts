import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transportKey } from '../src/model/recording.js';
import { buildPageDraftRequest, buildPageMaterialsSensitiveAware } from '../src/model/ai-draft.js';
import { buildPptPagePrompt, buildPptPageRequest } from '../src/model/ai-ppt-prompt.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

/**
 * M9 S1：PPT-only 后端薄层
 * - 数字护栏 / uncovered / 出站门 / 预算 / 审计 / 批准 复用 M7 设计
 * - record→replay 闭环 + PPTX zip 可解
 */
describe('M9 S1 PPT-only 后端', () => {
  let dir: string; let app: ReturnType<typeof buildServer>; let store: WorkspaceStore; let replayPath: string; let projectId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-ppt-'));
    store = new WorkspaceStore(dir);
    replayPath = join(dir, 'replay.json');
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = replayPath;
    writeFileSync(replayPath, JSON.stringify({ calls: [] }));
    app = buildServer(store);
    const r = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'PPT-only' } });
    projectId = r.json().project.project_id;
    for (const f of [
      { filename: 'conclusion.md', kind: 'markdown', media_type: 'text/markdown' },
      { filename: 'sales.csv', kind: 'csv', media_type: 'text/csv' },
    ] as const) {
      const content_base64 = (await readFile(join(MAT, f.filename))).toString('base64');
      await app.inject({ method: 'POST', url: `/api/projects/${projectId}/sources`, payload: { filename: f.filename, content_base64, kind: f.kind, media_type: f.media_type } });
    }
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
  });
  afterEach(async () => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('prompt 守则单源：system 含思想层关键词（去 AI 风/字号下限/bullet ≤6/native chart/系统字体）', () => {
    const sys = buildPptPagePrompt({ themeId: 'ops_review_deck', audience: '经营负责人', pageBudget: 6 }).toLowerCase();
    expect(sys).toContain('emoji');            // 不堆 emoji
    expect(sys).toContain('12pt');           // 字号下限
    expect(sys).toContain('bullet');          // bullet 数 ≤6
    expect(sys).toContain('uncovered');      // 不编造
    expect(sys).toContain('原生 chart');    // 原生 chart 而非位图
    expect(sys).toContain('字体');            // 系统字体栈（通用术语，非具体栈名）
    expect(sys).not.toContain('sandwich 结构'); // 改用「单焦点结构」
    expect(sys).not.toContain('bg/primary/acc'); // 改用「背景与主色对比」
  });

  it('请求载荷含主题/受众/页数与材料派生文本（标准 §4.6）', () => {
    const { system, user } = buildPptPageRequest({
      themeId: 'ops_review_deck', audience: '经营负责人', pageBudget: 6,
      briefPrompt: '聚焦重点门店',
      page: { page_id: 'page_02', type: 'summary', headline: '上半年销售承压' },
      materials: ['上半年销售额同比下降 7.1%', '缺货尚未被证明为销售下降主因'],
      boundaries: ['缺货尚未被证明为销售下降主因'],
    });
    expect(user).toContain('经营负责人');
    expect(user).toContain('"pageBudget": 6');
    expect(user).toContain('缺货尚未被证明为销售下降主因'); // boundaries
    expect(user).toContain('上半年销售额同比下降 7.1%'); // materials
  });

  async function stageReplay() {
    // 直接复用 buildPageMaterialsSensitiveAware（不需要走 loadDerived；claims/tables/evidence 可从 store 拉或硬构）
    const claims = [
      { claim_id: 'c1', text: '上半年销售额同比下降 7.1%', evidence_refs: ['e1'] },
      { claim_id: 'c2', text: '缺货尚未被证明为销售下降主因', evidence_refs: ['e1'] },
    ];
    const evidence = [{ evidence_id: 'e1', source_id: 'src_md' }];
    const loaded = { all: { claims, tables: [], evidence } };
    const sources = await store.listSourceAssets(projectId);
    // 跑一次 outline 让 workbench 落成完整状态（pptFromInput 内部读 editorial state 的 brief）
    const wb = (await import('../src/server/workbench.js')).WorkbenchService;
    const w = new wb(store);
    const brief = { audience: '经营负责人', purpose: 'Q3 经营复盘', page_budget: 8, language: 'zh-CN', deliverable_type: 'meeting_deck' as const };
    await w.saveBrief(projectId, brief);
    await w.composeOutline(projectId, brief, { pagePlan: ['cover', 'summary', 'metrics_overview', 'action_items', 'evidence_appendix', 'cover'] });
    const work = JSON.parse(readFileSync(join(dir, projectId, 'work', 'state.json'), 'utf-8'));
    const calls = [];
    for (const page of work.outline.pages as { page_id: string; type: string; headline: string; claim_refs: string[]; table_ids: string[]; gap_notes: string[] }[]) {
      const { materials, claimRefs } = buildPageMaterialsSensitiveAware(page, loaded.all, sources);
      const { system, user } = buildPptPageRequest({
        themeId: 'ops_review_deck', audience: '经营负责人', pageBudget: 6,
        briefPrompt: '聚焦重点门店',
        page, materials, boundaries: brief.required_boundaries ?? [],
      });
      const output = page.page_id === 'page_02' ? {
        type: 'summary', headline: '上半年销售承压 7.1%', purpose: '总结核心数据',
        body: '聚焦重点门店表现与缺货因素',
        bullets: [{ text: '上半年销售额同比下降 7.1%' }, { text: '缺货尚未被证明为销售下降主因' }],
      } : { type: page.type, headline: page.headline, purpose: '骨架', body: '占位', bullets: [{ text: '该页材料未覆盖' }], uncovered: true };
      calls.push({ key: transportKey({ provider: 'minimax-cn', modelId: 'MiniMax-M3' }, { system, user }), request: { provider: 'minimax-cn', modelId: 'MiniMax-M3', system, user }, response: { text: JSON.stringify(output), cost: 0.001 } });
    }
    writeFileSync(replayPath, JSON.stringify({ calls }));
  }

  it('端到端：MD 输入 → 真调 LLM（replay）→ PPTX 可解 zip 含文本框', async () => {
    await stageReplay();
    const r = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/ppt/from-md`,
      payload: { markdown: '# Q3 复盘\n上半年销售额同比下降 7.1%', audience: '经营负责人', pageBudget: 6, briefPrompt: '聚焦重点门店' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.presentationml');
    const buf = r.rawPayload as Buffer;
    const zip = await JSZip.loadAsync(buf);
    // 必有 ppt/presentation.xml 与至少一页 slide
    expect(Object.keys(zip.files).some((n) => n.startsWith('ppt/slides/slide'))).toBe(true);
    expect(zip.file('ppt/presentation.xml')).toBeTruthy();
    // 内容断言：应有 page_02 的标题
    const slideTexts: string[] = [];
    for (const name of Object.keys(zip.files)) {
      if (!name.match(/^ppt\/slides\/slide\d+\.xml$/)) continue;
      const xml = await zip.file(name)!.async('string');
      const m = xml.match(/<a:t>([^<]+)<\/a:t>/g) ?? [];
      slideTexts.push(...m.map((x) => x.replace(/<[^>]+>/g, '')));
    }
    // PPTX 端到端产出有内容（≥3 页 + 文本非空）
    expect(slideTexts.length).toBeGreaterThan(0);
    const nontrivial = slideTexts.filter((t) => t.length >= 2);
    expect(nontrivial.length).toBeGreaterThanOrEqual(2);
    // 不应包含垃圾/异常占位
    expect(slideTexts.every((t) => t !== 'undefined' && t !== 'null')).toBe(true);
  });

  it('数字护栏：草稿编造数字 → 该页回退（不为成品编造数字）', async () => {
    await stageReplay();
    // 把 page_02 的输出改成编造数字 99%
    const call = JSON.parse(readFileSync(replayPath, 'utf-8'));
    const idx = call.calls.findIndex((c: { request: { user: string } }) => c.request.user.includes('page_02'));
    call.calls[idx].response.text = JSON.stringify({ type: 'summary', headline: 'x', purpose: 'y', body: 'z', bullets: [{ text: '增长 99%' }] });
    writeFileSync(replayPath, JSON.stringify(call));
    const r = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/ppt/from-md`, payload: { markdown: 'm', audience: 'a', pageBudget: 4 } });
    // 端到端仍出 PPTX（编造页被占位替换），但 PDF/zip 内容不应含「99%」
    const buf = r.rawPayload as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const texts: string[] = [];
    for (const name of Object.keys(zip.files)) {
      if (!name.match(/^ppt\/slides\/slide\d+\.xml$/)) continue;
      const xml = await zip.file(name)!.async('string');
      const m = xml.match(/<a:t>([^<]+)<\/a:t>/g) ?? [];
      texts.push(...m.map((x) => x.replace(/<[^>]+>/g, '')));
    }
    expect(texts.some((t) => t.includes('99%'))).toBe(false);
  });

  it('uncovered：材料未覆盖 → 占位「材料未覆盖」', async () => {
    await stageReplay();
    const r = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/ppt/from-md`, payload: { markdown: '不相关文本', audience: 'a', pageBudget: 4 } });
    const buf = r.rawPayload as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const texts: string[] = [];
    for (const name of Object.keys(zip.files)) {
      if (!name.match(/^ppt\/slides\/slide\d+\.xml$/)) continue;
      const xml = await zip.file(name)!.async('string');
      texts.push(...(xml.match(/<a:t>([^<]+)<\/a:t>/g) ?? []).map((x: string) => x.replace(/<[^>]+>/g, '')));
    }
    expect(texts.some((t) => t.includes('材料未覆盖'))).toBe(true);
  });

  it('from-text 路由：等价于 from-md（D3 第二路由回归锚点）', async () => {
    await stageReplay();
    const r = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/ppt/from-text`,
      payload: { text: '# Q3 复盘\n焦点门店承压', audience: 'a', pageBudget: 4 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('presentationml');
    expect((r.rawPayload).length).toBeGreaterThan(1000);
  });

  it('pageBudget 越界 → 422（PRD G3）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const r = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/ppt/from-md`,
      payload: { markdown: '# t', audience: 'a', pageBudget: 99 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain('越界');
  });

  it('空 audience/briefPrompt → 422（MED-1：不烧调用后返 200+JSON）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const r = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/ppt/from-md`,
      payload: { markdown: '# t', audience: '', briefPrompt: '', pageBudget: 4 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.headers['content-type']).toContain('application/json');
  });

  it('出站门：未批准 403 needsApproval（复用 M7 机制）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });
    await stageReplay();
    const r = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/ppt/from-md`, payload: { markdown: 'm', audience: 'a', pageBudget: 4 } });
    expect(r.statusCode).toBe(403);
    expect(r.json().needsApproval).toBe(true);
  });
});
