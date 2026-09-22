const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

async function main() {
  const handlers = {};
  const shown = [];
  const opened = [];
  const self = {
    location: { origin: "https://xpacebox.com.br" },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    registration: { showNotification: async (...args) => { shown.push(args); } },
    clients: { matchAll: async () => [], openWindow: async (url) => { opened.push(url); } },
  };
  vm.runInNewContext(readFileSync("public/xpace-push-sw.js", "utf8"), { self, URL });

  let pending;
  handlers.push({
    data: { json: () => ({ title: "Nova aula experimental", body: "Abra a agenda.", tag: "booking-1", url: "/xpace/app?tab=agenda&date=2026-09-22" }) },
    waitUntil: (promise) => { pending = promise; },
  });
  await pending;
  assert.equal(shown[0][0], "Nova aula experimental");
  assert.equal(shown[0][1].tag, "booking-1");

  handlers.notificationclick({
    notification: { data: { url: "/xpace/app?tab=agenda&date=2026-09-22" }, close: () => {} },
    waitUntil: (promise) => { pending = promise; },
  });
  await pending;
  assert.equal(opened[0], "https://xpacebox.com.br/xpace/app?tab=agenda&date=2026-09-22");
  handlers.notificationclick({
    notification: { data: { url: "https://other.example/" }, close: () => {} },
    waitUntil: () => { throw new Error("External links must not open"); },
  });
  assert.equal(opened.length, 1);
  console.log("XPACE push worker smoke: aviso e abertura segura da agenda OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
