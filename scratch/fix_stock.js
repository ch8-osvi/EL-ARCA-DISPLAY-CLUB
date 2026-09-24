require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

// Define basic schemas to interact with the collections directly
const productSchema = new mongoose.Schema({}, { strict: false });
const stockHistorySchema = new mongoose.Schema({}, { strict: false });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema, 'products');
const StockHistory = mongoose.models.StockHistory || mongoose.model('StockHistory', stockHistorySchema, 'stockhistories');

async function fixMistake() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  // The mistake happened around "15:27" on September 23/24 depending on timezone.
  // We'll search for entries from the last 2 hours.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const historyEntries = await StockHistory.find({
    createdAt: { $gte: twoHoursAgo },
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
    
    // Find the product
    const product = await Product.findOne({ id: productId });
    if (!product) {
        console.log(`Product ${productId} not found!`);
        continue;
    }

    if (entry.reason.includes('Alta en lote')) {
        // This was a BRAND NEW product added by mistake.
        // We should completely delete it!
        await Product.deleteOne({ _id: product._id });
        console.log(`Deleted newly created product: ${product.marca} ${product.modelo}`);
        totalDeleted++;
    } else {
        // This was an increment to an existing product.
        // We should revert the stock to `stockBefore`.
        await Product.updateOne(
            { _id: product._id },
            { $set: { stock: entry.stockBefore, isHidden: entry.stockBefore === 0 } }
        );
        console.log(`Reverted existing product ${product.marca} ${product.modelo} from ${product.stock} to ${entry.stockBefore} stock.`);
        totalReverted++;
    }

    // Delete the false history entry
    await StockHistory.deleteOne({ _id: entry._id });
  }

  // Also, the AI might have executed an 'OCULTAR_LOTE' afterwards to try to fix it.
  // When it hides, it sets isHidden=true and creates an "ocultar" history entry.
  // If we already deleted the new products, we don't need to do anything about them.
  // But for existing products, we already reverted them to their stockBefore (and isHidden=true if it was 0).
  // Let's delete any "ocultado por IA" history entries in the last 2 hours to clean the history.
  const hideEntries = await StockHistory.find({
    createdAt: { $gte: twoHoursAgo },
    reason: /Ocultado por el Asistente IA/i
  }).lean();

  for (const h of hideEntries) {
    await StockHistory.deleteOne({ _id: h._id });
  }
  console.log(`Cleaned up ${hideEntries.length} "ocultar" history entries created by the AI's partial fix.`);

  console.log(`\nDONE. Reverted ${totalReverted} existing products, deleted ${totalDeleted} false new products.`);
  process.exit(0);
}

fixMistake().catch(console.error);
