// The SDK: one Computer object per computer, with the screen's methods (from Desktop) and
// create/connect/list/save/resume/kill/record for the rest. It works without the server running.
//
//   import { Computer } from "@openwork/computer";
//   const pc = await Computer.connect();                 // the running one, or connect("computer-1234abcd")
//   await pc.open("https://example.com");
//   await pc.leftClick(512, 300);
//   await pc.write("hello");
//   await pc.press("enter");
//   await Bun.write("shot.png", await pc.screenshot());
//   const file = await pc.upload("~/Pictures/beach.jpg");  // then pick `file` in the site's upload dialog
import { chmod, copyFile, mkdir, rename, rm } from "node:fs/promises";
import { basename } from "node:path";
import { type ComputerInfo, ComputerService } from "./computers.ts";
import { assertId, config } from "./config.ts";
import { Desktop } from "./desktop.ts";
import { RecordingService } from "./recordings.ts";
import { type ComputerHealth, ContainerRuntime } from "./runtime.ts";
import { ComputerStore } from "./store.ts";

/** The parts, made once and shared by the SDK, the command line and the server. */
export const services = (() => {
  const runtime = new ContainerRuntime();
  return { runtime, computers: new ComputerService(runtime, new ComputerStore()), recordings: new RecordingService(runtime) };
})();

/** A file on this Mac, by path (~ allowed), that must exist. */
const fileOnMac = async (path: string) => {
  const expanded = path.replace(/^~(?=\/)/, process.env.HOME ?? "~");
  const file = Bun.file(expanded);
  if (!(await file.exists())) throw new Error(`No file at ${path}`);
  return expanded;
};

export class Computer extends Desktop {
  private constructor(id: string) {
    super(id, services.runtime);
  }

  static list(): Promise<ComputerInfo[]> {
    return services.computers.list();
  }

  /** A new computer (about 7 s; the first ever also builds the image, several minutes). */
  static async create(label?: string): Promise<Computer> {
    return new Computer((await services.computers.create(label)).id);
  }

  /** The computer named, or the one running when only one is. */
  static async connect(id?: string): Promise<Computer> {
    if (id) return new Computer(assertId(id));
    const running = (await Computer.list()).filter((c) => c.state === "running");
    if (running.length !== 1) {
      throw new Error(running.length ? `Several are running (${running.map((c) => c.id).join(", ")}): name one` : "No computer is running");
    }
    return new Computer(running[0].id);
  }

  /** Closes Firefox cleanly and shuts the VM down; sign-ins and tabs come back on resume(). */
  save(label?: string) {
    return services.computers.save(this.id, label);
  }
  resume() {
    return services.computers.resume(this.id);
  }
  /** Deletes the VM; its profile folder is kept. */
  kill() {
    return services.computers.remove(this.id);
  }
  /** Whether browser commands can be sent, or the exec circuit is protecting this computer from retries. */
  health(): ComputerHealth {
    return services.runtime.health(this.id);
  }
  /** A short, explicit probe that is allowed while the exec circuit is open. */
  async probe(): Promise<void> {
    await services.runtime.probe(this.id);
  }

  /**
   * Copies a file into the uploads folder every computer shares, and returns where it is inside the computer
   * (/home/user/Uploads/NAME). The transfer is handled directly on the mounted host folder, with no `container exec`,
   * native picker automation, or second copy through the VM. `file` is a path on this Mac (~ allowed), a Blob, or
   * bytes, with `name` for non-path sources.
   */
  async upload(file: string | Blob | Uint8Array, name?: string): Promise<string> {
    const source = typeof file === "string" ? await fileOnMac(file) : file;
    const base = basename(name ?? (typeof file === "string" ? file : ""));
    if (!base || base.startsWith(".")) throw new Error("Give the upload a file name");
    const staged = `${config.paths.uploads}/${base}`;
    await mkdir(config.paths.uploads, { recursive: true, mode: 0o755 });
    await chmod(config.paths.uploads, 0o755);
    if (typeof source === "string") {
      await copyFile(source, staged);
    } else {
      const partial = `${staged}.${crypto.randomUUID()}.part`;
      try {
        await Bun.write(partial, source, { createPath: true });
        await rename(partial, staged);
      } finally {
        await rm(partial, { force: true }).catch(() => {});
      }
    }
    await chmod(staged, 0o644);
    return `${config.uploadsInside}/${base}`;
  }

  readonly record = {
    start: () => services.recordings.start(this.id),
    status: () => services.recordings.status(this.id),
    note: (text: string) => services.recordings.note(this.id, text),
    finish: (name: string) => services.recordings.finish(this.id, name),
    discard: () => services.recordings.discard(this.id),
  };
}

export type { ComputerInfo } from "./computers.ts";
export type { Tab } from "./desktop.ts";
export type { Recording, Step } from "./recordings.ts";
