/* 确认框架（六步视图,S4 切片交付） */
export function FrameworkView() {
  return (
    <div className="view">
      <div className="pagehead">
        <div className="crumbs"><span className="eyebrow">STEP</span></div>
      </div>
      <h2>确认框架</h2>
      <p className="sub">AI 依据资料生成整套页面结构;确认后锁定并进入生成。</p>
      <div className="empty" style={{ marginTop: 18 }}>此步骤在 S4 切片交付 时启用。</div>
    </div>
  );
}
