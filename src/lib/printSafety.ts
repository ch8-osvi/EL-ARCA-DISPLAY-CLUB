/** Escape business data before interpolating it in a printable HTML document. */
export function escapePrintData<T>(value: T): T {
  if (typeof value === "string")
    return value.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    ) as T;
  if (value instanceof Date || value == null) return value;
  if (Array.isArray(value)) return value.map(escapePrintData) as T;
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, escapePrintData(item)]),
    ) as T;
  return value;
}
