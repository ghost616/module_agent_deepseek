/**
 * dsh client 面源码（P1a）：本文件经 scripts/build-client.mjs 用 esbuild 打包，
 * 包裹为 __ModuleLoader__.load 合规单文件（仓库根 client.js）供 dsh web client-modules 装载。
 * P1b/c 将在此扩展 client 功能（当前仅为装载验证探针）。
 */
export const name = 'module-agent-client'

export function apply(_ctx: unknown): void {
  console.info('[module-agent-client] client loaded')
}
