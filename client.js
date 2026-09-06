window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-module-agent", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client-src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
var import_react = require("react");
var name = "module-agent-client";
var inject = ["slots"];
var STYLE_TAG_ID = "@deepseek-ai/dsh-module-agent/composer-retry";
var RETRY_STYLE = `
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
`;
function ensureRetryStyle() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "@deepseek-ai/dsh-module-agent";
  tag.dataset.pluginCss = STYLE_TAG_ID;
  tag.textContent = RETRY_STYLE;
  document.head.appendChild(tag);
}
function ModuleAgentComposerButton() {
  return (0, import_react.createElement)(
    import_dsh_client_ui_primitives.Tooltip,
    { label: "回退并重发", side: "top", delayMs: 500 },
    (0, import_react.createElement)(
      "button",
      {
        type: "button",
        "data-module-agent-retry": true,
        "aria-label": "回退并重发",
        title: "回退并重发（P1c 接入 fork/回填）",
        onClick: () => {
          console.info("[module-agent-client] composer button clicked");
        }
      },
      (0, import_react.createElement)(import_dsh_client_ui_primitives.IconBranchOutline16)
    )
  );
}
function apply(ctx) {
  const slots = ctx.slots;
  if (slots === void 0) throw new Error("[module-agent-client] slots service unavailable");
  ensureRetryStyle();
  slots.inject("conversation.input.right", () => slots.register(
    {
      name: "conversation.input.right",
      id: "module-agent-retry",
      order: 0
    },
    ModuleAgentComposerButton
  ));
}
return module.exports;
}});
