import { expect, test } from "bun:test";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { ComputerStore } from "../src/store.ts";

const record = (id: string) => ({ id, label: id, port: 41810, profile: "/tmp/p", createdAt: "2026-01-01T00:00:00.000Z", savedAt: null });

test("keeps concurrent writes and is readable by its owner only", async () => {
  const file = `${await mkdtemp(`${tmpdir()}/computer-`)}/computers.json`;
  const store = new ComputerStore(file);
  await Promise.all([store.put(record("computer-00000001")), store.put(record("computer-00000002"))]);
  await store.update("computer-00000001", { label: "Mail" });
  expect((await store.all()).map((c) => c.label).sort()).toEqual(["Mail", "computer-00000002"]);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  await store.remove("computer-00000002");
  expect(await store.all()).toHaveLength(1);
  expect(store.get("computer-99999999")).rejects.toThrow();
});
