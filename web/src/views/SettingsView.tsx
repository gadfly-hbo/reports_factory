/* 全局设置:服务形态 / 数据同步 / 隐私边界说明。 */
export function SettingsView() {
  return (
    <div className="main" id="main" tabIndex={-1}>
      <div className="home-wrap">
        <h1 className="home-title">设置</h1>
        <p className="home-sub">Report Studio 以本地优先方式运行——以下是全局事实,项目级隐私与品牌在各项目内设置。</p>

        <div className="card">
          <div className="card-h">本机服务</div>
          <dl className="kv">
            <div><dt>地址</dt><dd className="mono">http://127.0.0.1:8787</dd></div>
            <div><dt>数据目录</dt><dd>仓库内 data/(项目/材料/修订/导出,双机经 git 同步)</dd></div>
            <div><dt>编排模式</dt><dd>确定性(模型层可替换;local_only 下外部出站被阻断)</dd></div>
            <div><dt>同步</dt><dd>启动拉取 / 退出回推;冲突保本机(data-sync)</dd></div>
          </dl>
        </div>

        <div className="card">
          <div className="card-h">隐私边界</div>
          <p className="fine" style={{ margin: 0 }}>
            材料原件与项目数据默认只在本机;对外导出前逐项隐私检查(图表底层数据 / 元数据 / 敏感来源),
            未覆盖项明示。PPTX/PDF 产物元数据中性化;PDF Producer 为引擎固有字段(检查器标未覆盖)。
          </p>
        </div>

        <div className="card">
          <div className="card-h">可信边界</div>
          <p className="fine" style={{ margin: 0 }}>
            来源绑定 ≠ 事实已证实;推断不会被升级为结论;冲突不静默择一;
            阻断项未清零不能出正式定稿;导出冻结快照,数据更新不改写旧导出。
          </p>
        </div>
      </div>
    </div>
  );
}
