// Settings, in one place. Everything a computer keeps on this Mac lives under COMPUTER_HOME.
const home = process.env.COMPUTER_HOME ?? `${process.env.HOME}/.openwork-computer`;

export const config = {
  image: "openwork-computer:1",
  imageDir: new URL("../image/", import.meta.url).pathname,
  webDir: new URL("../web/dist/", import.meta.url).pathname,
  host: "127.0.0.1",
  port: Number(process.env.PORT ?? 41800),
  // Each computer's screen is published on one port from this range, on 127.0.0.1 only.
  ports: { from: 41810, to: 41899 },
  memory: "2G",
  cpus: 2,
  screen: { width: 1024, height: 640 },
  paths: {
    home,
    list: `${home}/computers.json`,
    profiles: `${home}/profiles`,
    recordings: `${home}/recordings`,
  },
} as const;

/** Computers are named computer-<8 hex>. Only names of that shape ever reach `container`, so nothing here can touch
 * another container on this Mac. */
export const COMPUTER_ID = /^computer-[0-9a-f]{8}$/;

export const assertId = (id: string): string => {
  if (!COMPUTER_ID.test(id)) throw new Error(`Not a computer id: ${id}`);
  return id;
};
