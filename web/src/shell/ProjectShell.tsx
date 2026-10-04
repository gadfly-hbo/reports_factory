/* 项目路由壳:中央列 = StageBar + 页头(面包屑+eyebrow) + 阶段视图 Outlet。Inspector 由 ComposeView 外层渲染(AppShell 层)。 */
import { Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { StageBar } from './StageBar';
import { useProject } from '../state/projectDetail';
import { useUI } from '../state/ui';
import { Inspector } from './Inspector';
import { STAGES, STAGE_TITLE } from '../state/types';
import type { StageKey } from '../state/types';

export function ProjectShell({ stage, children }: { stage: StageKey; children?: ReactNode }) {
  const p = useProject();
  const ui = useUI();

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
        <StageBar stage={stage} />
        <div className="pagehead">
          <div className="crumbs">
            <span>{p.detail?.project.title ?? '…'}</span>
            <span className="sep" aria-hidden="true">/</span>
            <span>{STAGE_TITLE[stage]}</span>
          </div>
          <div className="eyebrow">制作工作台 · 阶段 {STAGES.find((s) => s.key === stage)?.n}</div>
        </div>
        {children ?? <Outlet />}
      </div>
      {!ui.inspCollapsed && <Inspector />}
    </div>
  );
}
