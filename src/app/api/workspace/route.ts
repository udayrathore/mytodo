import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { workspaceQuery } from "@/lib/workspace-query";
import { getWorkspace } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const parsed = workspaceQuery.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid workspace query" },
        { status: 400 },
      );
    return NextResponse.json(await getWorkspace(user, parsed.data), {
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
