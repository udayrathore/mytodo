import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { dateOnly } from "@/lib/domain";
import { getWorkspace } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const raw = new URL(request.url).searchParams.get("through");
    const parsed = raw ? dateOnly.safeParse(raw) : null;
    if (parsed && !parsed.success)
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    return NextResponse.json(
      await getWorkspace(user, parsed?.success ? parsed.data : undefined),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AuthError
            ? "Sign in to continue."
            : "Could not load the workspace.",
      },
      { status: e instanceof AuthError ? 401 : 503 },
    );
  }
}
