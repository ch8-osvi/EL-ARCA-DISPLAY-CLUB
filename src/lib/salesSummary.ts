import { getHavanaDateKey } from "./dateUtils";

export const EMPTY_DAILY_SALES = {
  count: 0,
  usdCount: 0,
  cupCount: 0,
  todayGrossUSD: 0,
  todayRefundsUSD: 0,
  todayNetUSD: 0,
  todayPendingUSD: 0,
  todayGrossCUP: 0,
  todayRefundsCUP: 0,
  todayNetCUP: 0,
  todayPendingCUP: 0,
};

/** Summary of orders dated today in Havana, independently of the 200-row history window. */
export function dailySalesPipeline(now = new Date()) {
  const usd = { $eq: [{ $ifNull: ["$currency", "USD"] }, "USD"] };
  const cup = { $eq: ["$currency", "CUP"] };
  const paid = { $eq: ["$paid", true] };
  const refund = (currency: string) => ({
    $ifNull: [`$totalRefunded${currency}`, 0],
  });
  const net = (currency: string) => ({
    $max: [0, { $subtract: [`$total${currency}`, refund(currency)] }],
  });
  const sum = (condition: object, value: object | string | number) => ({
    $sum: { $cond: [condition, value, 0] },
  });
  return [
    {
      $match: {
        status: { $ne: "CANCELLED" },
        createdAt: { $gte: new Date(now.getTime() - 36 * 3600000), $lte: now },
      },
    },
    {
      $match: {
        $expr: {
          $eq: [
            {
              $dateToString: {
                date: "$createdAt",
                format: "%Y-%m-%d",
                timezone: "America/Havana",
              },
            },
            getHavanaDateKey(now),
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        usdCount: sum(usd, 1),
        cupCount: sum(cup, 1),
        todayGrossUSD: sum({ $and: [usd, paid] }, "$totalUSD"),
        todayRefundsUSD: sum({ $and: [usd, paid] }, refund("USD")),
        todayPendingUSD: sum({ $and: [usd, { $not: [paid] }] }, net("USD")),
        todayGrossCUP: sum({ $and: [cup, paid] }, "$totalCUP"),
        todayRefundsCUP: sum({ $and: [cup, paid] }, refund("CUP")),
        todayPendingCUP: sum({ $and: [cup, { $not: [paid] }] }, net("CUP")),
      },
    },
    {
      $set: {
        ...Object.fromEntries(
          [
            "todayGrossUSD",
            "todayRefundsUSD",
            "todayPendingUSD",
            "todayGrossCUP",
            "todayRefundsCUP",
            "todayPendingCUP",
          ].map((field) => [field, { $round: ["$" + field, 2] }]),
        ),
        todayNetUSD: {
          $round: [{ $subtract: ["$todayGrossUSD", "$todayRefundsUSD"] }, 2],
        },
        todayNetCUP: {
          $round: [{ $subtract: ["$todayGrossCUP", "$todayRefundsCUP"] }, 2],
        },
      },
    },
    { $project: { _id: 0 } },
  ];
}
