// The SDK: one Computer object per computer, with E2B Desktop's method names for the screen (from Desktop) and
// create/connect/list/save/resume/kill/record for the rest. It works without the server running.
//
//   import { Computer } from "@openwork/computer";
//   const pc = await Computer.connect();                 // the running one, or connect("computer-1234abcd")
//   await pc.open("https://example.com");
//   await pc.leftClick(512, 300);
//   await pc.write("hello");
//   await pc.press("enter");
//   await Bun.write("shot.png", await pc.screenshot());
import { type ComputerInfo, ComputerService } from "./computers.ts";
import { assertId } from "./config.ts";
import { Desktop } from "./desktop.ts";
import { RecordingService } from "./recordings.ts";
import { ContainerRuntime } from "./runtime.ts";
import { ComputerStore } from "./store.ts";

/** The parts, made once and shared by the SDK, the command line and the server. */
export const services = (() => {
  const runtime = new ContainerRuntime();
  return { runtime, computers: new ComputerService(runtime, new ComputerStore()), recordings: new RecordingService(runtime) };
})();

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
