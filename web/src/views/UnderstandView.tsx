/* 第 2 步 读取理解（ui-contract S4）：逐文件 checkpoint / 总进度 / 摘要展开 / 失败重试与移除。 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';

type UdEntry = {
  points: { text: string; topic_tag: string; kind: string; value?: number; unit?: string; locator?: string }[];
  uncovered: boolean;
  gist: string;
};

export function UnderstandView() {
  const { detail, refresh } = useProject();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = detail?.project.project_id;
  const sources = detail?.sources ?? [];
  const understanding = (detail as unknown as { understanding?: Record<string, UdEntry> } | null)?.understanding ?? {};
  const done = sources.filter((s) => understanding[s.source_id]).length;
  const hasPending = sources.some((s) => !understanding[s.source_id]);
  const failedFiles = sources.filter((s) => s.parse_status === 'failed');

  const runAll = async () => {
    if (!id) return;
    setRunning(true);
    setError(null);
    try {
      await api(`/api/projects/${id}/understand`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      });
    } catch (e) {
      setError(`读取理解失败：${e instanceof Error ? e.message : '未知错误'}（可能超时或模型输出不合规，稍后重试）`);
    }
    setRunning(false);
    await refresh();
  };

  const retry = async (sourceId: string) => {
    if (!id) return;
    setRunning(true);
    try {
      await api(`/api/projects/${id}/understand`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source_id: sourceId }),
      });
    } catch { /* 保持失败态 */ }
    setRunning(false);
    await refresh();
  };

  const remove = async (sourceId: string) => {
    if (!id || !window.confirm('移除该资料？其理解摘要将一并删除。')) return;
    await api(`/api/projects/${id}/sources/${sourceId}`, { method: 'DELETE' });
    await refresh();
  };

  return (
    <div className="view">
      <h2>读取理解</h2>
      <p className="sub">逐文件提取要点与数据，摘要持久化；已完成的文件重进不重跑。</p>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-h">
          理解进度 <span className="num">{done} / {sources.length}</span>
          <button className="btn btn-primary btn-sm" type="button" style={{ marginLeft: 12 }} disabled={running || !hasPending} onClick={() => void runAll()}>
            {running ? '理解中…' : done > 0 && hasPending ? '继续理解' : '开始读取理解'}
          </button>
        </div>
        {sources.length === 0 ? (
          <p className="fine">先在上传资料步骤添加文件。</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>文件</th><th>状态</th><th style={{ width: 140 }}></th></tr></thead>
            <tbody>
              {sources.map((s) => {
                const ud = understanding[s.source_id];
                return (
                  <tr key={s.source_id}>
                    <td>{s.filename}</td>
                    <td>
                      {ud ? <span className="chip chip-ok">已完成</span>
                        : s.parse_status === 'failed' ? <span className="chip chip-fail" title={s.parse_error}>解析失败</span>
                        : running ? <span className="chip">理解中…</span> : <span className="chip">待理解</span>}
                    </td>
                    <td>
                      {ud ? (
                        <details>
                          <summary className="fine" style={{ cursor: 'pointer' }}>摘要（{ud.points.length} 条要点）</summary>
                          <ul className="fine" style={{ margin: '6px 0 0 16px', lineHeight: 1.7 }}>
                            {ud.points.slice(0, 8).map((p, i) => (
                              <li key={i}>{p.text}{p.kind === 'data' && p.value != null ? `（${p.value}${p.unit ?? ''}）` : ''} <span className="chip">{p.topic_tag}</span></li>
                            ))}
                            {ud.points.length > 8 && <li>… 共 {ud.points.length} 条</li>}
                          </ul>
                        </details>
                      ) : (
                        <>
                          {s.parse_status !== 'failed' && (
                            <button className="btn btn-ghost btn-sm" type="button" disabled={running} onClick={() => void retry(s.source_id)}>理解</button>
                          )}
                        </>
                      )}
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => void remove(s.source_id)}>移除</button>
                      {s.parse_status === 'failed' && <span className="fine" style={{ color: 'var(--fail)' }}>可移除以解除阻塞</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-primary" type="button"
                disabled={running || sources.length === 0 || hasPending || failedFiles.length > 0}
                title={failedFiles.length > 0 ? '有解析失败的文件：重试或移除后进入确认框架' : undefined}
                onClick={() => navigate(`/project/${id}/framework`)}>
          进入确认框架 →
        </button>
      </div>
    </div>
  );
}
