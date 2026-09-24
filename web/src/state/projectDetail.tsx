/* 单项目详情上下文:三栏(侧栏/中央/Inspector)共享一份详情数据。
   集中承载项目操作:材料上传/冲突解决/大纲/组装/编辑/检查/导出/品牌。 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, post, put, del, errMsg } from './api';
import { useToast } from './toast';
import { useProjects } from './projects';
import type {
  BrandConfig, CheckIssueLite, CheckReport, Conflict, ExportResult, OutlineDraft, OutboundPreview, ProjectDetail,
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
  uploadBundle(file: File): Promise<{ ok: boolean; deduped?: boolean; error?: string; update?: { changed: string[]; added: string[] } } | null>;
  resolveConflict(c: Conflict, resolution: 'source_a' | 'source_b'): Promise<void>;
  composeOutline(brief: { audience: string; purpose: string; page_budget: number; deliverable_type?: string }): Promise<OutlineDraft | null>;
  assemble(): Promise<boolean>;
  edit(op: Record<string, unknown>, opts?: { source?: string; expectedRevision?: string }): Promise<{ ok: boolean; diff?: string; reason?: string } | null>;
  draftProposal(intent: string): Promise<{ op?: Record<string, unknown>; note?: string; expected_revision?: string; source?: string; needsApproval?: boolean } | null>;
  runChecks(exportScope?: 'internal' | 'external'): Promise<CheckReport | null>;
  runSemanticChecks(): Promise<{ issues?: CheckIssueLite[]; source?: 'ai'; ai?: { provider: string }; needsApproval?: boolean } | null>;
  draftEvidenceGaps(): Promise<{ created?: { request_id: string; question: string }[]; needsApproval?: boolean } | null>;
  doExport(opts: { mode: 'formal' | 'draft'; deliverable?: 'executive_summary'; exportScope?: 'internal' | 'external'; chart_data_mode?: string; ack_editable_data?: boolean; ack_external_share?: boolean }): Promise<ExportResult | null>;
  applyBrand(brand: BrandConfig): Promise<boolean>;
  saveBrief(brief: Record<string, unknown>): Promise<boolean>;
  composeOutlineAI(brief: { audience: string; purpose: string; page_budget: number; deliverable_type?: string }): Promise<{ draft?: OutlineDraft; ai?: { used: boolean; usedFallback: boolean; provider?: string; reason?: string }; needsApproval?: boolean } | null>;
  outboundPreview(mode: 'structure-only' | 'authorized-summary'): Promise<OutboundPreview | null>;
  approveOutbound(mode: 'structure-only' | 'authorized-summary'): Promise<boolean>;
  recommend(): Promise<{ logical_key: string; placement: string; reason: string; sticky?: boolean }[] | null>;
  recommendAI(): Promise<{ recommendations?: { logical_key: string; placement: string; reason: string; sticky?: boolean }[]; source?: 'ai' | 'rules'; ai?: { used: boolean; usedFallback: boolean; provider?: string; reason?: string }; needsApproval?: boolean } | null>;
  decide(decisions: { logical_key: string; placement: string; reason?: string }[]): Promise<boolean>;
  approveG1(approver: string): Promise<{ ok: boolean; warnings?: string[]; error?: string }>;
  resolvePending(keys: string[], pages?: string[]): Promise<boolean>;
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

  const uploadBundle = useCallback(async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text());
      const r = await post<{ ok: boolean; deduped?: boolean; error?: string; update?: { changed: string[]; added: string[] } }>(`/api/projects/${id}/bundle`, bundle);
      await reload();
      return r;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [id, reload, toast]);

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

  /** 编辑走变更控制器（/propose）：差异显式可见；被拒（锁定/版本冲突/超范围）时给出原因。
   *  expectedRevision 可显式传入（S5/G7：模型草案按起草时刻修订提交，不豁免 409）。 */
  const edit = useCallback(async (op: Record<string, unknown>, opts?: { source?: string; expectedRevision?: string }): Promise<{ ok: boolean; diff?: string; reason?: string } | null> => {
    const revision = opts?.expectedRevision ?? detail?.spec?.revision_id;
    if (!revision) { toast.show('尚未组装报告', 'fail'); return null; }
    try {
      const r = await post<{
        ok: boolean;
        state: string;
        reason?: string;
        proposal?: { changes?: { object_id: string; field: string; before?: unknown; after?: unknown }[] };
      }>(`/api/projects/${id}/propose`, { op, expected_revision: revision, ...(opts?.source ? { source: opts.source } : {}) });
      await reload();
      if (!r.ok) {
        toast.show(r.reason ?? '变更被拒', 'fail');
        return { ok: false, reason: r.reason };
      }
      const c = r.proposal?.changes?.[0];
      return { ok: true, diff: c ? `${c.object_id}.${c.field}: ${String(c.before ?? '（空）')} → ${String(c.after ?? '（空）')}` : undefined };
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [id, detail, reload, toast]);

  const runChecks = useCallback(async (exportScope?: 'internal' | 'external'): Promise<CheckReport | null> => {
    try {
      return await post<CheckReport>(`/api/projects/${id}/checks`, exportScope ? { exportScope } : {});
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [id, toast]);

  /** M5 语义检查（授权摘要，warning-only）：403 需批准时返回哨兵 */
  const runSemanticChecks = useCallback(async () => {
    try {
      return await post<{ issues: CheckIssueLite[]; source: 'ai'; ai: { provider: string } }>(`/api/projects/${id}/checks/ai`, {});
    } catch (e) {
      const msg = errMsg(e);
      if (msg.includes('尚未批准')) return { needsApproval: true };
      toast.show(msg, 'fail');
      return null;
    }
  }, [id, toast]);

  /** M5 补证建议：生成 EvidenceRequest 草稿 */
  const draftEvidenceGaps = useCallback(async () => {
    try {
      return await post<{ created: { request_id: string; question: string }[] }>(`/api/projects/${id}/evidence-requests/ai-draft`, {});
    } catch (e) {
      const msg = errMsg(e);
      if (msg.includes('尚未批准')) return { needsApproval: true };
      toast.show(msg, 'fail');
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

  // ---- M4 编审动作（发现/任务书/取舍/蓝图/G1/待复核） ----

  const saveBrief = useCallback(async (brief: Record<string, unknown>): Promise<boolean> => {
    try {
      await post(`/api/projects/${id}/brief`, { brief });
      toast.show('任务书已保存（编审状态可恢复）', 'ok');
      await reload();
      return true;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return false;
    }
  }, [id, reload, toast]);

  /** M5 提案起草（S5）：只起草不应用，应用由视图确认后走 edit */
  const draftProposal = useCallback(async (intent: string) => {
    try {
      return await post<{ op: Record<string, unknown>; note: string; expected_revision: string; source: string }>(
        `/api/projects/${id}/proposal/draft`,
        { intent },
      );
    } catch (e) {
      const msg = errMsg(e);
      if (msg.includes('尚未批准')) return { needsApproval: true };
      toast.show(msg, 'fail');
      return null;
    }
  }, [id, toast]);

  /** M5 AI 蓝图编排：403 需批准时返回哨兵，由视图弹预览层 */
  const composeOutlineAI = useCallback(async (brief: { audience: string; purpose: string; page_budget: number; deliverable_type?: string }) => {
    try {
      return await post<{ draft?: OutlineDraft; ai?: { used: boolean; usedFallback: boolean; provider?: string; reason?: string }; needsApproval?: boolean }>(
        `/api/projects/${id}/outline/ai`,
        { brief },
      );
    } catch (e) {
      const msg = errMsg(e);
      if (msg.includes('尚未批准')) return { needsApproval: true };
      toast.show(msg, 'fail');
      return null;
    }
  }, [id, toast]);

  const outboundPreview = useCallback(async (mode: 'structure-only' | 'authorized-summary') => {
    try {
      return await post<OutboundPreview>(`/api/projects/${id}/outbound/preview`, { mode });
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [id, toast]);

  const approveOutbound = useCallback(async (mode: 'structure-only' | 'authorized-summary') => {
    try {
      await post(`/api/projects/${id}/outbound/approve`, { mode });
      toast.show('已批准本会话出站（同类调用不再询问，出站日志可审计）', 'ok');
      await reload();
      return true;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return false;
    }
  }, [id, reload, toast]);

  const recommend = useCallback(async () => {
    try {
      const r = await post<{ recommendations: { logical_key: string; placement: string; reason: string; sticky?: boolean }[] }>(`/api/projects/${id}/recommend`, {});
      return r.recommendations;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return null;
    }
  }, [id, toast]);

  /** M5 AI 取舍推荐（授权摘要）：403 需批准时返回哨兵，由视图弹预览层 */
  const recommendAI = useCallback(async (): Promise<{ recommendations?: { logical_key: string; placement: string; reason: string; sticky?: boolean }[]; source?: 'ai' | 'rules'; ai?: { used: boolean; usedFallback: boolean; provider?: string; reason?: string }; needsApproval?: boolean } | null> => {
    try {
      return await post(`/api/projects/${id}/recommend/ai`, {});
    } catch (e) {
      const msg = errMsg(e);
      if (msg.includes('尚未批准')) return { needsApproval: true };
      toast.show(msg, 'fail');
      return null;
    }
  }, [id, toast]);

  const decide = useCallback(async (decisions: { logical_key: string; placement: string; reason?: string }[]): Promise<boolean> => {
    try {
      await post(`/api/projects/${id}/decisions`, { decisions });
      await reload();
      return true;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return false;
    }
  }, [id, reload, toast]);

  const approveG1 = useCallback(async (approver: string): Promise<{ ok: boolean; warnings?: string[]; error?: string }> => {
    try {
      const r = await post<{ ok: boolean; warnings?: string[]; error?: string }>(`/api/projects/${id}/approve-g1`, { approver });
      if (r.ok) {
        toast.show(`G1 已批准（${approver}）：主线与逐页蓝图已冻结`, 'ok');
        await reload();
      }
      return r;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return { ok: false, error: errMsg(e) };
    }
  }, [id, reload, toast]);

  const resolvePending = useCallback(async (keys: string[], pages: string[] = []): Promise<boolean> => {
    if (keys.length === 0 && pages.length === 0) { toast.show('没有可解除的待复核项', 'fail'); return false; }
    try {
      await post(`/api/projects/${id}/pending-updates/resolve`, {
        ...(keys.length > 0 ? { logical_keys: keys } : {}),
        ...(pages.length > 0 ? { affected_pages: pages } : {}),
      });
      toast.show('待复核已解除（复核记录保留）', 'ok');
      await reload();
      return true;
    } catch (e) {
      toast.show(errMsg(e), 'fail');
      return false;
    }
  }, [id, reload, toast]);

  return (
    <Ctx.Provider value={{ id, detail, loadFailed, busy, setBusy, reload, upload, uploadBundle, resolveConflict, composeOutline, assemble, edit, draftProposal, runChecks, runSemanticChecks, draftEvidenceGaps, doExport, applyBrand, saveBrief, composeOutlineAI, outboundPreview, approveOutbound, recommend, recommendAI, decide, approveG1, resolvePending }}>
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
