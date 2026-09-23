/* 项目首页:项目列表 + 新建。 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProjects } from '../state/projects';
import { PROJECT_STAGE_LABEL } from '../state/types';
import Empty from '../components/Empty';

export function ProjectsView() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { projects, loaded, create, remove } = useProjects();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [open, setOpen] = useState(params.get('new') === '1');

  useEffect(() => { if (params.get('new') === '1') setOpen(true); }, [params]);

  const submit = async () => {
    if (!title.trim()) return;
    const id = await create({ title: title.trim(), purpose: purpose.trim() || undefined });
    if (id) navigate(`/project/${id}/materials`);
  };

  return (
    <div className="main" id="main" tabIndex={-1}>
      <div className="home-wrap">
        <h1 className="home-title">Report Studio</h1>
        <p className="home-sub">把已有分析材料变成可信、可编辑、可追溯的会议汇报 / 研究报告 / 一页摘要。材料与报告默认只保存在本机。</p>

        <div className="card">
          <div className="card-h">新建汇报<button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}</button></div>
          {open && (
            <>
              <div className="fld">
                <label className="fld-label" htmlFor="np-title">项目名称</label>
                <input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如:Q3 经营复盘" />
              </div>
              <div className="fld">
                <label className="fld-label" htmlFor="np-purpose">用途（可选）</label>
                <input id="np-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="如:经营例会汇报" />
              </div>
              <div className="actions">
                <button className="btn btn-primary" type="button" disabled={!title.trim()} onClick={submit}>创建</button>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-h">最近项目<span className="card-h-note">{projects.length} 个</span></div>
          {!loaded ? (
            <p className="fine">加载中…</p>
          ) : projects.length === 0 ? (
            <Empty>还没有项目——展开上方「新建汇报」开始第一次制作。</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>名称</th><th>阶段</th><th>更新时间</th><th>隐私</th><th></th></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.project_id}>
                    <td>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate(`/project/${p.project_id}/materials`)}>
                        {p.title}
                      </button>
                    </td>
                    <td>{PROJECT_STAGE_LABEL[p.stage] ?? p.stage}</td>
                    <td className="num">{new Date(p.updated_at).toLocaleString('zh-CN')}</td>
                    <td>{p.privacy_policy === 'local_only' ? '仅本地' : '允许外部'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        type="button"
                        onClick={() => { if (window.confirm(`删除项目「${p.title}」及其全部材料与导出？`)) void remove(p); }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
