/* 审核发布（六步视图,S7 切片交付） */
export function PublishView() {
  return (
    <div className="view">
      <div className="pagehead">
        <div className="crumbs"><span className="eyebrow">STEP</span></div>
      </div>
      <h2>审核发布</h2>
      <p className="sub">内用草稿随时可导出;对外发布需隐私检查通过并经你批准。</p>
      <div className="empty" style={{ marginTop: 18 }}>此步骤在 S7 切片交付 时启用。</div>
    </div>
  );
}
