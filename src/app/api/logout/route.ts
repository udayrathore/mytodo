import { NextResponse } from "next/server";
import { checkOrigin, logout } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    await logout();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }
}
