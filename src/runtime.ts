// Adapter: Apple's `container` command line. Commands are supervised so a broken exec session fails fast instead of
// leaving an unbounded collection of `container` clients on the host.
import { assertId, COMPUTER_ID, config } from "./config.ts";

const decoder = new TextDecoder();
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type VmSpec = { id: string; port: number; profile: string };
export type CommandClass = "query" | "exec" | "transfer" | "lifecycle" | "build";
export type ExecOptions = {
  stdin?: string | Uint8Array;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Only recovery probes may run while the computer's exec circuit is open. */
  recovery?: boolean;
};
type CommandOptions = ExecOptions & { commandClass?: CommandClass; maxStdoutBytes?: number; maxStderrBytes?: number };
export type ComputerHealth = "healthy" | "unhealthy";

const DEFAULT_TIMEOUT: Record<CommandClass, number> = {
  query: 5_000,
  exec: 5_000,
  transfer: 60_000,
  lifecycle: 45_000,
  build: 20 * 60_000,
};
const DEFAULT_OUTPUT_LIMIT = 1 * 1024 * 1024;

export class CommandTimeoutError extends Error {
  constructor(readonly commandClass: CommandClass, readonly timeoutMs: number) {
    super(`Container ${commandClass} command timed out after ${timeoutMs} ms`);
    this.name = "CommandTimeoutError";
  }
}
export class CommandCancelledError extends Error {
  constructor() {
    super("Container command was cancelled");
    this.name = "CommandCancelledError";
  }
}
export class OutputLimitError extends Error {
  constructor(readonly stream: "stdout" | "stderr", readonly limit: number) {
    super(`Container command exceeded the ${stream} limit of ${limit} bytes`);
    this.name = "OutputLimitError";
  }
}
export class ComputerUnhealthyError extends Error {
  constructor(readonly id: string) {
    super(`${id} has a stalled container exec session; recover or resume it before sending more browser commands`);
    this.name = "ComputerUnhealthyError";
  }
}
export class CommandQueueFullError extends Error {
  constructor(readonly id: string) {
    super(`${id} has too many queued browser commands`);
    this.name = "CommandQueueFullError";
  }
}

const join = (chunks: Uint8Array[], length: number) => {
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const readLimited = async (stream: ReadableStream<Uint8Array>, limit: number, which: "stdout" | "stderr"): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return join(chunks, length);
      length += next.value.length;
      if (length > limit) throw new OutputLimitError(which, limit);
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
};

/** A FIFO for one computer. It prevents overlapping xdotool commands from racing one another. */
export class ComputerCommandQueue {
  #tail: Promise<void> = Promise.resolve();
  #queued = 0;
  #health: ComputerHealth = "healthy";

  get health() {
    return this.#health;
  }
  markHealthy() {
    this.#health = "healthy";
  }
  markUnhealthy() {
    this.#health = "unhealthy";
  }

  run<T>(id: string, work: () => Promise<T>, recovery = false): Promise<T> {
    if (this.#health === "unhealthy" && !recovery) return Promise.reject(new ComputerUnhealthyError(id));
    if (this.#queued >= 100) return Promise.reject(new CommandQueueFullError(id));
    this.#queued++;
    const result = this.#tail.then(() => {
      if (this.#health === "unhealthy" && !recovery) throw new ComputerUnhealthyError(id);
      return work();
    });
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      this.#queued--;
    });
    return result;
  }
}

export class ContainerRuntime {
  #ready: Promise<void> | null = null;
  #queues = new Map<string, ComputerCommandQueue>();
  #active = new Set<Bun.Subprocess>();

  constructor(private readonly bin = "container") {}

  private queue(id: string) {
    let queue = this.#queues.get(id);
    if (!queue) {
      queue = new ComputerCommandQueue();
      this.#queues.set(id, queue);
    }
    return queue;
  }

  health(id: string): ComputerHealth {
    return this.queue(assertId(id)).health;
  }
  markHealthy(id: string) {
    this.queue(assertId(id)).markHealthy();
  }

  private async terminate(child: Bun.Subprocess) {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([child.exited.then(() => undefined), sleep(750)]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited.catch(() => {});
  }

  /** Runs a bounded `container` command and returns its stdout. */
  async cli(args: string[], stdin?: string | Uint8Array, opts: CommandOptions = {}): Promise<Uint8Array> {
    const commandClass = opts.commandClass ?? "query";
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT[commandClass];
    if (opts.signal?.aborted) throw new CommandCancelledError();
    const child = Bun.spawn([this.bin, ...args], {
      stdin: stdin === undefined ? "ignore" : new Blob([stdin as unknown as BlobPart]),
      stdout: "pipe",
      stderr: "pipe",
    });
    this.#active.add(child);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const completion = Promise.all([
      readLimited(child.stdout, opts.maxStdoutBytes ?? DEFAULT_OUTPUT_LIMIT, "stdout"),
      readLimited(child.stderr, opts.maxStderrBytes ?? DEFAULT_OUTPUT_LIMIT, "stderr"),
      child.exited,
    ]);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CommandTimeoutError(commandClass, timeoutMs)), timeoutMs);
    });
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new CommandCancelledError());
      opts.signal?.addEventListener("abort", abort, { once: true });
    });

    try {
      const [out, err, code] = await Promise.race([completion, timeout, cancelled]);
      if (code !== 0) throw new Error(`container ${args[0]}: ${decoder.decode(err).trim() || "failed"}`);
      return out;
    } catch (error) {
      await this.terminate(child);
      await Promise.allSettled([completion]);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) opts.signal?.removeEventListener("abort", abort);
      this.#active.delete(child);
    }
  }

  async text(args: string[], stdin?: string | Uint8Array, opts: CommandOptions = {}): Promise<string> {
    return decoder.decode(await this.cli(args, stdin, opts));
  }

  /** One screen command at a time per computer. A timeout opens the circuit, stopping retry storms. */
  exec(id: string, args: string[], opts: ExecOptions = {}): Promise<Uint8Array> {
    const safeId = assertId(id);
    const queue = this.queue(safeId);
    return queue.run(safeId, async () => {
      try {
        const out = await this.cli(["exec", ...(opts.stdin === undefined ? [] : ["-i"]), "-e", "DISPLAY=:0", safeId, ...args], opts.stdin, {
          ...opts,
          commandClass: "exec",
        });
        if (opts.recovery) queue.markHealthy();
        return out;
      } catch (error) {
        if (error instanceof CommandTimeoutError) queue.markUnhealthy();
        throw error;
      }
    }, opts.recovery);
  }

  /** A bounded recovery probe. It is the only exec allowed while the circuit is open. */
  probe(id: string) {
    return this.exec(id, ["true"], { timeoutMs: 3_000, recovery: true });
  }

  /** A streaming exec for recordings and archives. Callers own cancellation and must consume the stream. */
  stream(id: string, args: string[]) {
    return Bun.spawn([this.bin, "exec", assertId(id), ...args], { stdout: "pipe", stderr: "ignore" });
  }

  /** Starts the `container` service, and builds the image the first time. */
  ready(): Promise<void> {
    return (this.#ready ??= (async () => {
      await this.cli(["system", "start"], undefined, { commandClass: "lifecycle" });
      const built = await this.cli(["image", "inspect", config.image], undefined, { commandClass: "query" }).then(() => true, () => false);
      if (!built) await this.build();
    })().catch((error) => {
      this.#ready = null;
      throw error;
    }));
  }

  build(): Promise<Uint8Array> {
    return this.cli(["build", "-t", config.image, "-f", `${config.imageDir}Containerfile`, config.imageDir], undefined, { commandClass: "build" });
  }

  run({ id, port, profile }: VmSpec): Promise<Uint8Array> {
    const safeId = assertId(id);
    return this.cli([
      "run", "-d", "--init", "--name", safeId, "-m", config.memory, "-c", String(config.cpus), "--shm-size", "512M",
      "-p", `${config.host}:${port}:6080`, "-v", `${profile}:/profile`, "-v", `${config.paths.uploads}:${config.uploadsInside}`,
      "-l", "app=openwork-computer", config.image,
    ], undefined, { commandClass: "lifecycle" }).then((out) => {
      this.markHealthy(safeId);
      return out;
    });
  }

  async remove(id: string): Promise<Uint8Array> {
    const safeId = assertId(id);
    const out = await this.cli(["delete", "--force", safeId], undefined, { commandClass: "lifecycle" });
    this.#queues.delete(safeId);
    return out;
  }

  async stop(id: string): Promise<Uint8Array> {
    const safeId = assertId(id);
    const out = await this.cli(["stop", "-t", "15", safeId], undefined, { commandClass: "lifecycle" });
    this.markHealthy(safeId);
    return out;
  }

  /** running | stopped, for computers only. */
  async states(): Promise<Map<string, string>> {
    const rows: { id: string; status: { state: string } }[] = JSON.parse(await this.text(["list", "--all", "--format", "json"], undefined, { commandClass: "query", maxStdoutBytes: 4 * 1024 * 1024 }).catch(() => "[]"));
    return new Map(rows.filter((r) => COMPUTER_ID.test(r.id)).map((r) => [r.id, r.status.state]));
  }
}
