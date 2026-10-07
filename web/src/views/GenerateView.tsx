/* 生成（六步视图,S5 切片交付） */
export function GenerateView() {
  return (
    <div className="view">
      <div className="pagehead">
        <div className="crumbs"><span className="eyebrow">STEP</span></div>
      </div>
      <h2>生成</h2>
      <p className="sub">按已确认框架逐页生成,每页内容都有资料支撑;失败页可单独重试。</p>
      <div className="empty" style={{ marginTop: 18 }}>此步骤在 S5 切片交付 时启用。</div>
    </div>
  );
}
