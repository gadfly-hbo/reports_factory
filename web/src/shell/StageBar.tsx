/* 中央列顶部:五阶段导航(材料→大纲→组装→检查→导出)+ Inspector 开关。
   阶段状态:done=前置已过 / active=当前 / locked=前置未完成。 */
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { useUI } from '../state/ui';
import { STAGES } from '../state/types';
import type { StageKey } from '../state/types';

export function StageBar({ stage }: { stage: StageKey }) {
  const p = useProject();
  const ui = useUI();
  const navigate = useNavigate();

  const d = p.detail;
  const hasMaterials = (d?.sources.length ?? 0) > 0;
  const hasSpec = d?.hasSpec ?? false;
  // 阶段解锁:大纲需材料;组装/检查/导出需已组装 spec
  const unlocked: Record<StageKey, boolean> = {
    materials: true,
    outline: hasMaterials,
    compose: hasSpec,
    check: hasSpec,
    export: hasSpec,
  };
  const reached = (k: StageKey): boolean => {
    if (k === 'materials') return hasMaterials;
    if (k === 'outline') return hasMaterials;
    if (k === 'compose') return hasSpec;
    if (k === 'check') return hasSpec;
    return (d?.exports.length ?? 0) > 0;
  };

  return (
    <div className="stagebar" role="navigation" aria-label="制作阶段">
      <ol className="stages">
        {STAGES.map((s) => {
          const cls = [
            'stage',
            stage === s.key ? 'active' : '',
            !unlocked[s.key] ? 'locked' : reached(s.key) && stage !== s.key ? 'done' : '',
          ].filter(Boolean).join(' ');
          return (
            <li key={s.key}>
              <button
                type="button"
                className={cls}
                disabled={!unlocked[s.key]}
                onClick={() => navigate(`/project/${p.id}/${s.key}`)}
                aria-current={stage === s.key ? 'step' : undefined}
              >
                <span className="stage-n" aria-hidden="true">{s.n}</span> {s.title}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="stagebar-right">
        <button className="btn btn-ghost btn-sm" type="button" onClick={ui.toggleInsp} title="Inspector(⌘I)">
          {ui.inspCollapsed ? '▸ Inspector' : '◂ Inspector'}
        </button>
      </div>
    </div>
  );
}
