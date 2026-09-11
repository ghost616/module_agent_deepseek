import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'

export interface SharedPlanEntry {
  id: string
  content: string
  created_by: string
  created_at: string
}

interface SharedPlansFile {
  plans: SharedPlanEntry[]
}

const FILE_NAME = 'shared_plans.json'

function getPath(workspaceDir: string): string {
  return join(workspaceDir, FILE_NAME)
}

/**
 * 读取工作空间的共享计划列表。
 * @param workspaceDir 工作空间目录。
 * @returns 计划条目数组；文件缺失或解析失败返回空数组。
 */
export function readSharedPlans(workspaceDir: string): SharedPlanEntry[] {
  const path = getPath(workspaceDir)
  if (!existsSync(path)) return []
  try {
    const data = readJsonSync<SharedPlansFile>(path)
    return data?.plans ?? []
  } catch {
    // 文件损坏（非法 JSON）时按空列表处理，避免读取计划失败中断风后流程。
    return []
  }
}

/**
 * 追加一条共享计划，生成唯一 id 与 ISO 时间戳。
 * @param workspaceDir 工作空间目录。
 * @param content 计划内容（纯文本）。
 * @param createdBy 创建者标识（风后会话 id）。
 * @returns 新写入的计划条目。
 */
export function appendSharedPlan(workspaceDir: string, content: string, createdBy: string): SharedPlanEntry {
  const plans = readSharedPlans(workspaceDir)
  const entry: SharedPlanEntry = {
    id: randomUUID(),
    content,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
  plans.push(entry)
  writeJsonSync(getPath(workspaceDir), { plans })
  return entry
}

/**
 * 按 id 删除共享计划。
 * @param workspaceDir 工作空间目录。
 * @param id 目标计划 id。
 * @returns 删除成功返回 true；id 不存在返回 false。
 */
export function removeSharedPlan(workspaceDir: string, id: string): boolean {
  const plans = readSharedPlans(workspaceDir)
  const index = plans.findIndex((p) => p.id === id)
  if (index < 0) return false
  plans.splice(index, 1)
  writeJsonSync(getPath(workspaceDir), { plans })
  return true
}
