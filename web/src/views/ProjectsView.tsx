/* 项目首页:项目列表 + 新建。 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProjects } from '../state/projects';
import { type TemplateInfo } from '../state/types';
import { api } from '../state/api';

const PAGE_TYPE_LABEL: Record<string, string> = {
  cover: '封面',
  summary: '结论摘要',
  metrics_overview: '指标总览',
  trend: '趋势',
  issue_breakdown: '原因/限制',
  option_comparison: '方案比较',
  action_items: '行动建议',
  evidence_appendix: '证据附录',
};
import Empty from '../components/Empty';

export function ProjectsView() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { projects, loaded, create, remove } = useProjects();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [open, setOpen] = useState(params.get('new') === '1');
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [tpl, setTpl] = useState('');

  useEffect(() => { if (params.get('new') === '1') setOpen(true); }, [params]);

  useEffect(() => {
    api<{ templates: TemplateInfo[] }>('/api/templates')
      .then((r) => {
        setTemplates(r.templates);
        if (r.templates.length > 0) setTpl(r.templates[0]!.id);
      })
      .catch(() => void 0);
  }, []);

  const submit = async () => {
    if (!title.trim()) return;
    const id = await create({ title: title.trim(), purpose: purpose.trim() || undefined, template_id: tpl || undefined, privacy_policy: 'local_only' });
    if (id) navigate(`/project/${id}/upload`);
  };

  return (
    <div className="main" id="main" tabIndex={-1}>
      <div className="home-wrap">
        <h1 className="home-title">Report Studio</h1>
        <p className="home-sub">上传资料 → 确认 PPT 框架 → 生成 → 逐页编辑 → 审核发布;数据默认只保存在本机。</p>

        <div className="card">
          <div className="card-h">新建项目<button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(!open)}>{open ? '收起' : '展开'}</button></div>
          {open && (
            <>
              <div className="fld">
                <label className="fld-label" htmlFor="np-title">项目名称</label>
                <input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="" />
              </div>
              <div className="fld">
                <label className="fld-label" htmlFor="np-purpose">项目简介（可选，用于生成 PPT 框架）</label>
                <input id="np-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="如:经营例会汇报" />
              </div>
              {templates.length > 0 && (
                <div className="fld">
                  <label className="fld-label" htmlFor="np-tpl">框架模板</label>
                  <select id="np-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {templates.filter((t) => t.id === tpl).map((t) => (
                    <div key={t.id} className="fine" style={{ marginTop: 6 }}>
                      <div>{t.description}</div>
                      <div style={{ marginTop: 4 }}>
                        结构：{t.page_plan.map((pt) => PAGE_TYPE_LABEL[pt] ?? pt).join(' → ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            <Empty>还没有项目——展开上方「新建项目」开始第一次制作。</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>名称</th><th>更新时间</th><th>隐私</th><th></th></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.project_id}>
                    <td>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate(`/project/${p.project_id}`)}>
                        {p.title}
                      </button>
                    </td>
                    <td className="num">{new Date(p.updated_at).toLocaleString('zh-CN')}</td>
                    <td>{p.privacy_policy === 'local_only' ? 'local_only' : 'external'}</td>
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
