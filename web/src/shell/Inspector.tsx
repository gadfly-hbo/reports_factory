/* 右侧 Inspector:上下文 / 主张与证据 / 指标 / 版本与比较。 */
import { useState } from 'react';
import Chip from '../components/Chip';
import { useProject } from '../state/projectDetail';
import { useUI } from '../state/ui';
import { api } from '../state/api';
import {
  DELIVERABLE_LABEL, KIND_LABEL, VERIF_CHIP, VERIF_LABEL,
} from '../state/types';
import type { Claim, EvidenceRef, InspTabExt } from './inspector-types';
import type { SpecDiff } from './inspector-types';

const TABS: { key: InspTabExt; label: string }[] = [
  { key: 'context', label: '上下文' },
  { key: 'evidence', label: '主张与证据' },
  { key: 'metrics', label: '指标' },
  { key: 'versions', label: '版本' },
];

export function Inspector() {
  const ui = useUI();
  return (
    <aside className="inspector" id="inspector" aria-label="上下文 Inspector">
      <div className="insp-head">
        <h2 className="insp-title">Inspector</h2>
        <button className="btn btn-ghost btn-sm" type="button" onClick={ui.toggleInsp} aria-label="关闭 Inspector">✕</button>
      </div>
      <div className="insp-tabs" role="tablist" aria-label="Inspector 页签">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`insp-tab${ui.inspTab === t.key ? ' active' : ''}`}
            role="tab"
            type="button"
            aria-selected={ui.inspTab === t.key}
            onClick={() => ui.setInspTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {ui.inspTab === 'context' && <ContextPane />}
      {ui.inspTab === 'evidence' && <EvidencePane />}
      {ui.inspTab === 'metrics' && <MetricsPane />}
      {ui.inspTab === 'versions' && <VersionsPane />}
    </aside>
  );
}

function ContextPane() {
  const p = useProject();
  if (!p.detail) return <p className="fine">加载中…</p>;
  const { project, sources, conflicts, exports } = p.detail;
  const unresolved = conflicts.filter((c) => c.resolution === 'unresolved');
  const spec = p.detail.spec;
  return (
    <div>
      <div className="insp-item">
        <div className="t">{project.title}</div>
        <div className="d">{project.purpose ?? '（未填用途）'}</div>
      </div>
      <div className="insp-item">
        <div className="t">交付物</div>
        <div className="d">{DELIVERABLE_LABEL[p.detail.deliverable_type] ?? p.detail.deliverable_type}</div>
      </div>
      <div className="insp-item">
        <div className="t">隐私策略</div>
        <div className="d">{project.privacy_policy === 'local_only' ? '仅本地（外部模型被阻断）' : '允许外部模型（经授权）'}</div>
      </div>
      <div className="insp-item">
        <div className="t">概况</div>
        <div className="d">
          材料 {sources.length} 份 · 主张 {spec?.claims.length ?? 0} 条 · 指标 {spec?.metrics.length ?? 0} 个 ·
          未解决冲突 {unresolved.length} 项 · 导出 {exports.length} 次
        </div>
      </div>
      {unresolved.length > 0 && (
        <div className="insp-item">
          <div className="t">待处理冲突</div>
          <div className="d">在「材料」阶段逐项确认口径后才能正式导出。</div>
        </div>
      )}
    </div>
  );
}

function EvidencePane() {
  const p = useProject();
  const [selected, setSelected] = useState<Claim | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRef | null>(null);
  if (!p.detail) return <p className="fine">加载中…</p>;
  const spec = p.detail.spec;
  if (!spec) return <p className="fine">尚未组装报告——先在「大纲」阶段确认并组装。</p>;

  // evidence_refs 为 id 列表;原文摘录存于材料派生资产(Inspector 展示引用与状态)

  return (
    <div>
      {spec.claims.length === 0 && <p className="fine">spec 中无主张（材料可能未解析出标记章节）。</p>}
      {spec.claims.map((c) => (
        <button
          key={c.claim_id}
          className="insp-item"
          type="button"
          style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }}
          onClick={() => setSelected(selected?.claim_id === c.claim_id ? null : c)}
        >
          <div className="t" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Chip kind={VERIF_CHIP[c.verification_state]}>{KIND_LABEL[c.kind] ?? c.kind}</Chip>
          </div>
          <div className="d">{c.text}</div>
          <div className="d" style={{ color: 'var(--text-3)' }}>{VERIF_LABEL[c.verification_state] ?? c.verification_state}</div>
          {selected?.claim_id === c.claim_id && (c.evidence_refs?.length ? (
            <div className="q">证据引用:{c.evidence_refs.join(', ')}（原文摘录见材料源文件）</div>
          ) : (
            <div className="q">无证据绑定——质量检查将提示补充。</div>
          ))}
        </button>
      ))}
      {evidence && <div className="insp-item"><div className="q">{evidence.excerpt}</div></div>}
    </div>
  );
}

function MetricsPane() {
  const p = useProject();
  if (!p.detail?.spec) return <p className="fine">尚未组装报告。</p>;
  const spec = p.detail.spec;
  if (spec.metrics.length === 0) return <p className="fine">无派生指标（材料需含汇总表格）。</p>;
  return (
    <div>
      {spec.metrics.map((m) => (
        <div key={m.metric_id} className="insp-item">
          <div className="t mono" style={{ fontSize: 11 }}>{m.metric_id}</div>
          <div className="d">
            值 {m.value}{m.unit === 'ratio' ? '（比率）' : `（${m.unit}）`}
            {m.formula ? ` · 公式 ${m.formula}` : ''}
          </div>
          {m.scope && <div className="q">{m.scope}</div>}
        </div>
      ))}
    </div>
  );
}

interface DiffState { diff: SpecDiff | null; recheck?: { blockers: number; warnings: number } }

function VersionsPane() {
  const p = useProject();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [state, setState] = useState<DiffState | null>(null);
  if (!p.detail) return <p className="fine">加载中…</p>;
  const { revisions, exports } = p.detail;

  const compare = async () => {
    if (!a || !b) return;
    try {
      const r = await api<{ diff: SpecDiff; recheck?: { blockers: number; warnings: number } }>(
        `/api/projects/${p.id}/diff?a=${a}&b=${b}`,
      );
      setState({ diff: r.diff, recheck: r.recheck });
    } catch {
      setState({ diff: null });
    }
  };

  return (
    <div>
      <div className="insp-item">
        <div className="t">版本比较</div>
        <div className="d" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select value={a} onChange={(e) => setA(e.target.value)} aria-label="旧版本">
            <option value="">旧版本…</option>
            {revisions.map((r) => <option key={r.revision_id} value={r.revision_id}>{r.revision_id}</option>)}
          </select>
          <select value={b} onChange={(e) => setB(e.target.value)} aria-label="新版本">
            <option value="">新版本…</option>
            {revisions.map((r) => <option key={r.revision_id} value={r.revision_id}>{r.revision_id}</option>)}
          </select>
          <button className="btn btn-sm" type="button" disabled={!a || !b || a === b} onClick={compare}>比较</button>
        </div>
        {state?.diff && (
          <div className="d">
            {state.diff.pages_added.length > 0 && <div>新增页:{state.diff.pages_added.join('、')}</div>}
            {state.diff.pages_removed.length > 0 && <div>删除页:{state.diff.pages_removed.join('、')}</div>}
            {state.diff.pages_reordered.length > 0 && <div>顺序变化:{state.diff.pages_reordered.join('、')}</div>}
            {state.diff.pages_changed.map((pc) => (
              <div key={pc.page_id} style={{ marginTop: 6 }}>
                <b>{pc.page_id}</b>
                {pc.changes.map((ch, i) => (
                  <div className="diff-field" key={i}>
                    {ch.field}{ch.locator ? `（${ch.locator}）` : ''}:<span className="old">{ch.before ?? '（空）'}</span> → <span className="new">{ch.after ?? '（空）'}</span>
                  </div>
                ))}
              </div>
            ))}
            {state.diff.metrics_changed.length > 0 && (
              <div style={{ marginTop: 6 }}>指标变化:{state.diff.metrics_changed.map((m) => `${m.metric_id}.${m.field}`).join('；')}</div>
            )}
            {state.recheck && (
              <div style={{ marginTop: 6, color: state.recheck.blockers > 0 ? 'var(--fail)' : 'var(--warn)' }}>
                数字/绑定变化已重检:{state.recheck.blockers} 阻断 / {state.recheck.warnings} 警告
              </div>
            )}
            {state.diff.pages_changed.length === 0 && state.diff.pages_added.length === 0 && state.diff.pages_removed.length === 0 && state.diff.metrics_changed.length === 0 && (
              <div style={{ marginTop: 6, color: 'var(--ok)' }}>两个版本内容一致</div>
            )}
          </div>
        )}
      </div>
      <div className="insp-item">
        <div className="t">修订（{revisions.length}）</div>
        {revisions.length === 0 ? (
          <div className="d">尚无修订——组装或导出时产生。</div>
        ) : (
          revisions.slice().reverse().map((r) => (
            <div className="d" key={r.revision_id}>{r.revision_id} · {r.note ?? '无备注'}</div>
          ))
        )}
      </div>
      <div className="insp-item">
        <div className="t">导出记录（{exports.length}）</div>
        {exports.length === 0 ? (
          <div className="d">尚未导出。</div>
        ) : (
          exports.slice().reverse().map((e) => (
            <div className="d" key={e.export_id}>{e.export_id} · {e.format.toUpperCase()} · {e.is_draft ? '草稿' : '定稿'}</div>
          ))
        )}
      </div>
    </div>
  );
}
