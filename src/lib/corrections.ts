import { join } from 'node:path'
import { exists, readJson, writeText } from './fs.ts'

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

export async function readCorrections(workspaceDir: string): Promise<CorrectionEntry[]> {
  const path = getPath(workspaceDir)
  if (!(await exists(path))) return []
  try {
    const data = await readJson<CorrectionsFile>(path)
    return data?.corrections ?? []
  } catch {
    return []
  }
}

export async function appendCorrection(workspaceDir: string, content: string): Promise<void> {
  const corrections = await readCorrections(workspaceDir)

  // dedup: skip if content identical to last entry
  const last = corrections[corrections.length - 1]
  if (last !== undefined && last.content === content) {
    return
  }

  corrections.push({ content, timestamp: new Date().toISOString() })

  await writeText(getPath(workspaceDir), JSON.stringify({ corrections }, null, 2))
}

export async function removeCorrection(workspaceDir: string, index: number): Promise<boolean> {
  const corrections = await readCorrections(workspaceDir)
  if (index < 0 || index >= corrections.length) return false
  corrections.splice(index, 1)
  await writeText(getPath(workspaceDir), JSON.stringify({ corrections }, null, 2))
  return true
}
