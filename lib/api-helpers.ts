import { NextResponse } from "next/server";
import { getCurrentUserId } from "./auth";

export async function requireUserId(): Promise<string | NextResponse> {
  const uid = await getCurrentUserId();
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return uid;
}

export function isResponse(x: unknown): x is NextResponse {
  return x instanceof NextResponse;
}
