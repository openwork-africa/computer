// Facade: making, saving, resuming and deleting computers, over the container runtime, the list of computers and
// the ports. A computer is a small Linux VM (image/) with Firefox; its Firefox profile is a folder on this Mac, so
// sign-ins and tabs survive Save, and Resume boots a fresh VM from the current image on that same profile.
import { chmod, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { assertId, config } from "./config.ts";
import type { ContainerRuntime } from "./runtime.ts";
import type { ComputerRecord, ComputerStore } from "./store.ts";

export type ComputerState = "running" | "stopped" | "gone";
export type ComputerInfo = ComputerRecord & { state: ComputerState };
/** Where a page connects to watch and drive the screen (noVNC's websocket), and its password for this boot. */
export type Stream = { ws: string; password: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A port is free when this process can bind it. Nothing holding a port is ever stopped: a taken one is skipped.
const portFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, config.host, () => probe.close(() => resolve(true)));
  });

export class ComputerService {
  constructor(private readonly runtime: ContainerRuntime, private readonly store: ComputerStore) {}

  async list(): Promise<ComputerInfo[]> {
    const [records, states] = await Promise.all([this.store.all(), this.runtime.states()]);
    return records.map((r) => ({ ...r, state: (states.get(r.id) as ComputerState) ?? "gone" }));
  }

  async create(label = ""): Promise<{ id: string; stream: Stream }> {
    await this.runtime.ready();
    const id = `computer-${crypto.randomUUID().slice(0, 8)}`;
    const port = await this.freePort();
    // The profile holds cookies and saved sign-ins: this user only.
    const profile = `${config.paths.profiles}/${id}`;
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await chmod(profile, 0o700);
    await this.runtime.run({ id, port, profile });
    try {
      const stream = await this.stream(id, port);
      await this.store.put({ id, label: label.trim() || "Firefox", port, profile, createdAt: new Date().toISOString(), savedAt: null });
      return { id, stream };
    } catch (error) {
      await this.runtime.remove(id).catch(() => {});
      throw error;
    }
  }

  /** Closes Firefox cleanly (so its profile is written out) and shuts the VM down. */
  async save(id: string, label?: string): Promise<ComputerRecord> {
    await this.runtime.exec(id, ["/usr/local/bin/start-computer", "quit"]).catch(() => {});
    await this.runtime.stop(id);
    await this.store.update(id, { savedAt: new Date().toISOString(), ...(label?.trim() ? { label: label.trim() } : {}) });
    return this.store.get(id);
  }

  /** A fresh VM from the current image, on the saved computer's name, port and profile. Running: its stream. */
  async resume(id: string): Promise<{ id: string; stream: Stream }> {
    const record = await this.store.get(assertId(id));
    await this.runtime.ready();
    const running = (await this.runtime.states()).get(id) === "running";
    if (!running) {
      if (!(await portFree(record.port))) throw new Error(`Port ${record.port} is in use by something else; free it to resume ${id}`);
      await this.runtime.remove(id).catch(() => {});
      await this.runtime.run(record);
    }
    return { id, stream: await this.stream(id, record.port) };
  }

  /** Deletes the VM. Its profile folder is kept: delete it by hand to forget the sign-ins. */
  async remove(id: string): Promise<void> {
    await this.runtime.remove(id).catch(() => {});
    await this.store.remove(id);
  }

  /** Waits (up to 40 s) for the screen to be served and Firefox to show, and returns where to connect. */
  async stream(id: string, port?: number): Promise<Stream> {
    port ??= (await this.store.get(id)).port;
    const until = Date.now() + 40_000;
    let password = "";
    while (Date.now() < until) {
      password ||= new TextDecoder().decode(await this.runtime.exec(id, ["cat", "/run/computer/vncpass"]).catch(() => new Uint8Array())).trim();
      const served = await fetch(`http://${config.host}:${port}/vnc.html`).then((r) => (r.body?.cancel(), r.ok), () => false);
      const shown = await this.runtime.exec(id, ["xdotool", "search", "--onlyvisible", "--class", "firefox"]).then(() => true, () => false);
      if (password && served && shown) return { ws: `ws://${config.host}:${port}/websockify`, password };
      await sleep(500);
    }
    throw new Error(`${id} did not start its screen`);
  }

  private async freePort(): Promise<number> {
    const taken = new Set((await this.store.all()).map((c) => c.port));
    for (let port = config.ports.from; port <= config.ports.to; port++) if (!taken.has(port) && (await portFree(port))) return port;
    throw new Error(`No free port in ${config.ports.from}-${config.ports.to}`);
  }
}
