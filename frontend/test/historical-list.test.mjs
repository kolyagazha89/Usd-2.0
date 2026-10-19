import test from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
test("history loads on entry, recovers after fetch failure, pages, scopes seasons and confirms all chunks", async () => {
  const base = path.dirname(fileURLToPath(import.meta.url)),
    scratch = await mkdtemp(path.join(base, ".history-"));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://usd.test/admin/historical-results",
  });
  const names = [
    "window",
    "document",
    "sessionStorage",
    "HTMLElement",
    "IS_REACT_ACT_ENVIRONMENT",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "ResizeObserver",
  ];
  const previous = new Map(
    names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  try {
    for (const k of names.slice(0, 4)) globalThis[k] = dom.window[k];
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.scrollTo = () => {};
    globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    globalThis.cancelAnimationFrame = clearTimeout;
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    globalThis.__historyGets = [];
    globalThis.__historyPosts = [];
    const outfile = path.join(scratch, "workflow.mjs");
    await build({
      entryPoints: [path.join(base, "fixtures/historical-list.tsx")],
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      outfile,
      packages: "external",
      plugins: [
        {
          name: "mock-api",
          setup(build) {
            build.onLoad({ filter: /[\\/]api\.ts$/ }, () => ({
              loader: "ts",
              contents: `let pending=125;export const apiGet=async path=>{globalThis.__historyGets.push(path);if(globalThis.__historyGets.length===1)throw Error('Failed to fetch');const q=new URLSearchParams(path.split('?')[1]),page=Number(q.get('page'));return {items:Array.from({length:50},(_,i)=>({id:'r'+page+'-'+i,value:150,unit:'DB',verificationStatus:pending?'PENDING':'VERIFIED',registration:{participant:{lastName:'Тестовый',firstName:'Участник'},stage:{name:'Этап',season:{year:2025}}}})),total:125,pending,seasons:['2026','2025']}};export const apiPost=async path=>{globalThis.__historyPosts.push(path);const processed=Math.min(pending,100);pending-=processed;return {processed,remaining:pending}};export const listData=x=>x.items??[];`,
            }));
          },
        },
      ],
    });
    const workflow = await import(pathToFileURL(outfile).href);
    await workflow.runHistoryWorkflow();
  } finally {
    dom.window.close();
    for (const [k, d] of previous) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    delete globalThis.__historyGets;
    delete globalThis.__historyPosts;
    await rm(scratch, { recursive: true, force: true });
  }
});
