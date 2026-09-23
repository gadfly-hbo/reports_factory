import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { retailBundleRich, retailBrief } from './helpers/retail.js';

/**
 * S5（M4 编审模块）：变更控制器 + 字段级锁定。
 * 单一变更通道：/propose（expected_revision + 锁定 + 范围检查 + 原子应用 + 审计），
 * /edit 保留为控制器薄壳（G2：G1 前自动应用留审计）。
 */

async function setupEditorialProject(app: FastifyInstance, projectId: string): Promise<void> {
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundleRich() });
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });
  const recs = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` })).json().recommendations;
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/decisions`, payload: { decisions: recs } });
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline`, payload: { brief: retailBrief } });
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '张编制' } });
  await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });
}

describe('S5 变更控制器与字段锁定', () => {
  let app: FastifyInstance;
  let dir: string;
  let projectId: string;
  let currentRevision: () => Promise<string>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-prop-'));
    app = buildServer(new WorkspaceStore(dir));
    projectId = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '提案测试' } })).json().project.project_id;
    currentRevision = async () => {
      const d = (await app.inject({ url: `/api/projects/${projectId}` })).json();
      return d.spec.revision_id as string;
    };
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('受控修改（T08）：只精简一页文字，范围外内容/数字/绑定零漂移；字段锁生效', async () => {
    await setupEditorialProject(app, projectId);
    const before = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;

    const res = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: {
        op: { kind: 'edit_text', page_id: 'page_02', field: 'body', text: '下降集中在部分重点门店（精简表述）' },
        expected_revision: before.revision_id,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const after = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    // 范围外零漂移：其他页逐字段一致，指标与声明不动
    for (const page of after.pages) {
      if (page.page_id === 'page_02') continue;
      const prev = before.pages.find((p: any) => p.page_id === page.page_id);
      expect(page).toEqual(prev);
    }
    expect(after.metrics).toEqual(before.metrics);
    expect(after.claims).toEqual(before.claims);

    // 审计：提案记录留痕（auto/applied + before/after）
    const proposals = (await app.inject({ url: `/api/projects/${projectId}/proposals` })).json().proposals;
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ expected_revision: before.revision_id, state: 'applied' });
    expect(proposals[0].changes[0]).toMatchObject({ object_id: 'page_02', field: 'body' });

    // 字段锁：锁定 page_02 标题后，改标题被拒（422），内容原样（原子性）
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'set_locks', page_id: 'page_02', locks: { headline: true } }, expected_revision: await currentRevision() },
    });
    const locked = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'edit_text', page_id: 'page_02', field: 'headline', text: '新标题' }, expected_revision: await currentRevision() },
    });
    expect(locked.statusCode).toBe(422);
    expect(locked.json().state).toBe('rejected');
    const untouched = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    expect(untouched.pages.find((p: any) => p.page_id === 'page_02').headline).not.toBe('新标题');
  });

  it('版本冲突（T15）：编辑期间旧提案到达被拒；页序锁与 G1 后实质变更同样被拒', async () => {
    await setupEditorialProject(app, projectId);
    const rev1 = await currentRevision();
    // 先应用一笔修改（修订前进）
    const first = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'edit_text', page_id: 'page_02', field: 'body', text: '第一笔修改' }, expected_revision: rev1 },
    });
    expect(first.statusCode).toBe(200);
    const rev2 = await currentRevision();
    expect(rev2).not.toBe(rev1);

    // 旧提案（拿着 rev1）再提交 → 409 stale，附当前修订供协调
    const stale = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'edit_text', page_id: 'page_03', field: 'body', text: '旧结果覆盖' }, expected_revision: rev1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().state).toBe('stale');
    expect(stale.json().current_revision).toBe(rev2);
    // 旧提案的目标内容未写入（原子性）
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    expect(spec.pages.find((p: any) => p.page_id === 'page_03').body ?? '').not.toContain('旧结果覆盖');

    // 页序锁：报告级 page_order 锁定后 reorder 被拒
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'set_report_locks', locks: { page_order: true } }, expected_revision: rev2 },
    });
    const order = spec.pages.map((p: any) => p.page_id);
    const reorder = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'reorder', order: [order[1]!, order[0]!, ...order.slice(2)] }, expected_revision: await currentRevision() },
    });
    expect(reorder.statusCode).toBe(422);

    // G1 后实质变更：重生成整页被拒（需重新编审），精简文字仍可（§8.4）
    const regen = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'regenerate_page', page_id: 'page_02' }, expected_revision: await currentRevision() },
    });
    expect(regen.statusCode).toBe(422);
    expect(regen.json().reason).toContain('实质变更');
    const trim = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'edit_text', page_id: 'page_02', field: 'body', text: '精简后的表述' }, expected_revision: await currentRevision() },
    });
    expect(trim.statusCode).toBe(200);

    // 审计完整：stale 与 rejected 也留痕
    const proposals = (await app.inject({ url: `/api/projects/${projectId}/proposals` })).json().proposals;
    const states = proposals.map((p: any) => p.state);
    expect(states).toContain('stale');
    expect(states).toContain('rejected');
    expect(states).toContain('applied');
  });

  it('版本更新候选与待复核（T10/T11）：新结果不自动改写；关键陈述变化阻断正式发布', async () => {
    await setupEditorialProject(app, projectId);
    const specBefore = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;

    // v2：F02（正文第 2/5 页引用）结论变化 + 新增 F03
    const rich = retailBundleRich();
    const v2 = retailBundleRich({
      upstream: { project_id: 'proj_x', task_id: 'task_sales', run_id: 'run_2', result_revision: 'r2' },
      snapshot_id: 'snap_2',
      findings: [
        ...(rich.findings as any[]).filter((f) => f.finding_id !== 'F02'),
        { finding_id: 'F02', kind: 'inference', text: '新证据显示缺货对下降的贡献显著减弱（r2 修正）', verification: 'unverified' },
        { finding_id: 'F03', kind: 'fact_statement', text: '部分下降来自营业天数变化', verification: 'bound_to_source' },
      ],
    });
    const imp = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: v2 })).json();
    expect(imp.ok).toBe(true);
    expect(imp.update.changed).toContain('bundle:xanthil:task_sales::F02');

    // T10：已确认报告未被自动改写（正文原样）；新发现只进候选区
    const specAfter = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    expect(specAfter.pages).toEqual(specBefore.pages);
    const findings = (await app.inject({ url: `/api/projects/${projectId}/findings` })).json().findings;
    expect(findings.find((f: any) => f.logical_key.endsWith('::F03')).placement).toBe('candidate');

    // T11：受影响页进入待复核（引用 F02 的第 2/5 页），正式导出被阻断
    const ed = (await app.inject({ url: `/api/projects/${projectId}/editorial` })).json();
    expect(ed.pending_review.affected_pages).toEqual(expect.arrayContaining(['page_02', 'page_05']));
    const blocked = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(blocked.allowed).toBe(false);
    expect(JSON.stringify(blocked.checks.issues)).toContain('待复核');
    // 草稿仍可导出（带标识）
    const draftOk = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'draft', formats: ['html'] },
    })).json();
    expect(draftOk.allowed).toBe(true);

    // 处理待复核（用户复核后解除）→ 正式导出恢复
    const resolve = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/pending-updates/resolve`,
      payload: { logical_keys: ['bundle:xanthil:task_sales::F02'] },
    });
    expect(resolve.statusCode).toBe(200);
    const formalOk = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(formalOk.allowed).toBe(true);
  });

  it('补证闭环（F07/§5.4）：草拟→批准→导出→结果回流；request_id 幂等（T16/T17）', async () => {
    await setupEditorialProject(app, projectId);

    // 草拟：问"还需要验证什么"，不预设结论
    const created = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/evidence-requests`,
      payload: { question: '缺货对销售下降的贡献需要量化验证', gap: '当前仅有相关性证据', affected_objects: ['page_05'], required_evidence: '同期缺货率与销量的分组对比，不限定结论方向' },
    })).json();
    expect(created.request.state).toBe('draft');
    const requestId = created.request.request_id;

    // T17 幂等：同 request_id 重复提交不重复创建
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/evidence-requests`,
      payload: { request_id: requestId, question: '缺货对销售下降的贡献需要量化验证' },
    });
    expect((await app.inject({ url: `/api/projects/${projectId}/evidence-requests` })).json().requests).toHaveLength(1);

    // T16 批准：记录批准人；批准 ≠ 授权执行（无任何执行动作被触发）
    const approve = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/evidence-requests/${requestId}/approve`,
      payload: { approver: '张编制' },
    })).json();
    expect(approve.request.state).toBe('approved');
    expect(approve.request.user_approval.approver).toBe('张编制');

    // 无上游连接：导出为文件，状态 exported
    const exported = await app.inject({ url: `/api/projects/${projectId}/evidence-requests/${requestId}/export` });
    expect(exported.statusCode).toBe(200);
    const body = exported.json();
    expect(body.request_id).toBe(requestId);
    expect(body.question).toContain('量化验证');
    const afterExport = (await app.inject({ url: `/api/projects/${projectId}/evidence-requests` })).json().requests[0];
    expect(afterExport.state).toBe('exported');

    // 结果回流（G8）：带 origin 的成果包导入 → 请求 returned + result_refs 关联 + 新证据进候选区
    const resultBundle = retailBundleRich({
      bundle_id: 'bundle_ev2',
      upstream: { task_id: 'task_ev', result_revision: 'r1' },
      origin: { evidence_request_id: requestId },
      findings: [{ finding_id: 'E01R', kind: 'computed_statement', text: '缺货组与非缺货组下降幅度差异 3.2pct（待复核）', verification: 'arithmetic_checked' }],
    });
    const imp = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: resultBundle })).json();
    expect(imp.ok).toBe(true);
    const finalReq = (await app.inject({ url: `/api/projects/${projectId}/evidence-requests` })).json().requests[0];
    expect(finalReq.state).toBe('returned');
    expect(finalReq.result_refs).toContain(imp.source.source_id);
  });

  it('空发现的补证结果也可解除待复核（N1 回归）', async () => {
    await setupEditorialProject(app, projectId);
    const created = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/evidence-requests`,
      payload: { question: '验证缺货贡献', affected_objects: ['page_05'] },
    })).json();
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/evidence-requests/${created.request.request_id}/approve`,
      payload: { approver: '张编制' },
    });
    // 结果包：零发现（"没有新证据"也是合法结果）——但受影响页须可解除
    const emptyResult = retailBundleRich({
      bundle_id: 'bundle_ev_empty',
      upstream: { task_id: 'task_ev_empty', result_revision: 'r1' },
      origin: { evidence_request_id: created.request.request_id },
      findings: [],
      metrics: [],
      evidence: [],
    });
    const imp = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: emptyResult })).json();
    expect(imp.ok).toBe(true);
    const ed = (await app.inject({ url: `/api/projects/${projectId}/editorial` })).json();
    expect(ed.pending_review.affected_pages).toContain('page_05');
    const blocked = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(blocked.allowed).toBe(false);
    // 按受影响页解除（键为空的更新也能解除）
    const resolve = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/pending-updates/resolve`,
      payload: { affected_pages: ['page_05'] },
    });
    expect(resolve.statusCode).toBe(200);
    const formalOk = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(formalOk.allowed).toBe(true);
  });

  it('G2 扩展检查：必要限制正文可见（T13）与因果措辞升级提示（T12）', async () => {
    // 带必要边界的任务书 → 组装：边界必须进入正文层（§7.3 不能只藏附录）
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/bundle`, payload: retailBundleRich() });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });
    const recs = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/recommend` })).json().recommendations;
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/decisions`, payload: { decisions: recs } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outline`, payload: { brief: retailBrief } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '张编制' } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });

    const ok = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(ok.allowed).toBe(true); // 边界已随组装进入正文层

    // T13：任务书追加必要边界但未重组装 → 边界在正文缺失 → blocker
    const briefWithExtra = { ...retailBrief, required_boundaries: [...retailBrief.required_boundaries, '试点必须包含停止条件'] };
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: briefWithExtra } });
    const blocked = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(blocked.allowed).toBe(false);
    const issue = blocked.checks.issues.find((i: any) => i.id === 'editorial_boundary_visibility');
    expect(issue.severity).toBe('blocker');
    expect(issue.message).toContain('停止条件');
    // 草稿仍可（带标识）
    expect((await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'draft', formats: ['html'] },
    })).json().allowed).toBe(true);

    // T12：推断类发现配确定性因果标题 → warning 提示降级措辞
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief`, payload: { brief: retailBrief } });
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const inferencePage = spec.pages.find((p: any) => (p.claim_refs ?? []).some((id: string) => {
      const c = spec.claims.find((x: any) => x.claim_id === id);
      return c?.kind === 'inference';
    }));
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'edit_text', page_id: inferencePage.page_id, field: 'headline', text: '缺货导致门店销售下降' }, expected_revision: spec.revision_id },
    });
    const warned = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks`, payload: {} })).json();
    const causal = warned.issues.find((i: any) => i.id === 'editorial_causal_overclaim');
    expect(causal).toBeDefined();
    expect(causal.severity).toBe('warning');
  });

  it('批准范围漂移（§8.4/§12.3）与回执（T23/T24）：页序变更超出精简范围需重批；旧交付标过时不改文件', async () => {
    await setupEditorialProject(app, projectId);
    // 首次正式导出 → 回执 formal
    const first = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(first.allowed).toBe(true);
    const firstExportId = first.exports[0].export_id;
    const receiptA = (await app.inject({ url: `/api/projects/${projectId}/exports/${firstExportId}/receipt` })).json();
    expect(receiptA).toMatchObject({ export_id: firstExportId, delivery_status: 'formal' });
    expect(receiptA.artifact_hash).toHaveLength(64);
    const hashA = receiptA.artifact_hash;

    // T24：修改后再发布 → 旧回执标 superseded，文件哈希不变（不静默重写旧交付）
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: {
        op: { kind: 'edit_text', page_id: 'page_02', field: 'body', text: '更精简的结论表述' },
        expected_revision: (await app.inject({ url: `/api/projects/${projectId}` })).json().spec.revision_id,
      },
    });
    const second = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(second.allowed).toBe(true);
    const receiptA2 = (await app.inject({ url: `/api/projects/${projectId}/exports/${firstExportId}/receipt` })).json();
    expect(receiptA2.delivery_status).toBe('superseded');
    expect(receiptA2.artifact_hash).toBe(hashA); // T23：旧文件保留，回执幂等可重取

    // 漂移：页序调整超出"局部语言精简"范围 → 正式发布阻断（需重新 G1）
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const order = spec.pages.map((p: any) => p.page_id);
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: { kind: 'reorder', order: [order[1]!, order[0]!, ...order.slice(2)] }, expected_revision: spec.revision_id },
    });
    const driftBlocked = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(driftBlocked.allowed).toBe(false);
    expect(driftBlocked.checks.issues.some((i: any) => i.id === 'editorial_scope_drift')).toBe(true);

    // 重新 G1 → 重组装（刷新基线）→ 正式导出恢复
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '张编制' } });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/assemble`, payload: {} });
    const recovered = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['html'] },
    })).json();
    expect(recovered.allowed).toBe(true);
  });
});
