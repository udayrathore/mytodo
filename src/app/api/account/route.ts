import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, checkOrigin, changeLoginCode, AuthError } from "@/lib/auth";
export async function GET() {
  try { const user = await requireUser(); return NextResponse.json({ recoveryEmail: user.recoveryEmail || null }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return NextResponse.json({ error: "Sign in to continue." }, { status: 401 }); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const raw = await request.text(); if (raw.length > 1000) return NextResponse.json({error: "Invalid request."}, {status:400});
    const input = z.object({ current: z.string().regex(/^\d{4}$/), next: z.string().regex(/^\d{4}$/) }).parse(JSON.parse(raw));
    await changeLoginCode(input.current, input.next);
    return NextResponse.json({ ok: true });
  } catch(e) { return NextResponse.json({ error: e instanceof AuthError ? e.message : e instanceof z.ZodError ? "Enter four digits for each code." : "Could not change the code." }, {status:400}); }
}
