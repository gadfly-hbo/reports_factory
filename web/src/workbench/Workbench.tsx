/* 工作台（T1 起逐步替换六步视图；布局与状态规则沿 .flow/ui-contract.md W0/W1/W2/W9）。
   真实状态渲染：附件解析状态来自 /materials，发送/停止来自 /chat 与 /agent/stop；无假进度。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, post, del, errMsg } from '../state/api';
import { OutlineCard, type OutlineState } from './OutlineCard';

interface Project { project_id: string; title: string; updated_at: string }
interface MaterialEntry { source_id: string; filename: string; kind: string; status: 'ready' | 'failed'; extract_file: string; chars: number; error?: string }
interface AgentResult { active: boolean; status?: string; value?: string; reason?: string }
interface AiStatus { chain: string[]; providers: Array<{ provider: string; modelId: string; key: boolean }>; modelAvailable: boolean }
interface Usage { modelCalls: number; toolCalls: number; inputTokens?: number; outputTokens: number; activeMs: number }

/** 结果分类（W9.2）：真实原因 + 可行下一步；cancel 为中性态 */
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

interface ThreadMsg { role: 'user' | 'assistant'; text: string; failed?: boolean; retry?: boolean; recoverable?: boolean }
interface UiEvent { at: string; kind: string; detail?: Record<string, unknown> }
interface DeckInfo { pages: Array<{ name: string; preview_ready: boolean; bytes: number }>; pptx: { exists: boolean; bytes: number } | null }
interface QaReport { ok: boolean; slides: number; text_boxes: number; charts: number; items: Array<{ item: string; status: 'pass' | 'flag' | 'info'; detail: string }>; message: string }
interface ExportRec { export_id: string; format: string; created_at: string }
interface HistoryEntry { id: string; kind: string; message?: { role: string; text: string; calls?: Array<{ name: string }> } }

export function Workbench() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);
  const [messages, setMessages] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [outline, setOutline] = useState<OutlineState | null>(null);
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [deck, setDeck] = useState<DeckInfo | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [qa, setQa] = useState<QaReport | null>(null);
  const [exportList, setExportList] = useState<ExportRec[]>([]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [historyLoadedFor, setHistoryLoadedFor] = useState<string | null>(null);
  const lastUserText = useRef('');
  const [showSettings, setShowSettings] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshProjects = useCallback(async () => {
    const r = await api<{ projects: Project[] }>('/api/projects');
    setProjects(r.projects);
    setActiveId((cur) => cur ?? r.projects[0]?.project_id ?? null);
  }, []);

  const refreshMaterials = useCallback(async (id: string) => {
    const r = await api<{ materials: MaterialEntry[] }>(`/api/projects/${id}/materials`);
    setMaterials(r.materials);
  }, []);

  useEffect(() => { void refreshProjects().catch((e) => setError(errMsg(e))); }, [refreshProjects]);

  const refreshOutline = useCallback(async (id: string) => {
    setOutline(await api<OutlineState>(`/api/projects/${id}/outline`));
  }, []);

  useEffect(() => {
    if (!activeId) { setMaterials([]); setOutline(null); setEvents([]); setDeck(null); setSelectedPage(null); return; }
    void refreshMaterials(activeId).catch((e) => setError(errMsg(e)));
    void refreshOutline(activeId).catch((e) => setError(errMsg(e)));
  }, [activeId, refreshMaterials, refreshOutline]);

  // T6 重启恢复：历史线程渲染（host.list 找回 JSONL 会话；失败不阻塞——空线程引导仍在）
  useEffect(() => {
    if (!activeId || historyLoadedFor === activeId) return;
    setHistoryLoadedFor(activeId);
    setMessages([]);
    void api<{ entries: HistoryEntry[] }>(`/api/projects/${activeId}/agent/history`)
      .then((r) => {
        const restored: Array<{ role: 'user' | 'assistant'; text: string; failed?: boolean }> = [];
        for (const e of r.entries) {
          if (e.kind !== 'message' || !e.message) continue;
          const text = (e.message.text ?? '').trim();
          if (!text) continue;
          if (e.message.role === 'user') restored.push({ role: 'user', text });
          else if (e.message.role === 'assistant') restored.push({ role: 'assistant', text });
        }
        if (restored.length > 0) setMessages([{ role: 'assistant', text: `—— 以上为此前会话（恢复于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}）——` }, ...restored.slice(-40)]);
      })
      .catch(() => { /* 历史不可用（如无密钥）：线程空态引导仍在 */ });
  }, [activeId, historyLoadedFor]);

  useEffect(() => {
    if (!activeId) { setEvents([]); return; }
    const es = new EventSource(`/api/projects/${activeId}/agent/events`);
    es.onmessage = (e) => {
      try { setEvents((prev) => [...prev.slice(-24), JSON.parse(e.data) as UiEvent]); } catch { /* 忽略坏帧 */ }
    };
    return () => es.close();
  }, [activeId]);

  const refreshDeck = useCallback(async (id: string) => {
    setDeck(await api<DeckInfo>(`/api/projects/${id}/deck`).catch(() => null));
    setExportList((await api<{ exports: ExportRec[] }>(`/api/projects/${id}/exports`).catch(() => ({ exports: [] }))).exports);
  }, []);

  const openSettings = async () => {
    setShowSettings(true);
    try { setAiStatus(await api<AiStatus>('/api/ai/status')); } catch (e) { setError(errMsg(e)); }
  };

  const recoverSession = async () => {
    if (!activeId) return;
    try {
      await post(`/api/projects/${activeId}/agent/recover`, {});
      setMessages((m) => [...m, { role: 'assistant', text: '会话已恢复（残留占用与配置迁移已处理）。可以重试上一条。' }]);
    } catch (e) { setError(`恢复失败：${errMsg(e)}`); }
  };

  const refreshUsage = useCallback(async (id: string) => {
    setUsage((await api<{ usage: Usage | null }>(`/api/projects/${id}/agent/usage`).catch(() => ({ usage: null }))).usage);
  }, []);

  const runQa = async () => {
    if (!activeId) return;
    setQa(null);
    try { setQa(await api<QaReport>(`/api/projects/${activeId}/qa`)); } catch (e) { setError(errMsg(e)); }
  };

  const doExport = async (fmt: 'pptx' | 'html' | 'pdf') => {
    if (!activeId) return;
    setExporting(fmt);
    setError(null);
    try {
      const r = await post<{ ok: boolean; qa: QaReport; exports: ExportRec[] }>(`/api/projects/${activeId}/export`, { formats: [fmt] });
      setQa(r.qa);
      await refreshDeck(activeId);
    } catch (e) { setError(`导出失败：${errMsg(e)}`); }
    setExporting(null);
  };

  useEffect(() => {
    if (!activeId) { setDeck(null); return; }
    void refreshDeck(activeId).catch(() => {});
  }, [activeId, refreshDeck]);

  const waitResult = useCallback(async (pid: string) => {
    setBusy(true);
    for (;;) {
      await new Promise((r) => setTimeout(r, 1200));
      const res = await api<AgentResult>(`/api/projects/${pid}/agent/result`);
      if (!res.active) {
        const c = classifyResult(res);
        if (c.kind === 'ok') setMessages((m) => [...m, { role: 'assistant', text: res.value?.trim() || '（空回复）' }]);
        else if (c.text) setMessages((m) => [...m, { role: 'assistant', text: c.text, failed: c.kind === 'fail', retry: c.kind === 'fail', recoverable: c.recover }]);
        break;
      }
    }
    await refreshOutline(pid).catch(() => {});
    await refreshDeck(pid).catch(() => {});
    await refreshUsage(pid).catch(() => {});
    setBusy(false);
  }, [refreshOutline, refreshDeck, refreshUsage]);

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

  const send = async () => {
    if (!activeId || !input.trim() || busy) return;
    const text = input.trim();
    const page = selectedPage ?? undefined;
    lastUserText.current = text;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: page ? `【针对 ${page}】${text}` : text }]);
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ mode: 'run' | 'steer' }>(`/api/projects/${activeId}/chat`, { text, ...(page ? { page } : {}) });
      if (r.mode === 'steer') setMessages((m) => [...m, { role: 'assistant', text: '（已作为插话发送给进行中的任务）' }]);
      await waitResult(activeId);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `发送失败：${errMsg(e)}`, failed: true }]);
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!activeId || busy || !lastUserText.current) return;
    const text = lastUserText.current;
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      await post(`/api/projects/${activeId}/chat`, { text });
      await waitResult(activeId);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: `发送失败：${errMsg(e)}（可在设置页检查模型状态）`, failed: true }]);
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
      setCreating(false);
      setNewTitle('');
      await refreshProjects();
      setActiveId(r.project.project_id);
    } catch (e) { setError(errMsg(e)); }
  };

  const removeProject = async (id: string, title: string) => {
    if (!window.confirm(`删除项目「${title}」？\n项目及其会话与产物将被删除，不可恢复。`)) return;
    try {
      await del(`/api/projects/${id}`);
      setActiveId(null);
      await refreshProjects();
    } catch (e) { setError(errMsg(e)); }
  };

  const active = projects.find((p) => p.project_id === activeId) ?? null;

  return (
    <div className="wb">
      <aside className="wb-sidebar" aria-label="项目">
        <div className="wb-brand">Report Studio</div>
        <button className="btn btn-primary wb-new" type="button" onClick={() => setCreating(true)}>＋ 新建项目</button>
        {creating && (
          <div className="wb-new-form">
            <input autoFocus placeholder="项目名称" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') void createProject(); if (e.key === 'Escape') setCreating(false); }} />
            <div className="wb-new-actions">
              <button className="btn btn-sm" type="button" onClick={() => setCreating(false)}>取消</button>
              <button className="btn btn-primary btn-sm" type="button" disabled={!newTitle.trim()} onClick={() => void createProject()}>创建</button>
            </div>
          </div>
        )}
        <div className="wb-list">
          {projects.map((p) => (
            <div key={p.project_id} role="button" tabIndex={0}
                 className={`wb-item ${p.project_id === activeId ? 'active' : ''}`}
                 onClick={() => setActiveId(p.project_id)}
                 onKeyDown={(e) => { if (e.key === 'Enter') setActiveId(p.project_id); }}>
              <span className="wb-item-title">{p.title}</span>
              <button className="wb-item-del" type="button" aria-label={`删除 ${p.title}`}
                      onClick={(e) => { e.stopPropagation(); void removeProject(p.project_id, p.title); }}>×</button>
            </div>
          ))}
          {projects.length === 0 && <p className="wb-side-note">尚无项目——新建一个开始。</p>}
        </div>
        <p className="wb-side-note">对话式生成 PPT；上传材料、说清需求即可。</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openSettings()}>设置</button>
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
        ) : (
          <>
            <header className="wb-header">
              <h1>{active.title}</h1>
              <span className="wb-sub">对话式生成 · 框架确认后自主推进</span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}
                      aria-expanded={showDrawer} onClick={() => { const next = !showDrawer; setShowDrawer(next); if (activeId && next) void refreshUsage(activeId); }}>运行详情</button>
            </header>

            <section className="wb-attachments" aria-label="材料">
              {materials.length === 0 ? (
                <p className="wb-hint">还没有材料——上传 md、Word、PDF、表格或图片，AI 会读取后与你讨论框架。</p>
              ) : materials.map((m) => (
                <span key={m.source_id} className={`chip ${m.status === 'failed' ? 'chip-fail' : 'chip-ok'}`}
                      title={m.error ?? `${m.chars} 字符提取文本`}>
                  {KIND_LABEL[m.kind] ?? m.kind} · {m.filename}{m.status === 'failed' ? ` · 解析失败：${m.error ?? ''}` : ' · 就绪'}
                </span>
              ))}
              <button className="btn btn-ghost btn-sm" type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? '解析中…' : '＋ 上传材料'}
              </button>
            </section>

            <section className="wb-thread" aria-live="polite">
              {messages.length === 0 && (
                <div className="wb-thread-empty">
                  <p>例如：「根据这几份材料做一份 Q3 经营复盘 PPT，10 页以内，先给我框架」。</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`wb-msg ${m.role}${m.failed ? ' failed' : m.text.startsWith('——') ? ' divider' : ''}`}>
                  {m.text}
                  {m.retry && !busy && <button type="button" className="btn btn-sm wb-retry" onClick={() => void retry()}>重试上一条</button>}
                  {m.recoverable && !busy && <button type="button" className="btn btn-sm wb-retry" onClick={() => void recoverSession()}>恢复会话</button>}
                </div>
              ))}
              {busy && (
                <div className="wb-msg assistant pending">
                  <div>AI 处理中…（可插话或停止）</div>
                  {events.slice(-4).map((e, i) => (
                    <div key={i} className="wb-event">
                      <span className="wb-event-kind">{e.kind}</span>
                      {e.detail?.toolName ? <span> · {String(e.detail.toolName)}</span> : null}
                      {e.detail?.model ? <span> · {String(e.detail.model)}</span> : null}
                      {e.detail?.reason ? <span> · {String(e.detail.reason)}</span> : null}
                    </div>
                  ))}
                </div>
              )}
              {deck && deck.pages.length > 0 && (
                <section className="wb-deck" aria-label="成果">
                  <div className="wb-deck-bar">
                    <strong>成果</strong>
                    {deck.pptx && <span className="chip chip-ok">deck.pptx · {Math.max(1, Math.round(deck.pptx.bytes / 1024))}KB · {deck.pages.length} 页</span>}
                    {selectedPage && <span className="chip chip-accent">正在编辑 {selectedPage}</span>}
                    {selectedPage && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedPage(null)}>取消选中</button>}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runQa()}>质检</button>
                      {(['pptx', 'html', 'pdf'] as const).map((fmt) => (
                        <button key={fmt} type="button" className="btn btn-primary btn-sm" disabled={!deck.pptx || exporting !== null}
                                onClick={() => void doExport(fmt)}>
                          {exporting === fmt ? '导出中…' : `下载 ${fmt.toUpperCase()}`}
                        </button>
                      ))}
                    </span>
                  </div>
                  {qa && (
                    <div className={`wb-qa ${qa.ok ? '' : 'has-flag'}`} role="region" aria-label="质检结果">
                      <strong>质检 · {qa.message}</strong>
                      <ul>
                        {qa.items.map((i) => <li key={i.item} className={`qa-${i.status}`}>{i.status === 'pass' ? '✓' : i.status === 'flag' ? '!' : '·'} {i.item}：{i.detail}</li>)}
                      </ul>
                      {(qa as { empty_slides?: string[] }).empty_slides?.length ? (
                        <p className="qa-flag">部分页失败：{(qa as { empty_slides?: string[] }).empty_slides!.join('、')} 为空页——选中该页对话要求重做。</p>
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
                  <div className="wb-deck-grid">
                    {deck.pages.map((p, i) => (
                      <button key={p.name} type="button"
                              className={`wb-thumb ${selectedPage === p.name ? 'active' : ''}`}
                              onClick={() => setSelectedPage(p.name)}>
                        <img src={`/api/projects/${activeId}/deck/preview/${p.name}?t=${busy ? 0 : (deck.pptx?.bytes ?? i)}`} alt={`${p.name} 近似预览`}
                             onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                        <span className="wb-thumb-name">{String(i + 1).padStart(2, '0')} · {p.name}{p.preview_ready ? '' : '（近似）'}</span>
                      </button>
                    ))}
                  </div>
                  {selectedPage && (
                    <figure className="wb-figure">
                      <img src={`/api/projects/${activeId}/deck/preview/${selectedPage}`} alt={`${selectedPage} 大图预览`} />
                      <figcaption className="fine">近似渲染，实际以导出 PPTX 为准。在下方输入框对话修改这一页。</figcaption>
                    </figure>
                  )}
                </section>
              )}
              {outline && activeId && (
                <OutlineCard projectId={activeId} outline={outline} busy={busy}
                             onChanged={() => void refreshOutline(activeId)}
                             onNotify={(t) => setMessages((m) => [...m, { role: 'assistant', text: t }])}
                             waitResult={() => waitResult(activeId)}
                             onReply={(q) => { setInput(`关于「${q.slice(0, 40)}」：`); }} />
              )}
            </section>

            <form className="wb-composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <textarea
                rows={2}
                placeholder="描述要做的 PPT，或对当前结果提出修改……"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
              />
              <div className="wb-composer-foot">
                {selectedPage && (
                  <span className="chip chip-accent">针对 {selectedPage}
                    <button type="button" className="wb-chip-x" aria-label="取消页选中" onClick={() => setSelectedPage(null)}>×</button>
                  </span>
                )}
                <button className="btn btn-ghost btn-sm" type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>📎 附件</button>
                {busy
                  ? <button className="btn btn-sm wb-stop" type="button" onClick={() => void stop()}>停止</button>
                  : <button className="btn btn-primary btn-sm" type="submit" disabled={!input.trim()}>发送</button>}
              </div>
            </form>
          </>
        )}
      </main>

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

      <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
             onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
