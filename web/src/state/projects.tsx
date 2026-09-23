/* 项目列表上下文:侧栏、项目总览、命令面板共用一份数据。 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, post, errMsg } from './api';
import { useToast } from './toast';
import type { Project } from './types';

interface ProjectsCtx {
  projects: Project[];
  loaded: boolean;
  error: string | null;
  reload(): Promise<void>;
  create(form: { title: string; purpose?: string }): Promise<string | null>;
  remove(p: Project): Promise<void>;
}

const Ctx = createContext<ProjectsCtx | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await api<{ projects: Project[] }>('/api/projects');
      setProjects(r.projects);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback(async (form: { title: string; purpose?: string }): Promise<string | null> => {
    try {
      const r = await post<{ project: Project }>('/api/projects', form);
      toast.show('项目已创建', 'ok');
      await reload();
      return r.project.project_id;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [reload, toast]);

  const remove = useCallback(async (p: Project): Promise<void> => {
    try {
      await api(`/api/projects/${p.project_id}`, { method: 'DELETE' });
      toast.show(`已删除「${p.title}」及其全部材料与导出`);
      await reload();
    } catch (e) {
      toast.show(errMsg(e), 'fail');
    }
  }, [reload, toast]);

  return (
    <Ctx.Provider value={{ projects, loaded, error, reload, create, remove }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProjects = (): ProjectsCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProjects 必须在 ProjectsProvider 内使用');
  return ctx;
};
