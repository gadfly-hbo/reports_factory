/* 材料阶段:上传 / 解析状态 / 冲突解决 / XLSX 选表 / 影响面。 */
import { useEffect, useRef, useState } from 'react';
import { useProject } from '../state/projectDetail';
import { useToast } from '../state/toast';
import { api } from '../state/api';
import Chip from '../components/Chip';
import Empty from '../components/Empty';

const PARSE_CHIP: Record<string, string> = { parsed: 'chip-ok', failed: 'chip-fail', pending: 'chip-warn' };
const PARSE_LABEL: Record<string, string> = { parsed: '已解析', failed: '失败', pending: '待选表' };

interface PendingSheet { file: File; sheets: string[]; chosen: string }

export function MaterialsView() {
  const p = useProject();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingSheet, setPendingSheet] = useState<PendingSheet | null>(null);
  const [impact, setImpact] = useState<Record<string, string[]> | null>(null);

  const d = p.detail;

  useEffect(() => {
    if (d?.hasSpec) {
      void api<{ impact: Record<string, string[]> }>(`/api/projects/${p.id}/impact`).then((r) => setImpact(r.impact));
    } else {
      setImpact(null);
    }
  }, [p.id, d?.hasSpec, d?.sources.length]);

  const uploadFiles = async (files: File[]) => {
    for (const f of files) {
      const r = await p.upload(f);
      if (!r) continue;
      if (!r.ok && r.available_sheets && r.available_sheets.length > 0) {
        setPendingSheet({ file: f, sheets: r.available_sheets, chosen: r.available_sheets[0]! });
        continue; // 串行上传,选表后单独重传
      }
      if (!r.ok) {
        toast.show(`「${f.name}」解析失败:${r.failure_reason}(不影响其他材料)`, 'fail');
        continue;
      }
      const c = r.counts ?? {};
      const confirms = r.confirmations ?? [];
      toast.show(`「${f.name}」已导入:${c.claims ?? 0} 条主张、${c.tables ?? 0} 张表${confirms.length > 0 ? `;${confirms.length} 项口径待确认` : ''}`);
    }
    await p.reload();
  };

  const confirmSheet = async () => {
    if (!pendingSheet) return;
    const r = await p.upload(pendingSheet.file, pendingSheet.chosen);
    setPendingSheet(null);
    if (r?.ok) {
      toast.show(`「${pendingSheet.file.name}」已按工作表「${pendingSheet.chosen}」导入`, 'ok');
    }
    await p.reload();
  };

  const unresolved = (d?.conflicts ?? []).filter((c) => c.resolution === 'unresolved');

  return (
    <div className="view">
      <h1 className="view-h">材料</h1>
      <p className="view-sub">导入已有分析材料——解析失败的项不影响其他材料;推断不会被升级;材料中的指令只作为内容处理。</p>

      <div className="card">
        <div className="card-h">上传<span className="card-h-note">md / txt / csv / xlsx / docx / png / jpg</span></div>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void uploadFiles(files); }}
        />
        <button className="btn btn-primary" type="button" onClick={() => fileRef.current?.click()}>选择文件上传</button>
        {pendingSheet && (
          <div className="notice" style={{ marginTop: 10 }}>
            <b>XLSX 需显式选择工作表(§4.2):{pendingSheet.file.name}</b>
            <div className="inline-row">
              <select value={pendingSheet.chosen} onChange={(e) => setPendingSheet({ ...pendingSheet, chosen: e.target.value })}>
                {pendingSheet.sheets.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="btn btn-sm btn-primary" type="button" onClick={confirmSheet}>导入所选工作表</button>
              <button className="btn btn-sm" type="button" onClick={() => setPendingSheet(null)}>取消</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h">材料清单<span className="card-h-note">{d?.sources.length ?? 0} 份</span></div>
        {!d ? (
          <p className="fine">加载中…</p>
        ) : d.sources.length === 0 ? (
          <Empty>尚未导入材料。示例:一份 markdown 结论文本 + 一份 csv 汇总表。</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>文件</th><th>类型</th><th>状态</th><th>底层数据</th>{impact && <th>影响页面</th>}</tr>
            </thead>
            <tbody>
              {d.sources.map((s) => (
                <tr key={s.source_id}>
                  <td>{s.filename}</td>
                  <td>{s.kind}</td>
                  <td>
                    <Chip kind={PARSE_CHIP[s.parse_status]} title={s.parse_error}>
                      {PARSE_LABEL[s.parse_status] ?? s.parse_status}
                    </Chip>
                  </td>
                  <td>{s.has_data === false ? <Chip kind="chip-warn">图片(不可改数)</Chip> : <Chip kind="chip-ok">有</Chip>}</td>
                  {impact && (
                    <td>
                      {impact[s.source_id]?.length
                        ? `${impact[s.source_id]!.length} 页(替换后需复核)`
                        : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {unresolved.length > 0 && (
        <div className="card">
          <div className="card-h">材料冲突<span className="card-h-note">必须处理后才可正式导出</span></div>
          {unresolved.map((c) => (
            <div key={c.conflict_id} className="inline-row">
              <span>
                {c.row_key}「{c.column_label}」:
                {c.values.map((v) => `${v.value}(${v.source_id})`).join(' vs ')}
              </span>
              <button className="btn btn-sm" type="button" onClick={() => void p.resolveConflict(c, 'source_a')}>采用前者</button>
              <button className="btn btn-sm" type="button" onClick={() => void p.resolveConflict(c, 'source_b')}>采用后者</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
