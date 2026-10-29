import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import manifest from "../src/app/manifest";

function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const stored: string[] = [];
  const responses = new Map<string, Response>();
  const notifications: { title: string; options: any }[] = [];
  let skipped = 0,
    focused = 0,
    opened = "";
  let online = true;
  let cacheControl = "public, max-age=31536000, immutable";
  let fetched = 0;
  const cache = {
    addAll: async (urls: string[]) => {
      stored.push(...urls);
    },
    put: async (request: { url: string }, response: Response) => {
      stored.push(request.url);
      responses.set(request.url, response);
    },
    keys: async () => [],
  };
  const self = {
    location: { origin: "https://tasks.example.test" },
    addEventListener: (type: string, handler: (event: any) => void) =>
      handlers.set(type, handler),
    skipWaiting: async () => {
      skipped++;
    },
    registration: {
      navigationPreload: { enable: async () => {} },
      showNotification: async (title: string, options: any) => {
        notifications.push({ title, options });
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => [
        {
          url: "https://tasks.example.test/?view=goals",
          focus: async () => {
            focused++;
          },
        },
      ],
      openWindow: async (url: string) => {
        opened = url;
      },
    },
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    URL,
    Response,
    Promise,
    fetch: async () => {
      if (!online) throw Error("offline");
      fetched++;
      return Object.defineProperty(
        new Response("private account content", {
          headers: { "Cache-Control": cacheControl },
        }),
        "type",
        { value: "basic" },
      );
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async (value: string | { url: string }) => {
        const url = typeof value === "string" ? value : value.url;
        return url === "/offline.html"
          ? new Response("generic offline screen")
          : responses.get(url)?.clone();
      },
    },
  });
  function fetchRequest(path: string, method = "GET", mode = "cors") {
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { url: new URL(path, self.location.origin).href, method, mode },
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
      preloadResponse: Promise.resolve(undefined),
    });
    return response;
  }
  async function event(type: string, fields: Record<string, unknown> = {}) {
    let result: Promise<unknown> | undefined;
    handlers.get(type)!({
      ...fields,
      waitUntil: (value: Promise<unknown>) => {
        result = value;
      },
    });
    await result;
  }
  return {
    stored,
    notifications,
    fetchRequest,
    event,
    setOffline: () => {
      online = false;
    },
    setCacheControl: (value: string) => {
      cacheControl = value;
    },
    stats: () => ({ skipped, focused, opened, fetched }),
  };
}

test("PWA caches public assets but never stores account pages, API reads or mutations", async () => {
  const app = worker();
  await app.event("install");
  assert.ok(app.stored.includes("/offline.html"));
  assert.ok(
    app.stored.every(
      (path) => path === "/offline.html" || path.startsWith("/icons/"),
    ),
  );
  for (const path of [
    "/api/workspace",
    "/api/push",
    "/api/account",
    "/api/commands",
    "/?view=today&_rsc=private",
    "/login",
    "/api/export?asset=/_next/static/chunks/3i06ah6_4t5-8.js",
  ]) {
    assert.equal(app.fetchRequest(path), undefined);
    assert.equal(app.fetchRequest(path, "POST"), undefined);
  }
  assert.equal(
    app.fetchRequest("https://other.example/_next/static/chunks/abcdef123.js"),
    undefined,
  );
  const page = await app.fetchRequest("/?view=goals", "GET", "navigate");
  assert.equal(await page?.text(), "private account content");
  assert.ok(
    !app.stored.some(
      (path) => path.includes("view=") || path.startsWith("/api/"),
    ),
  );
  app.setOffline();
  const offline = await app.fetchRequest("/?view=today", "GET", "navigate");
  assert.equal(await offline?.text(), "generic offline screen");
});

test("PWA caches actual immutable Next 16 Turbopack assets and excludes dev responses", async () => {
  const app = worker();
  // These filenames come from this app's production Next 16 build.
  for (const path of [
    "/_next/static/chunks/3i06ah6_4t5-8.js",
    "/_next/static/chunks/turbopack-2c3mg3r-05n1w.js",
    "/_next/static/chunks/2vdpbn5mq-9ru.css",
    "/_next/static/chunks/123-abcdef123456.js",
    "/_next/static/media/8d697b304b401681-s.woff2",
  ]) {
    const response = await app.fetchRequest(path);
    assert.equal(response?.status, 200, path);
    assert.ok(app.stored.includes(`https://tasks.example.test${path}`), path);
    const fetched = app.stats().fetched;
    await app.fetchRequest(path);
    assert.equal(
      app.stats().fetched,
      fetched,
      `${path} should use its cached response`,
    );
    assert.equal(app.fetchRequest(path, "POST"), undefined);
  }
  for (const path of [
    "/_next/static/development/_buildManifest.js",
    "/_next/static/chunks/app/page.js",
    "/_next/static/chunks/main-app.js",
    "/_next/static/chunks/3i06ah6_4t5-8.js.map",
  ])
    assert.equal(app.fetchRequest(path), undefined, path);
  app.setCacheControl("no-store, must-revalidate");
  const devHash = "/_next/static/chunks/15mh2xl6ex2mo.js";
  await app.fetchRequest(devHash);
  assert.ok(!app.stored.includes(`https://tasks.example.test${devHash}`));
});

test("development never registers a worker and removes only this app's prior worker/cache", async () => {
  const environment = process.env as Record<string, string | undefined>;
  const previousEnv = environment.NODE_ENV;
  environment.NODE_ENV = "development";
  const { registerAppWorker, clearDevelopmentAppWorker } =
    await import("../src/lib/pwa-client");
  if (previousEnv === undefined) delete environment.NODE_ENV;
  else environment.NODE_ENV = previousEnv;
  let registered = 0,
    unregistered = 0,
    cleared = 0;
  const deleted: string[] = [];
  let scriptURL = "https://tasks.example.test/sw.js";
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      serviceWorker: {
        register: async () => {
          registered++;
        },
        getRegistration: async (scope: string) => {
          assert.equal(scope, "/");
          return {
            active: {
              scriptURL,
              postMessage: (message: { type: string }) => {
                assert.equal(message.type, "CLEAR_APP_CACHES");
                cleared++;
              },
            },
            unregister: async () => {
              unregistered++;
            },
          };
        },
      },
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://tasks.example.test" },
      caches: {
        keys: async () => ["tasks-public-old", "other-app-cache"],
        delete: async (name: string) => {
          deleted.push(name);
          return true;
        },
      },
    },
  });
  try {
    await assert.rejects(registerAppWorker(), /available in production/);
    assert.equal(registered, 0);
    await clearDevelopmentAppWorker();
    assert.equal(unregistered, 1);
    assert.equal(cleared, 1);
    assert.deepEqual(deleted, ["tasks-public-old"]);
    scriptURL = "https://tasks.example.test/another-worker.js";
    await clearDevelopmentAppWorker();
    assert.equal(unregistered, 1, "an unrelated worker must remain registered");
    assert.equal(cleared, 1);
  } finally {
    if (previousNavigator)
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("PWA updates require acceptance and push clicks preserve an open editor", async () => {
  const app = worker();
  await app.event("install");
  await app.event("activate");
  assert.equal(app.stats().skipped, 0);
  await app.event("message", { data: { type: "ACTIVATE_UPDATE" } });
  assert.equal(app.stats().skipped, 1);
  await app.event("push", {
    data: {
      json: () => ({
        title: "Daily summary",
        body: "2 completed today · 8 pending",
        url: "https://other.example/",
      }),
    },
  });
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].options.data.url, "/?view=today");
  await app.event("notificationclick", {
    notification: { close: () => {}, data: { url: "/?view=today" } },
  });
  assert.equal(app.stats().focused, 1);
  assert.equal(app.stats().opened, "");
});

test("PWA manifest provides standalone install metadata and correctly sized PNG assets", () => {
  const data = manifest();
  assert.equal(data.display, "standalone");
  assert.equal(data.scope, "/");
  assert.equal(data.start_url, "/?view=today");
  for (const size of [192, 512]) {
    const icon = data.icons?.find(
      (item) => item.sizes === `${size}x${size}` && item.purpose === "any",
    );
    assert.ok(icon);
    const png = readFileSync("public" + icon.src);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.ok(data.icons?.some((item) => item.purpose === "maskable"));
});
