import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';

export async function GET() {
  try {
    await connectToDatabase();
    console.log("Connected to MongoDB.");

    const timeWindow = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

    const historyEntries = await StockHistory.find({
      createdAt: { $gte: timeWindow },
      type: 'entrada',
      reason: { $in: [
        /Alta en lote por Asistente IA/i,
        /Suma de stock en lote por Asistente IA/i,
        /Suma de stock \(\+\d+ uds\) y precio actualizado/i
      ]}
    }).lean();

    console.log(`Found ${historyEntries.length} history entries for the bulk add.`);

    let totalReverted = 0;
    let totalDeleted = 0;

    for (const entry of historyEntries) {
      const productId = entry.productId;
      const qtyAdded = entry.qty;
      
      const product = await Product.findOne({ id: productId });
      if (!product) {
          console.log(`Product ${productId} not found!`);
          continue;
      }

      if (entry.reason.includes('Alta en lote')) {
          await Product.deleteOne({ _id: product._id });
          console.log(`Deleted newly created product: ${product.marca} ${product.modelo}`);
          totalDeleted++;
      } else {
          await Product.updateOne(
              { _id: product._id },
              { $set: { stock: entry.stockBefore, isHidden: entry.stockBefore === 0 } }
          );
          console.log(`Reverted existing product ${product.marca} ${product.modelo} from ${product.stock} to ${entry.stockBefore} stock.`);
          totalReverted++;
      }

      await StockHistory.deleteOne({ _id: entry._id });
    }

    const hideEntries = await StockHistory.find({
      createdAt: { $gte: timeWindow },
      reason: /Ocultado por el Asistente IA/i
    }).lean();

    for (const h of hideEntries) {
      await StockHistory.deleteOne({ _id: h._id });
    }
    
    return NextResponse.json({
        success: true,
        reverted: totalReverted,
        deleted: totalDeleted,
        cleanedHideEntries: hideEntries.length
    });
  } catch (err) {
      return NextResponse.json({ success: false, error: String(err) });
  }
}
