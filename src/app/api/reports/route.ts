import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireUser } from "@/lib/auth";
import { dateOnly } from "@/lib/domain";
import { reports } from "@/lib/reports";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const q = z
      .object({
        from: dateOnly,
        to: dateOnly,
        metric: z.enum(["activity", "completed"]).default("activity"),
        kind: z.enum(["balance", "insights"]).default("balance"),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    if (
      q.from > q.to ||
      (q.kind === "insights" &&
        Date.parse(q.to) - Date.parse(q.from) > 365 * 86400000)
    )
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 },
      );
    return NextResponse.json(
      await reports(user, q.from, q.to, q.metric, q.kind),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthError
            ? "Sign in to continue."
            : "Could not load report.",
      },
      {
        status:
          e instanceof AuthError ? 401 : e instanceof z.ZodError ? 400 : 503,
      },
    );
  }
}
