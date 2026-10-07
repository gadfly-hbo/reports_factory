/* 第 4 步 生成（ui-contract S6）：逐页推进/总进度/继续生成/页级重试/预算封顶明示。 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';

const STATE_LABEL: Record<string, string> = { pending: '排队中', running: '生成中', done: '已完成', failed: '失败' };

export function GenerateView() {
  const { detail, refresh } = useProject();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = detail?.project.project_id;
  const framework = detail?.framework?.pages ?? [];
  const states = detail?.page_states ?? {};
  const pages = detail?.pages ?? {};
  const done = Object.values(states).filter((s) => s === 'done').length;
  const failedPages = framework.filter((p) => states[p.page_id] === 'failed');
  const pending = framework.some((p) => states[p.page_id] === undefined || states[p.page_id] === 'pending');
  const total = framework.length;
  const started = done > 0 || failedPages.length > 0;

  const run = async (pageId?: string) => {
    if (!id) return;
    if (pageId) { setRetrying(pageId); } else { setRunning(true); }
    setError(null);
    try {
      const r: any = await api(`/api/projects/${id}/pages/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pageId ? { page_id: pageId } : {}),
      });
      // 页级重试失败：显示原因（数字护栏/schema/预算）
      if (pageId && r && r.failed > 0) {
        const st = (detail?.page_states as Record<string, string> | undefined)?.[pageId];
        if (st === 'failed') setError(`第 ${pageId.replace('page_', '')} 页重试失败：模型输出不合规或数字护栏拒绝（可再试）`);
      }
    } catch (e) {
      setError(`生成失败：${e instanceof Error ? e.message : '未知错误'}`);
    }
    setRunning(false); setRetrying(null);
    await refresh();
  };

  return (
    <div className="view">
      <h2>生成</h2>
      <p className="sub">按已确认框架逐页生成，每页内容都有资料支撑；进度逐页保存，失败页可单独重试。</p>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-h">
          生成进度 <span className="num">{done} / {total} 页</span>
          <button className="btn btn-primary btn-sm" type="button" style={{ marginLeft: 12 }}
                  disabled={running || (started && !pending && failedPages.length === 0) || detail?.generation?.status === 'running'}
                  onClick={() => void run(started ? undefined : undefined)}>
            {running ? '生成中…' : started ? '继续生成' : '开始生成'}
          </button>
        </div>
        {detail?.generation?.status === 'running' && !running && (
          <p className="fine">服务端仍在推进（重进本页刷新进度；离开不丢 checkpoint）。</p>
        )}
        <table className="tbl">
          <thead><tr><th style={{ width: 40 }}>#</th><th>页题</th><th style={{ width: 200 }}>状态</th></tr></thead>
          <tbody>
            {framework.map((p, i) => {
              const st = states[p.page_id] ?? 'pending';
              const draft = pages[p.page_id];
              return (
                <tr key={p.page_id}>
                  <td className="num">{String(i + 1).padStart(2, '0')}</td>
                  <td>{draft?.headline ?? p.title}</td>
                  <td>
                    {st === 'done' ? <span className="chip chip-ok">已完成</span>
                      : st === 'failed' ? <span className="chip chip-fail">失败</span>
                      : st === 'running' ? <span className="chip">生成中…</span> : <span className="chip">排队中</span>}
                    {st === 'done' && draft?.chart && <span className="chip" style={{ marginLeft: 6 }}>原生图表</span>}
                    {st === 'failed' && (
                      <button className="btn btn-ghost btn-sm" type="button" style={{ marginLeft: 8 }} disabled={running || retrying !== null}
                              onClick={() => void run(p.page_id)}>{retrying === p.page_id ? '重试中…' : '重试该页'}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn btn-primary" type="button"
                disabled={running || total === 0 || done < total}
                onClick={() => navigate(`/project/${id}/page-edit`)}>
          进入逐页编辑 →
        </button>
      </div>
    </div>
  );
}
