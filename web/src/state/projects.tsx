/* 项目列表上下文:GET /api/projects(后端只列 PPT 项目,G6)+ 创建/删除动作。 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Project } from './types';
import { api } from './api';

interface ProjectsCtx {
  projects: Project[];
  loaded: boolean;
  refresh: () => Promise<void>;
  create: (input: { title: string; purpose?: string; template_id?: string; privacy_policy?: string }) => Promise<string | null>;
  remove: (p: Project) => Promise<void>;
}

const Ctx = createContext<ProjectsCtx | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ projects: Project[] }>('/api/projects');
      setProjects(r.projects);
    } catch {
      setProjects([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = useCallback<ProjectsCtx['create']>(async (input) => {
    try {
      const r = await api<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' } });
      await refresh();
      return r.project.project_id;
    } catch {
      return null;
    }
  }, [refresh]);

  const remove = useCallback<ProjectsCtx['remove']>(async (p) => {
    try {
      await api(`/api/projects/${p.project_id}`, { method: 'DELETE' });
    } finally {
      await refresh();
    }
  }, [refresh]);

  const value = useMemo(() => ({ projects, loaded, refresh, create, remove }), [projects, loaded, refresh, create, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useProjects = (): ProjectsCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProjects 必须在 ProjectsProvider 内使用');
  return v;
};
