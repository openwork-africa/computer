import { expect, test } from "bun:test";
import { assertId } from "../src/config.ts";
import { keyName } from "../src/desktop.ts";

test("maps common key names to xdotool's", () => {
  expect(keyName("enter")).toBe("Return");
  expect(keyName("PageDown")).toBe("Next");
  expect(keyName("cmd")).toBe("ctrl");
  expect(keyName("f5")).toBe("F5");
  expect(keyName("l")).toBe("l");
});

test("only computer ids reach the container runtime", () => {
  expect(assertId("computer-0123abcd")).toBe("computer-0123abcd");
  expect(() => assertId("me-workspace")).toThrow();
  expect(() => assertId("computer-0123abcd; rm -rf /")).toThrow();
});
