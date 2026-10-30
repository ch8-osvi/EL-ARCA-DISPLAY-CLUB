import { catalogProduct } from "@/lib/categories";
import { requireAdmin } from "@/lib/security/admin";
import { atomicResponse } from "@/lib/security/atomic-response";
import { executeFusionarProductos } from "@/lib/ai/adminTools";
import { Product } from "@/lib/models/Product";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let b;
  try {
    b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
  } catch {
    return Response.json(
      { success: false, error: "Solicitud de fusión inválida" },
      { status: 400 },
    );
  }
  return atomicResponse(async () => {
    if (
      typeof b.primaryId !== "string" ||
      typeof b.secondaryId !== "string" ||
      !b.primaryId.trim() ||
      !b.secondaryId.trim() ||
      b.primaryId.length > 200 ||
      b.secondaryId.length > 200 ||
      b.primaryId === b.secondaryId ||
      (b.finalPrecio !== undefined &&
        (!Number.isFinite(b.finalPrecio) ||
          b.finalPrecio < 0 ||
          b.finalPrecio > 1000000)) ||
      (b.finalModelo !== undefined &&
        (typeof b.finalModelo !== "string" ||
          !b.finalModelo.trim() ||
          b.finalModelo.length > 200))
    )
      return Response.json(
        { success: false, error: "IDs inválidos" },
        { status: 400 },
      );
    const result = await executeFusionarProductos({
      queryPrincipal: b.primaryId,
      querySecundario: b.secondaryId,
      nuevoModelo: b.finalModelo,
      nuevoPrecio: b.finalPrecio,
    });
    if (!result.success)
      return Response.json(
        { success: false, error: result.message },
        { status: 409 },
      );
    return Response.json({
      ...result,
      product: await Product.findOne({ id: b.primaryId }).lean(),
      products: (await Product.find({ isHidden: false }).lean()).map(
        catalogProduct,
      ),
      deletedCount: await Product.countDocuments({ isHidden: true }),
    });
  });
}
