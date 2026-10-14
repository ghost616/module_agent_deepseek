import { join } from 'node:path'
import { moduleAgentDir, CURRENT_SPEC_FILE } from './constants.ts'
import { exists, readText, writeText } from './fs.ts'

function specPath(directory: string, moduleName: string): string {
  return join(moduleAgentDir(directory, moduleName), CURRENT_SPEC_FILE)
}

export async function readCurrentSpec(directory: string, moduleName: string): Promise<string> {
  const path = specPath(directory, moduleName)
  if (!(await exists(path))) {
    return ''
  }
  return readText(path)
}

/**
 * 获取 current_spec.md 中所有 ## 二级标题（不含 ## 前缀）。
 * 同名标题（重复 section）只保留首次出现，与 updateSpecSection 的折叠行为一致。
 */
export async function getSpecHeadings(directory: string, moduleName: string): Promise<string[]> {
  const spec = await readCurrentSpec(directory, moduleName)
  if (!spec) return []
  const headings: string[] = []
  const seen = new Set<string>()
  for (const line of spec.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      const name = trimmed.slice(3)
      if (!seen.has(name)) {
        seen.add(name)
        headings.push(name)
      }
    }
  }
  return headings
}

/**
 * 获取 current_spec.md 中指定 heading 下 section 的内容。
 * 从标题行下一行起，到下一个 ## 标题或文件末尾为止。
 */
export async function getSpecSection(
  directory: string,
  moduleName: string,
  heading: string,
): Promise<string> {
  const spec = await readCurrentSpec(directory, moduleName)
  if (!spec) return ''
  const lines = spec.split('\n')
  const marker = `## ${heading}`
  let headingLine = -1
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === marker) {
      headingLine = i
      break
    }
  }
  if (headingLine === -1) return ''
  let nextHeading = lines.length
  for (let i = headingLine + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('## ')) {
      nextHeading = i
      break
    }
  }
  return lines.slice(headingLine + 1, nextHeading).join('\n').trim()
}

/**
 * 定位 section 的结束行：从 heading 行的下一行起，到下一个 ## 标题或文件末尾。
 */
function sectionEnd(lines: string[], headingLine: number): number {
  for (let i = headingLine + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('## ')) {
      return i
    }
  }
  return lines.length
}

/**
 * 收集所有与 `## <heading>` 完全匹配（trim 后相等）的标题行索引。
 */
function collectHeadingMatches(lines: string[], marker: string): number[] {
  const matches: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === marker) {
      matches.push(i)
    }
  }
  return matches
}

/**
 * 折叠重复同名 section：保留首个匹配标题所在的整段，删除其后所有同名 section
 * （含标题与其内容）。无重复时原样返回。
 */
function foldDuplicateSections(lines: string[], matches: number[]): string[] {
  if (matches.length <= 1) return lines
  const remove = new Set<number>()
  for (let k = 1; k < matches.length; k++) {
    const start = matches[k]!
    const end = sectionEnd(lines, start)
    for (let i = start; i < end; i++) {
      remove.add(i)
    }
  }
  return lines.filter((_, i) => !remove.has(i))
}

/**
 * 对 current_spec.md 中指定 heading 的 section 做增量修改。
 * 当存在重复同名 `## heading` 时先折叠：'set' 在首个匹配位置写入新内容并删除其余
 * 同名 section；'add' 并入首个 section 并删除其余同名 section，最终仅保留单标题。
 * @param mode 'set' 替换整个 section 内容；'add' 追加到末尾
 */
export async function updateSpecSection(
  directory: string,
  moduleName: string,
  heading: string,
  mode: 'set' | 'add',
  content: string,
): Promise<void> {
  const path = specPath(directory, moduleName)
  let spec = ''
  if (await exists(path)) {
    spec = await readText(path)
  }

  const marker = `## ${heading}`
  let lines = spec.split('\n')
  const matches = collectHeadingMatches(lines, marker)
  const headingLine = matches.length > 0 ? matches[0]! : -1

  if (headingLine === -1) {
    if (mode === 'set') {
      throw new Error(`Heading '${marker}' 不存在，无法替换内容`)
    }
    const newSection = `\n${marker}\n\n${content}\n`
    spec = spec.trimEnd() + newSection
    await writeText(path, spec)
    return
  }

  lines = foldDuplicateSections(lines, matches)
  const nextHeading = sectionEnd(lines, headingLine)

  if (mode === 'set') {
    const headingTitle = lines[headingLine] ?? ''
    const newLines = [headingTitle, '', content]
    const before = lines.slice(0, headingLine)
    const after = lines.slice(nextHeading)
    spec = [...before, ...newLines, ...after].join('\n')
  } else {
    const before = lines.slice(0, nextHeading).join('\n')
    const after = nextHeading < lines.length ? '\n' + lines.slice(nextHeading).join('\n') : ''
    const spacer = lines[nextHeading - 1]?.trim() ? '\n' : ''
    spec = before + spacer + content + after
  }

  await writeText(path, spec)
}
