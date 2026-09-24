/* 全局设置:服务形态 / AI 模型 / 数据同步 / 隐私边界说明。 */
import { useEffect, useState } from 'react';
import { api } from '../state/api';
import Chip from '../components/Chip';

interface AiStatus {
  chain: string[];
  providers: { provider: string; modelId: string; key: boolean }[];
  modelAvailable: boolean;
}

export function SettingsView() {
  const [ai, setAi] = useState<AiStatus | null>(null);
  useEffect(() => {
    void api<AiStatus>('/api/ai/status').then(setAi).catch(() => setAi(null));
  }, []);

  return (
    <div className="main" id="main" tabIndex={-1}>
      <div className="home-wrap">
        <h1 className="home-title">设置</h1>
        <p className="home-sub">Report Studio 以本地优先方式运行——以下是全局事实,项目级隐私与品牌在各项目内设置。</p>

        <div className="card">
          <div className="card-h">本机服务</div>
          <dl className="kv">
            <div><dt>地址</dt><dd className="mono">http://127.0.0.1:8787</dd></div>
            <div><dt>数据目录</dt><dd>仓库内 data/(项目/材料/修订/导出/编审状态,双机经 git 同步)</dd></div>
            <div><dt>编排模式</dt><dd>确定性(模型层可替换;local_only 下外部出站被阻断)</dd></div>
            <div><dt>同步</dt><dd>启动拉取 / 退出回推;冲突保本机(data-sync)</dd></div>
          </dl>
        </div>

        <div className="card">
          <div className="card-h">AI 模型（M5）<span className="card-h-note">仅"理解与表达"用点;一切计算/校验/门禁为确定性代码</span></div>
          {ai ? (
            <dl className="kv">
              <div><dt>模型链</dt><dd>{ai.chain.join(' → ') || '未配置（REPORT_STUDIO_MODEL_CHAIN）'}</dd></div>
              <div>
                <dt>密钥状态</dt>
                <dd>
                  {ai.providers.length === 0
                    ? '未配置模型链——AI 功能入口关闭,全部功能可用手动/规则模式'
                    : ai.providers.map((p) => (
                      <span key={p.provider} style={{ marginRight: 10 }}>
                        <Chip kind={p.key ? 'chip-ok' : 'chip-warn'}>{p.provider} 密钥{p.key ? '已配置' : '缺失'}</Chip>
                      </span>
                    ))}
                </dd>
              </div>
              <div><dt>可用性</dt><dd>{ai.modelAvailable ? '已就绪(至少一把密钥)' : '不可用——AI 入口关闭;确定性功能不受影响'}</dd></div>
              <div><dt>出站模式</dt><dd>仅结构模式(不含发现原文/数值)与授权摘要(需会话批准;sensitive 来源默认排除),由项目隐私策略决定;每次调用记零内容审计</dd></div>
              <div><dt>探针</dt><dd className="mono">scripts/with-model-env.sh npm run probe:model -- --provider minimax-cn --model MiniMax-M2.7</dd></div>
            </dl>
          ) : (
            <p className="fine">加载中…</p>
          )}
        </div>

        <div className="card">
          <div className="card-h">隐私边界</div>
          <p className="fine" style={{ margin: 0 }}>
            材料原件与项目数据默认只在本机;对外导出前逐项隐私检查(图表底层数据 / 元数据 / 敏感来源),
            未覆盖项明示。PPTX/PDF 产物元数据中性化;PDF Producer 为引擎固有字段(检查器标未覆盖)。
            AI 调用内容走白名单构造并需会话批准;出站日志零内容可审计。
          </p>
        </div>

        <div className="card">
          <div className="card-h">可信边界</div>
          <p className="fine" style={{ margin: 0 }}>
            来源绑定 ≠ 事实已证实;推断不会被升级为结论;冲突不静默择一;
            阻断项未清零不能出正式定稿;导出冻结快照,数据更新不改写旧导出;
            模型建议/起草均为草案,采纳与应用始终由人确认。
          </p>
        </div>
      </div>
    </div>
  );
}
