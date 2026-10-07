/* 第 6 步 审核发布（ui-contract S8）：原则横条 / 隐私检查 / 批准 / 失效判定 / 三格式导出 / 记录。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';

type PrivacyReport = { items: { item: string; status: 'pass' | 'flag' | 'not_checked'; detail?: string }[]; checked_count: number; not_checked_count: number; flag_count: number; has_flags: boolean };

export function PublishView() {
  const { detail, refresh } = useProject();
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<PrivacyReport | null>(null);
  const id = detail?.project.project_id;
  const exports = detail?.exports ?? [];
  const framework = detail?.framework?.pages ?? [];
  const states = detail?.page_states ?? {};
  const allDone = framework.length > 0 && framework.every((p) => states[p.page_id] === 'done');
  const approved = (detail as unknown as { approval_state?: { approved_at?: string; revoked?: boolean; reason?: string } } | null)?.approval_state ?? null;

  const privacyRun = async () => {
    if (!id) return;
    setBusy('privacy');
    try {
      const r = await api(`/api/projects/${id}/privacy-check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }) as { report?: PrivacyReport };
setReport(r.report ?? null);
      
    } catch (e) { window.alert(`隐私检查失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const approve = async () => {
    if (!id || !window.confirm('批准外发？批准会持久化，并在内容变更后自动失效。')) return;
    setBusy('approve');
    try {
      await api(`/api/projects/${id}/approve-formal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await refresh();
    } catch (e) { window.alert(`批准失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  const exportAll = async (level: 'internal' | 'external', formats: ('PPTX' | 'HTML' | 'PDF')[]) => {
    if (!id) return;
    setBusy(`export-${level}`);
    try {
      await api(`/api/projects/${id}/export`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formats: formats.map((f) => f.toLowerCase()), level }),
      });
      await refresh();
    } catch (e) { window.alert(`导出失败：${e instanceof Error ? e.message : '未知错误'}`); }
    setBusy(null);
  };

  return (
    <div className="view">
      <div className="governance" style={{ marginBottom: 14 }}>
        <span className="chip">内用草稿随时可导</span>
        <span className="chip">外发需检查 + 批准</span>
        <span className="chip">批准持久化留痕</span>
        <small>这是内容可信交付的关卡，也是本产品区别于同类工具的差异点。</small>
      </div>

      <div className="grid two" style={{ alignItems: 'flex-start' }}>
        <div className="card stack">
          <div className="card-h">隐私检查<span className="right">{report ? (report.has_flags ? <span className="chip chip-fail">命中 {report.flag_count} 项</span> : <span className="chip chip-ok">通过 · 0 命中</span>) : <span className="chip">未运行</span>}</span></div>
          <p className="fine">扫描整套页面：原生图表底层数据 / 主张来源绑定 / 敏感材料 / 元数据风险 / 推断内容。命中即阻断外发。</p>
          <div><button className="btn" type="button" disabled={busy !== null || !allDone} onClick={() => void privacyRun()}>运行隐私检查</button></div>
          {report && (
            <div className="ro-note" style={{ fontSize: '.8125rem' }}>
              {report.items.map((it) => `${it.item}=${it.status}${it.detail ? '（' + it.detail + '）' : ''}`).join('；')}
            </div>
          )}
        </div>
        <div className="card stack">
          <div className="card-h">外发批准<span className="right">{approved?.approved_at ? (approved.revoked ? <span className="chip chip-fail">已失效</span> : <span className="chip chip-ok">已批准</span>) : <span className="chip">未批准</span>}</span></div>
          <p className="fine">批准后导出物可带出本机；批准记录持久化留痕，内容变更后自动失效。</p>
          <div><button className="btn btn-primary" type="button" disabled={busy !== null || !report || report.has_flags} onClick={() => void approve()}>批准外发</button></div>
          <p className="fine">{approved?.revoked ? `失效：${approved.reason}` : approved?.approved_at ? `批准时间：${new Date(approved.approved_at).toLocaleString('zh-CN')}` : '先完成隐私检查并通过。'}</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">
          导出
          <span className="right" style={{ display: 'flex', gap: 8 }}>
            <span className="segment" id="segLevel">
              <button aria-pressed="true">内用草稿</button>
              <button aria-pressed="false">外发发布</button>
            </span>
            <span className="segment" id="segFmt">
              <button aria-pressed="true">PPTX</button>
              <button aria-pressed="false">HTML</button>
              <button aria-pressed="false">PDF</button>
            </span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="button" disabled={busy !== null || !allDone}
                  onClick={() => void exportAll('internal', ['PPTX'])}>导出（内用草稿）</button>
          <span className="fine">内用无需检查/批准，导出物标记 draft；三格式可任选。</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-h">导出记录<span className="card-h-note mono">{exports.length} 条</span></div>
        {exports.length === 0 ? <div className="empty">还没有导出记录</div> : (
          <table className="tbl">
            <thead><tr><th>格式</th><th>层级</th><th>时间</th><th>标记</th><th></th></tr></thead>
            <tbody>
              {exports.map((e) => (
                <tr key={e.export_id}>
                  <td><span className="chip mono">{e.format.toUpperCase()}</span></td>
                  <td>{e.export_scope === 'external' || e.delivery_status === 'formal' ? '外发' : '内用'}</td>
                  <td className="mono">{e.created_at ? new Date(e.created_at).toLocaleString('zh-CN') : '—'}</td>
                  <td><span className={`chip ${e.is_draft ? '' : 'chip-ok'}`}>{e.is_draft ? 'draft' : '已批准'}</span></td>
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
