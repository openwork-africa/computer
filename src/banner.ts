// The name, in block glyphs, for `computer help` and `computer serve`. In a terminal it runs from coral through violet
// to teal, the colours of the README's picture; NO_COLOR or a pipe gets it plain.
const GLYPHS = `
 ██████╗ ██████╗ ███╗   ███╗██████╗ ██╗   ██╗████████╗███████╗██████╗
██╔════╝██╔═══██╗████╗ ████║██╔══██╗██║   ██║╚══██╔══╝██╔════╝██╔══██╗
██║     ██║   ██║██╔████╔██║██████╔╝██║   ██║   ██║   █████╗  ██████╔╝
██║     ██║   ██║██║╚██╔╝██║██╔═══╝ ██║   ██║   ██║   ██╔══╝  ██╔══██╗
╚██████╗╚██████╔╝██║ ╚═╝ ██║██║     ╚██████╔╝   ██║   ███████╗██║  ██║
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝      ╚═════╝    ╚═╝   ╚══════╝╚═╝  ╚═╝`.slice(1);

const STOPS: [number, number, number][] = [[255, 122, 89], [124, 92, 255], [23, 195, 178]];

const colourAt = (t: number): [number, number, number] => {
  const scaled = t * (STOPS.length - 1);
  const i = Math.min(Math.floor(scaled), STOPS.length - 2);
  const f = scaled - i;
  return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f)) as [number, number, number];
};

const paint = (line: string, width: number) =>
  [...line].map((ch, x) => (ch === " " ? ch : `\x1b[38;2;${colourAt(x / (width - 1)).join(";")}m${ch}`)).join("") + "\x1b[0m";

export function banner(tagline = "a browser that stays signed in, for you and your agents"): string {
  const lines = GLYPHS.split("\n");
  const width = Math.max(...lines.map((l) => [...l].length));
  const colour = process.stdout.isTTY && !process.env.NO_COLOR;
  const art = colour ? lines.map((l) => paint(l, width)) : lines;
  const dim = (s: string) => (colour ? `\x1b[2m${s}\x1b[0m` : s);
  return `\n${art.join("\n")}\n${dim(`  ▌ ${tagline}`)}\n`;
}
