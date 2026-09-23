/* 检查阶段:质量检查(阻断/警告)+ 对外范围隐私预检。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';
import Chip from '../components/Chip';
import Empty from '../components/Empty';
import type { CheckReport } from '../state/types';

export function CheckView() {
  const p = useProject();
  const [scope, setScope] = useState<'internal' | 'external'>('internal');
  const [report, setReport] = useState<CheckReport | null>(null);
  const d = p.detail;

  if (!d) return <div className="view"><p className="fine">加载中…</p></div>;
  if (!d.hasSpec) {
    return (
      <div className="view">
        <Empty>尚未组装报告——先完成「大纲」阶段。</Empty>
      </div>
    );
  }

  const run = async () => setReport(await p.runChecks(scope));

  return (
    <div className="view">
      <h1 className="view-h">质量检查</h1>
      <p className="view-sub">
        数字一致性 / 单位口径 / 来源引用 / 不确定性保留 / 排版密度;阻断项未清零不得出正式定稿(草稿可导出但带标识)。
      </p>

      <div className="card">
        <div className="card-h">运行检查</div>
        <div className="fld-row" style={{ alignItems: 'flex-end' }}>
          <div className="fld" style={{ maxWidth: 180 }}>
            <label className="fld-label" htmlFor="chk-scope">导出范围</label>
            <select id="chk-scope" value={scope} onChange={(e) => setScope(e.target.value as 'internal' | 'external')}>
              <option value="internal">内部(本机留存)</option>
              <option value="external">对外(先过隐私检查)</option>
            </select>
          </div>
          <div className="actions" style={{ margin: 0 }}>
            <button className="btn btn-primary" type="button" onClick={run}>运行检查</button>
          </div>
        </div>

        {report && (
          <div style={{ marginTop: 12 }}>
            <p>
              <Chip kind={report.blockers > 0 ? 'chip-fail' : 'chip-ok'}>{report.blockers} 阻断</Chip>{' '}
              <Chip kind="chip-warn">{report.warnings} 警告</Chip>
            </p>
            {report.issues.length === 0 && <p className="fine" style={{ color: 'var(--ok)' }}>检查通过。</p>}
            {report.issues.map((i, n) => (
              <div className="issue" key={n}>
                <Chip kind={i.severity === 'blocker' ? 'chip-fail' : 'chip-warn'}>
                  {i.severity === 'blocker' ? '阻断' : '警告'}
                </Chip>
                <span className="msg">{i.message}</span>
                <span className="ref">{i.object_ref}</span>
              </div>
            ))}
            {scope === 'external' && (
              <p className="fine">对外导出的完整隐私检查(图表底层数据 / 元数据 / 敏感来源)在「导出」阶段执行并逐项展示。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
