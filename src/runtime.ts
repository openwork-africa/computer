// Adapter: Apple's `container` command line as a small typed interface. The rest of the code never builds `container`
// arguments itself, and every computer name passes assertId first.
import { assertId, COMPUTER_ID, config } from "./config.ts";

const decoder = new TextDecoder();

export type VmSpec = { id: string; port: number; profile: string };
export type ExecOptions = { stdin?: string };

export class ContainerRuntime {
  #ready: Promise<void> | null = null;

  constructor(private readonly bin = "container") {}

  /** Runs `container <args>` and returns its output; fails with its error text. */
  async cli(args: string[], stdin?: string): Promise<Uint8Array> {
    const child = Bun.spawn([this.bin, ...args], { stdin: stdin === undefined ? "ignore" : new Blob([stdin]), stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(child.stdout).bytes(), new Response(child.stderr).text(), child.exited]);
    if (code !== 0) throw new Error(`container ${args[0]}: ${err.trim() || "failed"}`);
    return out;
  }

  async text(args: string[], stdin?: string): Promise<string> {
    return decoder.decode(await this.cli(args, stdin));
  }

  /** A command inside a computer, against its screen. Arguments are passed as they are, never through a shell. */
  exec(id: string, args: string[], opts: ExecOptions = {}): Promise<Uint8Array> {
    const flags = opts.stdin === undefined ? [] : ["-i"];
    return this.cli(["exec", ...flags, "-e", "DISPLAY=:0", assertId(id), ...args], opts.stdin);
  }

  /** The output of a command inside a computer, as a stream (for large files). */
  stream(id: string, args: string[]) {
    return Bun.spawn([this.bin, "exec", assertId(id), ...args], { stdout: "pipe", stderr: "ignore" });
  }

  /** Starts the `container` service, and builds the image the first time (several minutes: Firefox is downloaded). */
  ready(): Promise<void> {
    return (this.#ready ??= (async () => {
      await this.cli(["system", "start"]);
      const built = await this.cli(["image", "inspect", config.image]).then(() => true, () => false);
      if (!built) await this.build();
    })().catch((error) => {
      this.#ready = null;
      throw error;
    }));
  }

  build(): Promise<Uint8Array> {
    return this.cli(["build", "-t", config.image, "-f", `${config.imageDir}Containerfile`, config.imageDir]);
  }

  run({ id, port, profile }: VmSpec): Promise<Uint8Array> {
    return this.cli([
      "run", "-d", "--init", "--name", assertId(id), "-m", config.memory, "-c", String(config.cpus), "--shm-size", "512M",
      "-p", `${config.host}:${port}:6080`, "-v", `${profile}:/profile`, "-l", "app=openwork-computer", config.image,
    ]);
  }

  remove(id: string): Promise<Uint8Array> {
    return this.cli(["delete", "--force", assertId(id)]);
  }

  stop(id: string): Promise<Uint8Array> {
    return this.cli(["stop", "-t", "15", assertId(id)]);
  }

  /** running | stopped, for computers only. No `container` service means none are running. */
  async states(): Promise<Map<string, string>> {
    const rows: { id: string; status: { state: string } }[] = JSON.parse(await this.text(["list", "--all", "--format", "json"]).catch(() => "[]"));
    return new Map(rows.filter((r) => COMPUTER_ID.test(r.id)).map((r) => [r.id, r.status.state]));
  }
}
