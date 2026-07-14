import { parseIntent } from "../chat/intents.js";
import { respond } from "../chat/respond.js";
import { runSelfTest } from "../chat/selftest.js";
import { get, set, on } from "../store.js";
import { el } from "../util.js";

let unsubs = [];

function messageRow(who, text) {
  return el("div", { class: `mm-chat-msg mm-chat-${who}` }, text);
}

function selftestView() {
  const { total, passed, results } = runSelfTest();
  const wrap = el("div", { class: "mm-view" });
  wrap.append(el("h2", {}, `Self-test: ${passed}/${total} passed`));
  results.forEach((r) => {
    wrap.append(el("div", { class: `mm-signal mm-${r.pass ? "up" : "down"}` },
      `${r.pass ? "✓" : "✗"} "${r.input}" -> ${r.got}${r.pass ? "" : ` (expected ${r.expected})`}`));
  });
  return wrap;
}

export function mount(root) {
  root.innerHTML = "";

  if (new URLSearchParams(location.search).get("selftest") === "1") {
    root.append(selftestView());
    return;
  }

  const wrap = el("div", { class: "mm-view mm-view-chat" });
  const langToggle = el("select", { class: "mm-select" }, [
    el("option", { value: "en" }, "English"),
    el("option", { value: "id" }, "Bahasa Indonesia"),
  ]);
  langToggle.value = get("lang");
  langToggle.addEventListener("change", () => set("lang", langToggle.value));

  const log = el("div", { class: "mm-chat-log" });
  const input = el("input", { class: "mm-search-input", placeholder: "analyze AAPL · dcf BBCA growth 10% · brief · help" });
  const sendBtn = el("button", { class: "mm-tf-btn active" }, "Send");

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    log.append(messageRow("user", text));
    input.value = "";
    log.scrollTop = log.scrollHeight;
    const intent = parseIntent(text);
    const thinking = messageRow("bot", "…");
    log.append(thinking);
    log.scrollTop = log.scrollHeight;
    try {
      const reply = await respond(intent, get("lang"));
      thinking.textContent = reply;
    } catch (e) {
      thinking.textContent = `Error: ${e.message}`;
    }
    log.scrollTop = log.scrollHeight;
  };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  log.append(messageRow("bot", "Quant analyst chat — every answer is computed from live data, not generated. Try: help"));

  wrap.append(
    el("div", { class: "mm-screen-controls" }, [langToggle]),
    log,
    el("div", { class: "mm-chat-input-row" }, [input, sendBtn])
  );
  root.append(wrap);
  unsubs.push(on("lang", (v) => { localStorage.setItem("mm.lang", v); }));
}

export function unmount() {
  unsubs.forEach((fn) => fn());
  unsubs = [];
}
