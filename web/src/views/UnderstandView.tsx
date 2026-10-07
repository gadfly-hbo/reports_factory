/* 读取理解（六步视图,S3 切片交付） */
export function UnderstandView() {
  return (
    <div className="view">
      <div className="pagehead">
        <div className="crumbs"><span className="eyebrow">STEP</span></div>
      </div>
      <h2>读取理解</h2>
      <p className="sub">逐文件提取要点与数据,摘要持久化;已完成的文件重进不重跑。</p>
      <div className="empty" style={{ marginTop: 18 }}>此步骤在 S3 切片交付 时启用。</div>
    </div>
  );
}
