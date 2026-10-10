/* 提案卡（T2，UI 合同 W3）：内联编辑 + 增删调序 + ≤3 澄清问题 + 保存/确认 + 版本徽标。 */
import { useState } from 'react';
import { post, put, errMsg } from '../state/api';

export interface OutlinePage { title: string; page_type: string; intent?: string; source_hint?: string[] }
export interface OutlineProposal { version: number; pages: OutlinePage[]; questions: string[]; proposed_at: string; origin: 'agent' | 'user_edit' }
export interface OutlineState { current: OutlineProposal | null; confirmed: boolean; confirmed_at?: string; confirmed_pages?: OutlinePage[]; history?: OutlineProposal[] }

export function OutlineCard(props: {
  projectId: string;
  outline: OutlineState;
  busy: boolean;
  onChanged: () => void;
  onNotify: (text: string) => void;
  waitResult: () => Promise<void>;
  onReply: (question: string) => void;
}) {
  const { projectId, outline, busy, onChanged, onNotify, waitResult, onReply } = props;
  const [pages, setPages] = useState<OutlinePage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = outline.current;
  if (!current) return null;
  const draft = pages ?? current.pages.map((p) => ({ ...p }));
  const dirty = pages !== null;

  const update = (i: number, patch: Partial<OutlinePage>) => {
    const next = [...draft];
    next[i] = { ...next[i]!, ...patch };
    setPages(next);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= draft.length) return;
    const next = [...draft];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setPages(next);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await put(`/api/projects/${projectId}/outline`, { pages: draft });
      setPages(null);
      onChanged();
    } catch (e) { setError(errMsg(e)); }
    setSaving(false);
  };

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      if (dirty) await put(`/api/projects/${projectId}/outline`, { pages: draft });
      setPages(null);
      const r = await post<{ injected: boolean; version: number; inject_error?: string }>(`/api/projects/${projectId}/outline/confirm`, {});
      onChanged();
      if (r.injected) {
        onNotify(`已确认框架 v${r.version}，AI 开始自主生成。`);
        await waitResult();
      } else {
        onNotify(`框架 v${r.version} 已确认，但生成注入失败：${r.inject_error ?? '模型不可用'}。确认状态已保存，恢复模型后可再次推进。`);
      }
    } catch (e) { setError(errMsg(e)); }
    setSaving(false);
  };

  return (
    <div className="wb-msg assistant wb-outline" role="region" aria-label={`框架提案 v${current.version}`}>
      <div className="wb-outline-head">
        <strong>框架提案 v{current.version}</strong>
        {outline.confirmed ? <span className="chip chip-ok">已确认（后续可直接对话修改）</span> : <span className="chip">待确认</span>}
        <span className="fine">{current.origin === 'agent' ? 'AI 提出' : '用户编辑'} · {current.pages.length} 页</span>
      </div>
      {error && <p className="wb-outline-error" role="alert">{error}</p>}
      <table className="wb-outline-tbl">
        <thead><tr><th style={{ width: 34 }}>#</th><th>页题（结论式）</th><th style={{ width: 150 }}>页型</th><th>意图</th>{!outline.confirmed && <th style={{ width: 96 }}></th>}</tr></thead>
        <tbody>
          {draft.map((p, i) => (
            <tr key={i}>
              <td className="num">{String(i + 1).padStart(2, '0')}</td>
              <td><input value={p.title} disabled={outline.confirmed || busy} onChange={(e) => update(i, { title: e.target.value })} /></td>
              <td>
                <input value={p.page_type} list="wb-page-types" disabled={outline.confirmed || busy}
                       onChange={(e) => update(i, { page_type: e.target.value })} />
              </td>
              <td><input value={p.intent ?? ''} disabled={outline.confirmed || busy} placeholder="该页要回答什么" onChange={(e) => update(i, { intent: e.target.value })} /></td>
              {!outline.confirmed && (
                <td className="wb-outline-ops">
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="下移" disabled={i === draft.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="删页" onClick={() => setPages(draft.filter((_, j) => j !== i))}>删</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!outline.confirmed && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPages([...draft, { title: '新页面', page_type: 'content' }])}>＋ 加页</button>
      )}
      {current.questions.length > 0 && (
        <div className="wb-outline-questions">
          <strong>待你澄清（{current.questions.length}/3）</strong>
          <ul>{current.questions.map((q, i) => (
            <li key={i}>{q} <button type="button" className="wb-reply-btn" onClick={() => onReply(q)}>去回复</button></li>
          ))}</ul>
          <p className="fine">可直接在下方输入框回答，AI 会出新版提案。</p>
        </div>
      )}
      {(outline.history?.length ?? 0) > 0 && (
        <details className="wb-outline-history">
          <summary>历史提案（{outline.history!.length} 版）</summary>
          {outline.history!.map((h) => (
            <p key={h.version} className="fine">v{h.version}：{h.pages.map((p) => p.title).join(' / ')}</p>
          ))}
        </details>
      )}
      <datalist id="wb-page-types">
        {[ 'cover', 'summary', 'metrics_overview', 'trend', 'issue_breakdown', 'option_comparison', 'action_items', 'evidence_appendix', 'content' ].map((t) => <option key={t} value={t} />)}
      </datalist>
      {!outline.confirmed && (
        <div className="wb-outline-actions">
          {dirty && <button type="button" className="btn btn-sm" disabled={saving || busy} onClick={() => void save()}>保存修改</button>}
          <button type="button" className="btn btn-primary btn-sm" disabled={saving || busy} onClick={() => void confirm()}>
            {saving ? '处理中…' : `按此框架生成（v${current.version}${dirty ? '·含修改' : ''}）`}
          </button>
        </div>
      )}
    </div>
  );
}
