interface RefundItem {
  productId: string;
  qty: number;
  returnedQty?: number;
  subtotalUSD: number;
}
interface RefundSale {
  totalUSD: number;
  totalCUP: number;
  totalRefundedUSD?: number;
  totalRefundedCUP?: number;
  items: RefundItem[];
  refunds?: { productId: string; refundUSD: number }[];
}
const cents = (value: number) => Number(value.toFixed(2));

/** Allocate the original charged amounts, including rounding residue on the final return. */
export function refundAmounts(
  sale: RefundSale,
  item: RefundItem,
  qty: number,
  batch = { usd: 0, cup: 0 },
) {
  const returned = item.returnedQty || 0;
  const previousLogs = (sale.refunds || []).filter(
    (row) => row.productId === item.productId,
  );
  const previousItemUSD = previousLogs.length
    ? previousLogs.reduce((n, row) => n + row.refundUSD, 0)
    : cents((item.subtotalUSD * returned) / item.qty);
  const remainingUSD = Math.max(
    0,
    cents(sale.totalUSD - (sale.totalRefundedUSD || 0) - batch.usd),
  );
  const remainingCUP = Math.max(
    0,
    cents(sale.totalCUP - (sale.totalRefundedCUP || 0) - batch.cup),
  );
  const final = sale.items.every(
    (row) => (row.returnedQty || 0) + (row === item ? qty : 0) >= row.qty,
  );
  const usd = final
    ? remainingUSD
    : Math.min(
        remainingUSD,
        Math.max(
          0,
          cents(
            (item.subtotalUSD * (returned + qty)) / item.qty - previousItemUSD,
          ),
        ),
      );
  const cup = final
    ? remainingCUP
    : Math.min(
        remainingCUP,
        sale.totalUSD > 0 ? cents((sale.totalCUP * usd) / sale.totalUSD) : 0,
      );
  return { usd: cents(usd), cup: cents(cup) };
}
