/* 组装阶段:预览(deck/document 自动按交付物类型)+ 品牌设置 + 编辑操作入口。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';
import { DELIVERABLE_LABEL } from '../state/types';
import Empty from '../components/Empty';

export function ComposeView() {
  const p = useProject();
  const d = p.detail;
  const [editPage, setEditPage] = useState('');
  const [editText, setEditText] = useState('');
  const [brand, setBrand] = useState<{ primary: string; accent: string; logo?: string; font?: string } | null>(null);

  if (!d) return <div className="view"><p className="fine">加载中…</p></div>;
  if (!d.hasSpec || !d.spec) {
    return (
      <div className="view">
        <Empty>尚未组装报告——先在「大纲」阶段生成并确认大纲。</Empty>
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
              const ok = await p.edit({ kind: 'edit_text', page_id: editPage, field: 'headline', text: editText.trim() });
              if (ok) { setEditText(''); }
            }}
          >
            修改标题
          </button>
          <button
            className="btn"
            type="button"
            disabled={!editPage}
            onClick={() => void p.edit({ kind: 'split_page', page_id: editPage })}
          >
            拆分此页
          </button>
          <button
            className="btn"
            type="button"
            disabled={!editPage}
            onClick={() => void p.edit({ kind: 'regenerate_page', page_id: editPage })}
          >
            重新生成此页
          </button>
          <span className="fine">锁定 / 页序 / 布局切换经 API 提供;版本差异见 Inspector「版本」。</span>
        </div>
      </div>

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
