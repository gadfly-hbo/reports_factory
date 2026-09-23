import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { retailBundle, retailBundleRich, retailBrief, MAT } from './helpers/retail.js';

/**
 * S2（M4 编审模块）：发现卡片 + 任务书扩展 + 编审决定持久化。
 * 主 seam = API 注入层。发现卡片是 Claim/Metric/Evidence 的组合视图（不另建事实对象）。
 */

describe('S2 发现卡片与编审决定', () => {
  let app: FastifyInstance;
  let dir: string;
  let projectId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-ed-'));
    app = buildServer(new WorkspaceStore(dir));
    projectId = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '编审测试' } })).json().project.project_id;
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('发现卡片：组合 claim+metric+证据+限制/反证，默认候选；普通材料也有逻辑身份', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundle() });
    const md = (await readFile(join(MAT, 'conclusion.md'))).toString('base64');
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'conclusion.md', content_base64: md, kind: 'markdown', media_type: 'text/markdown' },
    });

    const res = await app.inject({ url: `/api/projects/${projectId}/findings` });
    expect(res.statusCode).toBe(200);
    const findings = res.json().findings;

    // bundle 发现：组合视图齐全
    const f01 = findings.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F01');
    expect(f01).toMatchObject({
      kind: 'computed_statement',
      text: '重点门店销售额同比下降 12%',
      verification_state: 'arithmetic_checked',
      placement: 'candidate',
    });
    expect(f01.metrics).toHaveLength(1);
    expect(f01.metrics[0]).toMatchObject({ value: -0.12, unit: 'ratio', scope: '重点门店销售额同比（同口径）' });
    expect(f01.evidence[0]).toMatchObject({ locator: 'sales_by_store.csv#合计行', excerpt: '重点门店合计 880（上期 1000）' });
    expect(f01.limitations).toContain('同口径对比，未剔除营业天数差异');

    const f02 = findings.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F02');
    expect(f02.counter_evidence).toContain('营业天数变化也可能解释部分下降');

    // 普通材料发现：逻辑身份按 source:local:<stem> 派生，同样进入卡片
    const md1 = findings.find((f: any) => f.logical_key === 'source:local:conclusion::c1');
    expect(md1).toBeDefined();
    expect(md1.placement).toBe('candidate');
  });

  it('编排决定：excluded 粘性（T06）、重启恢复（T21）、两份报告互不污染（T04）', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundle() });

    // 记录"本次不采用 F02"，带理由
    const dec = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/decisions`,
      payload: { decisions: [{ logical_key: 'bundle:xanthil:task_sales::F02', placement: 'excluded', reason: '因果未证实，正文不放推断' }] },
    });
    expect(dec.statusCode).toBe(200);
    expect(dec.json().decisions).toHaveLength(1);

    let findings = (await app.inject({ url: `/api/projects/${projectId}/findings` })).json().findings;
    const f02 = findings.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F02');
    expect(f02.placement).toBe('excluded');
    expect(f02.decision.reason).toContain('因果未证实');

    // T06 粘性：升级 bundle（F02 内容不变的新版本）后，决定不丢、不自动回正文
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/bundle`,
      payload: retailBundle({
        upstream: { project_id: 'proj_x', task_id: 'task_sales', run_id: 'run_2', result_revision: 'r2' },
        snapshot_id: 'snap_2',
        findings: [
          retailBundle().findings[0],
          retailBundle().findings[1],
          { finding_id: 'F03', kind: 'fact_statement', text: '部分下降来自营业天数变化', verification: 'bound_to_source' },
        ],
      }),
    });
    findings = (await app.inject({ url: `/api/projects/${projectId}/findings` })).json().findings;
    expect(findings.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F02').placement).toBe('excluded');
    expect(findings.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F03').placement).toBe('candidate');

    // T21 恢复：模拟重启（同 workspace 新服务实例）后决定仍在
    const app2 = buildServer(new WorkspaceStore(dir));
    const after = (await app2.inject({ url: `/api/projects/${projectId}/findings` })).json().findings;
    expect(after.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F02').placement).toBe('excluded');
    await app2.close();

    // T04 报告隔离：另一份 report_id 下同一发现可用不同编排，互不污染
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/decisions`,
      payload: { report_id: 'report_other', decisions: [{ logical_key: 'bundle:xanthil:task_sales::F02', placement: 'body' }] },
    });
    const mine = (await app.inject({ url: `/api/projects/${projectId}/findings` })).json().findings;
    const other = (await app.inject({ url: `/api/projects/${projectId}/findings?report_id=report_other` })).json().findings;
    expect(mine.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F02').placement).toBe('excluded');
    expect(other.find((f: any) => f.logical_key === 'bundle:xanthil:task_sales::F02').placement).toBe('body');
  });

  it('任务书扩展（F01）：核心问题/非重点/必要边界/交付隐私可保存并随组装进 spec；旧 brief 兼容', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundle() });
    const brief = {
      audience: '商品与运营负责人',
      purpose: '讨论是否批准有限范围的补货试点',
      page_budget: 5,
      core_question: '问题集中在哪里、证据支持到什么程度、是否值得试点、怎样控制风险',
      non_goals: ['全面复盘全部经营指标', '完整代码与中间计算进正文'],
      required_boundaries: ['缺货尚未被证明为销售下降主因'],
      delivery_privacy: 'internal',
    };
    const save = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief } });
    expect(save.statusCode).toBe(200);
    expect(save.json().ok).toBe(true);

    const outline = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline`, payload: { brief } });
    expect(outline.statusCode).toBe(200);
    const assemble = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });
    expect(assemble.statusCode).toBe(200);
    expect(assemble.json().spec.brief).toMatchObject({ core_question: brief.core_question, required_boundaries: brief.required_boundaries });

    // 重启恢复：brief 草稿在编审状态里持久化
    const app2 = buildServer(new WorkspaceStore(dir));
    const ed = (await app2.inject({ url: `/api/projects/${projectId}/editorial` })).json();
    expect(ed.brief.core_question).toBe(brief.core_question);
    await app2.close();

    // 旧 brief（无新字段）仍可走大纲（向后兼容）
    const legacy = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/outline`,
      payload: { brief: { audience: 'a', purpose: 'p', page_budget: 8 } },
    });
    expect(legacy.statusCode).toBe(200);
  });

  it('取舍推荐（F03）：按核心问题给正文/附录/不采用建议及理由；excluded 决定粘性（T06，K2 样板断言）', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundleRich() });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });

    const res = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` });
    expect(res.statusCode).toBe(200);
    const recs = res.json().recommendations;
    const byLogical = Object.fromEntries(recs.map((r: any) => [r.logical_key.split('::').at(-1), r]));

    // §15 预期集合：下降/缺货/试点建议进正文；无关维度不采用；口径进附录
    expect(byLogical.F01.placement).toBe('body');
    expect(byLogical.F01.reason).toContain('核心问题');
    expect(byLogical.F02.placement).toBe('body');
    expect(byLogical.F02.reason).toContain('待核实');
    expect(byLogical.F04.placement).toBe('body');
    expect(byLogical.F05.placement).toBe('excluded');
    expect(byLogical.F05.reason).toContain('无直接关联');
    expect(byLogical.F06.placement).toBe('appendix');

    // T06 粘性：用户已 excluded 的发现，再次推荐不自动翻回正文
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/decisions`,
      payload: { decisions: [{ logical_key: 'bundle:xanthil:task_sales::F02', placement: 'excluded', reason: '因果未证实' }] },
    });
    const again = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` })).json().recommendations;
    const f02again = Object.fromEntries(again.map((r: any) => [r.logical_key.split('::').at(-1), r])).F02;
    expect(f02again.placement).toBe('excluded');
    expect(f02again.sticky).toBe(true);
  });

  it('逐页蓝图与组装投影（F04/G5）：蓝图字段随页进 spec；excluded 发现不进报告正文', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundleRich() });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });
    // 采纳推荐（body/appendix/excluded 全部落决定）
    const recs = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` })).json().recommendations;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/decisions`, payload: { decisions: recs } });

    const outline = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/outline`, payload: { brief: retailBrief },
    })).json().draft;
    // 蓝图字段：每页有目的与核心信息
    expect(outline.pages[0].blueprint.page_purpose).toContain('待决');
    expect(outline.pages[0].blueprint.core_message).toBe(retailBrief.core_question);

    const spec = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} })).json().spec;
    // 投影：excluded（F05 会员复购）不进任何页面与 spec.claims
    const f05Id = spec.claims.find((c: any) => c.logical_key?.endsWith('::F05'))?.claim_id;
    expect(f05Id).toBeUndefined();
    const bodyClaimIds = spec.pages.flatMap((p: any) => p.claim_refs ?? []);
    expect(spec.claims.map((c: any) => c.logical_key).filter((k: string) => k?.endsWith('::F05'))).toHaveLength(0);
    // 正文发现仍在
    expect(spec.claims.some((c: any) => c.logical_key?.endsWith('::F01'))).toBe(true);
    expect(spec.pages.some((p: any) => p.blueprint?.page_purpose)).toBe(true);
    // 附录层保留口径说明（data_note→appendix）
    expect(spec.claims.some((c: any) => c.logical_key?.endsWith('::F06'))).toBe(true);
    expect(bodyClaimIds.length).toBeGreaterThan(0);
  });

  it('G1 编审关口（§8.1）：状态机强制；未批准正式导出阻断、草稿带标识（T07）', async () => {
    // 空项目直接批准 G1 → 拒绝（无蓝图可批）
    const early = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '编制者' } });
    expect(early.statusCode).toBe(400);

    // 走完整编审准备：bundle → brief → 采纳推荐 → 大纲 → 组装草稿
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundleRich() });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });
    const recs = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` })).json().recommendations;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/decisions`, payload: { decisions: recs } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline`, payload: { brief: retailBrief } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });

    // T07：G1 前正式导出被阻断（编审未批准不能冒充正式稿）；草稿可导且带标识
    const blocked = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(blocked.allowed).toBe(false);
    expect(JSON.stringify(blocked.checks.issues)).toContain('G1');
    const draftExport = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'draft', formats: ['html'] },
    })).json();
    expect(draftExport.allowed).toBe(true);
    expect(draftExport.exports[0].is_draft).toBe(true);

    // 状态机：blueprint_review（大纲已生成）
    const mid = (await app.inject({ url: `/api/projects/${projectId}/editorial` })).json();
    expect(mid.status).toBe('blueprint_review');

    // G1 批准：记录绑定批准人/任务书/蓝图/来源快照
    const approve = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '张编制' } });
    expect(approve.statusCode).toBe(200);
    const g1 = approve.json().approval;
    expect(g1.approver).toBe('张编制');
    expect(g1.brief_hash).toHaveLength(64);
    expect(g1.source_snapshot.length).toBeGreaterThan(0);
    expect(g1.blueprint_pages.length).toBeGreaterThan(0);
    expect(g1.approved_at).toBeTruthy();

    // G1 后正式导出通过 G1 门（其他检查项照常）；发布后状态 published
    const formal = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(formal.allowed).toBe(true);
    const final = (await app.inject({ url: `/api/projects/${projectId}/editorial` })).json();
    expect(final.status).toBe('published');
    expect(final.approval.revision_ids.length).toBeGreaterThan(0);
  });

  it('published 后修改派生新修订（G9/§8.3）：不回退覆盖，旧修订不动', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundleRich() });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });
    const recs = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` })).json().recommendations;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/decisions`, payload: { decisions: recs } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline`, payload: { brief: retailBrief } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '张编制' } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });
    const published = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(published.allowed).toBe(true);
    const publishedRevision = published.revisionId ?? (await app.inject({ url: `/api/projects/${projectId}` })).json().revisions.at(-1).revision_id;

    // 发布后修改：派生新修订，状态回 draft_editing（不把已发布版本退回可变草稿）
    const edit = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/edit`,
      payload: { op: { kind: 'edit_text', page_id: 'page_01', field: 'headline', text: '补货试点评审（修订）' } },
    });
    expect(edit.statusCode).toBe(200);
    const after = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const ids = after.revisions.map((r: any) => r.revision_id);
    expect(ids).toContain(publishedRevision); // 旧修订仍在且未被覆盖
    const status = (await app.inject({ url: `/api/projects/${projectId}/editorial` })).json().status;
    expect(status).toBe('draft_editing');
  });
});
