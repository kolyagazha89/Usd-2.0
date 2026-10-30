import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const { chromium } = createRequire(
  path.join(process.env.USD_BROWSER_TOOLING, "package.json"),
)("playwright");
const output = path.resolve(
  process.env.PUSH_BROWSER_OUTPUT ?? "/tmp/usd-push-browser-qa",
);
await mkdir(output, { recursive: true });
const dist = path.resolve("frontend/dist");
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(dist, "." + name);
    if (!file.startsWith(dist + path.sep) && file !== dist) {
      res.writeHead(403).end();
      return;
    }
    let body,
      ext = path.extname(file);
    try {
      body = await readFile(file);
    } catch {
      body = await readFile(path.join(dist, "index.html"));
      ext = ".html";
    }
    res.writeHead(200, {
      "Content-Type":
        {
          ".js": "text/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".png": "image/png",
          ".webmanifest": "application/manifest+json",
        }[ext] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.USD_BROWSER_EXECUTABLE || undefined,
  args: ["--no-sandbox"],
});
const results = [];
async function scenario(width, mode = "participant", ios = false) {
  const context = await browser.newContext({
    viewport: { width, height: 920 },
  });
  let subscriptions = [],
    calls = [],
    announcements = [];
  await context.addInitScript(
    ({ ios }) => {
      window.__push = {
        prompts: 0,
        subscribes: 0,
        unsubscribes: 0,
        permission: "granted",
        gestures: [],
      };
      let subscription = null;
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          requestPermission: async () => {
            window.__push.prompts++;
            window.__push.gestures.push(navigator.userActivation.isActive);
            return window.__push.permission;
          },
        },
      });
      Object.defineProperty(window, "PushManager", {
        configurable: true,
        value: function () {},
      });
      const manager = {
        getSubscription: async () => subscription,
        subscribe: async () => {
          window.__push.subscribes++;
          subscription = {
            toJSON: () => ({
              endpoint: "https://fcm.googleapis.com/browser-fixture",
              keys: { p256dh: "fixture", auth: "fixture" },
            }),
            unsubscribe: async () => {
              window.__push.unsubscribes++;
              subscription = null;
              return true;
            },
          };
          return subscription;
        },
      };
      const registration = { pushManager: manager };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: async () => registration,
          ready: Promise.resolve(registration),
          getRegistration: async () => registration,
        },
      });
      if (ios) {
        Object.defineProperty(navigator, "userAgent", {
          configurable: true,
          value: "iPhone OS 17_0",
        });
        Object.defineProperty(navigator, "standalone", {
          configurable: true,
          value: false,
        });
      }
    },
    { ios },
  );
  const user = {
    id: "fixture-user",
    email: "fixture@example.test",
    role: mode === "admin" ? "ADMIN" : "PARTICIPANT",
    participantId: "fixture-participant",
    ...(mode === "viewer"
      ? {
          customRoleId: "fixture-role",
          customRole: { permissions: { notifications: ["view"] } },
        }
      : {}),
  };
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === base) return route.continue();
    if (url.hostname !== "api.usd-russia.ru")
      return route.abort("blockedbyclient");
    const p = url.pathname,
      method = request.method();
    const payload = request.postDataJSON();
    let data = [];
    if (p === "/auth/refresh") data = { accessToken: "browser-fixture", user };
    else if (p === "/participants/me")
      data = {
        participant: {
          id: "fixture-participant",
          firstName: "Иван",
          lastName: "Тестовый",
          city: "Тюмень",
          phone: "+79000000000",
          isPublic: true,
        },
      };
    else if (p === "/auth/newsletter-consent") data = { consent: false };
    else if (p === "/auth/legal-consent") data = { legalReady: false };
    else if (p.includes("historical-final-configuration"))
      data = { required: false };
    else if (p.startsWith("/media/")) data = { url: "" };
    else if (p.startsWith("/site-settings"))
      data = {
        settings: {
          branding: { siteName: "USD" },
          legal: {},
          homepage: { blocks: [] },
          catalogs: {},
          contacts: {},
          partners: [],
        },
      };
    else if (p === "/push/subscriptions" && method === "GET")
      data = {
        enabled: true,
        publicKey: "BAAB_w",
        consentVersion: "web-push-v1",
        subscriptions,
      };
    else if (p === "/push/subscriptions" && method === "PUT") {
      calls.push({ method, p, payload });
      const item = {
        ...payload,
        id: "fixture-device",
        createdAt: new Date().toISOString(),
        consentAt: new Date().toISOString(),
      };
      subscriptions = [item];
      data = item;
    } else if (
      p === "/push/subscriptions/fixture-device" &&
      method === "PATCH"
    ) {
      calls.push({ method, p, payload });
      Object.assign(subscriptions[0], payload);
      data = { success: true };
    } else if (
      p === "/push/subscriptions/fixture-device" &&
      method === "DELETE"
    ) {
      calls.push({ method, p });
      subscriptions = [];
      data = { success: true };
    } else if (p === "/push/admin/messages" && method === "GET")
      data = { enabled: true, subscribers: 2, messages: announcements };
    else if (p === "/push/admin/messages" && method === "POST") {
      calls.push({ method, p, payload });
      announcements = [
        {
          ...payload,
          id: "message-fixture",
          category: "announcements",
          createdAt: new Date().toISOString(),
          _count: { deliveries: 2 },
          statuses: [{ status: "PENDING", count: 2 }],
        },
      ];
      data = { id: "message-fixture", status: "QUEUED" };
    } else if (!["GET", "HEAD", "OPTIONS"].includes(method))
      return route.abort("blockedbyclient");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(
      base +
        (mode === "participant"
          ? "/participant?tab=profile"
          : "/admin/notifications"),
    );
    await page
      .getByRole("heading", { name: "Push-уведомления", exact: true })
      .waitFor();
    assert.equal(await page.evaluate(() => window.__push.prompts), 0);
    if (ios) {
      await page.getByText(/добавьте USD на экран «Домой»/).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Подключить уведомления", exact: true })
          .count(),
        0,
      );
    } else if (mode === "participant") {
      const enable = page.getByRole("button", {
        name: "Подключить уведомления",
        exact: true,
      });
      await enable.waitFor();
      assert.equal(await enable.isDisabled(), true);
      await page.locator(".push-consent input").check();
      await page.evaluate(() => (window.__push.permission = "default"));
      await enable.click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Разрешение не получено" })
        .waitFor();
      assert.equal(calls.length, 0);
      assert.equal(await page.evaluate(() => window.__push.subscribes), 0);
      await page.evaluate(() => (window.__push.permission = "granted"));
      await enable.click();
      await page
        .getByText("Уведомления подключены для этого браузера.")
        .waitFor();
      assert.equal(calls[0].payload.consent, true);
      assert.equal(calls[0].payload.announcements, false);
      assert.ok(
        (await page.evaluate(() => window.__push.gestures)).every(Boolean),
        "native permission must originate in a click",
      );
      await page
        .locator(".push-device")
        .getByText("Новости и объявления USD")
        .click();
      await page.getByText("Предпочтения сохранены.").waitFor();
      assert.equal(calls.at(-1).payload.announcements, true);
      await page
        .getByRole("button", { name: "Отключить этот браузер", exact: true })
        .click();
      await page.getByText(/Согласие отозвано/).waitFor();
      assert.equal(subscriptions.length, 0);
      assert.equal(await page.evaluate(() => window.__push.unsubscribes), 1);
    } else if (mode === "viewer") {
      assert.equal(await page.locator(".notification-composer").count(), 0);
    } else {
      await page.getByLabel("Заголовок", { exact: true }).fill("Тест USD");
      await page
        .locator(".notification-composer textarea")
        .fill("Тестовое объявление");
      const submit = page.getByRole("button", {
        name: "Поставить в очередь",
        exact: true,
      });
      assert.equal(await submit.isDisabled(), true);
      await page.locator(".notification-confirm input").check();
      await submit.click();
      await page.getByText(/Объявление поставлено в очередь/).waitFor();
      assert.equal(calls.length, 1);
      assert.equal(calls[0].payload.confirmed, true);
      assert.match(calls[0].payload.requestKey, /^[a-f0-9-]{36}$/);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, "horizontal overflow");
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: path.join(
        output,
        mode + "-" + width + (ios ? "-ios" : "") + ".png",
      ),
      fullPage: true,
    });
    results.push({ width, mode, ios, passed: true });
  } finally {
    await context.close();
  }
}
try {
  for (const width of [1440, 390, 320]) {
    await scenario(width);
    await scenario(width, "admin");
  }
  await scenario(390, "participant", true);
  await scenario(1440, "viewer");
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      {
        scope:
          "Built app; synthetic API/native push fixtures; all remote requests intercepted; no provider sends",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: results.length, output }));
} finally {
  await browser.close();
  server.close();
}
