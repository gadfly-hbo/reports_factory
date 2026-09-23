/* 左侧栏:品牌块 / ⌘K 搜索 / 新建入口 / 项目列表 / 当前项目阶段 / 底部设置与边界声明。 */
import { useLocation, useNavigate } from 'react-router-dom';
import { useProjects } from '../state/projects';
import { useUI } from '../state/ui';
import { PROJECT_STAGE_LABEL, STAGES } from '../state/types';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const ui = useUI();
  const { projects } = useProjects();

  const currentId = location.pathname.match(/^\/project\/([^/]+)/)?.[1] ?? null;
  const currentStage = location.pathname.match(/^\/project\/[^/]+\/(\w+)$/)?.[1] ?? null;

  return (
    <nav className="sidebar" aria-label="项目与阶段导航">
      <div className="sb-brand">
        <div className="mark" aria-hidden="true">报</div>
        <div>
          <strong>Report Studio</strong>
          <small>报告工厂 · 材料到交付</small>
        </div>
      </div>

      <div className="sb-top">
        <button className="sb-search" type="button" onClick={ui.openPalette}>
          <span aria-hidden="true">⌕</span> 搜索项目与命令 <kbd>⌘K</kbd>
        </button>
        {!currentId && (
          <button className="sb-new" type="button" onClick={() => navigate('/?new=1')}>＋ 新建汇报</button>
        )}
      </div>

      <div className="sb-section">
        <h2 className="sb-h">项目<span className="sb-h-count">{projects.length}</span></h2>
        {projects.length === 0 ? (
          <p className="sb-empty">还没有项目;点击「新建汇报」开始。</p>
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
                    <span className="sb-meta">{PROJECT_STAGE_LABEL[p.stage] ?? p.stage}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {currentId && (
        <div className="sb-section">
          <h2 className="sb-h">当前项目阶段</h2>
          <ul className="sb-list" role="list">
            {STAGES.map((s) => {
              const isCurrent = currentStage === s.key;
              return (
                <li key={s.key}>
                  <button
                    className={`sb-item${isCurrent ? ' active' : ''}`}
                    type="button"
                    onClick={() => navigate(`/project/${currentId}/${s.key}`)}
                  >
                    <span className="sb-label">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="sb-foot">
        <span className="pill pill-offline" title="仅在本机运行(127.0.0.1),材料默认不出本机">● 本机服务 · 本地优先</span>
        <button
          className={`sb-item${location.pathname === '/settings' ? ' active' : ''}`}
          type="button"
          onClick={() => navigate('/settings')}
        >
          <span aria-hidden="true">⚙</span> 设置
        </button>
        <div className="sb-note">
          <strong>来源绑定 ≠ 事实已证实</strong>
          推断不会被升级为结论;冲突不静默择一;阻断未清零不能出正式定稿。
        </div>
      </div>
    </nav>
  );
}
