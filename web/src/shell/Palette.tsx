/* ⌘K 命令面板:打开项目 / 跳转六步 / 全局设置（ui-contract S0.4）。 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../state/projects';
import { useUI } from '../state/ui';
import { STAGES, STAGE_TITLE } from '../state/types';

interface Cmd { id: string; label: string; run: () => void }

export function Palette() {
  const ui = useUI();
  const navigate = useNavigate();
  const { projects } = useProjects();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const currentId = useMemo(() => window.location.hash.match(/^#\/project\/([^/]+)/)?.[1] ?? null, [ui.paletteOpen]);

  const cmds = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    for (const p of projects) out.push({ id: `open-${p.project_id}`, label: `打开项目:${p.title}`, run: () => navigate(`/project/${p.project_id}`) });
    if (currentId) for (const s of STAGES) out.push({ id: `step-${s.key}`, label: `跳转:${STAGE_TITLE[s.key]}`, run: () => navigate(`/project/${currentId}/${s.key}`) });
    out.push({ id: 'settings', label: '全局设置', run: () => navigate('/settings') });
    return out;
  }, [projects, currentId, navigate]);

  const filtered = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  useEffect(() => { setSel(0); setQ(''); }, [ui.paletteOpen]);

  if (!ui.paletteOpen) return null;
  return (
    <div className="palette-backdrop" role="presentation" onClick={ui.closePalette}>
      <div className="palette" role="dialog" aria-label="命令面板" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          placeholder="搜索命令…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { filtered[sel]?.run(); ui.closePalette(); }
            else if (e.key === 'Escape') ui.closePalette();
          }}
        />
        <ul role="listbox">
          {filtered.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === sel} className={i === sel ? 'active' : ''}
                onMouseEnter={() => setSel(i)} onClick={() => { c.run(); ui.closePalette(); }}>
              {c.label}
            </li>
          ))}
          {filtered.length === 0 && <li className="fine" role="presentation">无匹配命令</li>}
        </ul>
      </div>
    </div>
  );
}
