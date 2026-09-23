const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Read .env.local to get MONGODB_URI if not already in process.env
const envLocalPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (!process.env[key]) {
        process.env[key] = value.trim();
      }
    }
  });
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Error: MONGODB_URI no encontrada en variables de entorno ni en .env.local');
  process.exit(1);
}

async function migrate() {
  try {
    console.log('Conectando a MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Conexión establecida.');

    const db = mongoose.connection.db;
    const productsColl = db.collection('products');

    const allProducts = await productsColl.find({}).toArray();
    console.log(`Analizando ${allProducts.length} productos en la base de datos...`);

    let updatedCount = 0;
    let unhiddenCount = 0;

    for (const p of allProducts) {
      const originalMarca = p.marca || '';
      const originalModelo = p.modelo || '';
      const originalCalidad = p.calidad || '';
      const originalIsHidden = !!p.isHidden;
      const stock = Number(p.stock) || 0;

      const upperMarca = originalMarca.toUpperCase().trim();
      const upperModelo = originalModelo.toUpperCase().trim();
      const upperCalidad = originalCalidad.toUpperCase().trim();

      // If stock > 0 and was hidden, pull it out of ocultos/agotados
      let shouldUnhide = false;
      if (stock > 0 && originalIsHidden) {
        shouldUnhide = true;
      }

      const needsTextUpdate = (
        originalMarca !== upperMarca ||
        originalModelo !== upperModelo ||
        originalCalidad !== upperCalidad
      );

      if (needsTextUpdate || shouldUnhide) {
        const updateDoc = {
          marca: upperMarca,
          modelo: upperModelo,
          calidad: upperCalidad,
        };

        if (shouldUnhide) {
          updateDoc.isHidden = false;
          unhiddenCount++;
        }

        await productsColl.updateOne(
          { _id: p._id },
          { $set: updateDoc }
        );
        updatedCount++;
      }
    }

    console.log('───────────────────────────────────────────────────');
    console.log(`✅ Migración completada con éxito:`);
    console.log(`   • Total productos revisados: ${allProducts.length}`);
    console.log(`   • Productos actualizados a MAYÚSCULAS: ${updatedCount}`);
    console.log(`   • Productos con stock reactivados (sacados de ocultos/agotados): ${unhiddenCount}`);
    console.log('───────────────────────────────────────────────────');

    await mongoose.disconnect();
    console.log('Desconectado de MongoDB.');
    process.exit(0);
  } catch (error) {
    console.error('Error durante la migración:', error);
    process.exit(1);
  }
}

migrate();
