// The list of computers, kept in one JSON file readable by this user only. Writes are queued, so two changes made at
// once never lose each other.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { config } from "./config.ts";

export type ComputerRecord = {
  id: string;
  label: string;
  port: number;
  profile: string;
  createdAt: string;
  savedAt: string | null;
};

export class ComputerStore {
  #writing = Promise.resolve();

  constructor(private readonly file: string = config.paths.list) {}

  async all(): Promise<ComputerRecord[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch {
      return [];
    }
  }

  async get(id: string): Promise<ComputerRecord> {
    const found = (await this.all()).find((c) => c.id === id);
    if (!found) throw new Error(`Unknown computer: ${id}`);
    return found;
  }

  put(record: ComputerRecord): Promise<void> {
    return this.change((list) => [...list.filter((c) => c.id !== record.id), record]);
  }

  update(id: string, patch: Partial<Omit<ComputerRecord, "id">>): Promise<void> {
    return this.change((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  remove(id: string): Promise<void> {
    return this.change((list) => list.filter((c) => c.id !== id));
  }

  private change(edit: (list: ComputerRecord[]) => ComputerRecord[]): Promise<void> {
    return (this.#writing = this.#writing.then(async () => {
      const next = edit(await this.all());
      await mkdir(config.paths.home, { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
      await rename(tmp, this.file);
    }));
  }
}
