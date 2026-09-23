/* 导出阶段:范围/图表数据选择/确认链 + 正式/草稿/一页摘要 + 隐私明细 + 导出记录。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';
import { DELIVERABLE_LABEL } from '../state/types';
import Chip from '../components/Chip';
import type { ExportResult } from '../state/types';

export function ExportView() {
  const p = useProject();
  const [scope, setScope] = useState<'internal' | 'external'>('internal');
  const [chartMode, setChartMode] = useState<'aggregate_only' | 'keep_editable'>('aggregate_only');
  const [ackData, setAckData] = useState(false);
  const [ackShare, setAckShare] = useState(false);
  const [last, setLast] = useState<ExportResult | null>(null);
  const d = p.detail;

  if (!d) return <div className="view"><p className="fine">加载中…</p></div>;
  if (!d.hasSpec) {
    return <div className="view"><EmptyFallback /></div>;
  }

  const external = scope === 'external';

  return (
    <div className="view">
      <h1 className="view-h">导出<span className="chip chip-accent">{DELIVERABLE_LABEL[d.deliverable_type] ?? d.deliverable_type}</span></h1>
      <p className="view-sub">
        {d.deliverable_type === 'research_report' ? 'DOCX(可编辑)/ 独立 HTML / A4 PDF' : 'PPTX(原生可编辑)/ PDF'} ;
        正式定稿需阻断项清零。
      </p>

      <div className="card">
        <div className="card-h">导出选项</div>
        <div className="fld-row">
          <div className="fld" style={{ maxWidth: 190 }}>
            <label className="fld-label" htmlFor="exp-scope">分享范围</label>
            <select id="exp-scope" value={scope} onChange={(e) => setScope(e.target.value as 'internal' | 'external')}>
              <option value="internal">内部(本机留存)</option>
              <option value="external">对外(先过隐私检查)</option>
            </select>
          </div>
          {external && (
            <>
              <div className="fld" style={{ maxWidth: 260 }}>
                <label className="fld-label" htmlFor="exp-chart">图表底层数据</label>
                <select id="exp-chart" value={chartMode} onChange={(e) => setChartMode(e.target.value as 'aggregate_only' | 'keep_editable')}>
                  <option value="aggregate_only">只分享聚合结果(图表降级为图片)</option>
                  <option value="keep_editable">保留可编辑数据</option>
                </select>
              </div>
              <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 300 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={ackShare} onChange={(e) => setAckShare(e.target.checked)} />
                <span className="fld-label" style={{ margin: 0 }}>我确认本报告对外分享(默认禁止)</span>
              </label>
              {chartMode === 'keep_editable' && (
                <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 300 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={ackData} onChange={(e) => setAckData(e.target.checked)} />
                  <span className="fld-label" style={{ margin: 0 }}>我确认对外保留可编辑图表底层数据</span>
                </label>
              )}
            </>
          )}
        </div>
        <div className="actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={p.busy === 'export'}
            onClick={async () => setLast(await p.doExport({
              mode: 'formal',
              exportScope: scope,
              chart_data_mode: external ? chartMode : undefined,
              ack_editable_data: ackData,
              ack_external_share: ackShare,
            }))}
          >
            {p.busy === 'export' ? '导出中…' : '正式导出'}
          </button>
          <button className="btn" type="button" disabled={p.busy === 'export'} onClick={async () => setLast(await p.doExport({ mode: 'draft', exportScope: scope }))}>
            草稿导出(带未解决标识)
          </button>
          <button className="btn" type="button" disabled={p.busy === 'export'} onClick={async () => setLast(await p.doExport({ mode: 'formal', deliverable: 'executive_summary' }))}>
            导出一页摘要(PPTX/PDF/HTML)
          </button>
        </div>
        {last && !last.allowed && <div className="notice fail" style={{ marginTop: 10 }}>{last.reason}</div>}
      </div>

      {last?.privacy ? (
        <div className="card">
          <div className="card-h">
            隐私检查明细
            <span className="card-h-note">已检查 {last.privacy.checked_count} 项 / 未覆盖 {last.privacy.not_checked_count} 项(明示,不做虚假全面承诺)</span>
          </div>
          {last.privacy.items.map((i) => (
            <div className="issue" key={i.item}>
              <Chip kind={i.status === 'pass' ? 'chip-ok' : i.status === 'flag' ? 'chip-fail' : 'chip-warn'}>
                {i.status === 'pass' ? '已检查' : i.status === 'flag' ? '阻断' : '未覆盖'}
              </Chip>
              <span className="msg">{i.item}</span>
              {i.detail && <span className="msg" style={{ color: 'var(--text-3)' }}>{i.detail}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-h">隐私检查<span className="card-h-note">仅对外导出时执行</span></div>
          <p className="fine" style={{ margin: 0 }}>
            内部留存导出不做出境检查;分享范围切换为「对外」后,导出前会逐项检查图表底层数据、
            元数据与敏感来源,未覆盖项会在此明示,不做虚假全面承诺。
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-h">导出记录<span className="card-h-note">{d.exports.length} 次</span></div>
        {d.exports.length === 0 ? (
          <p className="fine">尚未导出。</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>导出</th><th>格式</th><th>类型</th></tr></thead>
            <tbody>
              {d.exports.slice().reverse().map((e) => (
                <tr key={e.export_id}>
                  <td className="mono">{e.export_id}</td>
                  <td>{e.format.toUpperCase()}</td>
                  <td>{e.is_draft ? <Chip kind="chip-warn">草稿</Chip> : <Chip kind="chip-ok">定稿</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EmptyFallback() {
  return <div className="empty">尚未组装报告——先完成「大纲」阶段。</div>;
}
