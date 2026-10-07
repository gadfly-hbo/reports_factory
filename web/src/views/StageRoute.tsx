/* 步骤子路由:/project/:id/:step → ProjectShell(step) + 对应视图。
   旧报告路由(materials/outline/compose/check/export/ppt)一律重定向,不渲染旧视图（ui-contract N5）。 */
import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ProjectShell } from '../shell/ProjectShell';
import { isStageKey, type StageKey } from '../state/types';
import { UploadView } from './UploadView';
import { UnderstandView } from './UnderstandView';
import { FrameworkView } from './FrameworkView';
import { GenerateView } from './GenerateView';
import { PageEditView } from './PageEditView';
import { PublishView } from './PublishView';

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
      {stage === 'upload' && <UploadView />}
      {stage === 'understand' && <UnderstandView />}
      {stage === 'framework' && <FrameworkView />}
      {stage === 'generate' && <GenerateView />}
      {stage === 'page-edit' && <PageEditView />}
      {stage === 'publish' && <PublishView />}
    </ProjectShell>
  );
}
