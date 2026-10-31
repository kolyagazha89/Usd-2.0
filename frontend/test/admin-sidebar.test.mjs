import test from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

test("admin sidebar isolates active navigation and persists section disclosure", async () => {
  const base = path.dirname(fileURLToPath(import.meta.url));
  const scratch = await mkdtemp(path.join(base, ".sidebar-"));
  const dom = new JSDOM('<div id="root"></div>', { url: "https://usd.test/admin/users" });
  const names = ["window", "document", "HTMLElement", "localStorage", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = new Map(names.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  try {
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.localStorage = dom.window.localStorage;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const outfile = path.join(scratch, "sidebar.mjs");
    await build({
      entryPoints: [path.join(base, "fixtures/admin-sidebar.tsx")],
      bundle: true, platform: "node", format: "esm", jsx: "automatic",
      outfile, packages: "external",
      plugins: [{
        name: "mock-api",
        setup(build) {
          build.onLoad({ filter: /[\\/]api\.ts$/ }, () => ({
            loader: "ts", contents: "export const getPublicSiteAsset=async()=>null;",
          }));
        },
      }],
    });
    const module = await import(pathToFileURL(outfile).href);
    await module.runSidebarWorkflow();
  } finally {
    dom.window.close();
    for (const [k, desc] of previous) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
    await rm(scratch, { recursive: true, force: true });
  }
});
