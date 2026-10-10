import type { Authorization } from 'pi-agent-runtime';

/**
 * 授权策略（AGENT-RUNTIME §INTEGRATION 输入 2，P3 任务级授权）：
 * 本地单用户产品——项目会话内的模型调用与受限环境内文件/进程工具预授权自动放行；
 * external 效果工具默认拒绝（当前无外部网络工具）；发布（结果交付本地用户）放行。
 * 授权判断发生在每次效果执行前（由 SDK 调用），越界即拒；不实现 allow-all 常量。
 */

export const LOCAL_POLICY_VERSION = 'report-studio-local-v1';

export function localAuthorize(): (action: Authorization, signal: AbortSignal) => Promise<boolean> {
  return async (action: Authorization): Promise<boolean> => {
    switch (action.kind) {
      case 'model':
        return true; // 会话内模型调用已随任务创建授权（用户发起对话即授权）
      case 'tool':
        // read/write 由 ExecutionEnvironment 目录边界隔离；
        // bash 被原生工厂标为 external 效果，但实际运行在受限单进程 sandbox（禁网络/fork、
        // 根=项目数据目录），按项目内进程工具放行；其余 external（真实出网）一律拒绝
        if (action.effect === 'external') return action.name === 'bash';
        return action.effect === 'read' || action.effect === 'write';
      case 'publish':
        return true; // 结果交付本地用户；真实外发（邮件/上传）引入时收紧
      case 'control':
        return true; // steer/followUp/abort 来自本地 UI 用户操作
      default:
        return false;
    }
  };
}
