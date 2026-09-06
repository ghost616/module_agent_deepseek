/**
 * 构建 dsh client 面合规单文件（仓库根 client.js）。
 *
 * dsh client bundle 装载协议：浏览器加载的 client 产物必须是单文件脚本，顶层以
 * `window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => { ... } })`
 * 注册。factory 内为 CommonJS 执行环境：模块源码引用 factory 形参提供的
 * require/module/exports（esbuild cjs 产物引用的正是这些作用域内变量），
 * factory 返回 module.exports 即该 client 面的模块导出。产物格式对齐 dsh 仓库
 * 各 client 包的 lib/client.js 产物（参照 ui-skill），load id 为包名
 * '@deepseek-ai/dsh-module-agent'。
 *
 * 实现：esbuild 将 client-src/index.ts 打包为 CJS（bundle、write:false 先在内存产出文本），
 * 再包裹 __ModuleLoader__.load banner/footer 写入仓库根 client.js。
 * 共享模块（react/react-dom/@deepseek-ai/*）保持 external require，由 dsh web
 * 运行时模块表提供（P1a 零 import 时为冗余声明，保留为后续 client 功能铺路）。
 *
 * 运行：`node scripts/build-client.mjs`（需已安装 devDependency esbuild）。
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** dsh web 模块表中本包的浏览器模块 id（须与 package.json name 一致）。 */
const MODULE_AGENT_ID = '@deepseek-ai/dsh-module-agent'

/** 仓库根目录（本脚本位于 scripts/ 子目录）。 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 产物 banner：包裹 __ModuleLoader__.load 注册并提供 CJS 执行环境。 */
function loadBanner(id) {
  return (
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\n`
    + 'var module = { exports: {} };\n'
    + 'var exports = module.exports;\n'
  )
}

/** 产物 footer：返回 factory 的模块导出并闭合 load({...}) 调用。 */
const LOAD_FOOTER = `
return module.exports;
}});
`

try {
  const result = await build({
    entryPoints: [join(repoRoot, 'client-src', 'index.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    external: ['react', 'react-dom', '@deepseek-ai/*'],
    write: false,
    logLevel: 'silent',
  })
  const code = result.outputFiles[0].text.trimEnd()
  const outPath = join(repoRoot, 'client.js')
  // 末尾补单个换行，保证产物以单个换行结尾。
  writeFileSync(outPath, `${loadBanner(MODULE_AGENT_ID)}${code}${LOAD_FOOTER}\n`)
  console.info(`[client:build] wrote ${outPath} (${result.outputFiles[0].contents.byteLength} bytes)`)
} catch (error) {
  console.error('[client:build] failed:', error)
  process.exitCode = 1
}
