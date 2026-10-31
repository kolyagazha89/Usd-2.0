import React, { act } from "react";
import assert from "node:assert/strict";
import { createRoot } from "react-dom/client";
import { AdminShell } from "../../src/admin/AdminShell";

export async function runSidebarWorkflow() {
  const root = createRoot(document.getElementById("root")!);
  let navigated = "";
  const props = {
    user: { id: "admin", role: "ADMIN", email: "admin@example.invalid" } as any,
    go: (path: string) => { navigated = path; },
    mobileOpen: false,
    setMobileOpen: () => {},
    onLogout: async () => {},
    PageContent: () => <div>Admin page</div>,
    roleName: { ADMIN: "Администратор", PARTICIPANT: "Участник" } as any,
    cacheBrandLogo: () => {},
  };
  const renderAt = async (path: string) => {
    await act(async () => root.render(<AdminShell {...props} path={path} />));
  };
  await renderAt("/admin/users");
  const menu = document.querySelector(".sidebar > nav")!;
  assert.equal(menu.getAttribute("aria-label"), "Основное меню");
  assert.equal(menu.querySelectorAll('.sidebar-section-toggle[aria-expanded="true"]').length, 1,
    "only the active group is open by default");
  const users = menu.querySelector('.nav-item[aria-current="page"]') as HTMLButtonElement;
  assert.match(users.textContent!, /Пользователи и доступы/);
  assert.equal(users.classList.contains("active"), true);

  const competitions = [...menu.querySelectorAll<HTMLButtonElement>(".sidebar-section-toggle")]
    .find(el => el.textContent?.includes("Соревнования"))!;
  assert.equal(competitions.getAttribute("aria-expanded"), "false");
  await act(async () => competitions.click());
  assert.equal(competitions.getAttribute("aria-expanded"), "true");
  const inspections = [...menu.querySelectorAll<HTMLButtonElement>(".nav-item")]
    .find(el => el.textContent?.includes("Инспекции"))!;
  await act(async () => inspections.click());
  assert.equal(navigated, "/admin/inspections");
  await act(async () => competitions.click());
  assert.equal(competitions.getAttribute("aria-expanded"), "false");
  await renderAt("/admin/inspections");
  assert.equal(competitions.getAttribute("aria-expanded"), "true", "navigating to an active closed group reopens it");
  assert.match(menu.querySelector('[aria-current="page"]')?.textContent ?? "", /Инспекции/);
  await act(async () => root.unmount());
}
