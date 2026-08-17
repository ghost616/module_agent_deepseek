import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from './session_state.ts'
import { validateLimuBashCommand } from './limu_bash_guard.ts'
import { validateLizhuEnvCommand } from './lizhu_env_guard.ts'
import { checkLimuPlanActive } from './limu_plan_guard.ts'
import { isWorking } from './limu_monitor.ts'
import { resolveWorkspace, getWorkspaceDir } from './workspace.ts'
import { getBoundStarter, getBoundLizhu } from './module_session_tracker.ts'

export interface OrchestrationGuardOptions {
  /** 会话模式注册表（用于判断调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/** 读取工具参数中的字符串字段（参数已被 registry 深冻结）。 */
function stringArg(args: unknown, key: string): string | undefined {
  if (typeof args === 'object' && args !== null && key in args) {
    const value = (args as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

/**
 * 挂载 orchestration 模块的工具守卫（framework 的 registerGuards 之外追加）：
 * - tools.guard：力牧 bash 命令守卫（仅允许文件删除/重命名/移动）、离朱环境构建目录守卫。
 * - tools/pre-execute：力牧计划有效性检查与绑定离朱运行守卫、离朱启动者绑定校验（覆盖全部工具）。
 */
export function registerOrchestrationGuards(ctx: Context, options: OrchestrationGuardOptions): void {
  const { sessionState, dataDir } = options

  ctx.tools.guard((exec) => {
    const agent = exec.agent
    if (!agent) return undefined
    if (sessionState.getAgentMode(agent.id) !== 'limu') return undefined
    if (exec.name !== 'bash') return undefined
    const command = stringArg(exec.arguments, 'command') ?? ''
    try {
      validateLimuBashCommand(command)
      return undefined
    } catch (error) {
      return (error as Error).message
    }
  })

  ctx.tools.guard((exec) => {
    const agent = exec.agent
    if (!agent) return undefined
    if (sessionState.getAgentMode(agent.id) !== 'lizhu') return undefined
    if (exec.name !== 'bash') return undefined
    const directory = directoryOfAgent(agent, dataDir)
    const command = stringArg(exec.arguments, 'command') ?? ''
    const workdir = stringArg(exec.arguments, 'workdir') ?? stringArg(exec.arguments, 'working_dir')
    const envError = validateLizhuEnvCommand(directory, command, workdir)
    if (envError !== null) return envError
    return undefined
  })

  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const agent = exec.agent
    if (!agent) return next()
    const agentId = agent.id
    const mode = sessionState.getAgentMode(agentId)
    if (mode === undefined) return next()
    const directory = directoryOfAgent(agent, dataDir)

    if (mode === 'limu') {
      try {
        await checkLimuPlanActive(directory, agentId)
      } catch (error) {
        return { kind: 'deny', reason: (error as Error).message }
      }
      let wsName: string | null = null
      try {
        wsName = await resolveWorkspace(directory, agentId)
      } catch {
        // 工作空间解析失败视为无工作空间，跳过绑定离朱运行守卫
      }
      if (wsName !== null) {
        const boundLizhu = getBoundLizhu(getWorkspaceDir(directory, wsName), agentId)
        if (boundLizhu !== null && isWorking(boundLizhu)) {
          return { kind: 'deny', reason: '力牧绑定的离朱仍在运行，请等待离朱测试完成后再操作。' }
        }
      }
      return next()
    }

    if (mode === 'lizhu') {
      let wsName: string | null = null
      try {
        wsName = await resolveWorkspace(directory, agentId)
      } catch {
        // 无工作空间视为未绑定，走下方拒绝分支
      }
      if (wsName === null) {
        return { kind: 'deny', reason: '离朱未绑定启动者，无法执行操作。' }
      }
      const starter = getBoundStarter(getWorkspaceDir(directory, wsName), agentId)
      if (starter === null) {
        return { kind: 'deny', reason: '离朱未绑定启动者，无法执行操作。' }
      }
      return next()
    }

    return next()
  })
}
