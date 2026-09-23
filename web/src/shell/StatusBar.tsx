/* 底部状态栏:当前项目 / 阶段 / 交付物 / 隐私 / 编排模式。 */
import { useLocation } from 'react-router-dom';
import { useProjectOrNull } from '../state/projectDetail';
import { DELIVERABLE_LABEL, PROJECT_STAGE_LABEL, STAGE_TITLE } from '../state/types';
import { isStageKey } from '../state/types';

export function StatusBar() {
  const location = useLocation();
  const p = useProjectOrNull();
  const d = p?.detail ?? null;
  const project = d?.project ?? null;
  const stageSeg = location.pathname.match(/^\/project\/[^/]+\/(\w+)/)?.[1] ?? null;
  const unresolved = (d?.conflicts ?? []).filter((c) => c.resolution === 'unresolved');

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
