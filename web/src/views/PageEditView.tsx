/* 逐页编辑（六步视图,S6 切片交付） */
export function PageEditView() {
  return (
    <div className="view">
      <div className="pagehead">
        <div className="crumbs"><span className="eyebrow">STEP</span></div>
      </div>
      <h2>逐页编辑</h2>
      <p className="sub">手工直接改文字,或用一句自然语言让 agent 重写这一页。</p>
      <div className="empty" style={{ marginTop: 18 }}>此步骤在 S6 切片交付 时启用。</div>
    </div>
  );
}
