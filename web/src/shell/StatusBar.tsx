/* 底部状态栏:项目名 · 当前步骤 · 发布状态徽 | 本机服务（ui-contract S0.3）。 */
import { useLocation } from 'react-router-dom';
import { useProjectOrNull } from '../state/projectDetail';
import { publishStateOf, STAGE_TITLE, isStageKey } from '../state/types';

export function StatusBar() {
  const location = useLocation();
  const p = useProjectOrNull();
  const d = p?.detail ?? null;
  const project = d?.project ?? null;
  const stageSeg = location.pathname.match(/^\/project\/[^/]+\/([\w-]+)/)?.[1] ?? null;
  const publish = publishStateOf(d);

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
      {d && (
        <>
          <span className="sep">|</span>
          <span className="seg" data-testid="publish-state">发布:{publish}</span>
          <span className="sep">|</span>
          <span className="seg">隐私:{project?.privacy_policy === 'local_only' ? 'local_only' : project?.privacy_policy === 'allow_external' ? 'external_ok' : 'external+批准'}</span>
        </>
      )}
      <span className="spacer" />
      <span className="seg">本机服务 127.0.0.1</span>
    </footer>
  );
}
