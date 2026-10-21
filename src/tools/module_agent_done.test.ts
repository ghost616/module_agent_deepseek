import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createModuleAgentDoneTool } from './module_agent_done.ts'
import { getLatestCode, verificationCode } from './verification_code.ts'
import { createSessionState } from '../lib/session_state.ts'
import { bindFengzhou, createWorkspace, getWorkspaceDir } from '../lib/workspace.ts'
import { addLizhuSession, addModuleSession, bindLimuStarter, bindLizhuFengzhou } from '../lib/module_session_tracker.ts'
import { setSessionWorkspace } from '../lib/session_workspace.ts'
import { writeTestReport, writeTestSpec } from '../lib/testing.ts'

const FENGZHOU = 'ses_fengzhou'
const LIMU = 'ses_limu'
const LIZHU = 'ses_lizhu'

function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-done-'))
  createWorkspace(directory, 'ws')
  bindFengzhou(directory, FENGZHOU, 'ws')
  const wsDir = getWorkspaceDir(directory, 'ws')

  addModuleSession(wsDir, 'test_module', LIMU)
  bindLimuStarter(wsDir, FENGZHOU, LIMU)
  setSessionWorkspace(directory, LIMU, 'ws')

  addLizhuSession(wsDir, LIZHU)
  bindLizhuFengzhou(wsDir, LIZHU, FENGZHOU)
  setSessionWorkspace(directory, LIZHU, 'ws')

  writeTestSpec(wsDir, LIMU, 'spec')
  writeTestReport(wsDir, LIZHU, 'report')

  const sessionState = createSessionState()
  sessionState.setAgentMode(FENGZHOU, 'fengzhou')
  sessionState.setAgentMode(LIMU, 'limu')
  sessionState.setAgentMode(LIZHU, 'lizhu')

  const tool = createModuleAgentDoneTool({
    ctx: {
      sessions: { get: () => undefined },
      get: () => undefined,
    } as never,
    sessionState,
    dataDir: directory,
    subagentProvider: 'module-agent:limu',
  })
  const exec = {
    agent: { id: FENGZHOU, session: { header: { cwd: directory } } },
  } as never

  return { directory, wsDir, tool, exec }
}

async function confirmationCode(exec: never): Promise<string> {
  await verificationCode.execute({ length: 10, type: 'numeric' }, exec)
  return getLatestCode(FENGZHOU) ?? ''
}

describe('module_agent_done 关闭会话时清理测试产物', () => {
  it('close_all 删除力牧 test_specs 与离朱 test_reports 文件', async () => {
    const { wsDir, tool, exec } = setup()
    const specPath = join(wsDir, 'test_specs', `${LIMU}.json`)
    const reportPath = join(wsDir, 'test_reports', `${LIZHU}.json`)
    expect(existsSync(specPath)).toBe(true)
    expect(existsSync(reportPath)).toBe(true)

    const result = await tool.execute({ action: 'close_all', confirmation_code: await confirmationCode(exec) }, exec)

    expect(result).toMatchObject({ status: 'ok' })
    expect(existsSync(specPath)).toBe(false)
    expect(existsSync(reportPath)).toBe(false)
  })

  it('close 单个力牧/离朱时同样删除对应测试产物', async () => {
    const { wsDir, tool, exec } = setup()
    const specPath = join(wsDir, 'test_specs', `${LIMU}.json`)
    const reportPath = join(wsDir, 'test_reports', `${LIZHU}.json`)

    await tool.execute({ action: 'close', module_name: 'test_module', session_id: LIMU, confirmation_code: await confirmationCode(exec) }, exec)
    expect(existsSync(specPath)).toBe(false)

    await tool.execute({ action: 'close', session_id: LIZHU, confirmation_code: await confirmationCode(exec) }, exec)
    expect(existsSync(reportPath)).toBe(false)
  })
})
