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

        password: z.string().regex(/^\d{4}$/),
      })
      .parse(JSON.parse(raw));
    await login(process.env.OWNER_EMAIL || "", input.password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Enter your four-digit code."
            : e instanceof AuthError
              ? e.message
              : "Sign-in failed. Check your connection and try again.",
      },
      { status: 400 },
    );
  }
}
