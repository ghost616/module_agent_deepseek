import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteTestReport, deleteTestSpec, writeTestReport, writeTestSpec } from './testing.ts'

function createWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-testing-'))
}

describe('deleteTestSpec', () => {
  it('删除已存在的测试说明文件', () => {
    const workspaceDir = createWorkspace()
    writeTestSpec(workspaceDir, 'ses_test', 'spec')
    const path = join(workspaceDir, 'test_specs', 'ses_test.json')
    expect(existsSync(path)).toBe(true)

    deleteTestSpec(workspaceDir, 'ses_test')

    expect(existsSync(path)).toBe(false)
  })

  it('文件不存在时不抛错', () => {
    const workspaceDir = createWorkspace()
    expect(() => deleteTestSpec(workspaceDir, 'ses_missing')).not.toThrow()
  })
})

describe('deleteTestReport', () => {
  it('删除已存在的测试报告文件', () => {
    const workspaceDir = createWorkspace()
    writeTestReport(workspaceDir, 'ses_test', 'report')
    const path = join(workspaceDir, 'test_reports', 'ses_test.json')
    expect(existsSync(path)).toBe(true)

    deleteTestReport(workspaceDir, 'ses_test')

    expect(existsSync(path)).toBe(false)
  })

  it('文件不存在时不抛错', () => {
    const workspaceDir = createWorkspace()
    expect(() => deleteTestReport(workspaceDir, 'ses_missing')).not.toThrow()
  })
})
