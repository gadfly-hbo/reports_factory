/* 底部状态栏:项目名 · 当前步骤 · 发布状态徽 | 本机服务（ui-contract S0.3）。 */
import { useLocation } from 'react-router-dom';
import { useProjectOrNull } from '../state/projectDetail';
import { STAGE_TITLE, isStageKey } from '../state/types';

export function StatusBar() {
  const location = useLocation();
  const p = useProjectOrNull();
  const d = p?.detail ?? null;
  const project = d?.project ?? null;
  const stageSeg = location.pathname.match(/^\/project\/[^/]+\/([\w-]+)/)?.[1] ?? null;

  return (
    <footer className="statusbar" role="contentinfo">
      <span className="seg">
        {project ? (
          <>
            <strong>{project.title}</strong>
            <span className="sep">·</span>
            {stageSeg && isStageKey(stageSeg) ? STAGE_TITLE[stageSeg] : ''}
          </>
        ) : (
          <>Report Studio · {location.pathname.startsWith('/settings') ? '设置' : '项目列表'}</>
        )}
      </span>
      <span className="spacer" />
    </footer>
  );
}
