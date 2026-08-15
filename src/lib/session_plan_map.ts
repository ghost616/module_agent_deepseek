import { join } from 'node:path'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'

type SessionPlanMap = Record<string, string>

function getMapPath(workspaceDir: string): string {
  return join(workspaceDir, 'session_plan_map.json')
}

function readMap(workspaceDir: string): SessionPlanMap {
  const path = getMapPath(workspaceDir)
  if (!existsSync(path)) return {}
  try {
    return readJsonSync<SessionPlanMap>(path)
  } catch {
    return {}
  }
}

function writeMap(workspaceDir: string, map: SessionPlanMap): void {
  writeJsonSync(getMapPath(workspaceDir), map)
}

export function recordMapping(workspaceDir: string, sessionId: string, planId: string): void {
  const map = readMap(workspaceDir)
  map[sessionId] = planId
  writeMap(workspaceDir, map)
}

export function getPlanIdBySession(workspaceDir: string, sessionId: string): string | null {
  const map = readMap(workspaceDir)
  return map[sessionId] ?? null
}

export function removeMapping(workspaceDir: string, sessionId: string): boolean {
  const map = readMap(workspaceDir)
  if (!(sessionId in map)) return false
  delete map[sessionId]
  writeMap(workspaceDir, map)
  return true
}

export function removeMappingByPlanId(workspaceDir: string, planId: string): boolean {
  const map = readMap(workspaceDir)
  let removed = false
  for (const [sid, pid] of Object.entries(map)) {
    if (pid === planId) {
      delete map[sid]
      removed = true
    }
  }
  if (removed) {
    writeMap(workspaceDir, map)
  }
  return removed
}

export async function cleanStaleSessionPlanMap(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const map = readMap(workspaceDir)
  let removed = 0
  for (const sid of Object.keys(map)) {
    if (!(await isAlive(sid))) {
      delete map[sid]
      removed++
    }
  }
  if (removed > 0) {
    writeMap(workspaceDir, map)
  }
  return removed
}
