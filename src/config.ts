import z from '@deepseek-ai/schemastery'

export interface Config {
  /**
   * 项目根目录兜底。各 agent 会话通常携带 cwd（session header），
   * 此字段仅在 agent 会话无 cwd 时作为 .module_agent 数据目录的解析根。
   */
  dataDir?: string
  /**
   * 启动力牧/皋陶/离朱/夔子智能体使用的 subagent provider 名
   * （由 @deepseek-ai/dsh-subagent-spawn-in-process / -fork-in-process 等注册）。
   */
  subagentProvider?: string
}

export const Config: z<Config> = z.object({
  // schemastery 的 object 属性默认可选，无需 .optional()。
  dataDir: z.string(),
  subagentProvider: z.string().default('spawn'),
})
