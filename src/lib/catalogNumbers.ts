/** Parse spreadsheet amounts without silently stripping signs or rounding stock. */
export function parseCatalogNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return NaN;
  let text = value
    .trim()
    .replace(/\b(?:USD|CUP)\b/gi, "")
    .replace(/[$\s]/g, "");
  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(text)) return NaN;
  if (text.includes(",") && text.includes("."))
    text =
      text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  else if (text.includes(",")) text = text.replace(",", ".");
  return Number(text);
}
