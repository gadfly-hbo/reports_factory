/* 编审阶段(M4):任务书(核心问题/必要边界) → 发现卡片与取舍 → 逐页蓝图 → G1 人工编审 → 组装。
   决定持久化在服务端 editorial 状态,重开可恢复;Agent(确定性)只推荐,编制者决定。 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { useToast } from '../state/toast';
import { api } from '../state/api';
import Chip from '../components/Chip';
import Empty from '../components/Empty';
import type { EditorialStateT, FindingCardT, OutlineDraft, OutboundPreview, Placement } from '../state/types';
import { EDITORIAL_STATUS_LABEL, KIND_LABEL, PLACEMENT_LABEL, VERIF_CHIP, VERIF_LABEL } from '../state/types';

const PLACEMENTS: Placement[] = ['candidate', 'body', 'appendix', 'excluded', 'deferred', 'speaker_notes'];
const PLACEMENT_CHIP: Record<string, string> = {
  candidate: 'chip-warn', body: 'chip-ok', appendix: 'chip-accent', excluded: '', deferred: 'chip-warn', speaker_notes: 'chip-accent',
};

const lines = (v: string): string[] => v.split('\n').map((x) => x.trim()).filter(Boolean);

export function EditorialView() {
  const p = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const d = p.detail;

  const [brief, setBrief] = useState({
    audience: '商品与运营负责人',
    purpose: '上半年经营复盘与方案讨论',
    page_budget: 8,
    deliverable_type: 'meeting_deck' as 'meeting_deck' | 'research_report',
    core_question: '',
    non_goals: '',
    required_boundaries: '',
  });
  const [findings, setFindings] = useState<FindingCardT[]>([]);
  const [recs, setRecs] = useState<Record<string, { placement: string; reason: string; sticky?: boolean }>>({});
  const [draft, setDraft] = useState<OutlineDraft | null>(null);
  const [approver, setApprover] = useState('');
  const [g1Warnings, setG1Warnings] = useState<string[]>([]);
  const [ed, setEd] = useState<EditorialStateT | null>(null);
  const [aiPreview, setAiPreview] = useState<{ data: OutboundPreview; mode: 'structure-only' | 'authorized-summary' } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [recSource, setRecSource] = useState<'ai' | 'rules' | null>(null);

  // 恢复编审状态(T21:任务书草稿/状态机/待复核)与发现卡片
  useEffect(() => {
    void api<EditorialStateT>(`/api/projects/${p.id}/editorial`).then((state) => {
      setEd(state);
      if (state.brief !== undefined) {
        const b = state.brief;
        setBrief((prev) => ({
          ...prev,
          audience: typeof b['audience'] === 'string' ? b['audience'] : prev.audience,
          purpose: typeof b['purpose'] === 'string' ? b['purpose'] : prev.purpose,
          page_budget: typeof b['page_budget'] === 'number' ? b['page_budget'] : prev.page_budget,
          deliverable_type: b['deliverable_type'] === 'research_report' ? 'research_report' : prev.deliverable_type,
          core_question: typeof b['core_question'] === 'string' ? b['core_question'] : '',
          non_goals: Array.isArray(b['non_goals']) ? (b['non_goals'] as string[]).join('\n') : '',
          required_boundaries: Array.isArray(b['required_boundaries']) ? (b['required_boundaries'] as string[]).join('\n') : '',
        }));
      }
    }).catch(() => { /* 编审态不存在=新项目 */ });
    void api<{ findings: FindingCardT[] }>(`/api/projects/${p.id}/findings`).then((r) => setFindings(r.findings)).catch(() => {});
  }, [p.id]);

  const placementOf = (f: FindingCardT): string => recs[f.logical_key]?.placement ?? f.placement;
  const reasonOf = (f: FindingCardT): string | undefined => recs[f.logical_key]?.reason ?? f.decision?.reason;

  /** 文本域(每行一条) → 数组;任务书保存与蓝图生成共用同一规范化形态 */
  const normalizedBrief = {
    ...brief,
    non_goals: lines(brief.non_goals),
    required_boundaries: lines(brief.required_boundaries),
  };

  const doRecommend = async () => {
    const r = await p.recommend();
    if (!r) return;
    setRecs(Object.fromEntries(r.map((x) => [x.logical_key, { placement: x.placement, reason: x.reason, sticky: x.sticky }])));
    toast.show(`已给出取舍建议(确定性规则):正文/附录/不采用——请调整为你的决定后采纳`, 'ok');
  };

  const doAdopt = async () => {
    const decisions = findings.map((f) => ({
      logical_key: f.logical_key,
      placement: placementOf(f),
      ...(reasonOf(f) ? { reason: reasonOf(f) } : {}),
    }));
    if (await p.decide(decisions)) toast.show('编排决定已保存(按报告隔离,不改变发现的事实状态)', 'ok');
  };

  const generate = async () => {
    const r = await p.composeOutline(normalizedBrief);
    if (r) {
      setDraft(r);
      const conflictQs = r.open_questions.filter((q) => q.kind === 'conflict');
      toast.show(conflictQs.length > 0 ? `蓝图已生成(${r.pages.length} 页),但有 ${conflictQs.length} 项材料冲突需先处理` : `蓝图已生成(${r.pages.length} 页),确认后进入 G1`, conflictQs.length > 0 ? 'fail' : 'ok');
    }
  };

  /** M5 AI 蓝图（仅结构模式）：先取预览给用户看将发送什么；批准后调用；失败自动回退规则版 */
  const generateAI = async () => {
    setAiBusy(true);
    try {
      const r = await p.composeOutlineAI(normalizedBrief);
      if (!r) return;
      if (r.needsApproval || !r.draft || !r.ai) {
        const pv = await p.outboundPreview('structure-only');
        if (pv) setAiPreview({ data: pv, mode: 'structure-only' });
        return;
      }
      setDraft(r.draft);
      if (r.ai.usedFallback) {
        toast.show(`模型不可用,已自动回退规则版蓝图(${r.draft.pages.length} 页)——原因:${r.ai.reason?.slice(0, 60) ?? '未知'}`, 'fail');
      } else {
        toast.show(`AI 蓝图已生成(${r.draft.pages.length} 页,${r.ai.provider})——claim 绑定为本地确定性规则`, 'ok');
      }
    } finally {
      setAiBusy(false);
    }
  };

  /** M5 AI 取舍推荐（授权摘要）：403 → 预览授权摘要；失败回退规则版并明示 */
  const doRecommendAI = async () => {
    setAiBusy(true);
    try {
      const r = await p.recommendAI();
      if (!r) return;
      if (r.needsApproval || !r.recommendations || !r.source || !r.ai) {
        const pv = await p.outboundPreview('authorized-summary');
        if (pv) setAiPreview({ data: pv, mode: 'authorized-summary' });
        return;
      }
      setRecs(Object.fromEntries(r.recommendations.map((x) => [x.logical_key, { placement: x.placement, reason: x.reason, sticky: x.sticky }])));
      setRecSource(r.source);
      if (r.ai.usedFallback) {
        toast.show(`模型不可用,已自动回退规则版推荐——原因:${r.ai.reason?.slice(0, 60) ?? '未知'}`, 'fail');
      } else {
        toast.show(`AI 推荐已给出(${r.ai.provider})——模型建议不翻案你的既有决定`, 'ok');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const approveAndRun = async () => {
    if (!aiPreview) return;
    const { mode } = aiPreview;
    if (await p.approveOutbound(mode)) {
      setAiPreview(null);
      if (mode === 'structure-only') await generateAI();
      else await doRecommendAI();
    }
  };

  const approve = async () => {
    if (!approver.trim()) { toast.show('请填写批准人(谁确认主线与取舍)', 'fail'); return; }
    const r = await p.approveG1(approver.trim());
    if (r.ok) setG1Warnings(r.warnings ?? []);
  };

  const assembleNow = async () => {
    if (await p.assemble()) navigate(`/project/${p.id}/compose`);
  };

  const pending = ed?.pending_review;

  return (
    <div className="view">
      <h1 className="view-h">编审</h1>
      <p className="view-sub">分析充分展开,汇报有所取舍——先定任务书与取舍,再确认逐页蓝图;已确认内容不因新结果自动改写。</p>

      {aiPreview && (
        <div className="notice warn" data-testid="outbound-preview">
          <b>
            AI 调用前确认——本任务将发送以下内容到外部模型
            {aiPreview.mode === 'structure-only' ? '（仅结构模式,不含发现原文与表格数值）' : '（授权摘要,含非敏感发现文本;sensitive 来源默认不发送）'}:
          </b>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {aiPreview.data.descriptor.sections.map((s, i) => (
              <li key={i}>{s.label}:{s.label === '发现文本' ? `${s.count} 条 · ` : ''}{s.bytes} 字节</li>
            ))}
            <li>目标模型:{aiPreview.data.target}</li>
            <li>本会话累计:{aiPreview.data.session.calls} 次调用 · 成本 {aiPreview.data.session.totalCost.toFixed(4)}</li>
          </ul>
          <div className="fine">批准对本会话生效(同类调用不再询问);本会话后续 AI 调用将按同一范围发送新增发现;出站日志只记录条数与成本,不记录内容。</div>
          <div className="inline-row" style={{ marginTop: 6 }}>
            <button className="btn btn-sm btn-primary" type="button" onClick={approveAndRun}>批准并继续</button>
            <button className="btn btn-sm" type="button" onClick={() => setAiPreview(null)}>取消</button>
          </div>
        </div>
      )}

      {pending && pending.updates.length > 0 && (
        <div className="notice warn" data-testid="pending-review">
          <b>待复核更新({pending.updates.length}):</b>
          新版本证据影响 {pending.affected_pages.length > 0 ? `页面 ${pending.affected_pages.join('、')}` : '候选发现'}
          ——正式发布已阻断,复核后解除。
          {pending.repropose.length > 0 && <div className="fine">重要性可能变化,建议复核此前"不采用"的发现:{pending.repropose.length} 项</div>}
          <div style={{ marginTop: 6 }}>
            <button
              className="btn btn-sm" type="button"
              onClick={() => {
                const keys = [...new Set(pending.updates.flatMap((u) => {
                  const r = u as { changed?: string[]; added?: string[]; removed?: string[] };
                  return [...(r.changed ?? []), ...(r.added ?? []), ...(r.removed ?? [])];
                }))];
                const pages = pending.affected_pages;
                // N1：键可能为空（空发现的补证结果），此时按受影响页解除
                void p.resolvePending(keys, pages).then(() => void api<EditorialStateT>(`/api/projects/${p.id}/editorial`).then(setEd));
              }}
            >
              已复核,解除阻断
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">汇报任务书<span className="card-h-note">{ed ? `编审状态:${EDITORIAL_STATUS_LABEL[ed.status] ?? ed.status}` : '草拟'}</span></div>
        <div className="fld-row">
          <div className="fld">
            <label className="fld-label" htmlFor="brief-audience">受众</label>
            <input id="brief-audience" value={brief.audience} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} />
          </div>
          <div className="fld">
            <label className="fld-label" htmlFor="brief-purpose">目的</label>
            <input id="brief-purpose" value={brief.purpose} onChange={(e) => setBrief({ ...brief, purpose: e.target.value })} />
          </div>
          <div className="fld" style={{ maxWidth: 110 }}>
            <label className="fld-label" htmlFor="brief-budget">页数预算</label>
            <input id="brief-budget" type="number" min={1} value={brief.page_budget} onChange={(e) => setBrief({ ...brief, page_budget: Number(e.target.value) })} />
          </div>
          <div className="fld" style={{ maxWidth: 170 }}>
            <label className="fld-label" htmlFor="brief-type">交付物</label>
            <select id="brief-type" value={brief.deliverable_type} onChange={(e) => setBrief({ ...brief, deliverable_type: e.target.value as 'meeting_deck' | 'research_report' })}>
              <option value="meeting_deck">会议汇报(PPT)</option>
              <option value="research_report">研究报告(文档)</option>
            </select>
          </div>
        </div>
        <div className="fld" style={{ marginTop: 8 }}>
          <label className="fld-label" htmlFor="brief-core">核心问题(本次要回答什么,不写预设结论)</label>
          <input id="brief-core" value={brief.core_question} placeholder="例:问题集中在哪里、证据支持到什么程度、是否值得试点、怎样控制风险" onChange={(e) => setBrief({ ...brief, core_question: e.target.value })} />
        </div>
        <div className="fld-row" style={{ marginTop: 8 }}>
          <div className="fld">
            <label className="fld-label" htmlFor="brief-nongoals">非重点(每行一条,不进正文)</label>
            <textarea id="brief-nongoals" rows={2} value={brief.non_goals} onChange={(e) => setBrief({ ...brief, non_goals: e.target.value })} />
          </div>
          <div className="fld">
            <label className="fld-label" htmlFor="brief-boundaries">必要边界(每行一条,必须正文可见)</label>
            <textarea id="brief-boundaries" rows={2} value={brief.required_boundaries} onChange={(e) => setBrief({ ...brief, required_boundaries: e.target.value })} />
          </div>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => void p.saveBrief(normalizedBrief)}>保存任务书</button>
          <span className="fine">核心问题与边界驱动取舍推荐;边界缺失时正式导出会被阻断。</span>
        </div>
      </div>

      <div className="card">
        <div className="card-h">发现与取舍<span className="card-h-note">{findings.length} 条 · 证据状态决定可信度,编排位置只属于本报告</span></div>
        {findings.length === 0 ? (
          <Empty>尚无发现——在「材料」导入成果包(.json)或带标记的 markdown。</Empty>
        ) : (
          <>
            <div className="actions">
              <button className="btn" type="button" onClick={doRecommend}>推荐取舍(规则)</button>
              {d?.capabilities?.ai.enabled && (
                <button className="btn" type="button" disabled={aiBusy} data-testid="ai-recommend" onClick={doRecommendAI}>
                  {aiBusy ? 'AI 分析中…' : 'AI 推荐取舍(授权摘要)'}
                </button>
              )}
              <button className="btn btn-primary" type="button" onClick={doAdopt}>采纳编排</button>
              {recSource && <span className="fine">当前建议来源:{recSource === 'ai' ? 'AI 推荐' : '规则推荐'}</span>}
              <span className="fine">先推荐再调整例外;「不采用」有粘性,不会在下次生成时自动回正文。</span>
            </div>
            {findings.map((f) => (
              <div className="finding-card" key={f.logical_key} data-testid="finding-card">
                <div className="finding-head">
                  <Chip kind="chip-accent">{KIND_LABEL[f.kind] ?? f.kind}</Chip>
                  <Chip kind={VERIF_CHIP[f.verification_state] ?? ''} title="来源存在 ≠ 结论正确">{VERIF_LABEL[f.verification_state] ?? f.verification_state}</Chip>
                  <select
                    aria-label="编排位置"
                    value={placementOf(f)}
                    onChange={(e) => setRecs({ ...recs, [f.logical_key]: { placement: e.target.value, reason: reasonOf(f) ?? '' } })}
                  >
                    {PLACEMENTS.map((pl) => <option key={pl} value={pl}>{PLACEMENT_LABEL[pl]}</option>)}
                  </select>
                  {recs[f.logical_key]?.sticky && <span className="fine">既有决定(粘性)</span>}
                </div>
                <div className="finding-text">{f.text}</div>
                {f.metrics.length > 0 && (
                  <div className="fine">{f.metrics.map((m) => `${m.scope ?? m.metric_id} = ${m.value}(${m.unit})`).join('；')}</div>
                )}
                {(f.limitations.length > 0 || f.counter_evidence.length > 0) && (
                  <div className="fine" style={{ color: 'var(--warn)' }}>
                    {f.limitations.length > 0 && <div>限制:{f.limitations.join('；')}</div>}
                    {f.counter_evidence.length > 0 && <div>反证:{f.counter_evidence.join('；')}</div>}
                  </div>
                )}
                {f.evidence.length > 0 && <div className="fine">证据:{f.evidence.map((e) => e.locator).join('；')}</div>}
                {reasonOf(f) && <div className="fine">理由:{reasonOf(f)}</div>}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-h">逐页蓝图<span className="card-h-note">每页有目的与核心信息;主旨可直接修改</span></div>
        <div className="actions">
          <button className="btn btn-primary" type="button" disabled={p.busy === 'outline' || (d?.sources.length ?? 0) === 0} onClick={generate}>
            {p.busy === 'outline' ? '生成中…' : '生成蓝图(确定性模式)'}
          </button>
          {d?.capabilities?.ai.enabled && (
            <button className="btn" type="button" disabled={aiBusy || (d?.sources.length ?? 0) === 0} data-testid="ai-outline" onClick={generateAI}>
              {aiBusy ? 'AI 生成中…' : 'AI 生成蓝图(仅结构模式)'}
            </button>
          )}
          {(d?.sources.length ?? 0) === 0 && <span className="fine">先在「材料」阶段导入材料。</span>}
        </div>
        {draft && (
          <>
            {draft.pages.map((pg, i) => (
              <div className="outline-page" key={pg.page_id}>
                <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="type">{pg.type}</span>
                <input
                  value={pg.headline}
                  onChange={(e) => setDraft({ ...draft, pages: draft.pages.map((x) => (x.page_id === pg.page_id ? { ...x, headline: e.target.value } : x)) })}
                />
                {pg.blueprint?.page_purpose && <span className="fine">{pg.blueprint.page_purpose}</span>}
                {pg.gap_notes.length > 0 && <span className="gapnote" title={pg.gap_notes.join(';')}>待补充</span>}
              </div>
            ))}
            {draft.open_questions.length > 0 && (
              <div className="notice warn" style={{ marginTop: 10 }}>
                <b>需要你确认的问题:</b>
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {draft.open_questions.map((q, i) => <li key={i}>{q.text}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-h">G1 人工编审<span className="card-h-note">确认主线/取舍/逐页信息——内容批准与发布确认分开</span></div>
        <div className="fld-row">
          <div className="fld" style={{ maxWidth: 220 }}>
            <label className="fld-label" htmlFor="g1-approver">批准人</label>
            <input id="g1-approver" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="谁确认主线与取舍" />
          </div>
        </div>
        <div className="actions">
          <button className="btn" type="button" disabled={!draft && !d?.hasSpec} onClick={approve}>批准 G1(冻结蓝图与来源快照)</button>
          <button className="btn btn-primary" type="button" disabled={p.busy === 'assemble'} onClick={assembleNow}>确认蓝图 → 组装报告</button>
        </div>
        {g1Warnings.length > 0 && (
          <div className="notice warn" style={{ marginTop: 8 }}>
            <b>编审一致性提示:</b>
            <ul style={{ margin: '6px 0 0 18px' }}>{g1Warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        <p className="fine">G1 未批准时只能导出带【草稿】标识的预览;组装后的修改走变更提案(锁定字段与版本冲突受控)。</p>
      </div>
    </div>
  );
}
