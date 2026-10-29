import { NextResponse } from "next/server";
import { validCronAuthorization } from "@/lib/push-input";
import { dispatchDailySummaries, pushConfigured } from "@/lib/push-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
    return NextResponse.json(
      { error: "Summary scheduler is not configured." },
      { status: 503, headers },
    );
  if (
    !validCronAuthorization(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  )
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers },
    );
  if (!pushConfigured())
    return NextResponse.json(
      { error: "Push delivery is not configured." },
      { status: 503, headers },
    );
  try {
    const result = await dispatchDailySummaries();
    return NextResponse.json(
      { ok: result.remaining === 0, ...result },
      {
        status: result.remaining ? 503 : 200,
        headers: {
          ...headers,
          ...(result.remaining ? { "Retry-After": "30" } : {}),
        },
      },
    );
  } catch {
    // Never log browser endpoints, encryption keys or account task content.
    console.error("daily_summary_dispatch_failed");
    return NextResponse.json(
      { error: "Could not dispatch summaries. Retry safely." },
      { status: 503, headers },
    );
  }
}
export const POST = GET;
