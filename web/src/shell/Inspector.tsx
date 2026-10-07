/* 右侧检查器:上下文 / 导出与批准 两页签（ui-contract S0.5；S7 接批准语义,当前为骨架）。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';

export function Inspector() {
  const p = useProject();
  const [tab, setTab] = useState<'ctx' | 'exp'>('ctx');
  const d = p.detail;
  if (!d) return <aside className="inspector" aria-label="检查器" />;

  return (
    <aside className="inspector" aria-label="检查器">
      <div className="insp-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'ctx'} className={tab === 'ctx' ? 'active' : ''} type="button" onClick={() => setTab('ctx')}>上下文</button>
        <button role="tab" aria-selected={tab === 'exp'} className={tab === 'exp' ? 'active' : ''} type="button" onClick={() => setTab('exp')}>导出与批准</button>
      </div>
      {tab === 'ctx' && (
        <dl className="kv">
          <dt>项目名称</dt><dd>{d.project.title}</dd>
          {d.project.purpose && (<><dt>项目简介</dt><dd>{d.project.purpose}</dd></>)}
          <dt>资料数</dt><dd>{d.sources.length}</dd>
          <dt>隐私策略</dt><dd>{d.project.privacy_policy}</dd>
        </dl>
      )}
      {tab === 'exp' && (
        d.exports.length === 0 ? (
          <p className="fine">还没有导出记录。</p>
        ) : (
          <ul className="sb-list" role="list">
            {d.exports.map((e) => (
              <li key={e.export_id}>
                <div className="sb-item" role="presentation">
                  <span className="sb-label">{e.format.toUpperCase()} · {e.export_scope === 'external' || e.delivery_status === 'formal' ? '外发' : 'draft'}</span>
                  <span className="sb-meta">{e.created_at ? new Date(e.created_at).toLocaleString('zh-CN') : ''}</span>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </aside>
  );
}
