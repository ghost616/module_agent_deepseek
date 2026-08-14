import { join } from 'node:path'
import { exists, readJson, writeText } from './fs.ts'

type SessionPlanMap = Record<string, string>

function getMapPath(workspaceDir: string): string {
  return join(workspaceDir, 'session_plan_map.json')
}

async function readMap(workspaceDir: string): Promise<SessionPlanMap> {
  const path = getMapPath(workspaceDir)
  if (!(await exists(path))) return {}
  try {
    return await readJson<SessionPlanMap>(path)
  } catch {
    return {}
  }
}

async function writeMap(workspaceDir: string, map: SessionPlanMap): Promise<void> {
  await writeText(getMapPath(workspaceDir), JSON.stringify(map, null, 2))
}

export async function recordMapping(workspaceDir: string, sessionId: string, planId: string): Promise<void> {
  const map = await readMap(workspaceDir)
  map[sessionId] = planId
  await writeMap(workspaceDir, map)
}

export async function getPlanIdBySession(workspaceDir: string, sessionId: string): Promise<string | null> {
  const map = await readMap(workspaceDir)
  return map[sessionId] ?? null
}

export async function removeMapping(workspaceDir: string, sessionId: string): Promise<boolean> {
  const map = await readMap(workspaceDir)
  if (!(sessionId in map)) return false
  delete map[sessionId]
  await writeMap(workspaceDir, map)
  return true
}

export async function removeMappingByPlanId(workspaceDir: string, planId: string): Promise<boolean> {
  const map = await readMap(workspaceDir)
  let removed = false
  for (const [sid, pid] of Object.entries(map)) {
    if (pid === planId) {
      delete map[sid]
      removed = true
    }
  }
  if (removed) {
    await writeMap(workspaceDir, map)
  }
  return removed
}

export async function cleanStaleSessionPlanMap(
  workspaceDir: string,
  isAlive: (sessionId: string) => Promise<boolean>,
): Promise<number> {
  const map = await readMap(workspaceDir)
  let removed = 0
  for (const sid of Object.keys(map)) {
    if (!(await isAlive(sid))) {
      delete map[sid]
      removed++
    }
  }
  if (removed > 0) {
    await writeMap(workspaceDir, map)
  }
  return removed
}
