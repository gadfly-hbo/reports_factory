/* 生成页（M7 三步主路径第一步）：材料摘要 + 模版风格 + 一键生成（逐页 LLM 起草）+ 进度 + 大纲确认。 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { useToast } from '../state/toast';
import { api, post } from '../state/api';
import Chip from '../components/Chip';
import Empty from '../components/Empty';
import type { GenerationState, OutboundPreview, TemplateInfo } from '../state/types';

const STAGE_LABEL: Record<string, string> = { outline: '结构', draft: '起草', assemble: '组装', checks: '检查' };
const STAGE_CHIP: Record<string, string> = { done: 'chip-ok', fallback: 'chip-warn', failed: 'chip-fail', pending: 'chip-warn' };
const PAGE_LABEL: Record<string, string> = { ai: 'AI 起草', uncovered: '材料未覆盖', fallback: '规则版' };
const PAGE_CHIP: Record<string, string> = { ai: 'chip-ok', uncovered: 'chip-warn', fallback: 'chip-warn' };

export function GenerateView() {
  const p = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const d = p.detail;
  const [audience, setAudience] = useState('经营负责人');
  const [purpose, setPurpose] = useState('');
  const [confirmOutline, setConfirmOutline] = useState(false);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [gen, setGen] = useState<GenerationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [outlineHeads, setOutlineHeads] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ data: OutboundPreview; mode: 'structure-only' | 'authorized-summary' } | null>(null);
  const pollRef = useRef<number | null>(null);

  const project = d?.project;

  useEffect(() => {
    api<{ templates: TemplateInfo[] }>('/api/templates').then((r) => setTemplates(r.templates)).catch(() => void 0);
  }, []);

  // 恢复进行中/待确认的生成（刷新页面后从 checkpoint 恢复；running 态恢复轮询）
  useEffect(() => {
    void p.getGeneration().then((g) => {
      if (g && g.status !== 'done') {
        setGen(g);
        if (g.status === 'running') setBusy(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  // 请求期间轮询 checkpoint 进度
  useEffect(() => {
    if (!busy) return;
    pollRef.current = window.setInterval(() => {
      void p.getGeneration().then((g) => { if (g) setGen(g); });
    }, 1500);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const applyGen = (g: GenerationState | null) => {
    setGen(g);
    setBusy(false);
    if (g?.status === 'done') toast.show('生成完成——成稿可编辑', 'ok');
    else if (g?.status === 'failed') toast.show('生成失败，可重试续跑', 'fail');
  };

  const generateNow = async () => {
    if (!purpose.trim()) { toast.show('请填写汇报用途', 'fail'); return; }
    setBusy(true);
    const r = await p.generate({ audience: audience.trim(), purpose: purpose.trim(), confirm_outline: confirmOutline });
    if (r === 'needsApproval') {
      setBusy(false);
      const pv = await p.outboundPreview('authorized-summary');
      if (pv) setPreview({ data: pv, mode: 'authorized-summary' });
      return;
    }
    if (r === 'blocked') { setBusy(false); toast.show('出站被拒绝（预算超帽或策略限制）——详见进度区', 'fail'); await refreshGen(); return; }
    applyGen(r === null ? await refreshGen() : r);
  };

  const refreshGen = async (): Promise<GenerationState | null> => {
    const g = await p.getGeneration();
    setGen(g);
    return g;
  };

  const approveAndGenerate = async () => {
    if (!preview) return;
    if (await p.approveOutbound(preview.mode)) {
      setPreview(null);
      await generateNow();
    }
  };

  const confirmOutlineNow = async () => {
    setBusy(true);
    const g = await p.confirmGenerate(Object.keys(outlineHeads).length > 0 ? outlineHeads : undefined);
    applyGen(g);
  };

  if (!d) return <div className="view"><p className="fine">加载中…</p></div>;

  const tpl = templates.find((t) => t.id === project?.template_id);
  const draftStage = gen?.stages.find((s) => s.name === 'draft');
  const outlineStage = gen?.stages.find((s) => s.name === 'outline');
  const sources = d.sources ?? [];
  const parsedCount = sources.filter((s) => s.parse_status === 'parsed').length;

  return (
    <div className="view">
      <h1 className="view-h">生成<span className="chip chip-accent">{tpl?.name ?? '报告'}</span></h1>
      <p className="view-sub">上传材料 → 点一次生成 → 逐页 AI 起草成稿；生成后进入编辑，最后审批导出。</p>

      <div className="card">
        <div className="card-h">材料<span className="card-h-note">{sources.length} 份来源，{parsedCount} 份已解析</span></div>
        {sources.length === 0 ? (
          <Empty>还没有材料——先到「高级 → 材料」上传（md / csv / xlsx / docx）。</Empty>
        ) : (
          <p className="fine" style={{ margin: 0 }}>
            {sources.map((s) => s.filename).join('、')}
            {(d.conflicts ?? []).some((c) => c.resolution === 'unresolved') && '；存在未解决的材料冲突（正式导出前需处理）'}
          </p>
        )}
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="btn btn-sm" type="button" onClick={() => navigate(`/project/${p.id}/materials`)}>管理材料</button>
        </div>
      </div>

      <div className="card">
        <div className="card-h">生成<span className="card-h-note">{tpl ? `${tpl.name} · ${tpl.description}` : '模版加载中'}</span></div>
        {tpl && (
          <>
            <div className="inline-row" style={{ marginBottom: 8 }}>
              {(tpl.page_plan ?? []).map((pt, i) => (
                <span key={i} className="chip" style={{ fontSize: 11 }}>{pt}</span>
              ))}
            </div>
            {tpl.brand && (
              <div className="inline-row fine" style={{ marginBottom: 8, alignItems: 'center' }}>
                品牌风格：
                <span aria-hidden className="chip" style={{ background: tpl.brand.primary, color: '#fff', fontSize: 11 }}>{tpl.brand.primary}</span>
                <span aria-hidden className="chip" style={{ background: tpl.brand.accent, color: '#fff', fontSize: 11 }}>{tpl.brand.accent}</span>
                <span>（建项目时选定；自定义品牌可在编辑页覆盖）</span>
              </div>
            )}
          </>
        )}
        <div className="fld-row">
          <div className="fld" style={{ maxWidth: 200 }}>
            <label className="fld-label" htmlFor="gen-audience">汇报对象</label>
            <input id="gen-audience" value={audience} onChange={(e) => setAudience(e.target.value)} />
          </div>
          <div className="fld" style={{ flex: 1 }}>
            <label className="fld-label" htmlFor="gen-purpose">汇报用途</label>
            <input id="gen-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="如：上半年经营复盘" />
          </div>
        </div>
        <label className="fld" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={confirmOutline} onChange={(e) => setConfirmOutline(e.target.checked)} />
          <span className="fld-label" style={{ margin: 0 }}>先确认大纲再起草（默认直出整套）</span>
        </label>
        <div className="actions">
          <button
            className="btn btn-primary" type="button" data-testid="generate-now"
            disabled={busy || sources.length === 0 || !purpose.trim()}
            onClick={() => void generateNow()}
          >
            {busy ? '生成中…' : gen?.status === 'done' ? '重新生成' : '一键生成'}
          </button>
          <span className="fine">逐页 AI 起草（每页一次调用，受预算封顶）；无密钥/仅本地时自动回退规则版骨架。</span>
        </div>
        {preview && (
          <div className="notice warn" style={{ marginTop: 8 }} data-testid="generate-preview">
            <b>AI 起草前确认——生成将按页调用模型:</b>
            <ul style={{ margin: '6px 0 0 18px' }}>
              <li>每页发送：该页任务（页型/主旨）+ 该页绑定的材料要点与表格摘要（含数字）</li>
              <li>敏感来源的主张与表格默认排除，不外发</li>
              <li>目标模型:{preview.data.target} · 本会话累计:{preview.data.session.calls} 次调用</li>
            </ul>
            <div className="fine">批准对本会话生效；出站日志只记条数与成本，不记内容。</div>
            <div className="inline-row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm btn-primary" type="button" onClick={() => void approveAndGenerate()}>批准并生成</button>
              <button className="btn btn-sm" type="button" onClick={() => setPreview(null)}>取消</button>
            </div>
          </div>
        )}
      </div>

      {gen && gen.status !== 'awaiting_confirmation' && (
        <div className="card" data-testid="generation-progress">
          <div className="card-h">进度<span className="card-h-note">
            {gen.calls !== undefined && `已调用模型 ${gen.calls} 次 · `}{draftStage?.total
              ? `起草 第 ${Object.keys(draftStage.pages ?? {}).length}/${draftStage.total} 页 · ${gen.status === 'done' ? '已完成' : gen.status === 'failed' ? '已停止' : '进行中'}`
              : gen.status === 'done' ? '已完成' : gen.status === 'failed' ? '已停止' : '进行中'}
          </span></div>
          <div className="inline-row">
            {gen.stages.map((s) => (
              <Chip key={s.name} kind={STAGE_CHIP[s.status]} title={s.error ?? s.note}>
                {STAGE_LABEL[s.name] ?? s.name}:{{ done: '完成', failed: '失败', fallback: '规则版', pending: '待跑' }[s.status] ?? s.status}
              </Chip>
            ))}
          </div>
          {draftStage?.pages && (
            <div style={{ marginTop: 8 }}>
              {Object.entries(draftStage.pages).map(([pid, outcome]) => (
                <div key={pid} className="issue">
                  <Chip kind={PAGE_CHIP[outcome]}>{PAGE_LABEL[outcome] ?? outcome}</Chip>
                  <span className="msg">{pid}</span>
                </div>
              ))}
            </div>
          )}
          {draftStage?.note && <div className="fine" style={{ marginTop: 6 }}>{draftStage.note}</div>}
          {gen.stages.some((s) => s.status === 'failed') && (
            <div className="notice fail" style={{ marginTop: 8 }}>
              停点：{gen.stages.filter((s) => s.status === 'failed').map((s) => `${STAGE_LABEL[s.name] ?? s.name}——${s.error}`).join('；')}
              <div className="inline-row" style={{ marginTop: 6 }}>
                <button className="btn btn-sm" type="button" onClick={() => void generateNow()}>从断点续跑</button>
              </div>
            </div>
          )}
          {gen.status === 'done' && (
            <div className="notice" style={{ marginTop: 8 }}>
              成稿已就绪——内容页可直接编辑。
              <div className="inline-row" style={{ marginTop: 6 }}>
                <button className="btn btn-sm btn-primary" type="button" data-testid="goto-edit" onClick={() => navigate(`/project/${p.id}/compose`)}>进入编辑</button>
                <button className="btn btn-sm" type="button" onClick={() => navigate(`/project/${p.id}/export`)}>直达审批导出</button>
              </div>
            </div>
          )}
        </div>
      )}

      {gen?.status === 'awaiting_confirmation' && (
        <div className="card" data-testid="outline-confirm">
          <div className="card-h">确认大纲<span className="card-h-note">可改各页标题；确认后开始逐页起草</span></div>
          {(gen.outline ?? []).map((pg) => (
            <div className="fld-row" key={pg.page_id} style={{ alignItems: 'center' }}>
              <span className="fine" style={{ width: 130 }}>{pg.page_id} · {pg.type}</span>
              <input
                style={{ flex: 1 }}
                value={outlineHeads[pg.page_id] ?? pg.headline}
                onChange={(e) => setOutlineHeads({ ...outlineHeads, [pg.page_id]: e.target.value })}
              />
            </div>
          ))}
          <div className="actions">
            <button className="btn btn-primary" type="button" data-testid="confirm-outline" onClick={() => void confirmOutlineNow()}>确认并开始起草</button>
          </div>
        </div>
      )}
    </div>
  );
}
