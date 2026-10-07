/* 上传资料（六步视图,S3 切片交付） */
export function UploadView() {
  return (
    <div className="view">
      <div className="pagehead">
        <div className="crumbs"><span className="eyebrow">STEP</span></div>
      </div>
      <h2>上传资料</h2>
      <p className="sub">md、Word、PDF、图片、表格等格式不限;系统读取并理解后用于生成与改写。</p>
      <div className="empty" style={{ marginTop: 18 }}>此步骤在 S3 切片交付 时启用。</div>
    </div>
  );
}
