import {
  executeAgregarProducto,
  executeAgregarProductosLote,
  executeAgregarLoteBulk,
  executeActualizarCalidadProducto,
  executeModificarProducto,
  executeOcultarProducto,
  executeOcultarLote,
  executeCrearOrdenMulti,
  executeAnularOrden,
  executeActualizarTasaCambio,
  executeFusionarProductos,
  executeMarcarOrdenPagada,
  executeMarcarOrdenPendiente,
  executeActualizarPrecioProducto,
  executeAjustarStockProducto,
  executeRegistrarVentaRapida,
} from "@/lib/ai/adminTools";

// ─── Action Tag Parser (Robust Brace-Balanced) ───────────────────────────────

/**
 * Extracts all [ACCION:TYPE:{...}] tags from the AI response.
 * Uses brace-counting instead of a greedy regex so nested JSON objects
 * like {"items":[{...}]} are captured correctly without leaving residual text.
 */
export function extractActionTags(
  text: string,
): Array<{ full: string; type: string; jsonStr: string }> {
  const results: Array<{ full: string; type: string; jsonStr: string }> = [];
  const prefix = "[ACCION:";
  let searchFrom = 0;

  while (true) {
    const tagStart = text.indexOf(prefix, searchFrom);
    if (tagStart === -1) break;

    // Find the colon after the action type name
    const typeStart = tagStart + prefix.length;
    const colonIdx = text.indexOf(":", typeStart);
    if (colonIdx === -1) {
      searchFrom = tagStart + 1;
      continue;
    }

    const actionType = text.slice(typeStart, colonIdx).trim();
    if (!actionType || !/^[A-Z_]+$/.test(actionType)) {
      searchFrom = tagStart + 1;
      continue;
    }

    // Now find the JSON object using brace counting
    const jsonStart = text.indexOf("{", colonIdx);
    if (jsonStart === -1) {
      searchFrom = tagStart + 1;
      continue;
    }

    let depth = 0;
    let inString = false,
      escaped = false;
    let jsonEnd = -1;
    for (let i = jsonStart; i < text.length; i++) {
      if (inString) {
        if (escaped) escaped = false;
        else if (text[i] === "\\") escaped = true;
        else if (text[i] === '"') inString = false;
        continue;
      }
      if (text[i] === '"') {
        inString = true;
        continue;
      }
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          jsonEnd = i;
          break;
        }
      }
    }

    if (jsonEnd === -1) {
      searchFrom = tagStart + 1;
      continue;
    }

    // Find the closing ] of the tag; allow only whitespace between } and ]
    const closingBracket = text.indexOf("]", jsonEnd + 1);
    if (closingBracket === -1) {
      searchFrom = tagStart + 1;
      continue;
    }
    const betweenText = text.slice(jsonEnd + 1, closingBracket);
    if (betweenText.trim() !== "") {
      searchFrom = tagStart + 1;
      continue;
    }

    const fullMatch = text.slice(tagStart, closingBracket + 1);
    const jsonStr = text.slice(jsonStart, jsonEnd + 1);

    results.push({ full: fullMatch, type: actionType, jsonStr });
    searchFrom = closingBracket + 1;
  }
  return results;
}

/** Detects if the prompt is asking about duplicate or repeated displays */
export function isDuplicateQuery(prompt: string): boolean {
  const p = prompt.toLowerCase().trim();
  if (/^(mostrar\s+|ver\s+|listar\s+)?duplicad[ao]s?$/i.test(p)) return true;
  if (
    /^(pantallas?|displays?|repuestos?|productos?|modelos?)\s+duplicad[ao]s?$/i.test(
      p,
    )
  )
    return true;
  if (
    /^duplicad[ao]s?\s+(de\s+)?(pantallas?|displays?|repuestos?|productos?|modelos?)$/i.test(
      p,
    )
  )
    return true;
  if (/^lista\s+de\s+duplicad[ao]s?$/i.test(p)) return true;

  const hasDup =
    /duplicad[ao]s?|repetid[ao]s?|multi-?compatibles?\s+duplicad/i.test(p);
  const isQuestion =
    /(qu[eé]|cu[aá]les?|hay|detectas?|tienes?|existen?|mostrar?|listar?|ver|revisar?|buscar?)/i.test(
      p,
    );
  return (
    hasDup &&
    (isQuestion ||
      /^(qu[eé]\s+)?(pantallas?|displays?|repuestos?|productos?)/i.test(p))
  );
}

/** Parses explicit requests to merge a specific duplicate pair by index (e.g., 'une el par 1') */
export function parseMergeCommand(
  prompt: string,
  detectedPairs: any[],
): {
  pairIndex: number;
  queryPrincipal: string;
  querySecundario: string;
  nuevoModelo: string;
  nuevoPrecio: number;
} | null {
  const p = prompt.toLowerCase().trim();
  const parMatch = p.match(
    /(?:une|unir|fusiona|fusionar)\s+(?:el\s+)?par\s+(\d+)/i,
  );
  if (parMatch) {
    const idx = parseInt(parMatch[1], 10) - 1;
    if (idx >= 0 && idx < detectedPairs.length) {
      const pair = detectedPairs[idx];
      const prefersB =
        /deja(?:ndo)?\s+(?:el\s+)?(?:segundo|b|opci[oó]n\s*b)/i.test(p);
      const primary = prefersB ? pair.productB : pair.productA;
      const secondary = prefersB ? pair.productA : pair.productB;
      return {
        pairIndex: idx + 1,
        queryPrincipal: primary.id || primary.modelo,
        querySecundario: secondary.id || secondary.modelo,
        nuevoModelo: primary.modelo,
        nuevoPrecio: Math.max(primary.precio || 0, secondary.precio || 0),
      };
    }
  }
  return null;
}

/** Detects follow-up questions asking for price in CUP (e.g. 'en cup precio', 'cuanto es en cup', 'en pesos') */
export function isCupConversionQuery(prompt: string): boolean {
  const p = prompt.toLowerCase().trim();
  return /^(en\s+cup(\s+precio)?|precio\s+en\s+cup|cu[aá]nto\s+(es\s+)?en\s+cup|en\s+pesos|a\s+c[oó]mo\s+sale\s+en\s+cup|a\s+c[oó]mo\s+est[aá]\s+el\s+d[oó]lar|qu[eé]\s+tasa\s+tienen?)$/i.test(
    p,
  );
}

/** Detects canonical brand name mentioned in a prompt */
export function detectBrandInPrompt(prompt: string): string | null {
  const p = prompt.toLowerCase();
  if (/redmi|xiaomi|poco/i.test(p)) return "XIAOMI";
  if (/samsung|galaxy/i.test(p)) return "SAMSUNG";
  if (/iphone|apple/i.test(p)) return "IPHONE";
  if (/motorola|moto\b/i.test(p)) return "MOTOROLA";
  if (/huawei|honor|nova/i.test(p)) return "HUAWEI / HONOR / NOVA";
  if (/infinix|tecno|itel/i.test(p)) return "INFINIX / TECNO / ITEL";
  if (/oppo|realme|reno|oneplus|one\s*plus|narzo/i.test(p))
    return "OPPO / REALME / RENO / ONEPLUS";
  if (/zte|nubia/i.test(p)) return "ZTE / NUBIA";
  if (/tcl|alcatel/i.test(p)) return "TCL / ALCATEL";
  if (/\blg\b/i.test(p)) return "LG";
  if (/\bvivo\b/i.test(p)) return "VIVO";
  if (/blackview/i.test(p)) return "BLACKVIEW";
  if (/nokia/i.test(p)) return "NOKIA";
  return null;
}

/**
 * Detects if a prompt is asking specifically for inventory metrics/totals/aggregates
 */
export function isInventoryAggregateQuery(prompt: string): {
  isAggregate: boolean;
  brand: string | null;
} {
  const p = prompt.toLowerCase().trim();

  // 1. Guard against mutations or operational actions
  const isActionIntent =
    /(?:crear|genera|haz|registra|anota|crea)\s+(?:una?\s+)?(?:orden|pedido|venta)|(?:vende|vender|despacha|agrega|a[ñn]ade|modifica|cambia|actualiza|elimina|borra|oculta|fusiona|ajusta|merma|compra)/i.test(
      p,
    );
  if (isActionIntent) return { isAggregate: false, brand: null };

  const detectedBrand = detectBrandInPrompt(p);

  const isExplicitAggregate =
    /total\s+(?:de\s+)?(?:los\s+)?modelos|todos\s+los\s+modelos|sumando\s+todas\s+las\s+unidades|total\s+de\s+(?:las\s+)?unidades|cu[aá]ntos\s+modelos\s+(?:hay|tenemos|quedan|disponibles?)|stock\s+total|inventario\s+total|total\s+del?\s+inventario|total\s+de\s+pantallas\s+disponibles/i.test(
      p,
    );
  const mentionsUnitsOrModels =
    /modelos?|unidades?|piezas?|stock|inventario/i.test(p);
  const mentionsAvailability =
    /disponibles?|existencias?|agotad[ao]s?|en\s+stock/i.test(p);
  const mentionsTotalOrSum = /total|sumando|suma|cu[aá]nt[ao]s?|cantidad/i.test(
    p,
  );

  const isSingleProductCheck =
    /(?:precio|cu[aá]nto\s+vale|cu[aá]nto\s+cuesta|tienes\s+pantalla|hay\s+pantalla)\b/i.test(
      p,
    );
  if (isSingleProductCheck && !isExplicitAggregate) {
    return { isAggregate: false, brand: null };
  }

  if (isExplicitAggregate) {
    return { isAggregate: true, brand: detectedBrand };
  }

  if (mentionsUnitsOrModels && mentionsAvailability && mentionsTotalOrSum) {
    return { isAggregate: true, brand: detectedBrand };
  }

  if (
    detectedBrand &&
    mentionsUnitsOrModels &&
    (mentionsTotalOrSum || mentionsAvailability)
  ) {
    return { isAggregate: true, brand: detectedBrand };
  }

  return { isAggregate: false, brand: null };
}

/** Executes action tags found in AI response and returns cleaned text with execution messages */
export async function executeActions(response: string): Promise<{
  cleanedResponse: string;
  actionResults: string[];
  executedActionTypes: string[];
}> {
  const actionResults: string[] = [];
  const executedActionTypes: string[] = [];
  let cleanedResponse = response;

  const tags = extractActionTags(response);

  for (const tag of tags) {
    let payload: Record<string, unknown> = {};

    try {
      payload = JSON.parse(tag.jsonStr);
    } catch {
      console.error(
        `[AI Action Parser] Failed to parse JSON for action ${tag.type}:`,
        tag.jsonStr,
      );
      actionResults.push(
        `⚠️ Error interno al procesar la acción ${tag.type}. El formato del JSON generado es inválido.`,
      );
      cleanedResponse = cleanedResponse.replace(tag.full, "").trim();
      continue;
    }

    let result: { success: boolean; message: string } | null = null;
    executedActionTypes.push(tag.type);

    switch (tag.type) {
      case "CREAR_ORDEN": {
        result = await executeCrearOrdenMulti({
          clientName: String(payload.clientName ?? "Consumidor Final"),
          items: Array.isArray(payload.items) ? payload.items : [],
          currency: payload.currency === "CUP" ? "CUP" : "USD",
          paid: payload.paid !== false,
          notes: payload.notes ? String(payload.notes) : undefined,
        });
        break;
      }
      case "VENTA_RAPIDA": {
        result = await executeRegistrarVentaRapida({
          cliente: String(payload.cliente ?? "Consumidor Final"),
          modeloProducto: String(payload.modeloProducto ?? ""),
          cantidad: Number(payload.cantidad ?? 1),
          moneda: payload.moneda === "CUP" ? "CUP" : "USD",
          pagado: payload.pagado !== false,
        });
        break;
      }
      case "ACTUALIZAR_PRECIO": {
        result = await executeActualizarPrecioProducto(
          String(payload.queryProducto ?? ""),
          Number(payload.nuevoPrecioUSD ?? 0),
        );
        break;
      }
      case "ACTUALIZAR_CALIDAD": {
        result = await executeActualizarCalidadProducto(
          String(payload.queryProducto ?? ""),
          String(payload.nuevaCalidad ?? ""),
        );
        break;
      }
      case "AJUSTAR_STOCK": {
        result = await executeAjustarStockProducto(
          String(payload.queryProducto ?? ""),
          Number(payload.cantidadAgregada ?? 0),
          payload.motivo ? String(payload.motivo) : undefined,
        );
        break;
      }
      case "MARCAR_PAGADA": {
        result = await executeMarcarOrdenPagada(
          String(payload.orderNumber ?? ""),
        );
        break;
      }
      case "MARCAR_PENDIENTE": {
        result = await executeMarcarOrdenPendiente(
          String(payload.orderNumber ?? ""),
        );
        break;
      }
      case "ANULAR_ORDEN": {
        result = await executeAnularOrden(
          String(payload.orderNumber ?? ""),
          payload.motivo ? String(payload.motivo) : undefined,
        );
        break;
      }
      case "ACTUALIZAR_TASA_CAMBIO": {
        result = await executeActualizarTasaCambio(
          Number(payload.nuevaTasa ?? 0),
        );
        break;
      }
      case "AGREGAR_PRODUCTO": {
        result = await executeAgregarProducto({
          marca: String(payload.marca ?? "")
            .toUpperCase()
            .trim(),
          modelo: String(payload.modelo ?? "")
            .toUpperCase()
            .trim(),
          calidad: String(payload.calidad ?? "ORIGINAL C/M")
            .toUpperCase()
            .trim(),
          precio: Number(payload.precio ?? 0),
          stock:
            payload.stock !== undefined ? Number(payload.stock) : undefined,
        });
        break;
      }
      case "AGREGAR_LOTE": {
        const lote = Array.isArray(payload.productos) ? payload.productos : [];
        result = await executeAgregarProductosLote(
          lote.map((p: Record<string, unknown>) => ({
            marca: String(p.marca ?? "")
              .toUpperCase()
              .trim(),
            modelo: String(p.modelo ?? "")
              .toUpperCase()
              .trim(),
            calidad: String(p.calidad ?? "ORIGINAL C/M")
              .toUpperCase()
              .trim(),
            precio: Number(p.precio ?? 0),
            stock: p.stock !== undefined ? Number(p.stock) : undefined,
          })),
        );
        break;
      }
      case "AGREGAR_LOTE_BULK": {
        const lote = Array.isArray(payload.productos) ? payload.productos : [];
        result = await executeAgregarLoteBulk(
          lote.map((p: Record<string, unknown>) => ({
            marca: String(p.marca ?? "")
              .toUpperCase()
              .trim(),
            modelo: String(p.modelo ?? "")
              .toUpperCase()
              .trim(),
            calidad: String(p.calidad ?? "ORIGINAL C/M")
              .toUpperCase()
              .trim(),
            precio: Number(p.precio ?? 0),
            stock: p.stock !== undefined ? Number(p.stock) : undefined,
          })),
        );
        break;
      }
      case "OCULTAR_PRODUCTO": {
        result = await executeOcultarProducto(
          String(payload.queryProducto ?? ""),
        );
        break;
      }
      case "MODIFICAR_PRODUCTO": {
        result = await executeModificarProducto({
          queryProducto: String(payload.queryProducto ?? ""),
          nuevaMarca: payload.nuevaMarca
            ? String(payload.nuevaMarca).toUpperCase().trim()
            : undefined,
          nuevoModelo: payload.nuevoModelo
            ? String(payload.nuevoModelo).toUpperCase().trim()
            : undefined,
          nuevaCalidad: payload.nuevaCalidad
            ? String(payload.nuevaCalidad).toUpperCase().trim()
            : undefined,
          nuevoPrecio:
            payload.nuevoPrecio !== undefined
              ? Number(payload.nuevoPrecio)
              : undefined,
        });
        break;
      }
      case "OCULTAR_LOTE": {
        const queries = Array.isArray(payload.queries)
          ? payload.queries.map(String)
          : [];
        result = await executeOcultarLote(queries);
        break;
      }
      case "FUSIONAR_PRODUCTOS": {
        result = await executeFusionarProductos({
          queryPrincipal: String(payload.queryPrincipal ?? ""),
          querySecundario: String(payload.querySecundario ?? ""),
          nuevoModelo: payload.nuevoModelo
            ? String(payload.nuevoModelo).toUpperCase().trim()
            : undefined,
          nuevoPrecio:
            payload.nuevoPrecio !== undefined
              ? Number(payload.nuevoPrecio)
              : undefined,
        });
        break;
      }
      default:
        throw new Error(`Acción desconocida: ${tag.type}`);
    }

    if (result) {
      if (!result.success) throw new Error(result.message);
      actionResults.push(result.message);
    }

    cleanedResponse = cleanedResponse.replace(tag.full, "").trim();
  }

  cleanedResponse = cleanedResponse
    .replace(/\[ACCION:[^\]]{0,500}$/gm, "")
    .replace(/,\s*"[a-zA-Z_]+":\s*[^\n,}{\]]{0,200}(?=[\n]|$)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleanedResponse,
    actionResults,
    executedActionTypes,
  };
}
