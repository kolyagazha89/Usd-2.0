import React, { act } from "react";
import { createRoot } from "react-dom/client";
import assert from "node:assert/strict";
import { PermanentDeletionDialog } from "../../src/admin/PermanentDeletionDialog";
export async function runDeletionWorkflow() {
  const root = createRoot(document.getElementById("root")!);
  let closed = 0,
    deleted = 0;
  const state = globalThis as any;
  const flush = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  };
  const render = () =>
    root.render(
      <PermanentDeletionDialog
        kind="participant"
        id="person-id"
        onClose={() => closed++}
        onDeleted={() => deleted++}
      />,
    );
  await act(async () => render());
  await flush();
  const dialog = document.querySelector('[role="dialog"]')!;
  assert.ok(dialog);
  assert.equal(dialog.closest(".permanent-delete-overlay")?.parentElement, document.body, "the overlay must cover the full viewport, outside the admin scrolling shell");
  assert.equal(document.querySelector("#root")?.querySelector('[role="dialog"]'), null);
  assert.equal(dialog.getAttribute("aria-describedby"), "permanent-delete-description");
  assert.equal(document.activeElement?.textContent, "Отмена");
  assert.match(document.body.textContent!, /Иванов Иван/);
  assert.match(document.body.textContent!, /Учётная запись/);
  const button = () =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Удалить навсегда",
    )!;
  assert.equal(button().disabled, true);
  const input = document.querySelector("input")!;
  const type = async (value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await flush();
  };
  await type("Иванов");
  assert.equal(button().disabled, true);
  assert.equal(state.__deleteCalls, 0);
  await type("Иванов Иван");
  assert.equal(button().disabled, false);
  state.__deleteFail = true;
  await act(async () => button().click());
  await flush();
  assert.equal(state.__deleteCalls, 1);
  assert.equal(deleted, 0);
  assert.ok(document.querySelector('[role="alert"]'));
  assert.equal(button().disabled, true);
  const retry = [...document.querySelectorAll("button")].find(
    (b) => b.textContent === "Обновить подтверждение",
  )!;
  await act(async () => retry.click());
  await flush();
  assert.equal(document.querySelector("input")!.value, "");
  assert.equal(button().disabled, true);
  state.__deleteFail = false;
  const currentInput = document.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!.call(currentInput, "Иванов Иван");
    currentInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await flush();
  await act(async () => button().click());
  await flush();
  assert.equal(deleted, 1);
  assert.equal(state.__deleteCalls, 2);
  assert.deepEqual(state.__deletePayload, {
    confirmation: "Иванов Иван",
    fingerprint: "fresh-preview",
  });
  await act(async () => root.unmount());
  assert.equal(document.querySelector('.permanent-delete-overlay'), null);
  assert.equal(closed, 0);
}
