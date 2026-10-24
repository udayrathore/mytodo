import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { database } from "./db";
import { tokenHash, verifyPassword, hashPassword } from "./password";
const COOKIE = "pis_session";
export class AuthError extends Error {}
export function configured() {
  return !!(
    process.env.DATABASE_URL &&
    process.env.OWNER_EMAIL &&
    /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(
      process.env.OWNER_PASSWORD_HASH || "",
    ) &&
    process.env.APP_URL &&
    (!process.env.VERCEL || process.env.APP_URL.startsWith("https://"))
  );
}
export function checkOrigin(request: Request) {
  const expected = process.env.APP_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin)
    throw new AuthError("Request origin rejected.");
}
export async function currentUser() {
  if (!configured()) return null;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await database().session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.expiresAt < new Date() ||
    session.user.email !== process.env.OWNER_EMAIL?.toLowerCase()
  )
    return null;
  return session.user;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AuthError("Sign in to continue.");
  return user;
}
export async function requirePageUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function login(email: string, password: string) {
  if (!configured())
    throw new AuthError("Complete environment setup before signing in.");
  const db = database();
  await limitCodeAttempts();
  const owner = await db.user.findUnique({ where: { email: process.env.OWNER_EMAIL!.toLowerCase() } });
  const valid = await verifyPassword(
    password,
    owner?.loginCodeHash || process.env.OWNER_PASSWORD_HASH!,
  );
  if (!valid || email.toLowerCase() !== process.env.OWNER_EMAIL!.toLowerCase())
    throw new AuthError("Login code is incorrect.");
  const user = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      name: process.env.OWNER_NAME || "You",
      timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
    },
  });
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  await db.$transaction([
    db.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    }),
    db.session.create({
      data: { userId: user.id, tokenHash: tokenHash(token), expiresAt },
    }),
    db.loginBucket.deleteMany({ where: { key: "owner" } }),
  ]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: new URL(process.env.APP_URL!).protocol === "https:",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (token)
    await database().session.deleteMany({
      where: { tokenHash: tokenHash(token) },
    });
  cookieStore.delete(COOKIE);
}

export async function limitCodeAttempts() {
  const db = database();
  // One atomic, durable owner bucket: works across serverless instances. All attempts count.
  const rows = await db.$queryRaw<{ attempts: number }[]>`
 INSERT INTO login_buckets (key,attempts,resets_at) VALUES ('owner',1,NOW()+INTERVAL '15 minutes')
 ON CONFLICT (key) DO UPDATE SET
 attempts=CASE WHEN login_buckets.resets_at<NOW() THEN 1 ELSE login_buckets.attempts+1 END,
 resets_at=CASE WHEN login_buckets.resets_at<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE login_buckets.resets_at END
 RETURNING attempts`;
  if (rows[0].attempts > 10)
    throw new AuthError("Too many sign-in attempts. Try again in 15 minutes.");

}
export async function changeLoginCode(current: string, next: string) {
  const user = await requireUser();
  await limitCodeAttempts();
  const cookie = (await cookies()).get(COOKIE)?.value;
  const nextHash = await hashPassword(next);
  await database().$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    const owner = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!await verifyPassword(current, owner.loginCodeHash || process.env.OWNER_PASSWORD_HASH!)) throw new AuthError("Current code is incorrect.");
    await tx.user.update({ where: { id: user.id }, data: { loginCodeHash: nextHash } });
    await tx.session.deleteMany({ where: { userId: user.id, ...(cookie ? { tokenHash: { not: tokenHash(cookie) } } : {}) } });
    await tx.loginBucket.deleteMany({ where: { key: "owner" } });
  });
}
