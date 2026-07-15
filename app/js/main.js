import * as router from "./router.js";
import * as chartTab from "./tabs/chart.js";
import * as flowTab from "./tabs/flow.js";
import * as investTab from "./tabs/invest.js";
import * as screenTab from "./tabs/screen.js";
import * as moreTab from "./tabs/more.js";
import { el } from "./util.js";
import * as store from "./store.js";

// Debug hook for automated/manual QA — not gated, harmless (client-only app, no auth/state to leak).
window.__mm = { get: store.get, set: store.set };

const TABS = [
  ["chart", "Chart", chartTab],
  ["flow", "Flow", flowTab],
  ["invest", "Invest", investTab],
  ["screen", "Screen", screenTab],
  ["more", "More", moreTab],
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

// ---------- PWA: service worker + update toast ----------
if ("serviceWorker" in navigator && new URLSearchParams(location.search).get("nosw") !== "1") {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("/app/sw.js");
      const showUpdateToast = (waitingWorker) => {
        const toast = el("div", { class: "mm-update-toast" }, [
          "Update available.",
          el("button", { class: "mm-tf-btn active", onclick: () => {
            waitingWorker.postMessage("SKIP_WAITING");
            navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
          } }, "Reload"),
        ]);
        document.body.append(toast);
      };
      if (reg.waiting) showUpdateToast(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw?.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateToast(reg.waiting || nw);
        });
      });
    } catch {
      // SW registration failing (e.g. dev over http on a non-localhost host) shouldn't break the app.
    }
  });
} else if (new URLSearchParams(location.search).get("nosw") === "1" && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}
