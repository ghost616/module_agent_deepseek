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

// client-src/rewind.ts
function textOfContent(content) {
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const candidate = block;
    if (candidate.type === "text" && typeof candidate.text === "string") text += candidate.text;
  }
  return text;
}
function isUserMessage(event) {
  return event.type === "user/message" && event.data?.source?.kind === "user";
}
function scanRewindTarget(window) {
  let userIndex = -1;
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const entry2 = window[index];
    if (entry2?.type !== "event") continue;
    if (entry2.event !== void 0 && isUserMessage(entry2.event)) {
      userIndex = index;
      break;
    }
  }
  if (userIndex === -1) return { ok: false, reason: "no-user-message" };
  const entry = window[userIndex];
  const user = entry?.type === "event" ? entry.event : void 0;
  if (user === void 0) return { ok: false, reason: "no-user-message" };
  const userText = textOfContent(user.data?.content);
  let atSeq;
  for (let index = userIndex - 1; index >= 0; index -= 1) {
    const candidate = window[index];
    if (candidate?.type !== "event") continue;
    if (candidate.event?.type === "turn/end") {
      atSeq = candidate.event.seq;
      break;
    }
  }
  if (atSeq === void 0) return { ok: false, reason: "no-completed-turn" };
  if (userText === "") return { ok: false, reason: "no-text" };
  return { ok: true, userSeq: user.seq, userText, atSeq };
}
async function rewindLastRound(face) {
  const scan = scanRewindTarget(face.eventsOf());
  if (!scan.ok) return { ok: false, reason: scan.reason };
  let childId;
  try {
    childId = await face.fork(scan.atSeq);
  } catch (error) {
    return {
      ok: false,
      reason: "fork-failed",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
  let backfilled = false;
  const draft = face.draftOf(childId);
  if (draft !== void 0) {
    try {
      draft.setDraft(scan.userText);
      backfilled = true;
    } catch (error) {
      console.warn("[module-agent-client] rewind draft backfill failed:", error);
    }
  }
  face.open(childId);
  return { ok: true, childId, userText: scan.userText, backfilled };
}

// client-src/index.ts
var name = "module-agent-client";
var inject = ["slots", "sessions"];
var STYLE_TAG_ID = "@deepseek-ai/dsh-module-agent/composer-retry";
var BLOCK_COPY = {
  "no-user-message": "当前会话没有可回退的用户消息",
  "no-completed-turn": "没有更早的已完成回合可回退",
  "no-text": "最后一条用户消息没有可回填的文本，未执行回退"
};
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
function ModuleAgentComposerButton(props) {
  return (0, import_react.createElement)(
    import_dsh_client_ui_primitives.Tooltip,
    { label: "回退并重发", side: "top", delayMs: 500 },
    (0, import_react.createElement)(
      "button",
      {
        type: "button",
        "data-module-agent-retry": true,
        "aria-label": "回退并重发",
        title: "撤销最近一轮（作废最后一条消息及其回复），并回填该消息以便重新发送",
        onClick: props.onRewind
      },
      (0, import_react.createElement)(import_dsh_client_ui_primitives.IconBranchOutline16)
    )
  );
}
function rewindServiceFace(ctx, sessionId) {
  const sessions = ctx.sessions;
  if (sessions === void 0) throw new Error("[module-agent-client] sessions service unavailable");
  return {
    eventsOf() {
      return sessions.binding(sessionId)?.eventSource?.getSnapshot().entries ?? [];
    },
    fork(atSeq) {
      return sessions.fork({ sessionId, atSeq, increaseTitle: true });
    },
    draftOf(childId) {
      const scope = sessions.scope(childId);
      if (scope === void 0) return void 0;
      const conversation = scope.get("conversation");
      const resolver = conversation?.input;
      if (resolver === void 0 || resolver.for === void 0) return void 0;
      const draft = {
        setDraft(text) {
          resolver.for(scope).setDraft(text);
        }
      };
      return draft;
    },
    open(childId) {
      sessions.open(childId);
    }
  };
}
function reportRewind(ctx, sessionId, outcome) {
  if (outcome.ok) {
    if (!outcome.backfilled) {
      console.warn(
        "[module-agent-client] 回退并重发：已 fork 至新分支",
        outcome.childId,
        "，但 composer 草稿回填不可用（conversation 服务不可达），请手动粘贴/重发。"
      );
    }
    console.info(
      `[module-agent-client] 回退并重发：fork 至新会话 ${outcome.childId}，回填最后用户消息（${outcome.backfilled ? "已回填" : "未回填"}）`
    );
    return;
  }
  const text = outcome.reason === "fork-failed" ? `回退失败：${outcome.detail ?? "fork 不可用"}` : BLOCK_COPY[outcome.reason];
  console.warn(`[module-agent-client] ${text}`);
  const sessions = ctx.sessions;
  if (sessions === void 0) return;
  const scope = sessions.scope(sessionId);
  if (scope === void 0) return;
  try {
    const conversation = scope.get("conversation");
    conversation?.input?.for?.(scope).notify("error", text);
  } catch (error) {
    console.warn("[module-agent-client] failed to surface rewind feedback:", error);
  }
}
function apply(ctx) {
  const slots = ctx.slots;
  if (slots === void 0) throw new Error("[module-agent-client] slots service unavailable");
  ensureRetryStyle();
  slots.inject("conversation.input.right", () => slots.register(
    {
      name: "conversation.input.right",
      id: "module-agent-retry",
      order: 0,
      inject: (sessionId) => {
        const sessions = ctx.sessions;
        if (sessions === void 0) throw new Error("[module-agent-client] sessions service unavailable");
        let inFlight = false;
        const face = rewindServiceFace(ctx, sessionId);
        return {
          sessionId,
          onRewind: () => {
            if (inFlight) return;
            inFlight = true;
            void rewindLastRound(face).then(
              (outcome) => {
                reportRewind(ctx, sessionId, outcome);
              },
              (error) => {
                reportRewind(ctx, sessionId, {
                  ok: false,
                  reason: "fork-failed",
                  detail: error instanceof Error ? error.message : String(error)
                });
              }
            ).finally(() => {
              inFlight = false;
            });
          }
        };
      }
    },
    ModuleAgentComposerButton
  ));
}
return module.exports;
}});
