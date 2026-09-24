/* 组装阶段:预览(deck/document 自动按交付物类型)+ 自然语言修改(AI 起草) + 品牌设置 + 编辑操作入口。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';
import { DELIVERABLE_LABEL } from '../state/types';
import type { OutboundPreview } from '../state/types';
import Empty from '../components/Empty';

export function ComposeView() {
  const p = useProject();
  const d = p.detail;
  const [editPage, setEditPage] = useState('');
  const [editText, setEditText] = useState('');
  const [lastDiff, setLastDiff] = useState<string | null>(null);
  const [nlIntent, setNlIntent] = useState('');
  const [nlDraft, setNlDraft] = useState<{ op: Record<string, unknown>; note: string; expected_revision?: string } | null>(null);
  const [nlBusy, setNlBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<{ data: OutboundPreview; mode: 'structure-only' | 'authorized-summary' } | null>(null);
  const [brand, setBrand] = useState<{ primary: string; accent: string; logo?: string; font?: string } | null>(null);

  const draftNow = async () => {
    setAiBusy(true);
    try {
      const r = await p.draftProposal(nlIntent.trim());
      if (!r) return;
      if (r.needsApproval || !r.op) {
        const pv = await p.outboundPreview('authorized-summary');
        if (pv) setAiPreview({ data: pv, mode: 'authorized-summary' });
        return;
      }
      setNlDraft({ op: r.op, note: r.note ?? '', expected_revision: r.expected_revision });
    } finally {
      setAiBusy(false);
    }
  };

  const approveAndDraft = async () => {
    if (!aiPreview) return;
    if (await p.approveOutbound(aiPreview.mode)) {
      setAiPreview(null);
      await draftNow();
    }
  };

  if (!d) return <div className="view"><p className="fine">加载中…</p></div>;
  if (!d.hasSpec || !d.spec) {
    return (
      <div className="view">
        <Empty>尚未组装报告——先在「编审」阶段生成并确认蓝图。</Empty>
      </div>
    );
  }

  const currentBrand = d.project.brand;
  const draft = brand ?? {
    primary: currentBrand?.primary ?? '#0f766e',
    accent: currentBrand?.accent ?? '#155e75',
    logo: currentBrand?.logo_data_url,
    font: currentBrand?.font_name,
  };

  const spec = d.spec;

  return (
    <div className="view">
      <h1 className="view-h">组装与预览<span className="chip chip-accent">{DELIVERABLE_LABEL[d.deliverable_type] ?? d.deliverable_type}</span></h1>
      <p className="view-sub">
        {d.deliverable_type === 'research_report'
          ? '文档流预览(A4);导出为 DOCX / 独立 HTML / PDF。'
          : '16:9 幻灯预览;导出为可编辑 PPTX / PDF。'}
      </p>

      <div className="card">
        <div className="card-h">预览<span className="card-h-note">{spec.pages.length} 页 · 与导出同源渲染</span></div>
        <iframe className="preview-frame" title="报告预览" src={`/api/projects/${p.id}/preview`} />
      </div>

      <div className="card">
        <div className="card-h">局部编辑<span className="card-h-note">范围外内容不变(编辑稳定性有回归保障)</span></div>
        <div className="fld-row">
          <div className="fld" style={{ maxWidth: 160 }}>
            <label className="fld-label" htmlFor="edit-page">页面</label>
            <select id="edit-page" value={editPage} onChange={(e) => setEditPage(e.target.value)}>
              <option value="">选择页面…</option>
              {spec.pages.map((pg) => (
                <option key={pg.page_id} value={pg.page_id}>{pg.page_id} · {pg.headline.slice(0, 18)}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="fld-label" htmlFor="edit-text">新标题</label>
            <input id="edit-text" value={editText} onChange={(e) => setEditText(e.target.value)} placeholder="留空则不改" />
          </div>
        </div>
        <div className="actions">
          <button
            className="btn"
            type="button"
            disabled={!editPage || !editText.trim()}
            onClick={async () => {
              const r = await p.edit({ kind: 'edit_text', page_id: editPage, field: 'headline', text: editText.trim() });
              if (r?.ok) { setEditText(''); setLastDiff(r.diff ?? null); }
            }}
          >
            修改标题
          </button>
          <button
            className="btn"
            type="button"
            disabled={!editPage}
            onClick={async () => {
              const r = await p.edit({ kind: 'split_page', page_id: editPage });
              if (r?.ok) setLastDiff(r.diff ?? null);
            }}
          >
            拆分此页
          </button>
          <button
            className="btn"
            type="button"
            disabled={!editPage}
            onClick={async () => {
              const r = await p.edit({ kind: 'regenerate_page', page_id: editPage });
              if (r?.ok) setLastDiff(r.diff ?? null);
            }}
          >
            重新生成此页
          </button>
          <span className="fine">所有修改经变更控制器(锁定/版本冲突受控);版本差异见 Inspector「版本」。</span>
        </div>
        {lastDiff && (
          <div className="notice" style={{ marginTop: 8 }} data-testid="proposal-diff">
            <b>已应用的变更提案:</b> {lastDiff}
          </div>
        )}
      </div>

      {d.capabilities?.ai.enabled && (
        <div className="card">
          <div className="card-h">自然语言修改（AI 起草）<span className="card-h-note">模型只起草单一、最小范围的标题修改;应用前须你确认差异</span></div>
          <div className="inline-row">
            <input
              id="nl-intent"
              style={{ flex: 1 }}
              value={nlIntent}
              placeholder="例:把第 2 页标题改得更精简"
              onChange={(e) => setNlIntent(e.target.value)}
            />
            <button
              className="btn" type="button" data-testid="nl-draft"
              disabled={aiBusy || !nlIntent.trim()}
              onClick={draftNow}
            >
              {aiBusy ? '起草中…' : '生成修改提案'}
            </button>
          </div>
          {aiPreview && (
            <div className="notice warn" style={{ marginTop: 8 }} data-testid="outbound-preview">
              <b>AI 调用前确认——起草提案将发送页面清单与你的意图（授权摘要）:</b>
              <ul style={{ margin: '6px 0 0 18px' }}>
                {aiPreview.data.descriptor.sections.map((s, i) => (
                  <li key={i}>{s.label}:{s.bytes} 字节</li>
                ))}
                <li>目标模型:{aiPreview.data.target}</li>
                <li>本会话累计:{aiPreview.data.session.calls} 次调用 · 成本 {aiPreview.data.session.totalCost.toFixed(4)}</li>
              </ul>
              <div className="fine">批准对本会话生效;本会话后续 AI 调用将按同一范围发送新增发现;出站日志只记录条数与成本。</div>
              <div className="inline-row" style={{ marginTop: 6 }}>
                <button className="btn btn-sm btn-primary" type="button" onClick={approveAndDraft}>批准并继续</button>
                <button className="btn btn-sm" type="button" onClick={() => setAiPreview(null)}>取消</button>
              </div>
            </div>
          )}
          {nlDraft && (
            <div className="notice" style={{ marginTop: 8 }} data-testid="nl-draft">
              <b>模型起草的提案（未应用）:</b> {nlDraft.op['page_id'] as string}.{nlDraft.op['field'] as string} → 「{nlDraft.op['text'] as string}」
              <div className="fine">理由:{nlDraft.note}</div>
              <div className="inline-row" style={{ marginTop: 6 }}>
                <button
                  className="btn btn-sm btn-primary" type="button"
                  onClick={async () => {
                    const r = await p.edit(nlDraft.op, { source: 'model-draft', expectedRevision: nlDraft.expected_revision });
                    if (r?.ok) { setLastDiff(r.diff ?? null); setNlDraft(null); setNlIntent(''); }
                  }}
                >
                  确认应用（走变更控制器）
                </button>
                <button className="btn btn-sm" type="button" onClick={() => setNlDraft(null)}>丢弃</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-h">品牌设置<span className="card-h-note">token 级:色板 / Logo / 字体名——只改视觉,不重生成内容</span></div>
        <div className="fld-row">
          <div className="fld" style={{ maxWidth: 110 }}>
            <label className="fld-label" htmlFor="brand-primary">主色</label>
            <input id="brand-primary" type="color" value={draft.primary} onChange={(e) => setBrand({ ...draft, primary: e.target.value })} />
          </div>
          <div className="fld" style={{ maxWidth: 110 }}>
            <label className="fld-label" htmlFor="brand-accent">强调色</label>
            <input id="brand-accent" type="color" value={draft.accent} onChange={(e) => setBrand({ ...draft, accent: e.target.value })} />
          </div>
          <div className="fld" style={{ maxWidth: 160 }}>
            <label className="fld-label" htmlFor="brand-font">字体名</label>
            <input id="brand-font" placeholder="如 Microsoft YaHei" value={draft.font ?? ''} onChange={(e) => setBrand({ ...draft, font: e.target.value || undefined })} />
          </div>
          <div className="fld">
            <label className="fld-label" htmlFor="brand-logo">Logo(PNG/JPG)</label>
            <input
              id="brand-logo"
              type="file"
              accept="image/png,image/jpeg"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
                  setBrand({ ...draft, logo: url });
                }
              }}
            />
          </div>
        </div>
        <div className="actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={!brand}
            onClick={async () => {
              const b: Record<string, string> = { primary: draft.primary, accent: draft.accent };
              if (draft.font) b.font_name = draft.font;
              if (draft.logo) b.logo_data_url = draft.logo;
              const ok = await p.applyBrand(b as never);
              if (ok) setBrand(null);
            }}
          >
            应用品牌
          </button>
          {currentBrand && <span className="fine">当前已有品牌配置;重新应用会覆盖。</span>}
        </div>
      </div>
    </div>
  );
}
