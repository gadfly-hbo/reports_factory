/* 底部状态栏:当前项目 / 阶段 / 交付物 / 隐私 / 编审(G1·G2·待复核) / 编排模式。 */
import { useLocation } from 'react-router-dom';
import { useProjectOrNull } from '../state/projectDetail';
import { DELIVERABLE_LABEL, EDITORIAL_STATUS_LABEL, PROJECT_STAGE_LABEL, STAGE_TITLE } from '../state/types';
import { isStageKey } from '../state/types';

export function StatusBar() {
  const location = useLocation();
  const p = useProjectOrNull();
  const d = p?.detail ?? null;
  const project = d?.project ?? null;
  const stageSeg = location.pathname.match(/^\/project\/[^/]+\/(\w+)/)?.[1] ?? null;
  const unresolved = (d?.conflicts ?? []).filter((c) => c.resolution === 'unresolved');
  const ed = d?.editorial ?? null;

  return (
    <footer className="statusbar" role="contentinfo">
      <span className="seg">
        {project ? (
          <>
            <strong>{project.title}</strong>
            <span className="sep">·</span>
            阶段 {PROJECT_STAGE_LABEL[project.stage] ?? project.stage}
            {stageSeg && isStageKey(stageSeg) && (
              <>
                <span className="sep">·</span>查看:{STAGE_TITLE[stageSeg]}
              </>
            )}
          </>
        ) : (
          <>Report Studio · {location.pathname.startsWith('/settings') ? '设置' : '项目列表'}</>
        )}
      </span>
      {d && (
        <>
          <span className="sep">|</span>
          <span className="seg">交付物:{DELIVERABLE_LABEL[d.deliverable_type] ?? d.deliverable_type}</span>
          <span className="sep">|</span>
          <span className="seg">隐私:{project?.privacy_policy === 'local_only' ? '仅本地' : '允许外部'}</span>
          {ed && (
            <>
              <span className="sep">|</span>
              <span className="seg">编审:{EDITORIAL_STATUS_LABEL[ed.status] ?? ed.status}</span>
              <span className="sep">·</span>
              {/* 内容批准(G1)与发布确认(G2)分开展示(§13.3) */}
              <span className="seg" style={{ color: ed.g1 ? 'var(--ok)' : 'var(--muted)' }}>G1 {ed.g1 ? '✓' : '…'}</span>
              <span className="seg" style={{ color: ed.g2 ? 'var(--ok)' : 'var(--muted)' }}>G2 {ed.g2 ? '✓' : '…'}</span>
              {ed.pending_pages > 0 && (
                <span className="seg" style={{ color: 'var(--fail)' }}>待复核 {ed.pending_pages} 页</span>
              )}
            </>
          )}
          {unresolved.length > 0 && (
            <>
              <span className="sep">|</span>
              <span className="seg" style={{ color: 'var(--fail)' }}>未解决冲突 {unresolved.length}</span>
            </>
          )}
        </>
      )}
      <span className="spacer" />
      <span className="seg">编排:确定性模式 · 本机服务 127.0.0.1</span>
    </footer>
  );
}
