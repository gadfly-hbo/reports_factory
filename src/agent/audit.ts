import type { AuditEvent, AuditSink } from 'pi-agent-runtime';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 审计（AGENT-RUNTIME §INTEGRATION 输入 4）：SDK 只发安全元数据（任务/运行/模型/工具/原因/序列），
 * 不含 prompt、回复原文或凭据。append 即持久化确认——失败必须上抛（SDK 据此关闭新准入），
 * 不排队、不吞错。首版 JSONL 单文件追加；按 projectId 的投影视图在 server 层做。
 */

export class JsonlAuditSink implements AuditSink {
  constructor(private readonly filePath: string) {}

  async append(event: Readonly<AuditEvent>, _signal: AbortSignal): Promise<void> {
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, JSON.stringify(event) + '\n', 'utf-8');
    } catch (e) {
      // 审计失败关闭准入：转换为 SDK 可识别的失败语义由调用边界处理，这里原样上抛
      throw e;
    }
  }
}
