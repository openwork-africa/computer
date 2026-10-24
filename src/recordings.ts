// Record: what a person does in a computer, saved for an agent to do again. The image's Firefox add-on notes each
// click, typed text, key, scroll and page; computer-recorder (inside the computer) keeps them with a screenshot each
// while a recording is on. Finishing takes them out to <recordings>/<name>/: steps.json, steps.md (the same, one line
// per step, written for an agent to read) and NNNN.jpg screenshots. Passwords are never recorded (they read •••).
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { config } from "./config.ts";
import type { ContainerRuntime } from "./runtime.ts";

type Target = { tag: string; role?: string; type?: string; label?: string; text?: string; href?: string; selector?: string };
export type Step = {
  n: number;
  time: number;
  kind: string;
  shot: string;
  url?: string;
  how?: string;
  text?: string;
  value?: string;
  key?: string;
  by?: number;
  at?: { x: number; y: number };
  target?: Target;
};
export type Recording = { name: string; computer: string; startedAt: string | null; endedAt: string; screen: typeof config.screen; steps: Step[] };
export type RecordingSummary = { dir: string; name: string; steps: number; endedAt: string };

// ---- Strategy: one narrator per kind of step ----------------------------------------------------------------------

const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
};

/** "link "Jobs" (to https://…)", "search field "Search"", "button `div > button`". */
export const named = (t?: Target): string => {
  if (!t) return "the page";
  const what = t.role || (t.tag === "a" ? "link" : t.tag === "input" ? `${t.type || "text"} field` : t.tag);
  const name = t.label || t.text;
  const to = t.tag === "a" && t.href ? ` (to ${t.href})` : "";
  return (name ? `${what} "${name}"` : `${what}${t.selector ? ` \`${t.selector}\`` : ""}`) + to;
};

type Narrator = (s: Step) => string;
const click: Narrator = (s) => `${s.kind === "click" ? "Clicked" : "Right-clicked"} ${named(s.target)}${s.at ? ` at ${s.at.x},${s.at.y}` : ""} on ${hostOf(s.url)}`;

export const NARRATORS: Record<string, Narrator> = {
  page: (s) => `Page ${s.how === "in-page" ? "changed to" : `opened (${s.how})`}: ${s.url}`,
  click,
  "right-click": click,
  type: (s) => `Typed "${s.value}" into ${named(s.target)}`,
  select: (s) => `Chose "${s.value}" in ${named(s.target)}`,
  key: (s) => `Pressed ${s.key}${s.target ? ` in ${named(s.target)}` : ""}`,
  scroll: (s) => `Scrolled ${(s.by ?? 0) > 0 ? "down" : "up"} ${Math.abs(s.by ?? 0)}px in ${s.target ? named(s.target) : "the page"}`,
  note: (s) => `Note from the person recording: ${s.text}`,
};
export const narrate = (s: Step): string => (NARRATORS[s.kind] ?? ((x: Step) => x.kind))(s);

export const toMarkdown = (r: Recording): string =>
  [
    `# ${r.name}`,
    "",
    `Recorded ${r.endedAt.slice(0, 16).replace("T", " ")} UTC in ${r.computer} (Firefox, screen ${r.screen.width}x${r.screen.height}).`,
    `${r.steps.length} steps; each has the screenshot taken as it was done (NNNN.jpg here). Positions are screen pixels;`,
    "follow the steps by what they name, not only by position, since pages change. Details are in steps.json.",
    "",
    ...r.steps.map((s) => `${s.n}. ${narrate(s)} (${s.shot})`),
    "",
  ].join("\n");

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "recording";
const exists = (path: string) => stat(path).then(() => true, () => false);

// ---- the service ----------------------------------------------------------------------------------------------------

export class RecordingService {
  constructor(private readonly runtime: ContainerRuntime, private readonly dir: string = config.paths.recordings) {}

  private async recorder(id: string, ...args: string[]): Promise<string> {
    return new TextDecoder().decode(await this.runtime.exec(id, ["/usr/local/bin/computer-recorder", ...args])).trim();
  }

  async start(id: string) {
    await this.recorder(id, "start");
    return { on: true, steps: 0 };
  }

  async status(id: string): Promise<{ on: boolean; steps: number }> {
    return JSON.parse(await this.recorder(id, "count"));
  }

  async note(id: string, text: string) {
    if (!text.trim()) throw new Error("The note is empty");
    return { n: Number(await this.recorder(id, "note", text.trim())) };
  }

  /** Stops and throws away what was recorded. */
  async discard(id: string) {
    await this.recorder(id, "start");
    await this.recorder(id, "stop");
    return { on: false };
  }

  /** Stops, takes the steps and screenshots out of the computer, and writes them under a folder named after `name`. */
  async finish(id: string, name: string): Promise<RecordingSummary & { path: string }> {
    await this.recorder(id, "stop");
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    let dir = slug(name);
    for (let i = 2; await exists(`${this.dir}/${dir}`); i++) dir = `${slug(name)}-${i}`;
    const out = `${this.dir}/${dir}`;
    await mkdir(out, { mode: 0o700 });

    // The folder comes out as a tar stream through `container exec`, unpacked here.
    const pack = this.runtime.stream(id, ["tar", "-C", "/run/computer/rec", "-cf", "-", "--exclude=on", "--exclude=.lock", "."]);
    const unpack = Bun.spawn(["tar", "-xf", "-", "-C", out], { stdin: pack.stdout, stderr: "ignore" });
    if ((await pack.exited) !== 0 || (await unpack.exited) !== 0) throw new Error(`Could not take the recording out of ${id}`);

    const lines = await readFile(`${out}/steps.jsonl`, "utf8").catch(() => "");
    await rm(`${out}/steps.jsonl`, { force: true });
    const steps: Step[] = lines.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const recording: Recording = {
      name: name.trim() || dir,
      computer: id,
      startedAt: steps[0] ? new Date(steps[0].time).toISOString() : null,
      endedAt: new Date().toISOString(),
      screen: config.screen,
      steps,
    };
    await writeFile(`${out}/steps.json`, JSON.stringify(recording, null, 2) + "\n", { mode: 0o600 });
    await writeFile(`${out}/steps.md`, toMarkdown(recording), { mode: 0o600 });
    await this.discard(id).catch(() => {});
    return { dir, path: out, name: recording.name, steps: steps.length, endedAt: recording.endedAt };
  }

  async list(): Promise<RecordingSummary[]> {
    const dirs = await readdir(this.dir, { withFileTypes: true }).catch(() => []);
    const found = await Promise.all(dirs.filter((d) => d.isDirectory()).map(async (d) => {
      try {
        const r: Recording = JSON.parse(await readFile(`${this.dir}/${d.name}/steps.json`, "utf8"));
        return { dir: d.name, name: r.name, steps: r.steps.length, endedAt: r.endedAt };
      } catch {
        return null;
      }
    }));
    return found.filter((r): r is RecordingSummary => r !== null).sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  }
}
