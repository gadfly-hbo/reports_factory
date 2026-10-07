/* 项目详情上下文：拉取 /api/projects/:id 六步聚合，供壳层与各步视图消费。 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProjectDetail } from './types';

interface ProjectCtx {
  detail: ProjectDetail | null;
  loadFailed: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ProjectCtx | null>(null);

export function ProjectDetailProvider({ id, children }: { id: string; children: ReactNode }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      setDetail((await res.json()) as ProjectDetail);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setDetail(null);
    setLoading(true);
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ detail, loadFailed, loading, refresh }), [detail, loadFailed, loading, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useProject = (): ProjectCtx => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProject 必须在 ProjectDetailProvider 内使用');
  return v;
};
export const useProjectOrNull = (): ProjectCtx | null => useContext(Ctx);
