import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// One private key per build, shared by all deployed functions. Never log it.
// Set AQUA_SESSION_KEY to retain sessions across redeployments.
const directory = resolve(".aqua");
const path = resolve(directory, "session-key.json");
if (!existsSync(path)) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify({ key: randomBytes(32).toString("hex") }), { flag: "wx", mode: 0o600 });
}
console.log("Prepared server-only exercise session key.");
