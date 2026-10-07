/* 第 1 步 上传资料（ui-contract S3）：多选上传（格式不限，前端不拦截）/ 移除 / 冲突与失败明示。 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../state/projectDetail';
import { api } from '../state/api';
import type { SourceAsset } from '../state/types';

const KIND_LABEL: Record<string, string> = {
  markdown: 'md', text: 'txt', csv: 'csv', xlsx: 'xlsx', docx: 'docx', pdf: 'pdf', image: '图片', table: '表格', bundle: 'bundle',
};

function kindOf(filename: string): SourceAsset['kind'] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image';
  return 'text';
}

export function UploadView() {
  const { detail, refresh } = useProject();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const id = detail?.project.project_id;
  const sources = detail?.sources ?? [];

  const upload = async (files: FileList | null) => {
    if (!files || !id) return;
    for (const f of Array.from(files)) {
      setBusy(f.name);
      try {
        const buf = await f.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        await api(`/api/projects/${id}/sources`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: f.name, content_base64: base64, kind: kindOf(f.name), media_type: f.type || undefined }),
        });
      } catch {
        // 上传失败：列表刷新后以失败态呈现（本机服务不可达则整页提示）
      }
      setBusy(null);
    }
    await refresh();
  };

  const remove = async (sourceId: string) => {
    if (!id || !window.confirm('移除该资料？其理解摘要将一并删除。')) return;
    await api(`/api/projects/${id}/sources/${sourceId}`, { method: 'DELETE' });
    await refresh();
  };

  return (
    <div className="view">
      <h2>上传资料</h2>
      <p className="sub">md、Word、PDF、图片、表格等格式不限；系统读取并理解后用于生成与改写。</p>
      {sources.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>
          尚未上传资料<br />
          <button className="btn btn-primary" type="button" onClick={() => fileRef.current?.click()}>＋ 上传资料</button>
        </div>
      ) : (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-h">已上传资料<span className="card-h-note">{sources.length} 个文件</span></div>
          <table className="tbl">
            <thead><tr><th>文件</th><th>类型</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source_id}>
                  <td>{s.filename}</td>
                  <td><span className="chip">{KIND_LABEL[s.kind] ?? s.kind}</span></td>
                  <td>
                    {s.parse_status === 'parsed' ? <span className="chip chip-ok">已就绪</span>
                      : s.parse_status === 'failed' ? <span className="chip chip-fail" title={s.parse_error}>解析失败</span>
                      : '待理解'}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => void remove(s.source_id)}>移除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
             onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <button className="btn btn-ghost" type="button" onClick={() => fileRef.current?.click()}>＋ 继续上传</button>
        <button className="btn btn-primary" type="button" disabled={sources.length === 0 || busy !== null}
                onClick={() => navigate(`/project/${id}/understand`)}>
          {busy ? `上传中:${busy}` : '开始读取理解 →'}
        </button>
      </div>
    </div>
  );
}
