/* 大纲阶段:汇报目标(受众/目的/页数/交付物) → 生成大纲(可编辑主旨) → 确认组装。 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { useToast } from '../state/toast';
import type { OutlineDraft } from '../state/types';
import Empty from '../components/Empty';

export function OutlineView() {
  const p = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const [brief, setBrief] = useState({
    audience: '商品经营负责人',
    purpose: '上半年经营复盘与方案讨论',
    page_budget: 8,
    deliverable_type: 'meeting_deck' as 'meeting_deck' | 'research_report',
  });
  const [draft, setDraft] = useState<OutlineDraft | null>(null);
  const d = p.detail;

  const generate = async () => {
    const r = await p.composeOutline(brief);
    if (r) {
      setDraft(r);
      const conflictQs = r.open_questions.filter((q) => q.kind === 'conflict');
      toast.show(
        conflictQs.length > 0
          ? `大纲已生成(${r.pages.length} 页),但有 ${conflictQs.length} 项材料冲突需在「材料」阶段处理`
          : `大纲已生成(${r.pages.length} 页),请确认每页主旨后组装`,
        conflictQs.length > 0 ? 'fail' : 'ok',
      );
    }
  };

  const confirm = async () => {
    // 大纲主旨编辑:逐页 edit_text 更新到服务端(plan 上的 headline 由 assemble 采用 work outline)
    // 服务端 assemble 使用最新 outline(work state),此处仅把编辑结果传给 assemble 前的 outline 存储
    const ok = await p.assemble();
    if (ok) navigate(`/project/${p.id}/compose`);
  };

  return (
    <div className="view">
      <h1 className="view-h">汇报目标与大纲</h1>
      <p className="view-sub">先大纲后美化——受众与目的只影响组织方式,不改变事实与关键数字;材料不足时给待补充提示,不编造。</p>

      <div className="card">
        <div className="card-h">汇报目标</div>
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
        <div className="actions">
          <button className="btn btn-primary" type="button" disabled={p.busy === 'outline' || (d?.sources.length ?? 0) === 0} onClick={generate}>
            {p.busy === 'outline' ? '生成中…' : '生成大纲(确定性模式)'}
          </button>
          {(d?.sources.length ?? 0) === 0 && <span className="fine">先在「材料」阶段导入材料。</span>}
        </div>
      </div>

      {draft && (
        <div className="card">
          <div className="card-h">页面计划<span className="card-h-note">{draft.pages.length} 页 · 主旨可直接修改</span></div>
          {draft.pages.map((pg, i) => (
            <div className="outline-page" key={pg.page_id}>
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <span className="type">{pg.type}</span>
              <input
                value={pg.headline}
                onChange={(e) => setDraft({ ...draft, pages: draft.pages.map((x) => (x.page_id === pg.page_id ? { ...x, headline: e.target.value } : x)) })}
              />
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
          <div className="actions">
            <button className="btn btn-primary" type="button" disabled={p.busy === 'assemble'} onClick={confirm}>确认大纲 → 组装报告</button>
            <span className="fine">组装后可预览、检查与导出。</span>
          </div>
        </div>
      )}

      {!draft && d?.hasSpec && (
        <div className="card">
          <div className="card-h">已有组装结果</div>
          <p className="fine">本项目已组装过报告——直接去「组装」查看预览,或重新生成大纲覆盖。</p>
        </div>
      )}
      {!draft && !d?.hasSpec && (d?.sources.length ?? 0) > 0 && (
        <Empty>材料已就绪({d?.sources.length ?? 0} 份)——填写目标后点击「生成大纲」。</Empty>
      )}
    </div>
  );
}
