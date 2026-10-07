/* 第 5 步 逐页编辑（ui-contract S7）：页列表 / 手工直改编辑器 / agent 改写指令 / 删页。 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';

export function PageEditView() {
  const { detail, refresh } = useProject();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [localDraft, setLocalDraft] = useState<{ headline: string; bullets: { text: string }[]; table_note?: string } | null>(null);
  const id = detail?.project.project_id;
  const framework = detail?.framework?.pages ?? [];
  const pages = detail?.pages ?? {};
  const initialPageId = framework[0]?.page_id;
  const [activeId, setActiveId] = useState<string | null>(initialPageId ?? null);
  const active = activeId ? pages[activeId] : null;
  const sourceDraft = localDraft ?? active;

  const saveManual = async () => {
    if (!id || !activeId || !localDraft) return;
    setBusy('saving');
    try {
      await api(`/api/projects/${id}/pages/${activeId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(localDraft),
      });
      setLocalDraft(null);
      await refresh();
    } catch (e) { window.alert(`保存失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const rewrite = async () => {
    if (!id || !activeId || !instruction.trim()) return;
    setBusy('rewrite');
    try {
      await api(`/api/projects/${id}/pages/${activeId}/rewrite`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: instruction.trim() }),
      });
      setInstruction('');
      await refresh();
    } catch (e) { window.alert(`改写被拒：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const remove = async () => {
    if (!id || !activeId) return;
    if (!window.confirm(`删除第 ${framework.findIndex((p) => p.page_id === activeId) + 1} 页「${active?.headline ?? ''}」？`)) return;
    await api(`/api/projects/${id}/pages/${activeId}`, { method: 'DELETE' });
    setActiveId(framework.filter((p) => p.page_id !== activeId)[0]?.page_id ?? null);
    setLocalDraft(null);
    await refresh();
  };

  if (framework.length === 0 || !sourceDraft) {
    return (
      <div className="view">
        <h2>逐页编辑</h2>
        <p className="sub">先在生成步骤生成全部页面内容。</p>
        <div className="empty" style={{ marginTop: 18 }}>没有可编辑的页面。</div>
      </div>
    );
  }

  const isFirst = framework[0]?.page_id === activeId;
  const isLast = framework[framework.length - 1]?.page_id === activeId;

  return (
    <div className="view" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'flex-start' }}>
      <aside className="card" style={{ padding: 12 }}>
        <div className="card-h" style={{ fontSize: '.875rem' }}>页面</div>
        <ul className="sb-list" role="list" style={{ marginTop: 6 }}>
          {framework.map((p, i) => {
            const draft = pages[p.page_id];
            return (
              <li key={p.page_id}>
                <button className={`sb-item ${activeId === p.page_id ? 'active' : ''}`} type="button"
                        onClick={() => { setActiveId(p.page_id); setLocalDraft(null); }}>
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.8125rem', fontWeight: 600 }}>{draft?.headline ?? p.title}</span>
                  {pages[p.page_id] && <span className="chip chip-ok" style={{ marginLeft: 6 }}>就绪</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="card stack">
        <div className="card-h">手工直改</div>
        <div className="ro-note">页型/版式/图表数据为只读；当前可编辑文字字段。</div>
        <div className="field-block">
          <label>页标题</label>
          <input value={sourceDraft.headline} onChange={(e) => setLocalDraft({ ...sourceDraft, headline: e.target.value })} />
        </div>
        <div className="field-block">
          <label>要点（≤6）</label>
          {(sourceDraft.bullets ?? []).map((b, i) => (
            <div className="bullet-item" key={i}>
              <input value={b.text} onChange={(e) => {
                const next = [...sourceDraft.bullets]; next[i] = { ...b, text: e.target.value };
                setLocalDraft({ ...sourceDraft, bullets: next });
              }} />
            </div>
          ))}
        </div>
        {sourceDraft.table_note && (
          <div className="field-block">
            <label>表格 / 数据注释</label>
            <input value={sourceDraft.table_note} onChange={(e) => setLocalDraft({ ...sourceDraft, table_note: e.target.value })} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary btn-sm" type="button" disabled={busy !== null || !localDraft} onClick={() => void saveManual()}>保存修改</button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={busy !== null || isFirst || isLast} onClick={() => void remove()}>删除页</button>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 6 }}>
          <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 5 }}>让 agent 改这一页</label>
          <textarea placeholder="例如：这页强调环比变化而不是绝对值，语气更克制"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" type="button" disabled={busy !== null || !instruction.trim()} onClick={() => void rewrite()}>改写</button>
            <span className="fine">{busy === 'rewrite' ? '改写中……' : '出站白名单生效；数字护栏拦编造'}</span>
          </div>
        </div>
      </div>

      <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', gridColumn: '1 / -1' }}>
        <button className="btn btn-primary" type="button" onClick={() => navigate(`/project/${id}/publish`)}>进入审核发布 →</button>
      </div>
    </div>
  );
}
