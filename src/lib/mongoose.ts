import mongoose from "mongoose";
import { setServers } from "node:dns";
import { isIP } from "node:net";
mongoose.set("transactionAsyncLocalStorage", true);
if (process.env.MONGODB_DNS_SERVERS) {
  const servers = process.env.MONGODB_DNS_SERVERS.split(",").map((s) =>
    s.trim(),
  );
  if (servers.length && servers.every((s) => isIP(s))) setServers(servers);
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Por favor define la variable MONGODB_URI dentro de .env.local",
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    };

    cached.promise = mongoose
      .connect(uri, opts)
      .then((mongoose) => {
        console.log("✅ Conectado a MongoDB Atlas (Mongoose)");
        return mongoose;
      })
      .catch((err) => {
        console.error("❌ Error conectando a MongoDB:", err);
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectToDatabase;
