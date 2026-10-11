import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, checkOrigin, login } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const raw = await request.text();
    if (raw.length > 4000) throw new Error("Invalid credentials.");
    const input = z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(1024),
      })
      .parse(JSON.parse(raw));
    await login(input.email, input.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Enter a valid email and password."
            : e instanceof AuthError
              ? e.message
              : "Sign-in failed. Check your connection and try again.",
      },
      { status: 400 },
    );
  }
}
