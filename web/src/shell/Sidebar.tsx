/* 左侧栏:品牌块 / ⌘K 搜索 / 新建入口 / 项目列表 / 当前项目阶段 / 底部设置与边界声明。 */
import { useLocation, useNavigate } from 'react-router-dom';
import { useProjects } from '../state/projects';
import { useUI } from '../state/ui';
import { isStageKey, MAIN_STAGES, PROJECT_STAGE_LABEL, STAGES, STAGE_TITLE } from '../state/types';
import { useState } from 'react';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const ui = useUI();
  const { projects } = useProjects();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const currentId = location.pathname.match(/^\/project\/([^/]+)/)?.[1] ?? null;
  const currentStage = location.pathname.match(/^\/project\/[^/]+\/(\w+)$/)?.[1] ?? null;

  return (
    <nav className="sidebar" aria-label="项目与阶段导航">
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
              // 当前项目以路由阶段为准(STAGE_TITLE 与面包屑同一套五阶段词汇)——
              // 列表数据可能滞后于本会话操作,且 PROJECT_STAGE_LABEL 是后端粗阶段词汇,与路由阶段不一致
              const meta = isCurrent && currentStage && isStageKey(currentStage)
                ? STAGE_TITLE[currentStage]
                : (PROJECT_STAGE_LABEL[p.stage] ?? p.stage);
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
                    <span className="sb-meta">{meta}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {currentId && (
        <div className="sb-section">
          <h2 className="sb-h">制作主路径</h2>
          <ul className="sb-list" role="list" data-testid="main-path-nav">
            {MAIN_STAGES.map((s) => {
              const isCurrent = currentStage === s.key;
              return (
                <li key={s.key}>
                  <button
                    className={`sb-item${isCurrent ? ' active' : ''}`}
                    type="button"
                    onClick={() => navigate(`/project/${currentId}/${s.key}`)}
                  >
                    <span className="sb-num" aria-hidden="true">{String(s.n).padStart(2, '0')}</span>
                    <span className="sb-label">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            className="sb-h sb-adv-toggle" type="button" data-testid="advanced-toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen(!advancedOpen)}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', marginTop: 10 }}
          >
            高级 {advancedOpen ? '▾' : '▸'}
          </button>
          {advancedOpen && (
            <ul className="sb-list" role="list" data-testid="advanced-nav">
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
          )}
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
        <div className="sb-note">
          <strong>来源绑定 ≠ 事实已证实</strong>
          推断不会被升级为结论;冲突不静默择一;阻断未清零不能出正式定稿。
        </div>
      </div>
    </nav>
  );
}
