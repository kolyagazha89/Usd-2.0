// Run only on the deployment host. Writes a new owner-only file; never prints keys.
import { createRequire } from "node:module";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
const output = process.argv[2];
if (!output || !path.isAbsolute(output))
  throw new Error(
    "Provide an absolute output file on the deployment host outside this checkout",
  );
const parent = await realpath(path.dirname(output));
const repository = await realpath(path.join(import.meta.dirname, ".."));
if (parent === repository || parent.startsWith(repository + path.sep))
  throw new Error("VAPID secrets must remain outside the source checkout");
const webPush = createRequire(path.join(repository, "backend/package.json"))(
  "web-push",
);
const keys = webPush.generateVAPIDKeys();
const file = await open(path.join(parent, path.basename(output)), "wx", 0o600);
try {
  await file.writeFile(
    "PUSH_ENABLED=false\nPUSH_VAPID_PUBLIC_KEY=" +
      keys.publicKey +
      "\nPUSH_VAPID_PRIVATE_KEY=" +
      keys.privateKey +
      "\n",
  );
} finally {
  await file.close();
}
console.log(
  "VAPID keys written to the requested owner-only file. Configure PUSH_VAPID_SUBJECT on the host before enabling.",
);
