/**
 * 预算三线封顶（PRD D6 / 红队 KA-3 / AGENT-RUNTIME P4）：
 * 调用次数 + 墙钟 + 单阶段轮次，三线各自独立生效；成本仅次级展示不作封顶依据
 * （小米 token-plan usage.cost 恒为 0，成本线对它无效——§10 已知坑）。
 */

export interface BudgetConfig {
  /** 会话/项目累计模型调用次数上限 */
  maxCalls: number;
  /** 墙钟时长上限（毫秒，自首条审计记录起算） */
  maxWallMs: number;
  /** 单阶段轮次上限（同 stage 调用次数封顶，阶段间互不牵连） */
  maxTurns: number;
}

export interface BudgetEntry {
  at: string;
  stage: string;
  cost: number;
  blocked?: boolean;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  maxCalls: 50,
  maxWallMs: 30 * 60_000,
  maxTurns: 20,
};

export interface BudgetVerdict {
  allowed: boolean;
  line?: 'calls' | 'wall' | 'turns';
  reason?: string;
}

/** 预算判定：在出站门（gateOrThrow）内与批准检查并列，先于任何模型调用 */
export function checkBudget(
  log: BudgetEntry[],
  budget: BudgetConfig,
  stage: string,
  now: number,
): BudgetVerdict {
  // 成本不参与阻断（KA-3 硬约束）；blocked 条目是拦截尝试不是真实调用，不计入（计量不失真）
  const real = log.filter((e) => !e.blocked);
  const calls = real.length;
  if (calls >= budget.maxCalls) {
    return {
      allowed: false,
      line: 'calls',
      reason: `预算超帽：调用次数已达上限 ${calls}/${budget.maxCalls}——请提升预算或结束会话`,
    };
  }
  const first = real[0];
  if (first) {
    const wallMs = now - Date.parse(first.at);
    if (wallMs > budget.maxWallMs) {
      return {
        allowed: false,
        line: 'wall',
        reason: `预算超帽：墙钟时长已达上限 ${Math.round(wallMs / 1000)}s/${Math.round(budget.maxWallMs / 1000)}s——请提升预算或结束会话`,
      };
    }
  }
  const turns = real.filter((e) => e.stage === stage).length;
  if (turns >= budget.maxTurns) {
    return {
      allowed: false,
      line: 'turns',
      reason: `预算超帽：「${stage}」阶段轮次已达上限 ${turns}/${budget.maxTurns}——请提升预算或结束会话`,
    };
  }
  return { allowed: true };
}

/** 预算解析：env 覆盖 > 项目级配置 > 默认值（PRD D6） */
export function resolveBudget(
  project: { budget?: { max_calls?: number; max_wall_seconds?: number; max_turns?: number } },
  env: Record<string, string | undefined>,
): BudgetConfig {
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const b = project.budget ?? {};
  return {
    maxCalls: num(env['REPORT_STUDIO_BUDGET_CALLS'], num(b.max_calls, DEFAULT_BUDGET.maxCalls)),
    maxWallMs: num(env['REPORT_STUDIO_BUDGET_WALL_SECONDS'], num(b.max_wall_seconds, DEFAULT_BUDGET.maxWallMs / 1000)) * 1000,
    maxTurns: num(env['REPORT_STUDIO_BUDGET_TURNS'], num(b.max_turns, DEFAULT_BUDGET.maxTurns)),
  };
}
