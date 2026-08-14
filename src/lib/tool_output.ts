import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'

/**
 * 所有 module-agent 工具的公共输出声明：canonical 值是一个 lossless JSON 值，
 * render 将其序列化为一段纯文本返回给模型。
 */
export function jsonToolOutput() {
  return {
    schema: { type: 'json' as const },
    render: (_args: unknown, value: JsonValue): ContentBlock[] => [
      { type: 'text' as const, text: JSON.stringify(value) },
    ],
  }
}
