import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("push worker never intercepts private requests and constrains notification payloads and clicks", async () => {
  const source = await readFile(
    new URL("../public/usd-push-sw.js", import.meta.url),
    "utf8",
  );
  const handlers = {},
    shown = [],
    opened = [],
    focused = [];
  const self = {
    location: { origin: "https://usd.test" },
    registration: { showNotification: async (...args) => shown.push(args) },
    addEventListener: (name, handler) => (handlers[name] = handler),
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => [
        {
          url: "https://usd.test/participant",
          focus: async () => focused.push(true),
          navigate: async (url) => opened.push(url),
        },
      ],
      openWindow: async (url) => opened.push(url),
    },
  };
  vm.runInNewContext(source, { self, URL });
  assert.equal(
    handlers.fetch,
    undefined,
    "private API/auth responses must never enter a worker cache",
  );
  const emit = async (name, event) => {
    let pending;
    handlers[name]({ ...event, waitUntil: (value) => (pending = value) });
    await pending;
  };
  await emit("push", {
    data: {
      json: () => ({
        title: "USD",
        body: "Открыта регистрация",
        path: "//evil.test",
        tag: "t",
      }),
    },
  });
  assert.equal(shown[0][1].data.path, "/participant");
  await emit("notificationclick", {
    notification: { data: { path: "https://evil.test/steal" }, close() {} },
  });
  assert.deepEqual(opened, ["https://usd.test/participant"]);
  assert.equal(focused.length, 1);
  await emit("notificationclick", {
    notification: { data: { path: "/stages/123" }, close() {} },
  });
  assert.equal(opened.at(-1), "https://usd.test/stages/123");
  await emit("push", {
    data: {
      json: () => {
        throw new Error("malformed");
      },
    },
  });
  assert.equal(shown.at(-1)[0], "USD");
  for (const path of [
    "/news/%2e%2e/admin",
    "/participant/../../admin",
    "/admin",
    "/stages\\evil",
    "/news?x=1\n",
  ]) {
    await emit("push", { data: { json: () => ({ path }) } });
    assert.equal(shown.at(-1)[1].data.path, "/participant");
  }
});
