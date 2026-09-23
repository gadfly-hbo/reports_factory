/* 路由入口:三栏外壳 + 项目五阶段子路由(/project/:id/:stage?)。 */
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './shell/AppShell';
import { ProjectsView } from './views/ProjectsView';
import { SettingsView } from './views/SettingsView';
import { StageRedirect, StageRoute } from './views/StageRoute';
import { ProjectsProvider } from './state/projects';
import { UIProvider } from './state/ui';
import { ToastProvider } from './state/toast';

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <UIProvider>
          <ProjectsProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<ProjectsView />} />
                <Route path="/settings" element={<SettingsView />} />
                <Route path="/project/:id" element={<StageRedirect />} />
                <Route path="/project/:id/:stage" element={<StageRoute />} />
                <Route path="*" element={<ProjectsView />} />
              </Route>
            </Routes>
          </ProjectsProvider>
        </UIProvider>
      </ToastProvider>
    </HashRouter>
  );
}
