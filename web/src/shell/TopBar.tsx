/* 顶部品牌栏(64px,契约 UI-00):品牌区(冻结 logo 裁切 + JuanerAI/精确 slogan + 产品名)
   / 中段留空 / 右端操作区(边界徽 + 本机 avatar)。品牌图 SHA-256 以来源契约冻结值为准。 */
import logoUrl from '../assets/juanerai-logo-slogan.png';

export function TopBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <img src={logoUrl} alt="" />
        </span>
        <span className="brand-copy">
          <strong>JuanerAI</strong>
          <small>持续做出更好的决策</small>
        </span>
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-product">Report Studio</span>
      </div>
      <div aria-hidden="true" />
      <div className="topbar-actions">
        <span className="pill pill-offline" title="仅在本机运行(127.0.0.1),材料默认不出本机">
          ● 本机运行 · 本地优先
        </span>
        <span className="avatar" title="本地用户(无账号系统)" aria-label="本地用户">本</span>
      </div>
    </header>
  );
}
