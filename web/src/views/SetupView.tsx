/* 第 1 屏：建项目 + 上传资料 + 读取理解 + 确认框架（一屏完成准备阶段） */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';
import type { SourceAsset, FrameworkPage } from '../state/types';

const KIND_LABEL: Record<string, string> = {
  markdown: 'md', text: 'txt', csv: 'csv', xlsx: 'xlsx', docx: 'docx', pdf: 'pdf', image: '图片', table: '表格', bundle: 'bundle',
};

function kindOf(filename: string): SourceAsset['kind'] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  return 'text';
}

type Stage = 'create' | 'upload' | 'understand' | 'framework';

export function SetupView() {
  const { detail, refresh } = useProject();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('upload');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fwRows, setFwRows] = useState<FrameworkPage[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const id = detail?.project.project_id;
  const sources = detail?.sources ?? [];
  const understanding = detail?.understanding ?? {};
  const framework = fwRows ?? detail?.framework?.pages ?? null;
  const confirmed = detail?.framework_confirmed === true;

  const allDone = sources.length > 0 && sources.every((s) => understanding[s.source_id]);
  const doneCount = sources.filter((s) => understanding[s.source_id]).length;

  const stageOf = useCallback((): Stage => {
    if (confirmed) return 'framework';
    if (framework) return 'framework';
    if (allDone) return 'framework';
    if (sources.length > 0) return 'understand';
    return 'upload';
  }, [confirmed, framework, allDone, sources.length]);

  useEffect(() => { setStage(stageOf()); }, [stageOf]);

  const upload = async (files: FileList | null) => {
    if (!files || !id) return;
    setBusy('上传');
    setError(null);
    for (const f of Array.from(files)) {
      try {
        const buf = await f.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        await api(`/api/projects/${id}/sources`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: f.name, content_base64: base64, kind: kindOf(f.name), media_type: f.type || undefined }),
        });
      } catch { /* 失败以列表状态呈现 */ }
    }
    setBusy(null);
    await refresh();
  };

  const remove = async (sourceId: string) => {
    if (!id || !window.confirm('移除该资料？其理解摘要将一并删除。')) return;
    await api(`/api/projects/${id}/sources/${sourceId}`, { method: 'DELETE' });
    await refresh();
  };

  const runUnderstand = async () => {
    if (!id) return;
    setBusy('理解');
    setError(null);
    try {
      const r = await api(`/api/projects/${id}/understand`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      }) as { failed?: Array<{ source_id: string; reason: string }> };
      if (r.failed && r.failed.length > 0) {
        setError(`部分资料理解失败：${r.failed[0].reason.slice(0, 120)}（可重试）`);
      }
    } catch (e) {
      setError(`读取理解失败：${e instanceof Error ? e.message : '未知错误'}`);
    }
    setBusy(null);
    await refresh();
  };

  const genFramework = async () => {
    if (!id) return;
    setBusy('框架');
    setError(null);
    try {
      await api(`/api/projects/${id}/framework/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      setFwRows(null);
      await refresh();
    } catch (e) { setError(`框架生成失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const saveFramework = async (pages: FrameworkPage[]) => {
    if (!id) return;
    setBusy('保存');
    try {
      await api(`/api/projects/${id}/framework`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pages: pages.map(({ page_id: _pid, ...rest }) => { void _pid; return rest; }) }),
      });
      setFwRows(null);
      await refresh();
    } catch (e) { setError(`保存失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const confirmFramework = async () => {
    if (!id || !window.confirm('确认框架？确认后锁定，进入生成。')) return;
    setBusy('确认');
    try {
      await api(`/api/projects/${id}/framework/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await refresh();
      navigate(`/project/${id}/build`);
    } catch (e) { setError(`确认失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const updateFw = (i: number, patch: Partial<FrameworkPage>) => {
    if (!framework) return;
    const next = [...framework];
    next[i] = { ...next[i]!, ...patch };
    setFwRows(next);
  };

  return (
    <div className="view">
      {error && (
        <div className="fail-panel" style={{ marginBottom: 14 }}>
          <span>{error}</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setError(null)}>知道了</button>
        </div>
      )}

      {/* ===== 区块 1：项目与资料 ===== */}
      <div className="card stack" style={{ marginBottom: 16 }}>
        <div className="card-h">1 · 项目与资料</div>
        {sources.length === 0 ? (
          <div className="empty">
            上传资料开始——md、Word、PDF、图片、表格等格式不限<br />
            <button className="btn btn-primary" type="button" onClick={() => fileRef.current?.click()}>＋ 上传资料</button>
          </div>
        ) : (
          <table className="tbl">
            <thead><tr><th>文件</th><th>类型</th><th>理解状态</th><th style={{ width: 150 }}></th></tr></thead>
            <tbody>
              {sources.map((s) => {
                const ud = understanding[s.source_id];
                return (
                  <tr key={s.source_id}>
                    <td>{s.filename}</td>
                    <td><span className="chip">{KIND_LABEL[s.kind] ?? s.kind}</span></td>
                    <td>
                      {ud ? <span className="chip chip-ok">已理解（{ud.points.length} 条要点）</span>
                        : s.parse_status === 'failed' ? <span className="chip chip-fail" title={s.parse_error}>解析失败</span>
                        : busy === '理解' ? <span className="chip">理解中…</span> : <span className="chip">待理解</span>}
                    </td>
                    <td>
                      {!ud && s.parse_status !== 'failed' && (
                        <button className="btn btn-ghost btn-sm" type="button" disabled={busy !== null}
                                onClick={async () => {
                                  if (!id) return;
                                  setBusy('理解');
                                  try { await api(`/api/projects/${id}/understand`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_id: s.source_id }) }); } catch { /* 保持状态 */ }
                                  setBusy(null); await refresh();
                                }}>{busy === '理解' ? '理解中…' : '理解'}</button>
                      )}
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => void remove(s.source_id)}>移除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => fileRef.current?.click()}>＋ 继续上传</button>
          {sources.length > 0 && !allDone && (
            <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void runUnderstand()}>
              {busy === '理解' ? '理解中…' : doneCount > 0 ? '继续理解' : '开始读取理解'}
            </button>
          )}
          {busy === '理解' && <span className="fine">真实模型调用，约 1-2 分钟/文件</span>}
        </div>
      </div>

      {/* ===== 区块 2：PPT 框架 ===== */}
      <div className="card stack">
        <div className="card-h">
          2 · PPT 框架
          {confirmed && <span className="chip chip-accent" style={{ marginLeft: 10 }}>已确认 · 已锁定</span>}
        </div>
        {!allDone && !framework ? (
          <div className="ro-note">完成上方资料的读取理解后，AI 依据材料摘要生成页面框架。</div>
        ) : !framework ? (
          <div>
            <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void genFramework()}>
              {busy === '框架' ? '框架生成中…' : '生成 PPT 框架'}
            </button>
            <span className="fine" style={{ marginLeft: 10 }}>依据 {sources.length} 份资料摘要 + 项目简介</span>
          </div>
        ) : (
          <>
            <table className="tbl">
              <thead><tr><th style={{ width: 40 }}>#</th><th>页题</th><th style={{ width: 90 }}>页型</th><th>意图与来源</th>{!confirmed && <th style={{ width: 130 }}>操作</th>}</tr></thead>
              <tbody>
                {framework.map((p, i) => (
                  <tr key={p.page_id}>
                    <td className="num">{String(i + 1).padStart(2, '0')}</td>
                    <td>
                      {confirmed ? p.title : (
                        <input value={p.title} style={{ width: '100%' }}
                               onChange={(e) => updateFw(i, { title: e.target.value })} />
                      )}
                    </td>
                    <td><span className="chip">{p.page_type}</span></td>
                    <td>
                      <div className="fine">{p.intent}</div>
                      {(p.source_hint ?? []).length > 0 && <div className="fine" style={{ color: 'var(--accent)' }}>来源 {p.source_hint!.join('、')}</div>}
                    </td>
                    {!confirmed && (
                      <td>
                        <button className="btn btn-ghost btn-sm" type="button" disabled={i === 0}
                                onClick={() => { if (framework) { const next = [...framework]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; setFwRows(next); } }}>↑</button>
                        <button className="btn btn-ghost btn-sm" type="button" disabled={i === framework.length - 1}
                                onClick={() => { if (framework) { const next = [...framework]; [next[i + 1], next[i]] = [next[i]!, next[i + 1]!]; setFwRows(next); } }}>↓</button>
                        <button className="btn btn-ghost btn-sm" type="button"
                                onClick={() => { if (framework && window.confirm(`删除第 ${String(i + 1).padStart(2, '0')} 页「${p.title}」？`)) setFwRows(framework.filter((_, j) => j !== i)); }}>删页</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!confirmed && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" type="button"
                        onClick={() => framework && setFwRows([...framework, { page_id: `page_${framework.length + 1}`, title: '新页面', page_type: 'content', intent: '（补充意图说明）', source_hint: [] }])}>
                  ＋ 加页
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  {fwRows && <button className="btn btn-ghost" type="button" disabled={busy !== null} onClick={() => void saveFramework(fwRows)}>保存修改</button>}
                  <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void confirmFramework()}>确认框架</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 隐藏的文件输入 */}
      <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
             onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />

      {/* 确认后引导 */}
      {confirmed && (
        <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-primary" type="button" onClick={() => id && navigate(`/project/${id}/build`)}>
            进入生成与编辑 →
          </button>
        </div>
      )}
    </div>
  );
}
