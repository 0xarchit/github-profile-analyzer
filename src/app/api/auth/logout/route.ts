import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";

export const runtime = "edge";

export async function POST() {
  await deleteSession();
  return NextResponse.json({ success: true });
}
