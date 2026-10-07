/* 顶部品牌栏(64px):品牌区(冻结 logo 裁切 + JuanerAI/精确 slogan + 产品名)/中段留空。
   对齐 JuanerAI desktop 形态：无本地边界徽、无 avatar。 */
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
      <div className="topbar-actions" />
    </header>
  );
}
