/* 左侧栏:品牌块 / ⌘K 搜索 / 新建入口 / 项目列表 / 六步主流程导航 / 底部设置与口径声明（ui-contract S0.2）。 */
import { useLocation, useNavigate } from 'react-router-dom';
import { useProjects } from '../state/projects';
import { useUI } from '../state/ui';
import { useProjectOrNull } from '../state/projectDetail';
import { STAGES, STAGE_TITLE, isStageKey } from '../state/types';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const ui = useUI();
  const { projects } = useProjects();
  const detail = useProjectOrNull()?.detail ?? null;

  const currentId = location.pathname.match(/^\/project\/([^/]+)/)?.[1] ?? null;
  const currentStage = location.pathname.match(/^\/project\/[^/]+\/([\w-]+)$/)?.[1] ?? null;
  // 当前步骤：路由段优先；未匹配（/project/:id 根）时用后端最远解锁步
  const furthest = detail?.steps ? [...detail.steps].filter((s) => s.unlocked).at(-1)?.key : undefined;
  const activeStep = currentStage && isStageKey(currentStage) ? currentStage : furthest;

  return (
    <nav className="sidebar" aria-label="项目与步骤导航">
      <div className="sb-top">
        <button className="sb-search" type="button" onClick={ui.openPalette}>
          <span aria-hidden="true">⌕</span> 搜索项目与命令 <kbd>⌘K</kbd>
        </button>
        {!currentId && (
          <button className="sb-new" type="button" onClick={() => navigate('/?new=1')}>＋ 新建项目</button>
        )}
      </div>

      <div className="sb-section">
        <h2 className="sb-h">项目<span className="sb-h-count">{projects.length}</span></h2>
        {projects.length === 0 ? (
          <p className="sb-empty">还没有项目;点击「新建项目」开始。</p>
        ) : (
          <ul className="sb-list" role="list">
            {projects.map((p) => {
              const isCurrent = p.project_id === currentId;
              return (
                <li key={p.project_id}>
                  <div
                    className={`sb-item${isCurrent ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/project/${p.project_id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/project/${p.project_id}`); }}
                  >
                    <span className="sb-label" title={p.title}>{p.title}</span>
                    <span className="sb-meta">{isCurrent && activeStep ? STAGE_TITLE[activeStep] : ''}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {currentId && (
        <div className="sb-section">
          <h2 className="sb-h">PPT 主流程</h2>
          <ul className="sb-list" role="list" data-testid="step-nav">
            {STAGES.map((s) => {
              const isCurrent = activeStep === s.key;
              return (
                <li key={s.key}>
                  <button
                    className={`sb-item${isCurrent ? ' active' : ''}`}
                    type="button"
                    data-testid={`step-${s.key}`}
                    onClick={() => navigate(`/project/${currentId}/${s.key}`)}
                  >
                    <span className="sb-num" aria-hidden="true">{String(s.n).padStart(2, '0')}</span>
                    <span className="sb-label">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="sb-foot">
        <button
          className={`sb-item${location.pathname === '/settings' ? ' active' : ''}`}
          type="button"
          onClick={() => navigate('/settings')}
        >
          <span aria-hidden="true">⚙</span> 设置
        </button>
      </div>
    </nav>
  );
}
