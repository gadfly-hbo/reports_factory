/* M9 PPT 一站式生成视图：粘贴 MD/文本 + 提示词 → 端到端生成可编辑 PPTX（独立入口，不挤主路径）。 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { useToast } from '../state/toast';
import { post } from '../state/api';
import Empty from '../components/Empty';

type Mode = 'md' | 'text';

export function PptGeneratorView() {
  const p = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('md');
  const [input, setInput] = useState('');
  const [audience, setAudience] = useState('经营负责人');
  const [pageBudget, setPageBudget] = useState(6);
  const [briefPrompt, setBriefPrompt] = useState('聚焦重点门店');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ sections: { label: string; count: number; bytes: number }[]; target: string; session: { calls: number } } | null>(null);

  if (!p.detail) return <div className="view"><p className="fine">加载中…</p></div>;
  const d = p.detail;
  const localOnly = d.project.privacy_policy === 'local_only';

  const enableExternal = async () => {
    try {
      await fetch(`/api/projects/${p.id}/privacy`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ privacy_policy: 'allow_external_with_approval' }),
      });
      toast.show('已允许外部模型（出站首次调用仍需批准）', 'ok');
      await p.reload();
    } catch (e) {
      toast.show(String(e).slice(0, 120), 'fail');
    }
  };

  const generate = async () => {
    if (!input.trim()) { toast.show('请粘贴内容', 'fail'); return; }
    if (pageBudget < 1 || pageBudget > 16) { toast.show('页数需在 1–16 之间', 'fail'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${p.id}/ppt/from-${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(mode === 'md' ? { markdown: input } : { text: input }),
          audience, pageBudget, briefPrompt,
        }),
      });
      if (r.status === 403) {
        const j = await r.json().catch(() => null) as { needsApproval?: boolean; error?: string } | null;
        if (j?.needsApproval) {
          // S2 AC：needsApproval → 视图内就地批准预览（不再只引导去其他入口）
          const pv = await p.outboundPreview('authorized-summary').catch(() => null);
          if (pv) setPreview({ sections: pv.descriptor.sections, target: pv.target, session: pv.session });
          else toast.show('出站需批准——预览不可用，请先在生成页批准', 'fail');
        } else {
          toast.show(j?.error ?? '403', 'fail');
        }
        setBusy(false);
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => null) as { error?: string } | null;
        toast.show(j?.error ?? `生成失败 (${r.status})`, 'fail');
        setBusy(false);
        return;
      }
      // 触发浏览器下载
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ppt-${p.id}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.show('PPTX 已生成并下载', 'ok');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <h1 className="view-h">快速 PPT<span className="chip chip-accent">M9 一站式</span></h1>
      <p className="view-sub">粘贴 Markdown 或纯文本，写一句提示词，AI 起草后端到端生成可编辑 PPTX；不与现有编审/审批耦合。</p>

      {localOnly && (
        <div className="notice warn" data-testid="ppt-local-only">
          <b>当前项目隐私策略为「仅本地」——AI 起草被阻断，只会生成规则版骨架。</b>
          <div className="inline-row" style={{ marginTop: 6 }}>
            <button className="btn btn-sm btn-primary" type="button" data-testid="ppt-enable-external" onClick={() => void enableExternal()}>
              允许外部模型（出站首次调用仍需批准）
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-h">输入</div>
        <div className="inline-row" style={{ marginBottom: 8 }}>
          <label className="fine">
            <input type="radio" name="mode" checked={mode === 'md'} onChange={() => setMode('md')} /> Markdown
          </label>
          <label className="fine">
            <input type="radio" name="mode" checked={mode === 'text'} onChange={() => setMode('text')} /> 纯文本
          </label>
        </div>
        <textarea
          rows={10}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'md' ? '# 标题\n段落…\n- 要点 1\n- 要点 2' : '纯文本内容…'}
          data-testid="ppt-input"
        />
      </div>

      <div className="card">
        <div className="card-h">提示词与结构</div>
        <div className="fld-row">
          <div className="fld" style={{ maxWidth: 220 }}>
            <label className="fld-label" htmlFor="ppt-aud">受众</label>
            <input id="ppt-aud" value={audience} onChange={(e) => setAudience(e.target.value)} />
          </div>
          <div className="fld" style={{ maxWidth: 160 }}>
            <label className="fld-label" htmlFor="ppt-pages">页数 (1–16)</label>
            <input id="ppt-pages" type="number" min={1} max={16} value={pageBudget} onChange={(e) => setPageBudget(Number(e.target.value))} />
          </div>
          <div className="fld" style={{ flex: 1 }}>
            <label className="fld-label" htmlFor="ppt-prompt">一句提示词</label>
            <input id="ppt-prompt" value={briefPrompt} onChange={(e) => setBriefPrompt(e.target.value)} placeholder="聚焦重点门店" />
          </div>
        </div>
        {preview && (
          <div className="notice warn" style={{ marginTop: 8 }} data-testid="ppt-outbound-preview">
            <b>AI 起草前确认——将按页发送材料要点摘要（授权摘要）:</b>
            <ul style={{ margin: '6px 0 0 18px' }}>
              {preview.sections.map((sc, i) => (
                <li key={i}>{sc.label}:{sc.count} 项 · {sc.bytes} 字节</li>
              ))}
              <li>目标模型:{preview.target}</li>
              <li>本会话累计:{preview.session.calls} 次调用</li>
            </ul>
            <div className="fine">批准对本会话生效；出站日志只记条数与成本，不记内容。</div>
            <div className="inline-row" style={{ marginTop: 6 }}>
              <button className="btn btn-sm btn-primary" type="button" data-testid="ppt-approve" onClick={async () => {
                if (await p.approveOutbound('authorized-summary')) { setPreview(null); await generate(); }
              }}>批准并继续</button>
              <button className="btn btn-sm" type="button" onClick={() => setPreview(null)}>取消</button>
            </div>
          </div>
        )}
        <div className="actions">
          <button
            className="btn btn-primary"
            type="button"
            data-testid="ppt-generate"
            disabled={busy || !input.trim()}
            onClick={() => void generate()}
          >
            {busy ? '生成中…' : '一键生成 PPTX'}
          </button>
          <span className="fine">AI 起草 → 数字护栏/不编造/预算封顶 → 下载 .pptx；无密钥时按规则版骨架生成并明示。</span>
        </div>
      </div>

      {d.editorial?.g1 === false && d.editorial?.pending_pages === 0 && (
        <div className="card">
          <div className="card-h">下一步</div>
          <p className="fine">如需把生成的 PPTX 正式定稿发布，可走原三步主路径（编辑 → 审批导出）。</p>
          <div className="inline-row">
            <button className="btn btn-sm" type="button" onClick={() => navigate(`/project/${p.id}/compose`)}>打开编辑</button>
            <button className="btn btn-sm" type="button" onClick={() => navigate(`/project/${p.id}/export`)}>打开审批导出</button>
          </div>
        </div>
      )}

      {d.sources.length === 0 && (
        <Empty>还没有材料——先到「高级 → 材料」上传（MD/CSV/Excel），数字护栏会自动取材。</Empty>
      )}
    </div>
  );
}
