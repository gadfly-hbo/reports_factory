/* 单项目详情上下文:三栏(侧栏/中央/Inspector)共享一份详情数据。
   集中承载项目操作:材料上传/冲突解决/大纲/组装/编辑/检查/导出/品牌。 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, post, put, del, errMsg } from './api';
import { useToast } from './toast';
import { useProjects } from './projects';
import type {
  BrandConfig, CheckReport, Conflict, ExportResult, OutlineDraft, ProjectDetail,
} from './types';

interface UploadResult {
  ok: boolean;
  failure_reason?: string;
  counts?: Record<string, number>;
  confirmations?: { question: string }[];
  available_sheets?: string[];
}

interface ProjectCtx {
  id: string;
  detail: ProjectDetail | null;
  loadFailed: boolean;
  busy: string;
  setBusy(s: string): void;
  reload(): Promise<void>;
  upload(file: File, sheet?: string): Promise<UploadResult | null>;
  resolveConflict(c: Conflict, resolution: 'source_a' | 'source_b'): Promise<void>;
  composeOutline(brief: { audience: string; purpose: string; page_budget: number; deliverable_type?: string }): Promise<OutlineDraft | null>;
  assemble(): Promise<boolean>;
  edit(op: Record<string, unknown>): Promise<boolean>;
  runChecks(exportScope?: 'internal' | 'external'): Promise<CheckReport | null>;
  doExport(opts: { mode: 'formal' | 'draft'; deliverable?: 'executive_summary'; exportScope?: 'internal' | 'external'; chart_data_mode?: string; ack_editable_data?: boolean; ack_external_share?: boolean }): Promise<ExportResult | null>;
  applyBrand(brand: BrandConfig): Promise<boolean>;
}

const Ctx = createContext<ProjectCtx | null>(null);

const fileKind = (filename: string): { kind: string; media_type: string } | null => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md': case 'markdown': return { kind: 'markdown', media_type: 'text/markdown' };
    case 'txt': return { kind: 'text', media_type: 'text/plain' };
    case 'csv': return { kind: 'csv', media_type: 'text/csv' };
    case 'xlsx': case 'xlsm': return { kind: 'xlsx', media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    case 'docx': return { kind: 'docx', media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    case 'png': return { kind: 'image', media_type: 'image/png' };
    case 'jpg': case 'jpeg': return { kind: 'image', media_type: 'image/jpeg' };
    default: return null;
  }
};

export function ProjectDetailProvider({ id, children }: { id: string; children: ReactNode }) {
  const toast = useToast();
  const projects = useProjects();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => { setDetail(null); setLoadFailed(false); setBusy(''); }, [id]);

  const reload = useCallback(async () => {
    try {
      const d = await api<ProjectDetail>(`/api/projects/${id}`);
      setDetail(d);
      setLoadFailed(false);
      void projects.reload();
    } catch {
      setLoadFailed(true);
    }
  }, [id, projects]);

  useEffect(() => { void reload(); }, [reload]);

  const upload = useCallback(async (file: File, sheet?: string): Promise<UploadResult | null> => {
    const meta = fileKind(file.name);
    if (!meta) { toast.show('不支持的格式（支持 md/txt/csv/xlsx/docx/png/jpg）', 'fail'); return null; }
    try {
      const content_base64 = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
      const r = await post<UploadResult>(`/api/projects/${id}/sources`, { filename: file.name, content_base64, ...meta, ...(sheet ? { sheet } : {}) });
      return r;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [id, toast]);

  const resolveConflict = useCallback(async (c: Conflict, resolution: 'source_a' | 'source_b') => {
    try {
      await post(`/api/projects/${id}/resolve-conflict`, { resolution: { [c.conflict_id]: resolution } });
      toast.show(`冲突已按${resolution === 'source_a' ? '前者' : '后者'}口径解决（已记录采用值）`, 'ok');
      await reload();
    } catch (e) {
      toast.show(errMsg(e), 'fail');
    }
  }, [id, reload, toast]);

  const composeOutline = useCallback(async (brief: { audience: string; purpose: string; page_budget: number; deliverable_type?: string }): Promise<OutlineDraft | null> => {
    setBusy('outline');
    try {
      const r = await post<{ draft: OutlineDraft }>(`/api/projects/${id}/outline`, { brief });
      return r.draft;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    } finally { setBusy(''); }
  }, [id, toast]);

  const assemble = useCallback(async (): Promise<boolean> => {
    setBusy('assemble');
    try {
      await post(`/api/projects/${id}/assemble`, {});
      toast.show('报告已组装，可预览与检查', 'ok');
      await reload();
      return true;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return false;
    } finally { setBusy(''); }
  }, [id, reload, toast]);

  const edit = useCallback(async (op: Record<string, unknown>): Promise<boolean> => {
    try {
      await post(`/api/projects/${id}/edit`, { op });
      await reload();
      return true;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return false;
    }
  }, [id, reload, toast]);

  const runChecks = useCallback(async (exportScope?: 'internal' | 'external'): Promise<CheckReport | null> => {
    try {
      return await post<CheckReport>(`/api/projects/${id}/checks`, exportScope ? { exportScope } : {});
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [id, toast]);

  const doExport = useCallback(async (opts: { mode: 'formal' | 'draft'; deliverable?: 'executive_summary'; exportScope?: 'internal' | 'external'; chart_data_mode?: string; ack_editable_data?: boolean; ack_external_share?: boolean }): Promise<ExportResult | null> => {
    setBusy('export');
    try {
      const d = detail;
      const isResearch = d?.deliverable_type === 'research_report';
      const formats = opts.deliverable === 'executive_summary' ? ['pptx', 'pdf', 'html'] : isResearch ? ['docx', 'html', 'pdf'] : ['pptx', 'pdf'];
      const r = await post<ExportResult>(`/api/projects/${id}/export`, {
        mode: opts.mode, formats,
        exportScope: opts.exportScope ?? 'internal',
        chart_data_mode: opts.exportScope === 'external' ? opts.chart_data_mode : undefined,
        ack_editable_data: opts.ack_editable_data,
        ack_external_share: opts.ack_external_share,
        ...(opts.deliverable ? { deliverable: opts.deliverable } : {}),
      });
      if (r.allowed) {
        toast.show(`已导出 ${r.exports?.length ?? 0} 个文件（${opts.mode === 'draft' ? '草稿，带标识' : '正式定稿'}${opts.exportScope === 'external' ? '，对外' : ''}）`, 'ok');
      } else {
        toast.show(r.reason, 'fail');
      }
      await reload();
      return r;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    } finally { setBusy(''); }
  }, [id, detail, reload, toast]);

  const applyBrand = useCallback(async (brand: BrandConfig): Promise<boolean> => {
    try {
      await put(`/api/projects/${id}/brand`, { brand });
      toast.show('品牌已应用（仅视觉，内容不变，下次导出生效）', 'ok');
      await reload();
      return true;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return false;
    }
  }, [id, reload, toast]);

  return (
    <Ctx.Provider value={{ id, detail, loadFailed, busy, setBusy, reload, upload, resolveConflict, composeOutline, assemble, edit, runChecks, doExport, applyBrand }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProject = (): ProjectCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProject 必须在 ProjectDetailProvider 内使用');
  return ctx;
};

/** 可空版本:状态栏等外壳组件在项目路由外使用(无 Provider 时返回 null) */
export const useProjectOrNull = (): ProjectCtx | null => {
  return useContext(Ctx);
};;
