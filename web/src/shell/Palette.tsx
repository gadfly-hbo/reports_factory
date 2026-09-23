/* ⌘K 命令面板:搜索项目 / 跳转当前项目阶段。 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../state/ui';
import { useProjects } from '../state/projects';
import { useProjectOrNull } from '../state/projectDetail';
import { STAGES } from '../state/types';

interface Cmd { label: string; hint: string; run(): void }

export function Palette() {
  const ui = useUI();
  const navigate = useNavigate();
  const { projects } = useProjects();
  const p = useProjectOrNull();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  useEffect(() => { if (ui.paletteOpen) { setQ(''); setSel(0); } }, [ui.paletteOpen]);

  const cmds = useMemo<Cmd[]>(() => {
    const list: Cmd[] = projects.map((proj) => ({
      label: `打开项目:${proj.title}`,
      hint: '项目',
      run: () => navigate(`/project/${proj.project_id}/materials`),
    }));
    if (p?.id) {
      for (const s of STAGES) {
        list.push({
          label: `跳转:${s.title}`,
          hint: '阶段',
          run: () => navigate(`/project/${p.id}/${s.key}`),
        });
      }
      list.push({ label: '品牌设置', hint: '设置', run: () => navigate(`/project/${p.id}/compose`) });
    }
    list.push({ label: '全局设置', hint: '设置', run: () => navigate('/settings') });
    return list;
  }, [projects, p?.id, navigate]);

  const filtered = q ? cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())) : cmds;

  if (!ui.paletteOpen) return null;

  const close = () => ui.closePalette();
  const runSel = (i: number) => {
    const c = filtered[i];
    if (c) { close(); c.run(); }
  };

  return (
    <div
      className="palette-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <div className="palette">
        <input
          autoFocus
          value={q}
          placeholder="搜索项目或命令…"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); runSel(sel); }
            else if (e.key === 'Escape') close();
          }}
        />
        <ul className="palette-list" role="listbox">
          {filtered.length === 0 && <li className="palette-item" style={{ color: 'var(--text-3)' }}>无匹配</li>}
          {filtered.map((c, i) => (
            <li key={c.label}>
              <button
                type="button"
                className={`palette-item${i === sel ? ' sel' : ''}`}
                role="option"
                aria-selected={i === sel}
                onClick={() => runSel(i)}
                onMouseEnter={() => setSel(i)}
              >
                <span>{c.label}</span>
                <span className="k">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
