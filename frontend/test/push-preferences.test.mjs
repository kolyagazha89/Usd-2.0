import { test } from "node:test";
import assert from "node:assert/strict";
import { getPushSupport, decodeVapidKey } from "../src/push/push-support.ts";
test("unsupported browsers never offer permission and iOS explains installed Home Screen requirement", () => {
  assert.equal(
    getPushSupport({
      secure: true,
      serviceWorker: false,
      pushManager: false,
      notification: false,
      ios: false,
      standalone: false,
    }),
    "unsupported",
  );
  assert.equal(
    getPushSupport({
      secure: true,
      serviceWorker: true,
      pushManager: true,
      notification: true,
      ios: true,
      standalone: false,
    }),
    "install",
  );
  assert.equal(
    getPushSupport({
      secure: true,
      serviceWorker: true,
      pushManager: true,
      notification: true,
      ios: true,
      standalone: true,
    }),
    "supported",
  );
  assert.equal(
    getPushSupport({
      secure: false,
      serviceWorker: true,
      pushManager: true,
      notification: true,
      ios: false,
      standalone: false,
    }),
    "insecure",
  );
});
test("VAPID base64url becomes browser application server key bytes", () => {
  assert.deepEqual(Array.from(decodeVapidKey("BAAB_w")), [4, 0, 1, 255]);
});
