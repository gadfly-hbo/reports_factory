/* 工作台（flow-3 对齐已批准 ui-contract.md：W0 壳层双视图 / W1 侧栏 / W2 线程与 composer / W3 提案卡 / W5-W6 成果视图 / W7 抽屉 / W8 设置）。
   真实状态规则：进度与工具卡来自 SSE 真实事件；无假进度；等待/运行/失败可辨。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, post, put, del, errMsg } from '../state/api';
import { OutlineCard, type OutlineState } from './OutlineCard';

interface Project { project_id: string; title: string; purpose?: string; updated_at: string; created_at: string }
interface MaterialEntry { source_id: string; filename: string; kind: string; status: 'ready' | 'failed'; chars: number; size?: number; error?: string }
interface AgentResult { active: boolean; status?: string; value?: string; reason?: string }
interface UiEvent { at: string; kind: string; detail?: Record<string, unknown> }
interface DeckInfo { pages: Array<{ name: string; preview_ready: boolean; bytes: number }>; pptx: { exists: boolean; bytes: number } | null }
interface QaReport { ok: boolean; slides: number; text_boxes: number; charts: number; empty_slides?: string[]; items: Array<{ item: string; status: 'pass' | 'flag' | 'info'; detail: string }>; message: string }
interface ExportRec { export_id: string; format: string; created_at: string }
interface HistoryEntry { id: string; kind: string; message?: { role: string; text: string; calls?: Array<{ name: string }> } }
interface AiStatus { chain: string[]; providers: Array<{ provider: string; modelId: string; key: boolean }>; modelAvailable: boolean }
interface Usage { modelCalls: number; toolCalls: number; inputTokens?: number; outputTokens: number; activeMs: number }
interface ToolCard { name: string; status: 'running' | 'done' | 'failed'; durationMs?: number; reason?: string }

interface ThreadMsg { role: 'user' | 'assistant'; text: string; failed?: boolean; retry?: boolean; recoverable?: boolean }

const KIND_LABEL: Record<string, string> = { markdown: 'md', text: 'txt', csv: 'csv', xlsx: 'xlsx', docx: 'docx', pdf: 'pdf', image: '图片', table: '表格', bundle: 'bundle' };

function kindOf(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  return 'text';
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function classifyResult(r: { status?: string; reason?: string }): { text: string; kind: 'ok' | 'neutral' | 'fail'; recover?: boolean } {
  if (r.status === 'succeeded') return { text: '', kind: 'ok' };
  if (r.status === 'cancelled' || r.reason === 'CANCELLED') return { text: '已停止。可以继续对话或发新指令。', kind: 'neutral' };
  if (r.status === 'idle') return { text: '本轮没有产生结果。', kind: 'neutral' };
  switch (r.reason) {
    case 'CONFIGURATION_CHANGED': return { text: '运行配置已变更（如输出上限调整），此项目的会话需要恢复。点击「恢复会话」后重试。', kind: 'fail', recover: true };
    case 'TASK_BUSY': return { text: '任务被占用（可能是上次异常退出残留）。点击「恢复会话」清理后重试。', kind: 'fail', recover: true };
    case 'MODEL_FAILED': return { text: '模型服务不可用——稍后重试，或在设置页检查模型状态。', kind: 'fail' };
    case 'TOOL_FAILED': return { text: '工具执行失败——可点击重试，或换一种说法再描述。', kind: 'fail' };
    case 'INVALID_OUTPUT': return { text: '输出超限或格式不符——可重试（通常会自行换一种产出方式）。', kind: 'fail' };
    case 'BUDGET_EXHAUSTED': return { text: '预算账本异常——点击「恢复会话」后重试。', kind: 'fail', recover: true };
    default: return { text: `执行失败：${r.reason ?? '未知原因'}。可重试或补充说明。`, kind: 'fail' };
  }
}

export function Workbench() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'deck'>('chat');
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [outline, setOutline] = useState<OutlineState | null>(null);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [runTools, setRunTools] = useState<ToolCard[]>([]);
  const [deck, setDeck] = useState<DeckInfo | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [qa, setQa] = useState<QaReport | null>(null);
  const [exportList, setExportList] = useState<ExportRec[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [historyLoadedFor, setHistoryLoadedFor] = useState<string | null>(null);
  const lastUserText = useRef('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshProjects = useCallback(async () => {
    const r = await api<{ projects: Project[] }>('/api/projects');
    setProjects(r.projects);
    setActiveId((cur) => cur ?? r.projects[0]?.project_id ?? null);
  }, []);

  const refreshMaterials = useCallback(async (id: string) => {
    setMaterials((await api<{ materials: MaterialEntry[] }>(`/api/projects/${id}/materials`).catch(() => ({ materials: [] }))).materials);
  }, []);

  const refreshOutline = useCallback(async (id: string) => {
    setOutline(await api<OutlineState>(`/api/projects/${id}/outline`));
  }, []);

  const refreshDeck = useCallback(async (id: string) => {
    setDeck(await api<DeckInfo>(`/api/projects/${id}/deck`).catch(() => null));
    setExportList((await api<{ exports: ExportRec[] }>(`/api/projects/${id}/exports`).catch(() => ({ exports: [] }))).exports);
  }, []);

  const refreshUsage = useCallback(async (id: string) => {
    setUsage((await api<{ usage: Usage | null }>(`/api/projects/${id}/agent/usage`).catch(() => ({ usage: null }))).usage);
  }, []);

  useEffect(() => { void refreshProjects().catch((e) => setError(errMsg(e))); }, [refreshProjects]);

  useEffect(() => {
    if (!activeId) { setMaterials([]); setOutline(null); setEvents([]); setDeck(null); setSelectedPage(null); setView('chat'); return; }
    void refreshMaterials(activeId).catch(() => {});
    void refreshOutline(activeId).catch(() => {});
    void refreshDeck(activeId).catch(() => {});
  }, [activeId, refreshMaterials, refreshOutline, refreshDeck]);

  // W9.4 重启恢复：历史线程（含分隔线）
  useEffect(() => {
    if (!activeId || historyLoadedFor === activeId) return;
    setHistoryLoadedFor(activeId);
    setMessages([]);
    void api<{ entries: HistoryEntry[] }>(`/api/projects/${activeId}/agent/history`)
      .then((r) => {
        const restored: ThreadMsg[] = [];
        for (const e of r.entries) {
          if (e.kind !== 'message' || !e.message) continue;
          const text = (e.message.text ?? '').trim();
          if (!text) continue;
          if (e.message.role === 'user') restored.push({ role: 'user', text });
          else if (e.message.role === 'assistant') restored.push({ role: 'assistant', text });
        }
        if (restored.length > 0) setMessages([{ role: 'assistant', text: `—— 以上为此前会话（恢复于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）——` }, ...restored.slice(-40)]);
      })
      .catch(() => { /* 历史不可用：空态引导仍在 */ });
  }, [activeId, historyLoadedFor]);

  // SSE：真实事件 → 运行工具卡 + 抽屉时间线
  useEffect(() => {
    if (!activeId) { setEvents([]); return; }
    const es = new EventSource(`/api/projects/${activeId}/agent/events`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as UiEvent;
        setEvents((prev) => [...prev.slice(-24), ev]);
        if (ev.kind === 'tool.admitted') setRunTools((prev) => [...prev.slice(-30), { name: String(ev.detail?.toolName ?? ''), status: 'running' }]);
        if (ev.kind === 'tool.finished') setRunTools((prev) => {
          const name = String(ev.detail?.toolName ?? '');
          const idx = [...prev].reverse().findIndex((t) => t.name === name && t.status === 'running');
          if (idx < 0) return prev;
          const real = prev.length - 1 - idx;
          const next = [...prev];
          next[real] = { name, status: ev.detail?.failed ? 'failed' : 'done', durationMs: ev.detail?.durationMs as number | undefined, reason: ev.detail?.reason ? String(ev.detail.reason) : undefined };
          return next;
        });
      } catch { /* 忽略坏帧 */ }
    };
    return () => es.close();
  }, [activeId]);

  const waitResult = useCallback(async (pid: string) => {
    setRunTools([]); // M1：每轮工具摘要只计本轮（确认框架/重试/新发送统一入口清零）
    setBusy(true);
    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
      let res;
      try {
        res = await api<AgentResult>(`/api/projects/${pid}/agent/result`);
      } catch {
        continue; // 瞬时网络抖动重试
      }
      if (!res.active) {
        const c = classifyResult(res);
        if (c.kind === 'ok') {
          const tools = runToolsRef.current;
          const summary = tools.length ? `\n\n—— 本轮工具：${summarizeTools(tools)} ——` : '';
          setMessages((m) => [...m, { role: 'assistant', text: (res.value?.trim() || '（空回复）') + summary }]);
        } else if (c.text) {
          setMessages((m) => [...m, { role: 'assistant', text: c.text, failed: c.kind === 'fail', retry: c.kind === 'fail', recoverable: c.recover }]);
        }
        break;
      }
    }
    await refreshOutline(pid).catch(() => {});
    await refreshDeck(pid).catch(() => {});
    await refreshUsage(pid).catch(() => {});
    setBusy(false);
  }, [refreshOutline, refreshDeck, refreshUsage]);

  const runToolsRef = useRef<ToolCard[]>([]);
  useEffect(() => { runToolsRef.current = runTools; }, [runTools]);

  const upload = async (files: FileList | null) => {
    if (!files || !activeId) return;
    setUploading(true);
    setError(null);
    for (const f of Array.from(files)) {
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        await post(`/api/projects/${activeId}/sources`, { filename: f.name, content_base64: btoa(bin), kind: kindOf(f.name), media_type: f.type || undefined });
      } catch (e) { setError(`上传失败（${f.name}）：${errMsg(e)}`); }
    }
    setUploading(false);
    await refreshMaterials(activeId);
  };

  const removeMaterial = async (sid: string, name: string) => {
    if (!activeId || !window.confirm(`移除材料「${name}」？其提取文本将一并删除。`)) return;
    try { await del(`/api/projects/${activeId}/sources/${sid}`); await refreshMaterials(activeId); } catch (e) { setError(errMsg(e)); }
  };

  const send = async () => {
    if (!activeId || !input.trim()) return;
    const text = input.trim();
    const page = selectedPage ?? undefined;
    lastUserText.current = text;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: page ? `【针对第 ${pageNo(page)} 页】${text}` : text }]);
    setError(null);
    if (busy) {
      // W2.3 插话（steer）：注入进行中的 run，当前工具步骤结束后送达；不重置轮询
      try {
        const r = await post<{ mode: 'run' | 'steer' }>(`/api/projects/${activeId}/chat`, { text, ...(page ? { page } : {}) });
        setMessages((m) => [...m, { role: 'assistant', text: r.mode === 'steer' ? '已作为插话发送，将在当前工具步骤结束后送达。' : '已发送。' }]);
      } catch (e) {
        setMessages((m) => [...m, { role: 'assistant', text: `插话发送失败：${errMsg(e)}`, failed: true }]);
      }
      return;
    }
    setRunTools([]);
    setBusy(true);
    try {
      await post(`/api/projects/${activeId}/chat`, { text, ...(page ? { page } : {}) });
      await waitResult(activeId);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `发送失败：${errMsg(e)}（可在设置页检查模型状态）`, failed: true }]);
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!activeId || busy || !lastUserText.current) return;
    const text = lastUserText.current;
    setMessages((m) => [...m, { role: 'user', text }]);
    setRunTools([]);
    setBusy(true);
    try { await post(`/api/projects/${activeId}/chat`, { text }); await waitResult(activeId); }
    catch (e) { setMessages((m) => [...m, { role: 'assistant', text: `发送失败：${errMsg(e)}`, failed: true }]); setBusy(false); }
  };

  const recoverSession = async () => {
    if (!activeId) return;
    try {
      await post(`/api/projects/${activeId}/agent/recover`, {});
      setMessages((m) => [...m, { role: 'assistant', text: '会话已恢复（残留占用与配置迁移已处理）。可以重试上一条。' }]);
    } catch (e) { setError(`恢复失败：${errMsg(e)}`); }
  };

  /** 一键重新生成选中页（迭代③）：固定指令走 send 管线（页上下文注入+预览刷新） */
  const regeneratePage = async () => {
    if (!activeId || !selectedPage || busy) return;
    const page = selectedPage;
    const text = '请重新生成这一页：依据材料重新产出该页内容与版式（风格与全套保持一致），完成后 render_deck 重渲染。';
    lastUserText.current = text; // 失败重试语义与手动消息一致
    setMessages((m) => [...m, { role: 'user', text: `【重新生成 第 ${pageNo(page)} 页 · ${pageTitle(page)}】` }]);
    setRunTools([]);
    setBusy(true);
    setError(null);
    try {
      await post(`/api/projects/${activeId}/chat`, { text, page });
      await waitResult(activeId);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `重新生成失败：${errMsg(e)}`, failed: true, retry: true }]);
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!activeId) return;
    try { await post(`/api/projects/${activeId}/agent/stop`, {}); } catch (e) { setError(errMsg(e)); }
  };

  const createProject = async () => {
    if (!newTitle.trim()) return;
    try {
      const r = await post<{ project: Project }>('/api/projects', { title: newTitle.trim() });
      setCreating(false); setNewTitle('');
      await refreshProjects();
      setActiveId(r.project.project_id);
    } catch (e) { setError(errMsg(e)); }
  };

  const removeProject = async (id: string, title: string) => {
    if (!window.confirm(`删除项目「${title}」？\n项目及其会话与产物将被删除，不可恢复。`)) return;
    try { await del(`/api/projects/${id}`); setActiveId(null); await refreshProjects(); } catch (e) { setError(errMsg(e)); }
  };

  const openSettings = async () => {
    setShowSettings(true);
    try { setAiStatus(await api<AiStatus>('/api/ai/status')); } catch (e) { setError(errMsg(e)); }
  };

  const runQa = async () => {
    if (!activeId) return;
    setQa(null);
    try { setQa(await api<QaReport>(`/api/projects/${activeId}/qa`)); } catch (e) { setError(errMsg(e)); }
  };

  const doExport = async (fmt: 'pptx' | 'html' | 'pdf') => {
    if (!activeId) return;
    setExporting(fmt); setError(null);
    try {
      const r = await post<{ ok: boolean; qa: QaReport; exports: ExportRec[] }>(`/api/projects/${activeId}/export`, { formats: [fmt] });
      setQa(r.qa);
      await refreshDeck(activeId);
    } catch (e) { setError(`导出失败：${errMsg(e)}`); }
    setExporting(null);
  };

  // 页序号与标题（页标记词条 C1：page_02 → 第 2 页 · 标题）
  const pageNo = (name: string) => Number.parseInt(name.replace(/^page_/, ''), 10) || 0;
  const pageTitle = (name: string): string => {
    const pages = outline?.confirmed_pages ?? outline?.current?.pages ?? [];
    const t = pages[pageNo(name) - 1]?.title;
    return t ? (t.length > 12 ? `${t.slice(0, 12)}…` : t) : name;
  };
  const pageLabel = selectedPage ? `第 ${pageNo(selectedPage)} 页 · ${pageTitle(selectedPage)}` : '';

  const active = projects.find((p) => p.project_id === activeId) ?? null;
  const lastReply = [...messages].reverse().find((m) => m.role === 'assistant' && !m.text.startsWith('——') && !m.text.startsWith('已') && !m.text.startsWith('会话已恢复'))?.text ?? '';
  const hasDeck = !!deck && deck.pages.length > 0;
  const lastActivity = (p: Project) => new Date(p.updated_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const waitState = (() => {
    const last = events.filter((e) => e.kind.startsWith('tool.') || e.kind.startsWith('model.')).at(-1);
    if (last?.kind === 'tool.admitted') return `工具运行中：${String(last.detail?.toolName ?? '')}`;
    return '等待模型响应…';
  })();

  return (
    <div className="wb">
      <header className="wb-titlebar">
        <span className="wb-brand">Report Studio</span>
        <span className="fine">{active ? active.title : '未选择项目'}</span>
        <span className="wb-tag">对话式 PPT 工作台</span>
      </header>
      <nav className="wb-topbar">
        <div className="wb-seg" role="tablist" aria-label="视图">
          <button role="tab" aria-selected={view === 'chat'} className={`wb-seg-btn ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}>对话</button>
          <button role="tab" aria-selected={view === 'deck'} className={`wb-seg-btn ${view === 'deck' ? 'active' : ''}`}
                  disabled={!hasDeck} title={hasDeck ? undefined : '生成后可用'}
                  onClick={() => setView('deck')}>成果{hasDeck ? `（${deck!.pages.length} 页）` : ''}</button>
        </div>
        <div className="wb-topbar-right">
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showDrawer}
                  onClick={() => { const next = !showDrawer; setShowDrawer(next); if (activeId && next) void refreshUsage(activeId); }}>运行详情</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openSettings()}>设置</button>
        </div>
      </nav>

      <div className="wb-body">
        <aside className="wb-sidebar" aria-label="项目">
          <button className="btn btn-primary wb-new" type="button" onClick={() => setCreating(true)}>＋ 新建项目</button>
          {creating && (
            <div className="wb-new-form">
              <input autoFocus placeholder="项目名称（可留空）" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') void createProject(); if (e.key === 'Escape') setCreating(false); }} />
              <div className="wb-new-actions">
                <button className="btn btn-sm" type="button" onClick={() => setCreating(false)}>取消</button>
                <button className="btn btn-primary btn-sm" type="button" onClick={() => void createProject()}>创建</button>
              </div>
            </div>
          )}
          <div className="wb-list">
            {projects.map((p) => (
              <div key={p.project_id}>
                <div role="button" tabIndex={0}
                     className={`wb-item ${p.project_id === activeId ? 'active' : ''}`}
                     onClick={() => setActiveId(p.project_id)}
                     onKeyDown={(e) => { if (e.key === 'Enter') setActiveId(p.project_id); }}>
                  <span className="wb-item-title">{p.title || '未命名项目'}</span>
                  <span className="fine">{lastActivity(p)}</span>
                  <button className="wb-item-del" type="button" aria-label={`删除 ${p.title}`}
                          onClick={(e) => { e.stopPropagation(); void removeProject(p.project_id, p.title); }}>×</button>
                </div>
                {p.project_id === activeId && (
                  <div className="wb-session fine">会话 · 持续 · 最近活动 {lastActivity(p)}</div>
                )}
              </div>
            ))}
            {projects.length === 0 && <p className="wb-side-note">尚无项目——新建一个开始。</p>}
          </div>
          <p className="wb-side-note">旧版六步项目已隐藏，数据仍保留在本机。</p>
        </aside>

        <main className="wb-main" id="main" tabIndex={-1}>
          {error && (
            <div className="fail-panel" role="alert">
              <span>{error}</span>
              <button className="btn btn-sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => setError(null)}>知道了</button>
            </div>
          )}

          {!active ? (
            <div className="wb-empty">
              <h1>把材料变成一份专业 PPT</h1>
              <p>左侧新建或选择一个项目，上传材料、描述需求，AI 先帮你理清框架再生成。</p>
            </div>
          ) : view === 'chat' ? (
            <>
              <section className="wb-thread" aria-live="polite">
                {messages.length === 0 && !busy && (
                  <div className="wb-thread-empty">
                    <p>例如：「根据这几份材料做一份 Q3 经营复盘 PPT，10 页以内，先给我框架」。</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`wb-msg ${m.role}${m.failed ? ' failed' : m.text.startsWith('——') ? ' divider' : m.text.includes('本轮工具') ? ' tools-line' : ''}`}>
                    {m.text}
                    {m.retry && !busy && <button type="button" className="btn btn-sm wb-retry" onClick={() => void retry()}>重试上一条</button>}
                    {m.recoverable && !busy && <button type="button" className="btn btn-sm wb-retry" onClick={() => void recoverSession()}>恢复会话</button>}
                  </div>
                ))}
                {busy && (
                  <div className="wb-msg assistant pending">
                    <div className="wb-wait">{waitState}（可插话或停止）</div>
                    {runTools.length > 0 && (
                      <div className="wb-toolcards">
                        {runTools.slice(-6).map((t, i) => (
                          <span key={i} className={`wb-toolcard st-${t.status}`}>
                            <span className="wb-tool-name">{t.name}</span>
                            <span>{t.status === 'running' ? '运行中…' : t.status === 'failed' ? `失败${t.reason ? `：${t.reason}` : ''}` : `完成${t.durationMs ? ` ${(t.durationMs / 1000).toFixed(1)}s` : ''}`}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {outline && activeId && (
                  <OutlineCard projectId={activeId} outline={outline} busy={busy}
                               onChanged={() => void refreshOutline(activeId)}
                               onNotify={(t) => setMessages((m) => [...m, { role: 'assistant', text: t }])}
                               waitResult={() => waitResult(activeId)}
                               onReply={(q) => { setInput(`关于「${q.slice(0, 40)}」：`); }} />
                )}
                {hasDeck && !busy && (
                  <button type="button" className="wb-deck-link" onClick={() => setView('deck')}>
                    已有成果：deck.pptx · {deck!.pages.length} 页 → 查看成果视图
                  </button>
                )}
              </section>

              <form className="wb-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                {materials.length > 0 && (
                  <div className="wb-attachments">
                    {materials.map((m) => (
                      <span key={m.source_id} className={`att-row ${m.status === 'failed' ? 'st-fail' : 'st-ok'}`}>
                        <span className="att-kind">{KIND_LABEL[m.kind] ?? m.kind}</span>
                        <span className="att-name" title={m.error ?? ''}>{m.filename}{m.size ? ` · ${fmtSize(m.size)}` : ''}</span>
                        <span className="att-status">{m.status === 'failed' ? `解析失败：${m.error ?? ''}` : m.kind === 'image' ? '已生成图片描述' : m.chars ? `已提取 ${m.chars.toLocaleString()} 字` : '已就绪'}</span>
                        <button type="button" className="att-x" aria-label={`移除 ${m.filename}`} onClick={() => void removeMaterial(m.source_id, m.filename)}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                {selectedPage && (
                  <div className="page-badge-row">
                    <span className="chip chip-accent">针对 {pageLabel}
                      <button type="button" className="wb-chip-x" aria-label="取消页选中" onClick={() => setSelectedPage(null)}>×</button>
                    </span>
                  </div>
                )}
                <textarea rows={2} placeholder="描述要做的 PPT，或对当前结果提出修改……"
                           value={input} onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                <div className="wb-composer-foot">
                  <button className="btn btn-ghost btn-sm" type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>📎 附件</button>
                  <span className="fine">{uploading ? '解析中…' : busy ? '插话将在当前工具步骤结束后送达' : '支持 md / docx / pdf / csv / xlsx / 图片；也可先不传材料直接描述'}</span>
                  {busy ? (
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" type="submit" disabled={!input.trim()} title="作为插话（steer）注入进行中的任务">插话</button>
                      <button className="btn btn-sm wb-stop" type="button" onClick={() => void stop()}>停止</button>
                    </span>
                  ) : (
                    <button className="btn btn-primary btn-sm" type="submit" disabled={!input.trim()}>发送</button>
                  )}
                </div>
              </form>
            </>
          ) : (
            <section className="wb-deck" aria-label="成果">
              <div className="wb-deck-bar">
                <strong>成果</strong>
                {deck?.pptx && <span className="chip chip-ok">deck.pptx · {Math.max(1, Math.round(deck.pptx.bytes / 1024))}KB · {deck.pages.length} 页</span>}
                {selectedPage && <span className="chip chip-accent">正在编辑 {pageLabel}</span>}
                {selectedPage && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedPage(null)}>取消选中</button>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runQa()}>质检</button>
                  {(['pptx', 'html', 'pdf'] as const).map((fmt) => (
                    <button key={fmt} type="button" className="btn btn-primary btn-sm" disabled={!deck?.pptx || exporting !== null}
                            onClick={() => void doExport(fmt)}>{exporting === fmt ? '导出中…' : `下载 ${fmt.toUpperCase()}`}</button>
                  ))}
                </span>
              </div>
              {qa && (
                <div className={`wb-qa ${qa.ok ? '' : 'has-flag'}`} role="region" aria-label="质检结果">
                  <strong>质检 · {qa.message}</strong>
                  <ul>
                    {qa.items.map((i) => <li key={i.item} className={`qa-${i.status}`}>{i.status === 'pass' ? '✓' : i.status === 'flag' ? '!' : '·'} {i.item}：{i.detail}</li>)}
                  </ul>
                  {qa.empty_slides?.length ? (
                    <p className="qa-flag">部分页失败：{qa.empty_slides.join('、')} 为空页——选中该页对话要求重做。</p>
                  ) : null}
                </div>
              )}
              {exportList.length > 0 && (
                <table className="tbl wb-export-tbl">
                  <thead><tr><th>格式</th><th>时间</th><th></th></tr></thead>
                  <tbody>
                    {exportList.map((e) => (
                      <tr key={e.export_id}>
                        <td><span className="chip">{e.format.toUpperCase()}</span></td>
                        <td className="fine">{e.created_at ? new Date(e.created_at).toLocaleString('zh-CN') : '—'}</td>
                        <td><a className="link-btn" href={`/api/projects/${activeId}/exports/${e.export_id}/file`} target="_blank" rel="noreferrer">下载</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="wb-page-tabs" role="tablist" aria-label="页列表">
                {deck?.pages.map((p, i) => (
                  <button key={p.name} type="button" role="tab" aria-selected={selectedPage === p.name}
                          className={`wb-page-tab ${selectedPage === p.name ? 'active' : ''}`}
                          title={p.preview_ready ? p.name : `${p.name}（近似预览）`}
                          onClick={() => setSelectedPage(p.name)}>
                    <span className="num">{String(i + 1).padStart(2, '0')}</span> · {pageTitle(p.name)}
                  </button>
                ))}
              </div>
              {selectedPage && (
                <figure className="wb-figure">
                  <img key={`${selectedPage}-${deck?.pptx?.bytes ?? 0}`} src={`/api/projects/${activeId}/deck/preview/${selectedPage}?t=${busy ? 0 : (deck?.pptx?.bytes ?? 0)}`} alt={`${pageLabel} 大图预览`} />
                  <figcaption className="fine">近似渲染，实际以导出 PPTX 为准。</figcaption>
                </figure>
              )}
              {selectedPage && activeId && (
                <form className="wb-composer wb-page-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
                  <div className="page-badge-row">
                    <span className="chip chip-accent">修改 {pageLabel}</span>
                    <button type="button" className="btn btn-ghost btn-sm wb-regen" disabled={busy}
                            title="依据材料重新产出这一页（风格与全套一致）"
                            onClick={() => void regeneratePage()}>↻ 重新生成本页</button>
                  </div>
                  <textarea rows={2} placeholder={`直接对话修改${pageLabel}（如：标题改成结论式 / 换个图表）……`} value={input}
                             onChange={(e) => setInput(e.target.value)}
                             onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                  <div className="wb-composer-foot">
                    <span className="fine">{busy ? waitState : '修改将发送给 AI，完成后预览自动刷新'}</span>
                    {busy ? (
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" type="submit" disabled={!input.trim()} title="作为插话（steer）注入进行中的任务">插话</button>
                        <button className="btn btn-sm wb-stop" type="button" onClick={() => void stop()}>停止</button>
                      </span>
                    ) : (
                      <button className="btn btn-primary btn-sm" type="submit" disabled={!input.trim()}>发送修改</button>
                    )}
                  </div>
                  {busy && runTools.length > 0 && (
                    <div className="wb-toolcards">
                      {runTools.slice(-3).map((t, i) => (
                        <span key={i} className={`wb-toolcard st-${t.status}`}>
                          <span className="wb-tool-name">{t.name}</span>
                          <span>{t.status === 'running' ? '运行中…' : t.status === 'failed' ? `失败${t.reason ? `：${t.reason}` : ''}` : `完成${t.durationMs ? ` ${(t.durationMs / 1000).toFixed(1)}s` : ''}`}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {!busy && lastReply && (
                    <details className="wb-page-reply">
                      <summary className="fine">最近一轮回复（全文在对话视图）</summary>
                      <p className="fine" style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{lastReply}</p>
                    </details>
                  )}
                </form>
              )}
            </section>
          )}
        </main>

        {activeId && showDrawer && (
          <aside className="wb-drawer" aria-label="运行详情">
            <div className="wb-drawer-head">
              <strong>运行详情</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDrawer(false)}>关闭</button>
            </div>
            <div className="wb-drawer-stats">
              <span className="chip">工具调用 {events.filter((e) => e.kind === 'tool.finished').length}</span>
              <span className="chip">模型请求 {events.filter((e) => e.kind === 'model.finished').length}</span>
              {usage && <span className="chip">累计 {usage.modelCalls} 模型 / {usage.toolCalls} 工具</span>}
              {usage && <span className="chip">token 入{(usage.inputTokens ?? 0).toLocaleString()} / 出{usage.outputTokens.toLocaleString()}</span>}
              {usage && <span className="chip">用时 {Math.round(usage.activeMs / 1000)}s</span>}
            </div>
            <ol className="wb-timeline">
              {events.length === 0 && <li className="fine">暂无运行事件——发送消息后此处实时显示（工具/模型/失败原因）。</li>}
              {events.slice().reverse().map((e, i) => (
                <li key={i}>
                  <span className="wb-tl-kind">{e.kind}</span>
                  {e.detail?.toolName ? <span> · {String(e.detail.toolName)}</span> : null}
                  {e.detail?.model ? <span> · {String(e.detail.model)}</span> : null}
                  {e.detail?.reason ? <span className="wb-tl-fail"> · {String(e.detail.reason)}</span> : null}
                  <span className="fine"> · {e.at.slice(11, 19)}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      {showSettings && (
        <div className="wb-settings" role="dialog" aria-label="设置">
          <div className="wb-settings-card">
            <div className="wb-drawer-head">
              <strong>设置</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSettings(false)}>关闭</button>
            </div>
            <h3>模型链</h3>
            {!aiStatus ? <p className="fine">读取中…</p> : (
              <>
                <table className="tbl">
                  <thead><tr><th>供应商 / 模型</th><th>密钥</th></tr></thead>
                  <tbody>
                    {aiStatus.providers.map((p) => (
                      <tr key={p.modelId}><td>{p.provider} / {p.modelId}</td>
                        <td>{p.key ? <span className="chip chip-ok">就绪</span> : <span className="chip chip-fail">未配置</span>}</td></tr>
                    ))}
                  </tbody>
                </table>
                <p className="fine">{aiStatus.modelAvailable ? '模型链可用。' : '模型链不可用——任一密钥就绪即可。'} 密钥从环境变量或 ~/.pi/agent/auth.json 发现，不进仓库。</p>
              </>
            )}
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
             onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

function summarizeTools(tools: ToolCard[]): string {
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t.name, (counts.get(t.name) ?? 0) + 1);
  return [...counts.entries()].map(([n, c]) => `${n}×${c}`).join(' · ');
}
