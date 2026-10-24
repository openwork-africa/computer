#!/usr/bin/env bun
// The command line: each action is a Command (its usage and what it does), so the help text and the dispatch come
// from the same table.
//
//   bun computer screenshot shot.png
//   bun computer --id computer-1234abcd click 512 300
import { Computer } from "./sdk.ts";

type Command = { usage: string; run: (args: string[], pc: () => Promise<Computer>) => Promise<unknown> };

const num = (args: string[], i: number): number => {
  const n = Number(args[i]);
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got ${args[i] ?? "nothing"}`);
  return n;
};
const print = (value: unknown) => console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));

const COMMANDS: Record<string, Command> = {
  list: {
    usage: "list                        computers and their state",
    run: async () => (await Computer.list()).forEach((c) => console.log(`${c.id}  ${c.state.padEnd(8)}  ${c.label}`)),
  },
  create: { usage: "create [LABEL]              a new computer", run: async (a) => print((await Computer.create(a.join(" "))).id) },
  save: { usage: "save | resume | kill        shut down keeping sign-ins, boot again, delete", run: async (_, pc) => print(await (await pc()).save()) },
  resume: { usage: "", run: async (_, pc) => print(await (await pc()).resume()) },
  kill: { usage: "", run: async (_, pc) => (await pc()).kill() },

  screenshot: {
    usage: "screenshot [FILE.png]       save the screen",
    run: async (a, pc) => {
      const file = a[0] ?? "screenshot.png";
      await Bun.write(file, await (await pc()).screenshot());
      print(file);
    },
  },
  click: { usage: "click X Y                   also: doubleclick, rightclick, move", run: async (a, pc) => (await pc()).leftClick(num(a, 0), num(a, 1)) },
  doubleclick: { usage: "", run: async (a, pc) => (await pc()).doubleClick(num(a, 0), num(a, 1)) },
  rightclick: { usage: "", run: async (a, pc) => (await pc()).rightClick(num(a, 0), num(a, 1)) },
  move: { usage: "", run: async (a, pc) => (await pc()).moveMouse(num(a, 0), num(a, 1)) },
  drag: { usage: "drag X1 Y1 X2 Y2", run: async (a, pc) => (await pc()).drag([num(a, 0), num(a, 1)], [num(a, 2), num(a, 3)]) },
  scroll: {
    usage: "scroll up|down [N]          N wheel clicks where the mouse is (3)",
    run: async (a, pc) => (await pc()).scroll((a[0] ?? "down") as "up" | "down", a[1] ? num(a, 1) : 3),
  },
  type: { usage: "type TEXT                   type into what is focused", run: async (a, pc) => (await pc()).write(a.join(" ")) },
  key: { usage: "key KEYS                    enter, escape, ctrl+l, ctrl+shift+t…", run: async (a, pc) => (await pc()).press(a[0]) },

  open: {
    usage: "open URL [--new-tab]        go to an address",
    run: async (a, pc) => (await pc()).open(a.find((x) => x !== "--new-tab") ?? "", { newTab: a.includes("--new-tab") }),
  },
  url: { usage: "url | title | cursor        the tab's address, the window title, the mouse", run: async (_, pc) => print(await (await pc()).getUrl()) },
  title: { usage: "", run: async (_, pc) => print(await (await pc()).getWindowTitle()) },
  cursor: { usage: "", run: async (_, pc) => print(await (await pc()).getCursorPosition()) },
  tabs: {
    usage: "tabs                        the open tabs (* = in front)",
    run: async (_, pc) => (await (await pc()).tabs()).forEach((t) => console.log(`${t.active ? "*" : " "} ${t.index}  ${t.title}  ${t.url}`)),
  },
  tab: {
    usage: "tab N|TEXT                  bring a tab to the front, by index or by name",
    run: async (a, pc) => print(await (await pc()).switchTab(/^\d+$/.test(a[0] ?? "") ? Number(a[0]) : a.join(" "))),
  },
  newtab: { usage: "newtab [URL] | closetab", run: async (a, pc) => (await pc()).newTab(a[0]) },
  closetab: { usage: "", run: async (_, pc) => (await pc()).closeTab() },
  clipboard: {
    usage: "clipboard [TEXT]            read the computer's clipboard, or set it",
    run: async (a, pc) => (a.length ? (await pc()).setClipboard(a.join(" ")) : print(await (await pc()).getClipboard())),
  },

  record: {
    usage: "record start|status|note TEXT|finish NAME|discard",
    run: async ([what, ...words], pc) => {
      const r = (await pc()).record;
      const actions: Record<string, () => Promise<unknown>> = {
        start: r.start, status: r.status, discard: r.discard,
        note: () => r.note(words.join(" ")),
        finish: () => r.finish(words.join(" ")),
      };
      if (!actions[what]) throw new Error(COMMANDS.record.usage);
      print(await actions[what]());
    },
  },
};

const help = () =>
  `bun computer [--id computer-xxxxxxxx] <command>\n\n${Object.values(COMMANDS).filter((c) => c.usage).map((c) => `  ${c.usage}`).join("\n")}`;

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--id");
  const id = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const [name, ...rest] = args;
  try {
    const command = COMMANDS[name];
    if (!command) console.log(help());
    else await command.run(rest, () => Computer.connect(id));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
