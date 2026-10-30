export type PushSupportFlags = {
  secure: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  ios: boolean;
  standalone: boolean;
};
export function getPushSupport(
  flags: PushSupportFlags,
): "insecure" | "install" | "unsupported" | "supported" {
  if (!flags.secure) return "insecure";
  if (flags.ios && !flags.standalone) return "install";
  if (!flags.serviceWorker || !flags.pushManager || !flags.notification)
    return "unsupported";
  return "supported";
}
export function browserPushSupport() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return getPushSupport({
    secure: window.isSecureContext,
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    ios,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  });
}
export function decodeVapidKey(key: string): Uint8Array<ArrayBuffer> {
  const value = atob(
    key
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(key.length / 4) * 4, "="),
  );
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}
