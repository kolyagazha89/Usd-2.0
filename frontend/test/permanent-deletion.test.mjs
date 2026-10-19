import test from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
test("permanent deletion requires exact typed confirmation and refresh after a stale preview", async () => {
  const base = path.dirname(fileURLToPath(import.meta.url)),
    scratch = await mkdtemp(path.join(base, ".deletion-"));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://usd.test/admin/participants",
  });
  const names = [
    "window",
    "document",
    "HTMLElement",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = new Map(
    names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  try {
    for (const k of names.slice(0, 3)) globalThis[k] = dom.window[k];
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.__deleteCalls = 0;
    const outfile = path.join(scratch, "workflow.mjs");
    await build({
      entryPoints: [path.join(base, "fixtures/permanent-deletion.tsx")],
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      outfile,
      packages: "external",
      loader: { ".css": "empty" },
      plugins: [
        {
          name: "mock-api",
          setup(build) {
            build.onLoad({ filter: /[\\/]api\.ts$/ }, () => ({
              loader: "ts",
              contents: `export const apiGet=async()=>({label:'Иванов Иван',fingerprint:'fresh-preview',counts:{registrations:2,results:2},linkedAccount:'test@example.invalid'});export const apiPost=async(path,body)=>{globalThis.__deleteCalls++;globalThis.__deletePayload=body;if(globalThis.__deleteFail)throw Error('Данные изменились');return {success:true,storageCleanupPending:false}};`,
            }));
          },
        },
      ],
    });
    const workflow = await import(pathToFileURL(outfile).href);
    await workflow.runDeletionWorkflow();
  } finally {
    dom.window.close();
    for (const [k, d] of previous) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    for (const k of ["__deleteCalls", "__deletePayload", "__deleteFail"])
      delete globalThis[k];
    await rm(scratch, { recursive: true, force: true });
  }
});
