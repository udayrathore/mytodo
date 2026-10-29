import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, checkOrigin, requireUser } from "@/lib/auth";
import { pushActionInput } from "@/lib/push-input";
import {
  PushError,
  pushConfigured,
  pushStatus,
  subscribePush,
  testPush,
  unsubscribePush,
} from "@/lib/push-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function failure(cause: unknown) {
  const status =
    cause instanceof AuthError
      ? 401
      : cause instanceof PushError
        ? cause.status
        : cause instanceof z.ZodError
          ? 400
          : 503;
  return NextResponse.json(
    {
      error:
        cause instanceof AuthError || cause instanceof PushError
          ? cause.message
          : cause instanceof z.ZodError
            ? "Check this browser push subscription."
            : "Could not update notifications. Try again.",
    },
    { status, headers },
  );
}
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await pushStatus(user.id, user.timezone), {
      headers,
    });
  } catch (cause) {
    return failure(cause);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 10000)
      throw new PushError("Notification request is too large.", 413);
    const input = pushActionInput.parse(JSON.parse(raw));
    if (input.action === "unsubscribe")
      await unsubscribePush(user.id, input.endpoint);
    else {
      if (!pushConfigured())
        throw new PushError(
          "Push notifications are not configured on this deployment.",
          503,
        );
      if (input.action === "subscribe")
        await subscribePush(user.id, input.subscription);
      else await testPush(user.id, user.timezone, input.endpoint);
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (cause) {
    if (cause instanceof SyntaxError)
      return NextResponse.json(
        { error: "Invalid notification request." },
        { status: 400, headers },
      );
    return failure(cause);
  }
}
