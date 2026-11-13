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

export async function runVenueSidebarWorkflow() {
  (window as Window & {__USD_VENUE_MODE__?:boolean}).__USD_VENUE_MODE__=true;
  const root=createRoot(document.getElementById("root")!);
  let navigated="";
  const user={id:"staff",role:"ADMIN",email:"staff@example.invalid"} as any;
  const props={
    user,go:(path:string)=>{navigated=path;},mobileOpen:false,
    setMobileOpen:()=>{},onLogout:async()=>{},
    PageContent:()=> <div>Event day workspace</div>,
    roleName:{ADMIN:"Администратор",PARTICIPANT:"Участник"} as any,
    cacheBrandLogo:()=>{},
  };
  try {
    await act(async()=>root.render(<AdminShell {...props} path="/admin/event-day"/>));
    assert.match(document.querySelector(".venue-admin-banner")?.textContent??"","ЛОКАЛЬНЫЙ ЭТАП");
    assert.equal(document.querySelector(".admin-site-switch"),null,"no public site switch during offline judging");
    assert.equal(document.querySelector(".admin-member-switch"),null,"no participant workspace switch");
    assert.equal(document.querySelector(".topbar .role-pill")?.textContent,"Администратор");
    const nav=document.querySelector(".sidebar > nav")!;
    const toggles=[...nav.querySelectorAll<HTMLButtonElement>(".sidebar-section-toggle")];
    assert.equal(toggles.length,2,"event workspace contains only competition and car/participant groups");
    for(const toggle of toggles){
      if(toggle.getAttribute("aria-expanded")==="false")await act(async()=>toggle.click());
    }
    const items=[...nav.querySelectorAll<HTMLButtonElement>(".nav-item")];
    const labels=items.map(item=>item.textContent?.trim());
    assert.deepEqual(labels,[
      "День соревнований","Регистрации","Инспекции","Результаты","Участники","Автомобили",
    ]);
    const brand=document.querySelector<HTMLButtonElement>(".brand-button")!;
    await act(async()=>brand.click());
    assert.equal(navigated,"/admin/event-day","logo must stay inside event desk on LAN");
  } finally {
    await act(async()=>root.unmount());
    delete (window as Window & {__USD_VENUE_MODE__?:boolean}).__USD_VENUE_MODE__;
  }
}
