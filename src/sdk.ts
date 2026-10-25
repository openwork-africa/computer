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
import { basename } from "node:path";
import { type ComputerInfo, ComputerService } from "./computers.ts";
import { assertId, config } from "./config.ts";
import { Desktop } from "./desktop.ts";
import { RecordingService } from "./recordings.ts";
import { ContainerRuntime } from "./runtime.ts";
import { ComputerStore } from "./store.ts";

/** The parts, made once and shared by the SDK, the command line and the server. */
export const services = (() => {
  const runtime = new ContainerRuntime();
  return { runtime, computers: new ComputerService(runtime, new ComputerStore()), recordings: new RecordingService(runtime) };
})();

/** A file on this Mac, by path (~ allowed), that must exist. */
const fileOnMac = async (path: string) => {
  const file = Bun.file(path.replace(/^~(?=\/)/, process.env.HOME ?? "~"));
  if (!(await file.exists())) throw new Error(`No file at ${path}`);
  return file;
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

  /**
   * Copies a file into the uploads folder every computer shares, and returns where it is inside the computer
   * (/home/user/Uploads/NAME), for a site's upload dialog: click the site's upload button, press ctrl+l, write that
   * path, press enter. `file` is a path on this Mac (~ allowed) or the bytes themselves, with `name`.
   */
  async upload(file: string | Blob | Uint8Array, name?: string): Promise<string> {
    const source = typeof file === "string" ? await fileOnMac(file) : file;
    const base = basename(name ?? (typeof file === "string" ? file : ""));
    if (!base || base.startsWith(".")) throw new Error("Give the upload a file name");
    await Bun.write(`${config.paths.uploads}/${base}`, source, { createPath: true });
    const inside = `${config.uploadsInside}/${base}`;
    // A computer started before the shared folder existed does not have it until it is saved and resumed.
    await this.runtime.exec(this.id, ["runuser", "-u", "user", "--", "test", "-r", inside]).catch(() => {
      throw new Error(`${this.id} cannot see its Uploads folder yet: save and resume it, then upload again`);
    });
    return inside;
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
