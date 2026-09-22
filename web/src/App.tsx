import { useCallback, useEffect, useRef, useState } from 'react';

interface Project { project_id: string; title: string; purpose?: string; created_at: string; updated_at: string; privacy_policy: string; stage: string }
interface SourceAsset { source_id: string; filename: string; kind: string; parse_status: string; parse_error?: string; has_data?: boolean; imported_at: string }
interface Conflict { conflict_id: string; row_key: string; column_label: string; values: { source_id: string; value: string | number }[]; resolution: string }
interface PagePlan { page_id: string; type: string; headline: string; intent: string; claim_refs: string[]; table_ids: string[]; gap_notes: string[]; locked: boolean }
interface OpenQuestion { text: string; kind: 'conflict' | 'confirmation' | 'gap'; ref?: string }
interface OutlineDraft { pages: PagePlan[]; open_questions: OpenQuestion[] }
interface Issue { id: string; severity: 'blocker' | 'warning'; page_id?: string; object_ref: string; message: string }
interface CheckReport { issues: Issue[]; blockers: number; warnings: number }
interface ExportRec { export_id: string; format: string; artifact_path: string; is_draft: boolean }
interface RevisionMeta { revision_id: string; created_at: string; note?: string }
interface SpecDiff {
  pages_added: string[]; pages_removed: string[]; pages_reordered: string[];
  pages_changed: { page_id: string; changes: { field: string; locator?: string; before?: string; after?: string }[] }[];
  metrics_changed: { metric_id: string; field: string; before?: string; after?: string }[];
  claims_changed: { claim_id: string; field: string; before?: string; after?: string }[];
}

const api = {
  get: async <T,>(url: string): Promise<T> => (await fetch(url)).json(),
  post: async <T,>(url: string, payload?: unknown): Promise<T> =>
    (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload ?? {}) })).json(),
  del: async (url: string) => fetch(url, { method: 'DELETE' }),
};

function kindOf(filename: string): { kind: string; media_type: string } | null {
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
}

const stageLabel: Record<string, string> = { materials: '材料', outline: '大纲', draft: '草稿', checked: '已检查', exported: '已导出' };
const parseBadge = (s: SourceAsset) =>
  s.parse_status === 'parsed'
    ? <span className="badge green">已解析</span>
    : s.parse_status === 'failed'
      ? <span className="badge red" title={s.parse_error}>失败</span>
      : <span className="badge neutral">待解析</span>;

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ project: Project; sources: SourceAsset[]; exports: ExportRec[]; conflicts: Conflict[]; hasSpec: boolean } | null>(null);
  const [brief, setBrief] = useState({ audience: '商品经营负责人', purpose: '上半年经营复盘与方案讨论', page_budget: 8, deliverable_type: 'meeting_deck' as 'meeting_deck' | 'research_report' });
  const [outline, setOutline] = useState<OutlineDraft | null>(null);
  const [checks, setChecks] = useState<CheckReport | null>(null);
  const [exportScope, setExportScope] = useState<'internal' | 'external'>('internal');
  const [diffA, setDiffA] = useState('');
  const [diffB, setDiffB] = useState('');
  const [diffResult, setDiffResult] = useState<{ diff: SpecDiff; recheck?: CheckReport } | null>(null);
  const [chartDataMode, setChartDataMode] = useState<'keep_editable' | 'aggregate_only'>('keep_editable');
  const [ackEditable, setAckEditable] = useState(false);
  const [ackExternalShare, setAckExternalShare] = useState(false);
  const [lastPrivacy, setLastPrivacy] = useState<{ checked_count: number; not_checked_count: number; items: { item: string; status: string; detail?: string }[] } | null>(null);
  const [brandDraft, setBrandDraft] = useState<{ primary: string; accent: string; logo?: string; font?: string } | null>(null);
  const [pendingSheet, setPendingSheet] = useState<{ file: File; meta: { kind: string; media_type: string }; sheets: string[]; chosen: string } | null>(null);
  const [impact, setImpact] = useState<Record<string, string[]> | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const reloadProjects = useCallback(async () => setProjects((await api.get<{ projects: Project[] }>('/api/projects')).projects), []);
  const reloadDetail = useCallback(async (id: string) => {
    const d = await api.get<typeof detail>(`/api/projects/${id}`);
    setDetail(d);
  }, []);

  useEffect(() => { void reloadProjects(); }, [reloadProjects]);
  useEffect(() => { if (currentId) void reloadDetail(currentId); }, [currentId, reloadDetail]);
  useEffect(() => {
    if (currentId && detail?.hasSpec) {
      void api.get<{ impact: Record<string, string[]> }>(`/api/projects/${currentId}/impact`).then((r) => setImpact(r.impact));
    } else {
      setImpact(null);
    }
  }, [currentId, detail?.hasSpec]);

  const createProject = async () => {
    const title = prompt('项目名称？');
    if (!title) return;
    const { project } = await api.post<{ project: Project }>('/api/projects', { title });
    await reloadProjects();
    setCurrentId(project.project_id);
    setOutline(null); setChecks(null); setMessage(null);
  };

  const uploadOne = async (file: File) => {
    if (!currentId) return null;
    const meta = kindOf(file.name);
    if (!meta) return { filename: file.name, ok: false, failure_reason: `不支持的格式（支持 md/txt/csv/png/jpg）`, counts: undefined as Record<string, number> | undefined, confirmations: [] as { question: string }[] };
    const content_base64 = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
    const res = await api.post<{ ok: boolean; failure_reason?: string; counts?: Record<string, number>; confirmations?: { question: string }[]; available_sheets?: string[] }>(`/api/projects/${currentId}/sources`, { filename: file.name, content_base64, ...meta });
    // XLSX 需显式选表（§4.2）：内联选择器（走确认通道，不弹 prompt）
    if (!res.ok && res.available_sheets && res.available_sheets.length > 0) {
      setPendingSheet({ file, meta, sheets: res.available_sheets, chosen: res.available_sheets[0]! });
      return { filename: file.name, ok: false, failure_reason: undefined, counts: undefined, confirmations: [], deferred: true } as never;
    }
    return { filename: file.name, ...res, available_sheets: undefined };
  };

  const uploadFiles = async (files: File[]) => {
    if (!currentId) return;
    setBusy(true);
    try {
      const results = [];
      for (const f of files) results.push(await uploadOne(f)); // 串行：避免并发响应乱序覆盖状态
      await reloadDetail(currentId); // 全部入库后统一刷新一次
      const failed = results.filter((r) => r && !r.ok && !(r as { deferred?: boolean }).deferred);
      const okRes = results.filter((r) => r?.ok);
      if (failed.length > 0) {
        setMessage({ kind: 'warn', text: `${failed.map((f) => `「${f!.filename}」${f!.failure_reason}`).join('；')}（不影响其他材料）` });
      } else if (okRes.length > 0) {
        const last = okRes.at(-1)!;
        const confirms = okRes.flatMap((r) => r?.confirmations ?? []);
        setMessage({
          kind: 'info',
          text: `已导入 ${okRes.length} 份材料${last.counts ? `：${last.counts.claims} 条主张、${last.counts.tables} 张表` : ''}${confirms.length > 0 ? `；${confirms.length} 项口径待确认（${confirms[0]!.question}）` : ''}`,
        });
      }
    } finally { setBusy(false); }
  };

  const genOutline = async () => {
    if (!currentId) return;
    setBusy(true);
    try {
      const { draft } = await api.post<{ draft: OutlineDraft }>(`/api/projects/${currentId}/outline`, { brief });
      setOutline(draft);
      const conflictQs = draft.open_questions.filter((q) => q.kind === 'conflict');
      setMessage({ kind: conflictQs.length > 0 ? 'warn' : 'info', text: conflictQs.length > 0 ? `大纲已生成，但存在 ${conflictQs.length} 项材料冲突需要处理` : '大纲已生成，请确认每页主旨后组装报告' });
    } finally { setBusy(false); }
  };

  const confirmOutline = async () => {
    if (!currentId) return;
    setBusy(true);
    try {
      await api.post(`/api/projects/${currentId}/assemble`, {});
      await reloadDetail(currentId);
      setMessage({ kind: 'info', text: '报告已组装，可预览与检查' });
    } finally { setBusy(false); }
  };

  const runChecks = async () => {
    if (!currentId) return;
    setChecks(await api.post<CheckReport>(`/api/projects/${currentId}/checks`));
  };

  const resolveConflict = async (c: Conflict, resolution: string) => {
    if (!currentId) return;
    await api.post(`/api/projects/${currentId}/resolve-conflict`, { resolution: { [c.conflict_id]: resolution } });
    await reloadDetail(currentId);
  };

  const saveBrand = async () => {
    if (!currentId || !brandDraft) return;
    const brand: Record<string, string> = { primary: brandDraft.primary, accent: brandDraft.accent, ...(brandDraft.font ? { font_name: brandDraft.font } : {}) };
    if (brandDraft.logo) brand.logo_data_url = brandDraft.logo;
    const res = await fetch(`/api/projects/${currentId}/brand`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brand }),
    }).then((r) => r.json());
    setMessage({ kind: res.ok ? 'info' : 'error', text: res.ok ? '品牌已应用（仅视觉，内容不变，下次导出生效）' : (res.error ?? '品牌应用失败') });
    setBrandDraft(null);
  };

  const doDiff = async () => {
    if (!currentId || !diffA || !diffB) return;
    const res = await api.get<{ diff: SpecDiff; recheck?: CheckReport }>(`/api/projects/${currentId}/diff?a=${diffA}&b=${diffB}`);
    setDiffResult(res);
  };

  const doExport = async (mode: 'formal' | 'draft', deliverable?: 'executive_summary') => {
    if (!currentId) return;
    setBusy(true);
    try {
      const isResearch = (detail as { deliverable_type?: string } | null)?.deliverable_type === 'research_report';
      const formats = deliverable === 'executive_summary' ? ['pptx', 'pdf', 'html'] : isResearch ? ['docx', 'html', 'pdf'] : ['pptx', 'pdf'];
      const res = await api.post<{ allowed: boolean; reason: string; exports: ExportRec[]; privacy?: { checked_count: number; not_checked_count: number; items: { item: string; status: string; detail?: string }[] } }>(`/api/projects/${currentId}/export`, {
        mode, formats, exportScope,
        chart_data_mode: exportScope === 'external' ? chartDataMode : undefined,
        ack_editable_data: ackEditable,
        ack_external_share: ackExternalShare,
        ...(deliverable ? { deliverable } : {}),
      });
      const privacyNote = res.privacy ? `（隐私检查：${res.privacy.checked_count} 项已检查 / ${res.privacy.not_checked_count} 项未覆盖）` : '';
      if (res.privacy) setLastPrivacy(res.privacy);
      setMessage({
        kind: res.allowed ? 'info' : 'error',
        text: res.allowed
          ? `已导出 ${res.exports.length} 个文件（${mode === 'draft' ? '草稿，带标识' : '正式定稿'}${exportScope === 'external' ? '，对外' : ''}）${privacyNote}`
          : `${res.reason}${privacyNote}`,
      });
      await reloadDetail(currentId);
    } finally { setBusy(false); }
  };

  // ------- 首页：项目列表 -------
  if (!currentId) {
    return (
      <div className="app">
        <div className="header"><h1>Report Studio</h1><span className="sub">把已有分析材料变成可信的会议汇报</span></div>
        <p className="page-desc">选择一个项目继续，或新建汇报。材料与报告默认只保存在本机。</p>
        <div className="card">
          <h2>最近项目</h2>
          <button className="primary" onClick={createProject}>＋ 新建汇报</button>
          <table className="list" style={{ marginTop: 12 }}>
            <thead><tr><th>名称</th><th>阶段</th><th>更新时间</th><th>隐私</th><th></th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.project_id}>
                  <td>{p.title}</td>
                  <td><span className="badge neutral">{stageLabel[p.stage] ?? p.stage}</span></td>
                  <td className="num">{new Date(p.updated_at).toLocaleString('zh-CN')}</td>
                  <td>{p.privacy_policy === 'local_only' ? '仅本地' : '允许外部'}</td>
                  <td>
                    <button className="small" onClick={() => { setCurrentId(p.project_id); setOutline(null); setChecks(null); setMessage(null); }}>继续编辑</button>
                    <button className="small danger" style={{ marginLeft: 6 }} onClick={async () => { if (confirm(`删除项目「${p.title}」及其全部材料与导出？`)) { await api.del(`/api/projects/${p.project_id}`); await reloadProjects(); } }}>删除</button>
                  </td>
                </tr>
              ))}
              {projects.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--soft)' }}>还没有项目</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ------- 项目工作区 -------
  const project = detail?.project;
  const sources = detail?.sources ?? [];
  const conflicts = detail?.conflicts ?? [];
  const hasSpec = detail?.hasSpec ?? false;

  return (
    <div className="app">
      <div className="header">
        <button className="small" onClick={() => { setCurrentId(null); setDetail(null); }}>← 项目列表</button>
        <h1>{project?.title}</h1>
        {project && <span className="badge neutral">{stageLabel[project.stage] ?? project.stage}</span>}
      </div>
      {message && <div className={`notice ${message.kind === 'error' ? 'error' : message.kind === 'warn' ? 'warn' : ''}`}>{message.text}</div>}

      <div className="steps">
        <span className={`step ${sources.length > 0 ? 'done' : 'on'}`}>① 材料导入</span>
        <span className={`step ${outline ? 'done' : sources.length > 0 ? 'on' : ''}`}>② 目标与大纲</span>
        <span className={`step ${hasSpec ? 'done' : outline ? 'on' : ''}`}>③ 组装</span>
        <span className={`step ${hasSpec ? 'on' : ''}`}>④ 预览 · 检查 · 导出</span>
      </div>

      <div className="card">
        <h2>① 材料（解析失败的项不影响其他材料）</h2>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void uploadFiles(files); }} />
        <button onClick={() => fileRef.current?.click()}>上传材料（md / txt / csv / xlsx / docx / png / jpg）</button>
        <table className="list" style={{ marginTop: 12 }}>
          <thead><tr><th>文件</th><th>类型</th><th>状态</th><th>底层数据</th><th>影响页面</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source_id}>
                <td>{s.filename}</td><td>{s.kind}</td>
                <td>{parseBadge(s)}</td>
                <td>{s.has_data === false ? <span className="badge amber">图片（不可改数）</span> : <span className="badge green">有</span>}</td>
                <td title={impact?.[s.source_id]?.join('、')}>
                  {impact?.[s.source_id]?.length ? `${impact[s.source_id]!.length} 页（替换后需复核）` : '—'}
                </td>
              </tr>
            ))}
            {sources.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--soft)' }}>尚未导入材料。示例：一份 markdown 结论文本 + 一份 csv 汇总表。</td></tr>}
          </tbody>
        </table>
        {pendingSheet && (
          <div className="notice" style={{ marginTop: 12 }}>
            <b>XLSX 工作簿需显式选择工作表（§4.2）：</b>
            <div className="row" style={{ marginTop: 6 }}>
              <span>{pendingSheet.file.name}</span>
              <select value={pendingSheet.chosen} onChange={(e) => setPendingSheet({ ...pendingSheet, chosen: e.target.value })}>
                {pendingSheet.sheets.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="small primary" onClick={async () => {
                if (!currentId || !pendingSheet) return;
                const content_base64 = btoa(String.fromCharCode(...new Uint8Array(await pendingSheet.file.arrayBuffer())));
                const res = await api.post<{ ok: boolean; failure_reason?: string }>(`/api/projects/${currentId}/sources`, { filename: pendingSheet.file.name, content_base64, ...pendingSheet.meta, sheet: pendingSheet.chosen });
                setPendingSheet(null);
                setMessage({ kind: res.ok ? 'info' : 'error', text: res.ok ? `「${pendingSheet.file.name}」已按工作表「${pendingSheet.chosen}」导入` : (res.failure_reason ?? '导入失败') });
                await reloadDetail(currentId);
              }}>导入所选工作表</button>
              <button className="small" onClick={() => setPendingSheet(null)}>取消</button>
            </div>
          </div>
        )}
        {conflicts.filter((c) => c.resolution === 'unresolved').length > 0 && (
          <div className="notice warn" style={{ marginTop: 12 }}>
            <b>材料冲突（必须处理后才可正式导出）：</b>
            {conflicts.filter((c) => c.resolution === 'unresolved').map((c) => (
              <div className="row" key={c.conflict_id} style={{ margin: '6px 0' }}>
                <span>{c.row_key}「{c.column_label}」：{c.values.map((v) => `${v.value}（${v.source_id}）`).join(' vs ')}</span>
                <button className="small" onClick={() => void resolveConflict(c, 'source_a')}>采用前者</button>
                <button className="small" onClick={() => void resolveConflict(c, 'source_b')}>采用后者</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>② 汇报目标与大纲（先大纲，后美化）</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="field">受众<input value={brief.audience} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} /></label>
          <label className="field">目的<input value={brief.purpose} onChange={(e) => setBrief({ ...brief, purpose: e.target.value })} /></label>
          <label className="field">页数预算<input type="number" min={1} value={brief.page_budget} onChange={(e) => setBrief({ ...brief, page_budget: Number(e.target.value) })} style={{ width: 80 }} /></label>
          <label className="field">交付物
            <select value={brief.deliverable_type} onChange={(e) => setBrief({ ...brief, deliverable_type: e.target.value as 'meeting_deck' | 'research_report' })}>
              <option value="meeting_deck">会议汇报（PPT）</option>
              <option value="research_report">研究报告（文档）</option>
            </select>
          </label>
        </div>
        <button className="primary" disabled={busy || sources.length === 0} onClick={genOutline}>{busy ? '生成中…' : '生成大纲（确定性模式）'}</button>
        {outline && (
          <>
            <div style={{ marginTop: 12 }}>
              {outline.pages.map((p, i) => (
                <div className="outline-page" key={p.page_id}>
                  <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                  <span className="type">{p.type}</span>
                  <input value={p.headline} onChange={(e) => setOutline({ ...outline, pages: outline.pages.map((x) => x.page_id === p.page_id ? { ...x, headline: e.target.value } : x) })} />
                  {p.gap_notes.length > 0 && <span className="gapnote" title={p.gap_notes.join('；')}>待补充</span>}
                </div>
              ))}
            </div>
            {outline.open_questions.length > 0 && (
              <div className="notice warn" style={{ marginTop: 10 }}>
                <b>需要你确认的问题：</b>
                <ul style={{ margin: '6px 0 0 18px' }}>{outline.open_questions.map((q, i) => <li key={i}>{q.text}</li>)}</ul>
              </div>
            )}
            <button className="primary" style={{ marginTop: 12 }} disabled={busy} onClick={confirmOutline}>确认大纲 → 组装报告</button>
          </>
        )}
      </div>

      {hasSpec && (
        <>
          <div className="card">
            <h2>④ 预览（HTML，与导出同源）</h2>
            {currentId && <iframe className="preview-frame" title="preview" src={`/api/projects/${currentId}/preview`} />}
          </div>
          <div className="card">
            <h2>质量检查</h2>
            <button onClick={runChecks}>运行检查</button>
            {checks && (
              <div style={{ marginTop: 10 }}>
                <p><span className={`badge ${checks.blockers > 0 ? 'red' : 'green'}`}>{checks.blockers} 阻断</span> <span className="badge amber">{checks.warnings} 警告</span></p>
                {checks.issues.map((i, n) => (
                  <div className="issue" key={n}>
                    <span className={`badge ${i.severity === 'blocker' ? 'red' : 'amber'}`}>{i.severity === 'blocker' ? '阻断' : '警告'}</span>
                    <span className="msg">{i.message}</span>
                    <span className="ref">{i.object_ref}</span>
                  </div>
                ))}
                {checks.issues.length === 0 && <p style={{ color: 'var(--green)' }}>检查通过</p>}
              </div>
            )}
          </div>
          <div className="card">
            <h2>导出（正式定稿需阻断项清零）</h2>
            <div className="row" style={{ marginBottom: 10 }}>
              <label className="field">分享范围
                <select value={exportScope} onChange={(e) => setExportScope(e.target.value as 'internal' | 'external')}>
                  <option value="internal">内部（本机留存）</option>
                  <option value="external">对外（先过隐私检查）</option>
                </select>
              </label>
              {exportScope === 'external' && (
                <>
                  <label className="row" style={{ alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={ackExternalShare} onChange={(e) => setAckExternalShare(e.target.checked)} />
                    我确认本报告对外分享（报告默认禁止对外）
                  </label>
                  <label className="field">图表底层数据
                    <select value={chartDataMode} onChange={(e) => setChartDataMode(e.target.value as 'keep_editable' | 'aggregate_only')}>
                      <option value="aggregate_only">只分享聚合结果（图表降级为图片）</option>
                      <option value="keep_editable">保留可编辑数据</option>
                    </select>
                  </label>
                  {chartDataMode === 'keep_editable' && (
                    <label className="row" style={{ alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={ackEditable} onChange={(e) => setAckEditable(e.target.checked)} />
                      我确认对外产物保留可编辑图表底层数据
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="row">
              <button className="primary" disabled={busy} onClick={() => doExport('formal')}>正式导出</button>
              <button disabled={busy} onClick={() => doExport('draft')}>草稿导出（带未解决标识）</button>
              <button disabled={busy} onClick={() => doExport('formal', 'executive_summary')}>导出一页摘要</button>
            </div>
            {lastPrivacy && (
              <div style={{ marginTop: 10 }}>
                <b style={{ fontSize: 13 }}>隐私检查明细（逐项）：</b>
                {lastPrivacy.items.map((i) => (
                  <div className="issue" key={i.item}>
                    <span className={`badge ${i.status === 'pass' ? 'green' : i.status === 'flag' ? 'red' : 'neutral'}`}>
                      {i.status === 'pass' ? '已检查' : i.status === 'flag' ? '阻断' : '未覆盖'}
                    </span>
                    <span className="msg">{i.item}</span>
                    {i.detail && <span className="ref">{i.detail}</span>}
                  </div>
                ))}
              </div>
            )}
            {(detail?.exports ?? []).length > 0 && (
              <table className="list" style={{ marginTop: 12 }}>
                <thead><tr><th>导出</th><th>格式</th><th>类型</th></tr></thead>
                <tbody>
                  {detail!.exports.map((e) => (
                    <tr key={e.export_id}><td className="num">{e.export_id}</td><td>{e.format.toUpperCase()}</td><td>{e.is_draft ? <span className="badge amber">草稿</span> : <span className="badge green">定稿</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2>品牌设置（仅视觉 token：色板 / Logo）</h2>
            {(() => {
              const current = (detail as any)?.project?.brand;
              const draft = brandDraft ?? { primary: current?.primary ?? '#155e75', accent: current?.accent ?? '#0f766e', logo: current?.logo_data_url };
              return (
                <div className="row">
                  <label className="field">主色<input type="color" value={draft.primary} onChange={(e) => setBrandDraft({ ...draft, primary: e.target.value })} style={{ width: 60 }} /></label>
                  <label className="field">强调色<input type="color" value={draft.accent} onChange={(e) => setBrandDraft({ ...draft, accent: e.target.value })} style={{ width: 60 }} /></label>
                  <label className="field">字体名<input placeholder="如 Microsoft YaHei" value={draft.font ?? ''} onChange={(e) => setBrandDraft({ ...draft, font: e.target.value || undefined })} style={{ width: 140 }} /></label>
                  <label className="field">Logo（PNG/JPG）
                    <input type="file" accept="image/png,image/jpeg" onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) setBrandDraft({ ...draft, logo: await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); }) });
                    }} />
                  </label>
                  <button className="small primary" disabled={!brandDraft} onClick={saveBrand}>应用品牌</button>
                </div>
              );
            })()}
          </div>
          <div className="card">
            <h2>版本比较（修订之间差异）</h2>
            {(detail as any)?.revisions?.length > 1 ? (
              <>
                <div className="row">
                  <select value={diffA} onChange={(e) => setDiffA(e.target.value)}>
                    <option value="">旧版本…</option>
                    {(detail as any).revisions.map((r: RevisionMeta) => <option key={r.revision_id} value={r.revision_id}>{r.revision_id}（{r.note ?? '无备注'}）</option>)}
                  </select>
                  <span>→</span>
                  <select value={diffB} onChange={(e) => setDiffB(e.target.value)}>
                    <option value="">新版本…</option>
                    {(detail as any).revisions.map((r: RevisionMeta) => <option key={r.revision_id} value={r.revision_id}>{r.revision_id}（{r.note ?? '无备注'}）</option>)}
                  </select>
                  <button disabled={!diffA || !diffB} onClick={doDiff}>比较</button>
                </div>
                {diffResult && (
                  <div style={{ marginTop: 10 }}>
                    {diffResult.diff.pages_changed.length === 0 && diffResult.diff.pages_added.length === 0 && diffResult.diff.pages_removed.length === 0 && (
                      <p style={{ color: 'var(--green)' }}>两个版本内容一致</p>
                    )}
                    {diffResult.diff.pages_added.length > 0 && <p><span className="badge green">新增页</span> {diffResult.diff.pages_added.join('、')}</p>}
                    {diffResult.diff.pages_removed.length > 0 && <p><span className="badge red">删除页</span> {diffResult.diff.pages_removed.join('、')}</p>}
                    {diffResult.diff.pages_reordered.length > 0 && <p><span className="badge neutral">顺序变化</span> {diffResult.diff.pages_reordered.join('、')}</p>}
                    {diffResult.diff.pages_changed.map((p) => (
                      <div key={p.page_id} style={{ marginTop: 8 }}>
                        <b style={{ color: 'var(--primary-ink)' }}>{p.page_id}</b>
                        {p.changes.map((c, i) => (
                          <div className="issue" key={i}>
                            <span className="badge neutral">{c.field}</span>
                            <span className="msg">{c.locator ? `${c.locator}：` : ''}{c.before ?? '（空）'} → {c.after ?? '（空）'}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {diffResult.diff.metrics_changed.length > 0 && (
                      <p><span className="badge amber">指标变化</span> {diffResult.diff.metrics_changed.map((m) => `${m.metric_id}.${m.field}: ${m.before} → ${m.after}`).join('；')}</p>
                    )}
                    {diffResult.recheck && (
                      <p><span className={`badge ${diffResult.recheck.blockers > 0 ? 'red' : 'amber'}`}>数字/绑定变化已重触发检查：{diffResult.recheck.blockers} 阻断 / {diffResult.recheck.warnings} 警告</span></p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: 'var(--soft)' }}>导出或编辑产生至少两个修订后可比较版本差异。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
