// Minimal hash router: #/chart #/flow #/invest #/screen #/chat #/more
const routes = new Map(); // name -> {mount, unmount}
let current = null;

export function register(name, handlers) {
  routes.set(name, handlers);
}

function nameFromHash() {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
  return h || "chart";
}

export function params() {
  const q = location.hash.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(q));
}

export function navigate(name, query) {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  location.hash = `/${name}${qs}`;
}

function render() {
  const name = routes.has(nameFromHash()) ? nameFromHash() : "chart";
  if (current === name) return;
  const prev = routes.get(current);
  if (prev?.unmount) prev.unmount();
  current = name;
  const next = routes.get(name);
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  next.mount(document.getElementById("view"));
}

export function start() {
  window.addEventListener("hashchange", render);
  render();
}
