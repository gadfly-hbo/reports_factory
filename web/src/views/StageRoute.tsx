/* 步骤子路由:/project/:id/:step → ProjectShell(step) + 对应视图。
   旧报告路由(materials/outline/compose/check/export/ppt)一律重定向,不渲染旧视图（ui-contract N5）。 */
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ProjectShell } from '../shell/ProjectShell';
import { isStageKey, type StageKey } from '../state/types';
import { SetupView } from './SetupView';
import { BuildView } from './BuildView';

const LEGACY: Record<string, true> = { materials: true, outline: true, compose: true, check: true, export: true, ppt: true };

/** /project/:id → 重定向到最远已解锁步骤,兜底 upload（ui-contract S-RT）。 */
export function StageRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!alive) return;
        if (!res.ok) throw new Error('load failed');
        const detail = (await res.json()) as { steps: { key: StageKey; unlocked: boolean }[] };
        const furthest = [...detail.steps].filter((s) => s.unlocked).at(-1)?.key ?? 'upload';
        navigate(`/project/${id}/${furthest}`, { replace: true });
      } catch {
        if (alive) navigate(`/project/${id}/upload`, { replace: true });
      }
    })();
    return () => { alive = false; };
  }, [id, navigate]);
  return <div className="main"><div className="empty">跳转中…</div></div>;
}

export function StageRoute() {
  const { id, stage } = useParams();
  if (stage && LEGACY[stage]) return <Navigate to={`/project/${id}/upload`} replace />;
  if (!stage || !isStageKey(stage)) return <StageRedirect />;
  return (
    <ProjectShell stage={stage}>
      {/* 两屏制：prepare = 准备（建/传/理解/框架），build = 产出（生成/编辑/下载） */}
      {(stage === 'upload' || stage === 'understand' || stage === 'framework') && <SetupView />}
      {stage === 'generate' && <BuildView />}
      {stage === 'page-edit' && <BuildView />}
      {stage === 'publish' && <BuildView />}
    </ProjectShell>
  );
}
