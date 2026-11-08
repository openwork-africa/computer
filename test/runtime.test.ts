import { expect, test } from "bun:test";
import { CommandTimeoutError, ComputerCommandQueue, ComputerUnhealthyError, ContainerRuntime, OutputLimitError } from "../src/runtime.ts";

test("bounds a command that never exits and reaps it", async () => {
  const runtime = new ContainerRuntime(process.execPath);
  await expect(runtime.cli(["-e", "setInterval(() => {}, 1_000)"], undefined, { timeoutMs: 25 })).rejects.toBeInstanceOf(CommandTimeoutError);
});

test("caps command output", async () => {
  const runtime = new ContainerRuntime(process.execPath);
  await expect(runtime.cli(["-e", "process.stdout.write('x'.repeat(4096))"], undefined, { maxStdoutBytes: 32 })).rejects.toBeInstanceOf(OutputLimitError);
});

test("serializes computer commands and opens a circuit", async () => {
  const queue = new ComputerCommandQueue();
  const order: string[] = [];
  const first = queue.run("computer-0123abcd", async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push("first");
  });
  const second = queue.run("computer-0123abcd", async () => {
    order.push("second");
  });
  await Promise.all([first, second]);
  expect(order).toEqual(["first", "second"]);

  queue.markUnhealthy();
  await expect(queue.run("computer-0123abcd", async () => {})).rejects.toBeInstanceOf(ComputerUnhealthyError);
  await queue.run("computer-0123abcd", async () => order.push("recovery"), true);
  expect(order.at(-1)).toBe("recovery");
});
