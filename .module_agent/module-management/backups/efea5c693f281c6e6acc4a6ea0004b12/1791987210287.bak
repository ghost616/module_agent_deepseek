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
 * 获取 current_spec.md 中所有 ## 二级标题（不含 ## 前缀）
 */
export async function getSpecHeadings(directory: string, moduleName: string): Promise<string[]> {
  const spec = await readCurrentSpec(directory, moduleName)
  if (!spec) return []
  const headings: string[] = []
  for (const line of spec.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      headings.push(trimmed.slice(3))
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
 * 对 current_spec.md 中指定 heading 的 section 做增量修改。
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
  const lines = spec.split('\n')
  let headingLine = -1
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === marker) {
      headingLine = i
      break
    }
  }

  if (headingLine === -1) {
    if (mode === 'set') {
      throw new Error(`Heading '${marker}' 不存在，无法替换内容`)
    }
    const newSection = `\n${marker}\n\n${content}\n`
    spec = spec.trimEnd() + newSection
    await writeText(path, spec)
    return
  }

  let nextHeading = lines.length
  for (let i = headingLine + 1; i < lines.length; i++) {
    if ((lines[i] ?? '').startsWith('## ')) {
      nextHeading = i
      break
    }
  }

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
