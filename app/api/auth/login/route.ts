import { NextResponse } from "next/server";

// Mock "send code" step: any well-formed phone number is accepted and a
// (fake) code is issued. No account is created yet — that happens on verify.
export async function POST(request: Request) {
  const { phone } = (await request.json()) as { phone: string };
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return NextResponse.json({ error: "Введите корректный номер телефона" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, demoCode: "00000" });
}
