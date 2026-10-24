import { requireAdmin } from "@/lib/security/admin";
import { atomicResponse } from "@/lib/security/atomic-response";
import { executeAgregarProductosLote } from "@/lib/ai/adminTools";
import { validateActions } from "@/lib/ai/contracts";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    validateActions([
      { type: "AGREGAR_LOTE", payload: { productos: body.productos } },
    ]);
    return atomicResponse(async () => {
      const result = await executeAgregarProductosLote(body.productos);
      return Response.json(
        { ...result, errors: result.success ? 0 : 1 },
        { status: result.success ? 200 : 409 },
      );
    });
  } catch {
    return Response.json(
      {
        success: false,
        error:
          "Lote inválido. Indica marca, modelo, calidad, precio y stock en cada línea.",
      },
      { status: 400 },
    );
  }
}
