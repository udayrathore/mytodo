import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [scheme, salt, hex] = hash.split(":");
  if (scheme !== "scrypt" || !salt || !hex || !/^[a-f0-9]{128}$/.test(hex))
    return false;
  const key = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(key, Buffer.from(hex, "hex"));
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
