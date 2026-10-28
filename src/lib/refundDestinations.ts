export const REFUND_DESTINATIONS = ["stock", "merma", "retirado"] as const;
export type RefundDestination = (typeof REFUND_DESTINATIONS)[number];
export function refundDestinationLabel(destination?: RefundDestination) {
  return {
    stock: "A stock",
    merma: "Merma / baja",
    retirado: "Fuera de inventario",
  }[destination ?? "stock"];
}
