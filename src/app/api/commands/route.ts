import { NextResponse } from "next/server";
import { DomainError } from "@/lib/domain";
import { ZodError, z } from "zod";
import { AuthError, checkOrigin, requireUser } from "@/lib/auth";
import { executeCommand, ConflictError } from "@/lib/commands";
export async function POST(request: Request) {
  const started = performance.now();
  let commandType = "unknown";
  try {
    checkOrigin(request);
    const user = await requireUser();
    const raw = await request.text();
    if (raw.length > 100000)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    const input = JSON.parse(raw);
    commandType =
      typeof input?.type === "string" ? input.type.slice(0, 60) : "unknown";
    const key = z
      .uuid()
      .optional()
      .parse(request.headers.get("Idempotency-Key") || undefined);
    const result = await executeCommand(user.id, input, key);
    const durationMs = Math.round(performance.now() - started);
    if (durationMs > 1000)
      console.info("command_slow", { type: commandType, durationMs });
    const collection =
      commandType === "category.save"
        ? "categories"
        : commandType === "tag.save"
          ? "tags"
          : commandType === "entity.save" || commandType === "project.save"
            ? "entities"
            : null;
    return NextResponse.json(
      {
        ok: true,
        id: result?.id,
        ...(result && "version" in result ? { version: result.version } : {}),
        ...(collection ? { patch: { collection, record: result } } : {}),
      },
      {
        headers: {
          "Server-Timing": `command;dur=${(performance.now() - started).toFixed(1)}`,
        },
      },
    );
  } catch (e) {
    // Log operational metadata only; never titles, notes, credentials or SQL parameters.
    console.error("command_failed", {
      type: commandType,
      code:
        (e as { code?: string }).code ||
        (e instanceof Error ? e.name : "Unknown"),
      durationMs: Math.round(performance.now() - started),
    });
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
