import { z } from 'zod';

/**
 * S1 探针合成任务（纯 fixture 词汇，无真实业务数据）。
 * probe 脚本与 replay 测试共用同一份 system/user/schema，
 * 保证录制文件（tests/fixtures/recordings/）可被测试离线重放。
 */

export const PROBE_SYSTEM =
  '你是探针。只输出一个 JSON 对象：{"pick": string}，pick 必须是候选列表中的原文，不要输出其他文字。';
export const PROBE_USER = '目标：库存。候选列表：["门店销售额同比", "库存周转天数", "会员复购率"]';
export const ProbeSchema = z.object({ pick: z.string().min(1) });
export type ProbeOutput = z.infer<typeof ProbeSchema>;
