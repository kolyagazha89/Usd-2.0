import React, { act } from "react";
import { createRoot } from "react-dom/client";
import assert from "node:assert/strict";
import HistoricalPage from "../../src/admin/HistoricalPage";
const Frame = ({ children, action }: any) => (
    <div>
      {action}
      {children}
    </div>
  ),
  ErrorPanel = ({ message, retry }: any) => (
    <div role="alert">
      {message}
      <button onClick={retry}>Повторить</button>
    </div>
  );
export async function runHistoryWorkflow() {
  const root = createRoot(document.getElementById("root")!),
    state = globalThis as any;
  const flush = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  await act(async () =>
    root.render(
      <HistoricalPage
        PageFrame={Frame}
        ErrorPanel={ErrorPanel}
        LoadingPage={() => <p>Loading</p>}
        Empty={() => null}
        PanelTitle={Frame}
        EntityDetailModal={Frame}
        enumLabel={(x) => String(x)}
        formatDate={(x) => x}
      />,
    ),
  );
  await flush();
  assert.equal(state.__historyGets.length, 1);
  assert.ok(document.querySelector('[role="alert"]'));
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Повторить")!
      .click(),
  );
  await flush();
  assert.equal(document.querySelectorAll("tbody tr").length, 50);
  assert.ok(
    [...document.querySelectorAll("button")].some((b) =>
      b.textContent?.includes("Подтвердить все (125)"),
    ),
  );
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Далее")!
      .click(),
  );
  await flush();
  assert.match(state.__historyGets.at(-1), /page=2/);
  const select = document.querySelector("select")!;
  await act(async () => {
    select.value = "2025";
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await flush();
  assert.match(state.__historyGets.at(-1), /page=1/);
  assert.match(state.__historyGets.at(-1), /season=2025/);
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.includes("Подтвердить все (125)"))!
      .click(),
  );
  await flush();
  assert.equal(state.__historyPosts.length, 0);
  await act(async () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent === "Подтвердить")!
      .click(),
  );
  await flush();
  assert.equal(state.__historyPosts.length, 2);
  assert.ok(
    state.__historyPosts.every(
      (p: string) => p === "/historical-results/verify-all?season=2025",
    ),
  );
  assert.match(document.body.textContent!, /Подтверждено результатов: 125/);
  assert.ok(
    ![...document.querySelectorAll("button")].some((b) =>
      b.textContent?.includes("Подтвердить все"),
    ),
  );
  await act(async () => root.unmount());
}
