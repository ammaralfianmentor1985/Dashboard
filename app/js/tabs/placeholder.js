import { el } from "../util.js";

export function makePlaceholder(title, milestone) {
  return {
    mount(root) {
      root.innerHTML = "";
      root.append(
        el("div", { class: "mm-view mm-placeholder" }, [
          el("h2", {}, title),
          el("p", {}, `Lands in ${milestone}. Not built yet on this branch.`),
        ])
      );
    },
    unmount() {},
  };
}
