import { createHash, timingSafeEqual, ECDH, createECDH } from "node:crypto";
import { z } from "zod";

export function trustedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (!url.port || url.port === "443") &&
      url.pathname !== "/" &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(url.hostname) ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
const endpoint = z
  .string()
  .max(2048)
  .url()
  .refine(trustedPushEndpoint, "Unsupported push service.");
const key = (length: number, firstByte?: number) =>
  z
    .string()
    .max(128)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/)
    .refine((value) => {
      const bytes = Buffer.from(value, "base64url");
      try {
        return (
          bytes.length === length &&
          (firstByte === undefined ||
            (bytes[0] === firstByte &&
              ECDH.convertKey(bytes, "prime256v1").length === 65))
        );
      } catch {
        return false;
      }
    }, "Invalid push encryption key.");
export const pushSubscriptionInput = z.object({
  endpoint,
  expirationTime: z
    .number()
    .finite()
    .positive()
    .max(8640000000000000)
    .nullable()
    .optional(),
  keys: z.object({ p256dh: key(65, 4), auth: key(16) }),
});
export const pushActionInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("subscribe"),
    subscription: pushSubscriptionInput,
  }),
  z.object({ action: z.literal("unsubscribe"), endpoint }),
  z.object({ action: z.literal("test"), endpoint }),
]);
export const pushEndpointHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function validCronAuthorization(
  header: string | null,
  secret: string | undefined,
) {
  if (!secret || secret.length < 32 || !header?.startsWith("Bearer "))
    return false;
  const actual = Buffer.from(header.slice(7)),
    expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validVapidConfiguration(
  publicValue: string,
  privateValue: string,
  subject: string,
) {
  try {
    const publicKey = Buffer.from(publicValue, "base64url"),
      privateKey = Buffer.from(privateValue, "base64url");
    if (
      publicKey.length !== 65 ||
      publicKey[0] !== 4 ||
      privateKey.length !== 32 ||
      !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)
    )
      return false;
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(privateKey);
    return pair.getPublicKey().equals(publicKey);
  } catch {
    return false;
  }
}
