import { expect, test } from "bun:test";
import { named, narrate, toMarkdown, type Step } from "../src/recordings.ts";

const step = (s: Partial<Step>): Step => ({ n: 1, time: 0, kind: "click", shot: "0001.jpg", ...s });

test("names what was clicked by role, label or text", () => {
  expect(named({ tag: "a", text: "Jobs", href: "https://x.test/jobs" })).toBe('link "Jobs" (to https://x.test/jobs)');
  expect(named({ tag: "input", type: "search", label: "Search" })).toBe('search field "Search"');
  expect(named({ tag: "div", selector: "main > div" })).toBe("div `main > div`");
  expect(named(undefined)).toBe("the page");
});

test("narrates each kind of step", () => {
  expect(narrate(step({ kind: "page", how: "typed", url: "https://x.test/" }))).toBe("Page opened (typed): https://x.test/");
  expect(narrate(step({ kind: "click", at: { x: 10, y: 20 }, url: "https://x.test/", target: { tag: "button", text: "Go" } }))).toBe('Clicked button "Go" at 10,20 on x.test');
  expect(narrate(step({ kind: "type", value: "•••", target: { tag: "input", type: "password", label: "Password" } }))).toBe('Typed "•••" into password field "Password"');
  expect(narrate(step({ kind: "scroll", by: -300 }))).toBe("Scrolled up 300px in the page");
  expect(narrate(step({ kind: "note", text: "only this week" }))).toBe("Note from the person recording: only this week");
  expect(narrate(step({ kind: "something-new" }))).toBe("something-new");
});

test("writes a recording as a numbered list", () => {
  const md = toMarkdown({
    name: "Read jobs",
    computer: "computer-0000abcd",
    startedAt: null,
    endedAt: "2026-10-24T12:00:00.000Z",
    screen: { width: 1024, height: 640 },
    steps: [step({ kind: "key", key: "Enter" })],
  });
  expect(md).toStartWith("# Read jobs\n");
  expect(md).toContain("1. Pressed Enter (0001.jpg)");
});
