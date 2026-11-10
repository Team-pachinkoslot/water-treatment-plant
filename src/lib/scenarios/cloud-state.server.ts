import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { LabError } from "./errors.server";

export const CLOUD_STATE_LIMIT = 300_000;
/** normal: 通常の演習 / practice: Blueだけの練習。保存先(Cookie・localStorage)を分け、互いの進捗に影響させない */
export type StateSlot = "normal" | "practice";
const CHECKPOINT_COOKIE = (slot: StateSlot) => (slot === "practice" ? "aqua_practice_checkpoint" : "aqua_checkpoint");
interface Checkpoint { digest: string; starts: number[]; expiresAt: number }
const HEX_KEY = /^[a-f0-9]{64}$/i;
/**
 * 暗号鍵の一覧。先頭が暗号化に使う現在の鍵、残りは復号だけに使う旧鍵。
 * アップデート(再デプロイ)で鍵を変えても保存済みの回答データを読めるよう、
 * 鍵を変えるときは旧鍵を AQUA_SESSION_KEY_PREVIOUS(カンマ区切り)へ移す。
 * 旧鍵で読めたデータは、次の保存時に現在の鍵で暗号化し直される。
 */
function keys(): Buffer[] {
  const configured = process.env.AQUA_SESSION_KEY?.trim();
  let fileKey: unknown;
  try { fileKey = JSON.parse(readFileSync(join(process.cwd(), ".aqua/session-key.json"), "utf8")).key; } catch { fileKey = undefined; }
  const current: unknown = configured || fileKey;
  if (current === undefined) throw new LabError("SESSION_KEY_NOT_CONFIGURED", "演習用の設定を読み込めません。再デプロイしてください。", 503);
  if (typeof current !== "string" || !HEX_KEY.test(current)) throw new LabError("SESSION_KEY_NOT_CONFIGURED", "演習用の設定を確認してください。", 503);
  const previous = (process.env.AQUA_SESSION_KEY_PREVIOUS ?? "").split(",").map(v => v.trim()).filter(v => HEX_KEY.test(v));
  // 環境変数の鍵へ切り替えた後も、ビルド時に生成した鍵で保存されたデータを読めるようにする。
  if (configured && typeof fileKey === "string" && HEX_KEY.test(fileKey)) previous.push(fileKey);
  return [...new Set([current, ...previous].map(v => v.toLowerCase()))].map(v => Buffer.from(v, "hex"));
}
function seal(value: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys()[0], iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(deflateRawSync(Buffer.from(value))), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}
function openWith(secret: Buffer, bytes: Buffer, purpose: string): string {
  const decipher = createDecipheriv("aes-256-gcm", secret, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const compressed = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
  return inflateRawSync(compressed, { maxOutputLength: 300_000 }).toString("utf8");
}
function open(value: string, purpose: string): string {
  const secrets = keys();
  const invalid = () => new LabError("INVALID_CLOUD_STATE", "保存済みの演習を読み込めません。新しい演習を開始してください。", 409);
  if (value.length > CLOUD_STATE_LIMIT || !/^v1\.[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  const bytes = Buffer.from(value.slice(3), "base64url");
  if (bytes.length < 29) throw invalid();
  for (const secret of secrets) {
    try { return openWith(secret, bytes, purpose); } catch { /* 次の鍵で試す */ }
  }
  throw invalid();
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
}
function checkpoint(request: Request, slot: StateSlot): Checkpoint | undefined {
  const value = cookie(request, CHECKPOINT_COOKIE(slot));
  if (!value) return undefined;
  let data: Checkpoint;
  try { data = JSON.parse(open(value, "aqua-checkpoint")); } catch { return undefined; }
  if (!Array.isArray(data.starts) || !data.starts.every(t => Number.isFinite(t)) || typeof data.digest !== "string" || !/^[a-f0-9]{64}$/.test(data.digest) || !Number.isFinite(data.expiresAt) || data.expiresAt < Date.now()) return undefined;
  return data;
}
export function recentStarts(request: Request, slot: StateSlot = "normal") { return (checkpoint(request, slot)?.starts ?? []).filter(t => t > Date.now() - 60_000); }
export function restoreCloudState(request: Request, value: unknown, slot: StateSlot = "normal"): string {
  if (typeof value !== "string" || !value) throw new LabError("CLOUD_STATE_REQUIRED", "このブラウザに保存された演習データがありません。演習を開始してください。", 401);
  const current = checkpoint(request, slot);
  if (!current || !timingSafeEqual(Buffer.from(current.digest, "hex"), Buffer.from(digest(value), "hex"))) throw new LabError("STALE_CLOUD_STATE", "演習データが更新されています。再読込するか、新しい演習を開始してください。", 409);
  return open(value, "aqua-exercise-state");
}
export function encodeCloudState(snapshot: string) { return seal(snapshot, "aqua-exercise-state"); }
export function checkpointCookie(state: string, starts: number[], secure: boolean, slot: StateSlot = "normal") {
  const value = seal(JSON.stringify({ digest: digest(state), starts, expiresAt: Date.now() + 24 * 60 * 60_000 }), "aqua-checkpoint");
  return `${CHECKPOINT_COOKIE(slot)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400${secure ? "; Secure" : ""}`;
}
