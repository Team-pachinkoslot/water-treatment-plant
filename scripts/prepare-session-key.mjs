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
// アップデート(再デプロイ)をまたいで回答データを引き継ぐには、固定の AQUA_SESSION_KEY が必要。
if ((process.env.VERCEL || process.env.CI) && !process.env.AQUA_SESSION_KEY) {
  console.warn([
    "",
    "WARNING: AQUA_SESSION_KEY is not set.",
    "  このビルドは使い捨ての鍵で暗号化するため、次のアップデート(再デプロイ)後に",
    "  受講者の保存済み回答データを読み込めなくなります。",
    "  `openssl rand -hex 32` で生成した値を環境変数 AQUA_SESSION_KEY に登録してください。",
    "",
  ].join("\n"));
}
