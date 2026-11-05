import { createElement } from "lucide";
import type { IconNode } from "lucide";

export const ic = (i: IconNode) => createElement(i) as SVGElement;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}

// Icon-only button; the label is for screen readers and long-press tooltips only.
export function btn(icon: IconNode, label: string, fn: () => void, cls = ""): HTMLButtonElement {
  const b = h("button", cls, ic(icon));
  b.setAttribute("aria-label", label);
  b.title = label;
  b.onclick = fn;
  return b;
}

export function swatch(colors: string[], top?: string): HTMLElement {
  const d = h("div", "sw");
  const stops = colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(",");
  d.style.background = top ? `linear-gradient(${top} 50%, ${colors[0]} 50%)` : `linear-gradient(90deg, ${stops})`;
  return d;
}
