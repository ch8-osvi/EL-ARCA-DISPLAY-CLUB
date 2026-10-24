import { atomicResponse } from "@/lib/security/atomic-response";
import { requireAdmin } from "@/lib/security/admin";
import { NextResponse } from "next/server";
import { executeNormalizarCatalogoExistente } from "@/lib/ai/adminTools";

export const dynamic = "force-dynamic";

async function handlePOST() {
  try {
    const result = await executeNormalizarCatalogoExistente();
    return NextResponse.json(result, { status: result.success ? 200 : 409 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return atomicResponse(() => (handlePOST as any)(req.clone(), context));
}
