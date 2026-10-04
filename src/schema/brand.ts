import { z } from 'zod';

/**
 * 品牌配置（M3-G7）：token 级——色板/Logo/字体名。
 * 只影响视觉 token，不触碰内容（换品牌不触发内容重生成）。
 * Logo 为 dataUrl（进冻结快照；对外导出随产物走，受隐私链约束）。
 */
export const BrandConfigSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  muted: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logo_data_url: z.string().startsWith('data:image/').optional(),
  font_name: z.string().min(1).optional(),
});
export type BrandConfig = z.infer<typeof BrandConfigSchema>;

/** 新项目默认品牌:与工作台 UI accent 同源(系统蓝图 v4.2 铁锈橘) */
export const DEFAULT_BRAND: BrandConfig = { primary: '#b44626', accent: '#8f3820' };
