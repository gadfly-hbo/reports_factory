/* 阶段子路由:/project/:id/:stage → ProjectShell(stage) + 对应视图。 */
import { Navigate, useParams } from 'react-router-dom';
import { ProjectShell } from '../shell/ProjectShell';
import { isStageKey } from '../state/types';
import { MaterialsView } from './MaterialsView';
import { EditorialView } from './EditorialView';
import { ComposeView } from './ComposeView';
import { CheckView } from './CheckView';
import { ExportView } from './ExportView';

export function StageRedirect() {
  const { id } = useParams();
  return <Navigate to={`/project/${id}/materials`} replace />;
}

export function StageRoute() {
  const { stage } = useParams();
  if (!stage || !isStageKey(stage)) return <StageRedirect />;
  return (
    <ProjectShell stage={stage}>
      {stage === 'materials' && <MaterialsView />}
      {stage === 'outline' && <EditorialView />}
      {stage === 'compose' && <ComposeView />}
      {stage === 'check' && <CheckView />}
      {stage === 'export' && <ExportView />}
    </ProjectShell>
  );
}
