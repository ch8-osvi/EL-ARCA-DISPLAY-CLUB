import { requireAdmin } from "@/lib/security/admin";
import { NextResponse } from "next/server";
import { getElToqueRate } from "@/lib/eltoque";
export const dynamic = "force-dynamic";
async function handleGET() {
  try {
    const data = await getElToqueRate();
    return NextResponse.json(data, {
      status: data.success ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        rate: null,
        stale: true,
        error: "Referencia elTOQUE no disponible",
      },
      { status: 503 },
    );
  }
}

export async function GET(req: Request, context: any) {
  if (new URL(req.url).searchParams.has("all")) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
  }
  return (handleGET as any)(req, context);
}
