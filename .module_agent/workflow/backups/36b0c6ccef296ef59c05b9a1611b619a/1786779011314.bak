import { defineTool } from '@deepseek-ai/dsh-tools'
import { directoryOfAgent, type SessionState } from '../lib/session_state.ts'
import { resolveWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { getBoundStarter } from '../lib/module_session_tracker.ts'
import { runShellCommand, writeTestSpec, writeTestReport } from '../lib/testing.ts'
import { jsonToolOutput } from '../lib/tool_output.ts'

const MAX_BUFFER_CHECK = 10 * 1024 * 1024

export interface ModuleAgentTestingToolOptions {
  /** 会话模式注册表（用于校验调用者身份）。 */
  readonly sessionState: SessionState
  /** 项目根目录兜底（agent 会话 cwd 缺失时使用，允许显式 undefined）。 */
  readonly dataDir?: string | undefined
}

/**
 * 代码测试工具：写入待测试功能说明（write_spec）、写入测试报告（write_report）、
 * 检测 Playwright（check_playwright）。离朱写入报告前校验启动者绑定（orchestration）。
 */
export function createModuleAgentTestingTool(options: ModuleAgentTestingToolOptions) {
  return defineTool({
    name: 'module_agent_testing',
    description: `代码测试工具。支持三种操作：
- write_spec：风后或力牧写入待测试功能说明，供测试智能体读取
- write_report：离朱写入测试报告（Markdown 格式）
- check_playwright：检测 Playwright 是否安装（支持 npm 和 Python）

注意：unit（单元测试）、compile（编译检查）、e2e（端到端测试）已废弃，请直接使用 bash 工具执行对应命令。`,
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['write_spec', 'write_report', 'check_playwright'],
        description: '测试类型',
      },
      content: {
        type: 'string',
        description: 'write_spec/write_report：Markdown 内容',
      },
    },
    output: jsonToolOutput(),
    async execute(args, exec) {
      const directory = directoryOfAgent(exec.agent, options.dataDir)
      const agentId = exec.agent?.id ?? ''
      const mode = options.sessionState.getAgentMode(agentId)
      const action = args.action

      if (action === 'write_spec') {
        if (mode !== 'fengzhou' && mode !== 'limu') {
          return { status: 'error', error: 'module_agent_testing action="write_spec" 仅供风后或力牧调用。' }
        }
      } else if (action === 'check_playwright') {
        if (mode !== 'fengzhou' && mode !== 'limu' && mode !== 'lizhu') {
          return { status: 'error', error: 'module_agent_testing action="check_playwright" 仅供风后、力牧或离朱调用。' }
        }
      } else {
        if (mode !== 'lizhu') {
          return { status: 'error', error: 'module_agent_testing action="write_report" 仅供离朱调用。' }
        }
      }

      let workspaceDir = ''
      try {
        const ws = await resolveWorkspace(directory, agentId)
        if (ws) workspaceDir = getWorkspaceDir(directory, ws)
      } catch {
        // 无工作空间也继续执行，跳过存储
      }

      // 离朱启动者绑定校验（orchestration：会话绑定跟踪）。未绑定启动者的离朱不得写入测试报告。
      if (action === 'write_report' && mode === 'lizhu') {
        if (workspaceDir) {
          const starter = await getBoundStarter(workspaceDir, agentId)
          if (!starter) {
            return { status: 'error', error: '离朱未绑定启动者，无法写入测试报告。' }
          }
        }
      }

      if (action === 'write_spec') {
        const content = args.content
        if (!content) {
          return { status: 'error', error: 'write_spec 需提供 content' }
        }
        if (!workspaceDir) {
          return { status: 'error', error: '未关联工作空间，无法存储测试说明。' }
        }
        await writeTestSpec(workspaceDir, agentId, content)
        return { action: 'write_spec', status: 'ok', path: `test_specs/${agentId}.json` }
      }

      if (action === 'write_report') {
        const content = args.content
        if (!content) {
          return { status: 'error', error: 'write_report 需提供 content' }
        }
        if (!workspaceDir) {
          return { status: 'error', error: '未关联工作空间，无法存储测试报告。' }
        }
        await writeTestReport(workspaceDir, agentId, content)
        return { action: 'write_report', status: 'ok', path: `test_reports/${agentId}.json` }
      }

      if (action === 'check_playwright') {
        const npmResult = await runShellCommand('npx playwright --version', directory, 30000, MAX_BUFFER_CHECK)
        if (npmResult.exit_code === 0) {
          return { installed: true, source: 'npm', version: npmResult.stdout.trim() }
        }

        const pyResult = await runShellCommand('python -c "import playwright; print(getattr(playwright, \'__version__\', \'\'))"', directory, 30000, MAX_BUFFER_CHECK)
        if (pyResult.exit_code === 0) {
          return { installed: true, source: 'python', version: pyResult.stdout.trim() || 'unknown' }
        }

        return { installed: false }
      }

      return { status: 'error', error: `未知 action: ${action}` }
    },
  })
}
