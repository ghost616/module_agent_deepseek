/**
 * dsh client 面（P1b）：在 composer 工具栏右侧注册一个图标工具按钮（conversation.input.right），
 * 观感对齐 ui-conversation 输入工具项（透明圆角图标按钮：无边框、hover/active 用 --dsw-* token、
 * focus-visible 焦点环、图标 15px）。本文件由 scripts/build-client.mjs 用 esbuild 打包为
 * __ModuleLoader__.load 合规单文件 client.js。共享模块 react 与
 * @deepseek-ai/dsh-client-ui-primitives（PLATFORM_MODULE，dsh web 模块表 seed）由运行时 external
 * require 提供；slots 为 client cordis 服务（ui-renderer 提供）。P1c 将把 onClick 接入
 * 「回退并重发」的 fork/回填实现。
 */
import {
  IconBranchOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { createElement } from 'react'

/** dsh client cordis 服务的最小可写面（运行时由 ui-renderer 提供，客户端不做宿主类型检查）。 */
interface SlotsLike {
  inject: (key: string, callback: () => unknown) => unknown
  register: (options: Record<string, unknown>, component: unknown) => unknown
}

export const name = 'module-agent-client'

/** 所需 client cordis 服务：slots。 */
export const inject = ['slots']

/** 本按钮自有样式 data-plugin-css 键（document 级去重）。 */
const STYLE_TAG_ID = '@deepseek-ai/dsh-module-agent/composer-retry'

/**
 * 图标工具按钮样式：对齐 composer 输入工具项的视觉基线——28px 透明圆角图标按钮、
 * hover 用交互 hover-solid token、active 用交互 active token、focus-visible 用
 * PermissionSelect 同款 2px l3 焦点环；图标按 chat 图标操作基线缩至 15px。
 */
const RETRY_STYLE = `
[data-module-agent-retry] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
[data-module-agent-retry]:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-secondary);
}
[data-module-agent-retry]:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active);
}
[data-module-agent-retry]:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);
}
[data-module-agent-retry] svg {
  width: 15px;
  height: 15px;
}
`

/** 注入本 client 自有样式（对齐 dsh client css 注入范式，仅注入一次）。 */
function ensureRetryStyle(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@deepseek-ai/dsh-module-agent'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = RETRY_STYLE
  document.head.appendChild(tag)
}

/** composer 右侧（conversation.input.right）图标工具按钮项：观感对齐输入工具项，onClick 仅打标记。 */
function ModuleAgentComposerButton(): ReturnType<typeof createElement> {
  return createElement(
    Tooltip,
    { label: '回退并重发', side: 'top', delayMs: 500 },
    createElement(
      'button',
      {
        type: 'button',
        'data-module-agent-retry': true,
        'aria-label': '回退并重发',
        title: '回退并重发（P1c 接入 fork/回填）',
        onClick: () => {
          console.info('[module-agent-client] composer button clicked')
        },
      },
      createElement(IconBranchOutline16),
    ),
  )
}

/**
 * 注册 composer 按钮项。
 * @param ctx - client 根上下文（含 slots 服务）。
 */
export function apply(ctx: { slots?: SlotsLike }): void {
  const slots = ctx.slots
  if (slots === undefined) throw new Error('[module-agent-client] slots service unavailable')
  ensureRetryStyle()
  slots.inject('conversation.input.right', () => slots.register(
    {
      name: 'conversation.input.right',
      id: 'module-agent-retry',
      order: 0,
    },
    ModuleAgentComposerButton,
  ))
}
