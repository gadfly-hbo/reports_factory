/* 检查阶段:质量检查(阻断/警告)+ 对外范围隐私预检 + M5 模型辅助语义检查与补证建议。 */
import { useState } from 'react';
import { useProject } from '../state/projectDetail';
import { useToast } from '../state/toast';
import Chip from '../components/Chip';
import Empty from '../components/Empty';
import type { CheckIssueLite, CheckReport } from '../state/types';

export function CheckView() {
  const p = useProject();
  const toast = useToast();
  const [scope, setScope] = useState<'internal' | 'external'>('internal');
  const [report, setReport] = useState<CheckReport | null>(null);
  const [semantic, setSemantic] = useState<CheckIssueLite[] | null>(null);
  const [semanticProvider, setSemanticProvider] = useState('');
  const [gapNote, setGapNote] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const d = p.detail;

  if (!d) return <div className="view"><p className="fine">加载中…</p></div>;
  if (!d.hasSpec) {
    return (
      <div className="view">
        <Empty>尚未组装报告——先完成「编审」阶段。</Empty>
      </div>
    );
  }

  const run = async () => setReport(await p.runChecks(scope));

  /** 语义检查（授权摘要）：403 → 提示需批准（批准入口在任一 AI 首次调用的预览弹层） */
  const runSemantic = async () => {
    setAiBusy(true);
    try {
      const r = await p.runSemanticChecks();
      if (!r) return;
      if (r.needsApproval || !r.issues || !r.ai) {
        toastNeedsApproval();
        return;
      }
      setSemantic(r.issues);
      setSemanticProvider(r.ai.provider);
    } finally {
      setAiBusy(false);
    }
  };

  const draftGaps = async () => {
    setAiBusy(true);
    try {
      const r = await p.draftEvidenceGaps();
      if (!r) return;
      if (r.needsApproval) {
        toastNeedsApproval();
        return;
      }
      setGapNote(`已创建 ${r.created?.length ?? 0} 条补证请求草稿——可经补证请求导出走上游分析`);
    } finally {
      setAiBusy(false);
    }
  };

  const toastNeedsApproval = () => {
    toast.show('需要先批准本会话出站（授权摘要）——在任一 AI 入口首次调用时的预览弹层完成批准', 'fail');
  };

  return (
    <div className="view">
      <h1 className="view-h">质量检查</h1>
      <p className="view-sub">
        数字一致性 / 单位口径 / 来源引用 / 不确定性保留 / 排版密度;阻断项未清零不得出正式定稿(草稿可导出但带标识)。
      </p>

      <div className="card">
        <div className="card-h">运行检查</div>
        <div className="fld-row" style={{ alignItems: 'flex-end' }}>
          <div className="fld" style={{ maxWidth: 180 }}>
            <label className="fld-label" htmlFor="chk-scope">导出范围</label>
            <select id="chk-scope" value={scope} onChange={(e) => setScope(e.target.value as 'internal' | 'external')}>
              <option value="internal">内部(本机留存)</option>
              <option value="external">对外(先过隐私检查)</option>
            </select>
          </div>
          <div className="actions" style={{ margin: 0 }}>
            <button className="btn btn-primary" type="button" onClick={run}>运行检查</button>
          </div>
        </div>

        {report && (
          <div style={{ marginTop: 12 }}>
            <p>
              <Chip kind={report.blockers > 0 ? 'chip-fail' : 'chip-ok'}>{report.blockers} 阻断</Chip>{' '}
              <Chip kind="chip-warn">{report.warnings} 警告</Chip>
            </p>
            {report.issues.length === 0 && <p className="fine" style={{ color: 'var(--ok)' }}>检查通过。</p>}
            {report.issues.map((i, n) => (
              <div className="issue" key={n}>
                <Chip kind={i.severity === 'blocker' ? 'chip-fail' : 'chip-warn'}>
                  {i.severity === 'blocker' ? '阻断' : '警告'}
                </Chip>
                <span className="msg">{i.message}</span>
                <span className="ref">{i.object_ref}</span>
              </div>
            ))}
            {scope === 'external' && (
              <p className="fine">对外导出的完整隐私检查(图表底层数据 / 元数据 / 敏感来源)在「导出」阶段执行并逐项展示。</p>
            )}
          </div>
        )}
      </div>

      {d.capabilities?.ai.enabled && (
        <div className="card">
          <div className="card-h">模型辅助检查<span className="card-h-note">warning-only,永不阻断导出;与确定性检查分列</span></div>
          <div className="actions">
            <button className="btn" type="button" data-testid="semantic-check" disabled={aiBusy || !d.capabilities.ai.modelAvailable} onClick={runSemantic}>
              {aiBusy ? 'AI 评审中…' : '运行模型辅助检查'}
            </button>
            <button className="btn" type="button" disabled={aiBusy || !d.capabilities.ai.modelAvailable} onClick={draftGaps}>生成补证建议草稿</button>
            {!d.capabilities.ai.modelAvailable && <span className="fine">模型未配置或缺少密钥——按钮不可用,确定性检查不受影响。</span>}
            {semanticProvider && <span className="fine">来源:{semanticProvider}(模型辅助结果不改变阻断计数)</span>}
          </div>
          {semantic && (
            <div style={{ marginTop: 10 }}>
              {semantic.length === 0 && <p className="fine" style={{ color: 'var(--ok)' }}>模型辅助检查未发现语义层问题。</p>}
              {semantic.map((i, n) => (
                <div className="issue" key={n}>
                  <Chip kind="chip-warn">模型辅助</Chip>
                  <span className="msg">{i.message}</span>
                  <span className="ref">{i.object_ref}</span>
                </div>
              ))}
            </div>
          )}
          {gapNote && <p className="fine" style={{ marginTop: 6 }}>{gapNote}</p>}
        </div>
      )}
    </div>
  );
}
