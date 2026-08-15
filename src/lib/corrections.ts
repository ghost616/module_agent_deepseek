import { join } from 'node:path'
import { existsSync, readJsonSync, writeJsonSync } from './fs.ts'

export interface CorrectionEntry {
  content: string
  timestamp: string
}

interface CorrectionsFile {
  corrections: CorrectionEntry[]
}

function getPath(workspaceDir: string): string {
  return join(workspaceDir, 'corrections.json')
}

export function readCorrections(workspaceDir: string): CorrectionEntry[] {
  const path = getPath(workspaceDir)
  if (!existsSync(path)) return []
  try {
    const data = readJsonSync<CorrectionsFile>(path)
    return data?.corrections ?? []
  } catch {
    return []
  }
}

export function appendCorrection(workspaceDir: string, content: string): void {
  const corrections = readCorrections(workspaceDir)

  // dedup: skip if content identical to last entry
  const last = corrections[corrections.length - 1]
  if (last !== undefined && last.content === content) {
    return
  }

  corrections.push({ content, timestamp: new Date().toISOString() })

  writeJsonSync(getPath(workspaceDir), { corrections })
}

export function removeCorrection(workspaceDir: string, index: number): boolean {
  const corrections = readCorrections(workspaceDir)
  if (index < 0 || index >= corrections.length) return false
  corrections.splice(index, 1)
  writeJsonSync(getPath(workspaceDir), { corrections })
  return true
}
