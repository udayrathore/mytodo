import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getWorkspace(await requireUser()), {
      headers: { "Cache-Control": "private, no-store" },
    });
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
