import { NextResponse } from "next/server";
import { DomainError } from "@/lib/domain";
import { ZodError } from "zod";
import { AuthError, checkOrigin, requireUser } from "@/lib/auth";
import { executeCommand, ConflictError } from "@/lib/commands";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 100000)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    const result = await executeCommand(user.id, JSON.parse(raw));
    return NextResponse.json({ ok: true, id: result?.id, ...((result && "version" in result) ? { version: result.version } : {}) });
  } catch (e) {
    if (e instanceof AuthError)
      return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    if (e instanceof ConflictError || (e as { code?: string }).code === "P2034")
      return NextResponse.json(
        { error: "This record changed. Refresh and try again." },
        { status: 409 },
      );
    const code = (e as { code?: string }).code;
    if (code)
      return NextResponse.json(
        {
          error:
            code === "P2002"
              ? "That record already exists."
              : "Could not save: check linked records, hierarchy, and field values.",
        },
        { status: 400 },
      );
    if (e instanceof DomainError)
      return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    return NextResponse.json(
      { error: "Could not save. Please try again." },
      { status: 500 },
    );
  }
}
