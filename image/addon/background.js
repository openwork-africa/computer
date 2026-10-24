// Every step goes to the recorder in this computer (computer-recorder, 127.0.0.1:6081), which keeps it only while a
// recording is on and takes a screenshot with it. Page changes are noted here; what is done on a page comes from
// content.js.
const RECORDER = "http://127.0.0.1:6081/step";

const send = (step) => fetch(RECORDER, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(step) }).catch(() => {});

browser.runtime.onMessage.addListener((step, sender) => {
  send({ ...step, url: sender.url, title: sender.tab?.title });
});

// A page opened by typing an address, going back or forward, or reloading. Pages opened by a click follow the click
// step; LinkedIn and other apps change the address without loading (history), noted as "page" too.
browser.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0 || d.url.startsWith("about:") || d.url.startsWith("moz-extension:")) return;
  const how = d.transitionQualifiers.includes("forward_back") ? "back-or-forward" : d.transitionType;
  send({ kind: "page", how, url: d.url });
});
browser.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId === 0) send({ kind: "page", how: "in-page", url: d.url });
});

// The open tabs, kept up to date in /run/computer/tabs.json (by the recorder, always, not only while recording), so
// the SDK (src/desktop.ts) can list them and switch by name.
const TABS = "http://127.0.0.1:6081/tabs";
let tabsTimer = 0;
const sendTabs = () => {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(async () => {
    const tabs = await browser.tabs.query({ currentWindow: true });
    const list = tabs.map((t) => ({ index: t.index, id: t.id, active: t.active, title: t.title, url: t.url }));
    fetch(TABS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(list) }).catch(() => {});
  }, 200);
};
for (const e of [browser.tabs.onActivated, browser.tabs.onCreated, browser.tabs.onRemoved, browser.tabs.onMoved, browser.tabs.onUpdated]) e.addListener(sendTabs);
sendTabs();
