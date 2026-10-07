/* 项目路由壳:页头(面包屑+eyebrow 步骤号) + 步骤视图 Outlet。步骤导航在 Sidebar（ui-contract S0.2）。 */
import { Outlet } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { useUI } from '../state/ui';
import { Inspector } from './Inspector';
import { STAGES, STAGE_TITLE } from '../state/types';
import type { StageKey } from '../state/types';

export function ProjectShell({ stage, children }: { stage: StageKey; children?: React.ReactNode }) {
  const p = useProject();
  const ui = useUI();
  const step = STAGES.find((s) => s.key === stage);

  if (p.loadFailed) {
    return (
      <div className="main">
        <div className="view">
          <div className="empty">项目加载失败——可能已被删除。<a href="#/">返回项目列表</a></div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-3col" style={{ flex: 1, minWidth: 0, display: 'flex' }}>
      <div className="main" id="main" tabIndex={-1}>
        <div className="pagehead">
          <div className="crumbs">
            <span>{p.detail?.project.title ?? '…'}</span>
            <span className="sep" aria-hidden="true">/</span>
            <span>{STAGE_TITLE[stage]}</span>
          </div>
          <div className="eyebrow">PPT 主流程{step ? ` · 第 ${String(step.n).padStart(2, '0')} 步` : ''}</div>
        </div>
        {children ?? <Outlet />}
      </div>
      {!ui.inspCollapsed && <Inspector />}
    </div>
  );
}
