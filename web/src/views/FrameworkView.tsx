/* 第 3 步 确认框架（ui-contract S5）：生成（单发工人）→ 整屏编辑（改题/删页/调序/加页）→ 确认锁定。 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';

type FwPage = { page_id: string; title: string; page_type: string; intent?: string; source_hint?: string[] };

const PAGE_TYPE_LABEL: Record<string, string> = {
  cover: '封面页', summary: '摘要页', metrics_overview: '指标页', trend: '图表页',
  issue_breakdown: '洞察页', action_items: '行动页', evidence_appendix: '附录页', insight: '洞察页',
  next: '收尾页', content: '内容页', data: '数据页',
};

export function FrameworkView() {
  const { detail, refresh } = useProject();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'generating' | 'saving' | null>(null);
  const [rows, setRows] = useState<FwPage[] | null>(null);
  const id = detail?.project.project_id;
  const confirmed = detail?.framework_confirmed === true;
  const framework = rows ?? detail?.framework?.pages ?? null;
  const genUnlocked = detail?.steps.find((s) => s.key === 'framework')?.unlocked ?? false;

  const generate = async () => {
    if (!id) return;
    setBusy('generating');
    try {
      await api(`/api/projects/${id}/framework/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      setRows(null);
      await refresh();
    } catch (e) { window.alert(`框架生成失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const save = async (pages: FwPage[]) => {
    if (!id) return;
    setBusy('saving');
    try {
      await api(`/api/projects/${id}/framework`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pages: pages.map(({ page_id: _pid, ...rest }) => { void _pid; return rest; }) }),
      });
      setRows(null);
      await refresh();
    } catch (e) { window.alert(`保存失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const confirm = async () => {
    if (!id || !window.confirm('确认框架？确认后将锁定，进入生成。')) return;
    await api(`/api/projects/${id}/framework/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    await refresh();
  };

  if (!genUnlocked && !framework) {
    return (
      <div className="view">
        <h2>确认框架</h2>
        <p className="sub">先完成读取理解，AI 才能依据材料摘要生成页面框架。</p>
        <div className="empty" style={{ marginTop: 18 }}>理解未完成——先完成「读取理解」。<br /></div>
      </div>
    );
  }

  return (
    <div className="view">
      <h2>确认框架</h2>
      <p className="sub">AI 依据资料生成整套页面结构；你可以改题、删页、调序、加页，<b>确认后锁定</b>并进入生成。</p>
      {busy === 'generating' ? (
        <div className="card" style={{ marginTop: 18, textAlign: 'center', padding: 30 }}>框架生成中……（依据资料摘要与项目简介）</div>
      ) : !framework ? (
        <div className="empty" style={{ marginTop: 18 }}>
          还没有生成框架<br />
          <button className="btn btn-primary" type="button" onClick={() => void generate()}>生成 PPT 框架</button>
          <div className="fine" style={{ marginTop: 8 }}>依据 {detail?.sources.length ?? 0} 份资料摘要 + 项目简介</div>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-h">
            页面结构 <span className="num">{framework.length} 页</span>
            {confirmed && <span className="chip chip-accent" style={{ marginLeft: 10 }}>已确认 · 已锁定</span>}
          </div>
          <table className="tbl">
            <thead><tr><th style={{ width: 40 }}>#</th><th>页题</th><th style={{ width: 90 }}>页型</th><th>意图与来源</th>{!confirmed && <th style={{ width: 130 }}>操作</th>}</tr></thead>
            <tbody>
              {framework.map((p, i) => (
                <tr key={p.page_id}>
                  <td className="num">{String(i + 1).padStart(2, '0')}</td>
                  <td>
                    {confirmed ? p.title : (
                      <input value={p.title} style={{ width: '100%' }}
                             onChange={(e) => { const next = [...framework]; next[i] = { ...p, title: e.target.value }; setRows(next); }} />
                    )}
                  </td>
                  <td><span className="chip">{PAGE_TYPE_LABEL[p.page_type] ?? p.page_type}</span></td>
                  <td>
                    <div className="fine">{p.intent}</div>
                    {(p.source_hint ?? []).length > 0 && <div className="fine" style={{ color: 'var(--accent)' }}>来源 {p.source_hint!.join('、')}</div>}
                  </td>
                  {!confirmed && (
                    <td>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={i === 0}
                              onClick={() => { const next = [...framework]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; setRows(next); }}>↑</button>
                      <button className="btn btn-ghost btn-sm" type="button" disabled={i === framework.length - 1}
                              onClick={() => { const next = [...framework]; [next[i + 1], next[i]] = [next[i]!, next[i + 1]!]; setRows(next); }}>↓</button>
                      <button className="btn btn-ghost btn-sm" type="button"
                              onClick={() => { if (window.confirm(`删除第 ${String(i + 1).padStart(2, '0')} 页「${p.title}」？`)) { const next = framework.filter((_, j) => j !== i); setRows(next); } }}>删页</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!confirmed && (
            <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" type="button"
                      onClick={() => setRows([...framework, { page_id: `page_${framework.length + 1}`, title: '新页面', page_type: 'content', intent: '（补充意图说明）', source_hint: [] }])}>
                ＋ 加页
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                {rows && <button className="btn btn-ghost" type="button" disabled={busy !== null} onClick={() => void save(rows)}>保存修改</button>}
                <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void confirm()}>确认框架</button>
              </div>
            </div>
          )}
        </div>
      )}
      {confirmed && (
        <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" type="button" onClick={() => navigate(`/project/${id}/generate`)}>开始生成 →</button>
        </div>
      )}
    </div>
  );
}
