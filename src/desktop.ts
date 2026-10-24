// What can be done on a running computer's screen: screenshot, leftClick, write, press, scroll… Each is one xdotool,
// ImageMagick or xclip command run inside the computer.
import { config } from "./config.ts";
import type { ContainerRuntime } from "./runtime.ts";

const decoder = new TextDecoder();

export type Tab = { index: number; id: number; active: boolean; title: string; url: string };
export type ScrollDirection = "up" | "down" | "left" | "right";

// Common key names (enter, esc, pagedown…) as xdotool's. Cmd means Ctrl: the computer is Linux.
const KEYS: Record<string, string> = {
  enter: "Return", return: "Return", esc: "Escape", escape: "Escape", tab: "Tab", space: "space",
  backspace: "BackSpace", delete: "Delete", del: "Delete", insert: "Insert",
  up: "Up", down: "Down", left: "Left", right: "Right",
  arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right",
  home: "Home", end: "End", pageup: "Prior", pagedown: "Next",
  ctrl: "ctrl", control: "ctrl", cmd: "ctrl", meta: "ctrl", shift: "shift", alt: "alt", option: "alt", super: "super",
};
export const keyName = (key: string): string => KEYS[key.toLowerCase()] ?? (/^f\d{1,2}$/i.test(key) ? key.toUpperCase() : key);

const WHEEL: Record<ScrollDirection, string> = { up: "4", down: "5", left: "6", right: "7" };
const PLAIN_TEXT = /^[\x20-\x7e\n\t]*$/;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Desktop {
  constructor(readonly id: string, protected readonly runtime: ContainerRuntime) {}

  private run(...args: string[]) {
    return this.runtime.exec(this.id, args);
  }
  private async read(...args: string[]): Promise<string> {
    return decoder.decode(await this.run(...args)).trim();
  }
  private async xdotool(...args: string[]): Promise<void> {
    await this.run("xdotool", ...args);
  }
  private xy(x: number, y: number): string[] {
    return [String(Math.round(x)), String(Math.round(y))];
  }

  // ---- seeing ---------------------------------------------------------------------------------------------------

  /** The screen as a PNG. */
  screenshot(): Promise<Uint8Array> {
    return this.run("import", "-window", "root", "png:-");
  }
  getScreenSize() {
    return Promise.resolve({ ...config.screen });
  }
  async getCursorPosition(): Promise<{ x: number; y: number }> {
    const out = await this.read("xdotool", "getmouselocation", "--shell");
    return { x: Number(out.match(/X=(\d+)/)?.[1]), y: Number(out.match(/Y=(\d+)/)?.[1]) };
  }
  getWindowTitle(): Promise<string> {
    return this.read("xdotool", "getactivewindow", "getwindowname");
  }

  // ---- the mouse ------------------------------------------------------------------------------------------------

  moveMouse(x: number, y: number) {
    return this.xdotool("mousemove", ...this.xy(x, y));
  }
  private click(button: number, x?: number, y?: number, repeat = 1) {
    const at = x === undefined || y === undefined ? [] : ["mousemove", ...this.xy(x, y)];
    return this.xdotool(...at, "click", "--repeat", String(repeat), String(button));
  }
  leftClick(x?: number, y?: number) {
    return this.click(1, x, y);
  }
  doubleClick(x?: number, y?: number) {
    return this.click(1, x, y, 2);
  }
  middleClick(x?: number, y?: number) {
    return this.click(2, x, y);
  }
  rightClick(x?: number, y?: number) {
    return this.click(3, x, y);
  }
  drag(from: [number, number], to: [number, number]) {
    return this.xdotool("mousemove", ...this.xy(...from), "mousedown", "1", "sleep", "0.1", "mousemove", ...this.xy(...to), "sleep", "0.1", "mouseup", "1");
  }
  /** Wheel clicks where the mouse is. */
  scroll(direction: ScrollDirection = "down", amount = 1) {
    return this.xdotool("click", "--repeat", String(amount), "--delay", "60", WHEEL[direction]);
  }

  // ---- the keyboard ---------------------------------------------------------------------------------------------

  /** Types into what is focused. xdotool drops keys around characters outside plain ASCII, so such text is pasted. */
  async write(text: string, opts: { delayInMs?: number } = {}) {
    if (PLAIN_TEXT.test(text)) return await this.xdotool("type", "--delay", String(opts.delayInMs ?? 15), "--", text);
    await this.setClipboard(text);
    await this.press("ctrl+v");
  }
  /** A key or chord: press("enter"), press("ctrl+l"), press(["ctrl", "shift", "t"]). */
  press(key: string | string[]) {
    const keys = Array.isArray(key) ? key : key.split("+");
    return this.xdotool("key", keys.map(keyName).join("+"));
  }

  // ---- the clipboard --------------------------------------------------------------------------------------------

  getClipboard(): Promise<string> {
    return this.read("xclip", "-o", "-selection", "clipboard").catch(() => "");
  }
  async setClipboard(text: string) {
    await this.runtime.exec(this.id, ["xclip", "-selection", "clipboard", "-i"], { stdin: text });
  }
  /** Copies what is selected (Ctrl+C) and returns it. */
  async copy(): Promise<string> {
    await this.press("ctrl+c");
    await sleep(300);
    return this.getClipboard();
  }

  // ---- the browser ----------------------------------------------------------------------------------------------

  /** Goes to an address through the address bar, in this tab or a new one. */
  async open(url: string, opts: { newTab?: boolean } = {}) {
    if (opts.newTab) await this.press("ctrl+t");
    await this.press("ctrl+l");
    await sleep(150);
    await this.write(url, { delayInMs: 5 });
    await this.press("enter");
  }
  /** The address of the tab in front. */
  async getUrl(): Promise<string> {
    await this.press("ctrl+l");
    const url = await this.copy();
    await this.press("escape");
    return url;
  }

  /** The open tabs, left to right, as the image's add-on reports them. */
  async tabs(): Promise<Tab[]> {
    return JSON.parse(await this.read("cat", "/run/computer/tabs.json").catch(() => "[]"));
  }
  /** Brings a tab to the front: by index (0 is the leftmost) or by part of its title or address. Returns its title. */
  async switchTab(to: number | string): Promise<string> {
    const tabs = await this.tabs();
    const index = typeof to === "number" ? to : tabs.find((t) => `${t.title} ${t.url}`.toLowerCase().includes(to.toLowerCase()))?.index;
    if (index === undefined || index < 0 || (tabs.length && index >= tabs.length)) {
      throw new Error(`No tab ${JSON.stringify(to)} among: ${tabs.map((t) => t.title).join(" | ") || "none listed"}`);
    }
    // Firefox on Linux: Alt+1…8 picks a tab; past the eighth, step from the first.
    if (index < 8) await this.press(`alt+${index + 1}`);
    else {
      await this.press("alt+1");
      for (let i = 0; i < index; i++) await this.nextTab();
    }
    await sleep(150);
    return this.getWindowTitle();
  }
  nextTab() {
    return this.press("ctrl+pagedown");
  }
  prevTab() {
    return this.press("ctrl+pageup");
  }
  newTab(url?: string) {
    return url ? this.open(url, { newTab: true }) : this.press("ctrl+t");
  }
  closeTab() {
    return this.press("ctrl+w");
  }

  /** The last lines of Firefox's log: the sites' console errors and warnings, and Firefox's own. Read it when a site
   * misbehaves (a button that stays disabled, a sign-in that goes nowhere). */
  async logs(lines = 50): Promise<string> {
    return this.read("tail", "-n", String(lines), "/var/log/firefox.log").catch(() => "");
  }

  wait(ms: number) {
    return sleep(ms);
  }
}
