/* 第 2 屏：生成 + 逐页编辑 + 下载（一屏完成产出阶段）；
   发布简化：取消审批/隐私检查/内外分级，只保留三格式下载。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';

const STATE_LABEL: Record<string, string> = { pending: '排队中', running: '生成中', done: '已完成', failed: '失败' };

export function BuildView() {
  const { detail, refresh } = useProject();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localDraft, setLocalDraft] = useState<{ headline: string; bullets: { text: string }[]; table_note?: string } | null>(null);
  const [instruction, setInstruction] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const id = detail?.project.project_id;
  const framework = detail?.framework?.pages ?? [];
  const states = detail?.page_states ?? {};
  const pages = detail?.pages ?? {};
  const exports = detail?.exports ?? [];
  const done = Object.values(states).filter((s) => s === 'done').length;
  const total = framework.length;
  const started = done > 0 || Object.values(states).some((s) => s === 'failed');
  const allDone = total > 0 && done === total;
  const activeIdResolved = activeId ?? framework[0]?.page_id ?? null;
  const draft = activeIdResolved ? pages[activeIdResolved] : null;
  const sourceDraft = localDraft ?? draft;

  const genAll = async () => {
    if (!id) return;
    setRunning('all');
    setError(null);
    try {
      await api(`/api/projects/${id}/pages/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
    } catch (e) { setError(`生成失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setRunning(null);
    await refresh();
  };

  const retryPage = async (pageId: string) => {
    if (!id) return;
    setRunning(pageId);
    setError(null);
    try {
      const r = await api(`/api/projects/${id}/pages/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page_id: pageId }),
      }) as { ok?: boolean };
      if (r.ok === false) setError(`第 ${pageId.replace('page_', '')} 页重试失败（模型输出不合规或预算），可再试`);
    } catch (e) { setError(`重试失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setRunning(null);
    await refresh();
  };

  const saveManual = async () => {
    if (!id || !activeIdResolved || !localDraft) return;
    setRunning('save');
    try {
      await api(`/api/projects/${id}/pages/${activeIdResolved}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(localDraft),
      });
      setLocalDraft(null);
      await refresh();
    } catch (e) { setError(`保存失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setRunning(null);
  };

  const rewrite = async () => {
    if (!id || !activeIdResolved || !instruction.trim()) return;
    setRunning('rewrite');
    try {
      await api(`/api/projects/${id}/pages/${activeIdResolved}/rewrite`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: instruction.trim() }),
      });
      setInstruction('');
      await refresh();
    } catch (e) { setError(`改写被拒：${e instanceof Error ? e.message : '未知错误'}`); }
    setRunning(null);
  };

  const exportDeck = async (format: 'PPTX' | 'HTML' | 'PDF') => {
    if (!id) return;
    setExporting(format);
    setError(null);
    try {
      await api(`/api/projects/${id}/export`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formats: [format.toLowerCase()], level: 'internal' }),
      });
      await refresh();
    } catch (e) { setError(`导出失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setExporting(null);
  };

  if (total === 0) {
    return (
      <div className="view">
        <h2>生成与编辑</h2>
        <p className="sub">先在准备屏确认 PPT 框架。</p>
        <div className="empty" style={{ marginTop: 18 }}>还没有框架——回「准备」屏确认框架后开始生成。</div>
      </div>
    );
  }

  return (
    <div className="view">
      {error && (
        <div className="fail-panel" style={{ marginBottom: 14 }}>
          <span>{error}</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setError(null)}>知道了</button>
        </div>
      )}

      {/* ===== 区块 1：生成（紧凑摘要） ===== */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '1.05rem' }}>生成</strong>
          <span className="num">{done} / {total} 页完成</span>
          {Object.values(states).some((v) => v === 'failed') && (
            <span className="chip chip-fail">{Object.values(states).filter((v) => v === 'failed').length} 页失败（已自动重试 2 次）</span>
          )}
          <button className="btn btn-primary btn-sm" type="button" style={{ marginLeft: 'auto' }}
                  disabled={running !== null || allDone || detail?.generation?.status === 'running'}
                  onClick={() => void genAll()}>
            {running === 'all' ? '生成中…' : started ? '继续生成' : '开始生成'}
          </button>
          {detail?.generation?.status === 'running' && running === null && (
            <span className="fine">服务端工具 Agent 推进中，稍后刷新查看</span>
          )}
        </div>
      </div>

      {/* ===== 区块 2：逐页编辑（含预览） ===== */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">逐页编辑</div>
        <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr)', gap: 14, alignItems: 'start', marginTop: 8 }}>
          {/* 页列表 */}
          <ul className="sb-list" role="list">
            {framework.map((p, i) => (
              <li key={p.page_id}>
                <button className={`sb-item ${activeIdResolved === p.page_id ? 'active' : ''}`} type="button"
                        onClick={() => { setActiveId(p.page_id); setLocalDraft(null); }}>
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.8125rem', fontWeight: 600 }}>
                    {pages[p.page_id]?.headline ?? p.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {/* 编辑器 */}
          <div>
            {sourceDraft ? (
              <>
                <div className="field-block"><label>页标题</label>
                  <input value={sourceDraft.headline} onChange={(e) => setLocalDraft({ ...sourceDraft, headline: e.target.value })} />
                </div>
                <div className="field-block"><label>要点</label>
                  {(sourceDraft.bullets ?? []).map((b, i) => (
                    <div className="bullet-item" key={i}>
                      <input value={b.text} onChange={(e) => {
                        const next = [...sourceDraft.bullets]; next[i] = { ...b, text: e.target.value };
                        setLocalDraft({ ...sourceDraft, bullets: next });
                      }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <button className="btn btn-primary btn-sm" type="button" disabled={running !== null || !localDraft} onClick={() => void saveManual()}>保存修改</button>
                </div>
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 5 }}>让 agent 改这一页</label>
                  <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)}
                            placeholder="例如：把标题改成 XXX" />
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                    <button className="btn btn-primary" type="button" disabled={running !== null || !instruction.trim()} onClick={() => void rewrite()}>改写</button>
                    <span className="fine">{running === 'rewrite' ? '改写中…' : '出站白名单生效'}</span>
                  </div>
                </div>
              </>
            ) : <p className="fine">该页尚未生成内容。</p>}
          </div>
        </div>
        {/* 预览：编辑器下方，随选中页刷新 */}
        {activeIdResolved && (
          <div style={{ marginTop: 14 }}>
            <img src={`/api/projects/${id}/pages/${activeIdResolved}/preview.png?t=${Date.now()}`}
                 alt="页预览" style={{ maxWidth: '100%', width: 640, borderRadius: 8, border: '1px solid var(--line)' }}
                 onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <p className="fine" style={{ marginTop: 4 }}>近似渲染，实际以导出 PPTX 为准。</p>
          </div>
        )}
      </div>

      {/* ===== 区块 3：下载 ===== */}
      <div className="card">
        <div className="card-h">下载</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['PPTX', 'HTML', 'PDF'] as const).map((fmt) => (
            <button key={fmt} className="btn btn-primary" type="button" disabled={exporting !== null || !allDone}
                    title={!allDone ? '全部页生成完成后可下载' : undefined}
                    onClick={() => void exportDeck(fmt)}>
              {exporting === fmt ? '导出中…' : `下载 ${fmt}`}
            </button>
          ))}
          {!allDone && <span className="fine">全部页生成完成后可下载。</span>}
        </div>
        {exports.length > 0 && (
          <table className="tbl" style={{ marginTop: 12 }}>
            <thead><tr><th>格式</th><th>时间</th><th></th></tr></thead>
            <tbody>
              {exports.map((e) => (
                <tr key={e.export_id}>
                  <td><span className="chip mono">{e.format.toUpperCase()}</span></td>
                  <td className="mono">{e.created_at ? new Date(e.created_at).toLocaleString('zh-CN') : '—'}</td>
                  <td><a className="link-btn" href={`/api/projects/${id}/exports/${e.export_id}/file`} target="_blank" rel="noreferrer">下载</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
