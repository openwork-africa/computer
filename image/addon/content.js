// What is done on the page, as steps an agent can follow by meaning: what was clicked (its role, label and text, a
// selector, where it sat on the screen), what was typed into which field, keys, scrolls. Passwords and one-time codes
// are never sent: their text is replaced with •••.
const send = (step) => browser.runtime.sendMessage({ ...step, frame: window === top ? undefined : location.href }).catch(() => {});

const clean = (s, max = 120) => (s || "").replace(/\s+/g, " ").trim().slice(0, max) || undefined;

// The element a person means when they click inside it: the nearest link, button, field or other control.
const CONTROL = "a[href],button,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem]," +
  "[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[role=textbox],[contenteditable=''],[contenteditable=true]";
const controlOf = (el) => (el instanceof Element ? el.closest(CONTROL) || el : null);
const whole = (el) => el === document.body || el === document.documentElement;

// A short selector: an id, else up to four ancestors by their most telling attribute.
const ATTRS = ["data-testid", "aria-label", "name", "componentkey", "role", "placeholder"];
const selectorOf = (el) => {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && document.querySelectorAll(`#${el.id}`).length === 1) return `#${el.id}`;
  const parts = [];
  for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
    const tag = e.tagName.toLowerCase();
    const attr = ATTRS.find((a) => e.getAttribute(a));
    if (attr) parts.unshift(`${tag}[${attr}="${CSS.escape(e.getAttribute(attr).slice(0, 80))}"]`);
    else {
      const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [];
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(e) + 1})` : tag);
    }
    if (attr === "data-testid" || attr === "componentkey") break;
  }
  return parts.join(" > ");
};

// Screen pixels (the computer's 1024x640 screen), so a step can be clicked again with xdotool.
const onScreen = (x, y) => ({ x: Math.round(window.mozInnerScreenX + x), y: Math.round(window.mozInnerScreenY + y) });

const secret = (el) =>
  el.type === "password" || /one-time-code|password|cc-/.test(el.getAttribute?.("autocomplete") || "");

const describe = (el) => {
  const r = el.getBoundingClientRect();
  const field = el.matches("input,textarea,select,[contenteditable=''],[contenteditable=true],[role=textbox]");
  const label = el.getAttribute("aria-label") || el.labels?.[0]?.innerText || el.getAttribute("placeholder") ||
    el.getAttribute("title") || el.getAttribute("alt") || (field ? el.getAttribute("name") : "") ||
    (whole(el) || clean(el.innerText) ? "" : el.querySelector("img[alt]:not([alt=''])")?.getAttribute("alt") ||
      el.querySelector("svg[aria-label],[aria-label]")?.getAttribute("aria-label"));
  return {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute("role") || undefined,
    type: el.tagName === "INPUT" ? el.type : undefined,
    label: clean(label),
    text: field || whole(el) ? undefined : clean(el.innerText),
    href: el.href ? String(el.href) : undefined,
    selector: selectorOf(el),
    box: { ...onScreen(r.left, r.top), width: Math.round(r.width), height: Math.round(r.height) },
  };
};

const valueOf = (el) => (secret(el) ? "•••" : el.isContentEditable ? clean(el.innerText, 2000) ?? "" : String(el.value ?? "").slice(0, 2000));

// Typing is one step per field: sent when the field is left, Enter is pressed in it, or something else is clicked.
const typed = new Map(); // field -> value last sent
let dirty = null;
const flush = () => {
  const el = dirty;
  dirty = null;
  if (!el || !el.isConnected) return;
  const value = valueOf(el);
  if (typed.get(el) === value) return;
  typed.set(el, value);
  send({ kind: "type", value, target: describe(el) });
};

addEventListener("input", (e) => {
  const el = e.target instanceof Element ? e.target.closest("input,textarea,[contenteditable=''],[contenteditable=true]") : null;
  if (!el || ["checkbox", "radio", "file", "range", "color"].includes(el.type)) return;
  if (dirty && dirty !== el) flush();
  dirty = el;
}, true);
addEventListener("change", (e) => {
  const el = e.target;
  if (el.tagName === "SELECT") send({ kind: "select", value: clean(el.selectedOptions[0]?.text), target: describe(el) });
  else if (el === dirty) flush();
}, true);
addEventListener("blur", (e) => { if (e.target === dirty) flush(); }, true);

addEventListener("pointerdown", (e) => {
  if (!e.isTrusted || e.button > 2) return;
  if (dirty) flush();
  const el = controlOf(e.target);
  if (!el) return;
  send({ kind: e.button === 2 ? "right-click" : "click", at: onScreen(e.clientX, e.clientY), target: describe(el) });
}, true);

// Keys that do something on their own; plain typing is the "type" step.
const NAMED = new Set(["Enter", "Escape", "Tab", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);
addEventListener("keydown", (e) => {
  if (!e.isTrusted || e.repeat || ["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
  const combo = e.ctrlKey || e.metaKey || e.altKey;
  const inField = e.target === dirty || e.target?.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target?.tagName);
  if (!combo && !NAMED.has(e.key)) return;
  if (inField && !combo && ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  if (dirty) flush();
  const key = [e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && combo && "shift", e.metaKey && "super", e.key.length === 1 ? e.key.toLowerCase() : e.key]
    .filter(Boolean).join("+");
  send({ kind: "key", key, target: e.target instanceof Element && e.target !== document.body ? describe(e.target) : undefined });
}, true);

// Scrolling, once it settles: how far, and which list or panel when it is not the page itself.
let scrollTimer = 0, scrolled = null, startY = null;
addEventListener("scroll", (e) => {
  const el = e.target === document || e.target === document.documentElement ? null : e.target;
  if (scrolled !== el) { if (scrollTimer) settle(); scrolled = el; startY = null; }
  startY ??= el ? el.scrollTop : scrollY;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(settle, 700);
}, true);
function settle() {
  const el = scrolled;
  const y = el ? el.scrollTop : scrollY;
  if (startY !== null && Math.abs(y - startY) > 20) {
    send({ kind: "scroll", by: Math.round(y - startY), to: Math.round(y), target: el ? describe(el) : undefined });
  }
  scrollTimer = 0; scrolled = null; startY = null;
}
