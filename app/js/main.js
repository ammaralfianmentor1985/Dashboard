import * as router from "./router.js";
import * as chartTab from "./tabs/chart.js";
import { makePlaceholder } from "./tabs/placeholder.js";
import { el } from "./util.js";
import * as store from "./store.js";

// Debug hook for automated/manual QA — not gated, harmless (client-only app, no auth/state to leak).
window.__mm = { get: store.get, set: store.set };

const TABS = [
  ["chart", "Chart", chartTab],
  ["flow", "Flow", makePlaceholder("Flow — order flow", "M4")],
  ["invest", "Invest", makePlaceholder("Invest — Buffett scorecard & DCF", "M5")],
  ["screen", "Screen", makePlaceholder("Screen — screener", "M6")],
  ["chat", "Chat", makePlaceholder("Chat — quant analyst", "M7")],
  ["more", "More", makePlaceholder("More — journal, sizer, learn", "M8")],
];

function buildShell() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const view = el("div", { id: "view" });
  const nav = el("nav", { class: "mm-tabbar" }, TABS.map(([name, label]) =>
    el("button", {
      class: "tab-btn",
      "data-tab": name,
      onclick: () => router.navigate(name),
    }, label)
  ));
  app.append(view, nav);
}

for (const [name, , mod] of TABS) router.register(name, mod);

buildShell();
router.start();

if (new URLSearchParams(location.search).get("fps") === "1") {
  const badge = el("div", {
    style: "position:fixed;top:4px;right:4px;z-index:999;background:#000a;color:#0f0;font:11px monospace;padding:2px 6px;border-radius:4px;",
  }, "…");
  document.body.append(badge);
  let last = performance.now(), frames = 0;
  const tick = (now) => {
    frames++;
    if (now - last >= 1000) {
      badge.textContent = `${frames} fps`;
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
