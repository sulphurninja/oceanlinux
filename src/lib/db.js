import mongoose from "mongoose";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

// Global variable to track the connection promise (for serverless environments)
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

function normalizeMongoUrl(url) {
  if (!url) return url;
  const trimmed = url.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function connectDB() {
  // If already connected, return
  if (cached.conn) {
    return cached.conn;
  }

  // If already connecting, wait for the existing promise
  if (cached.promise) {
    cached.conn = await cached.promise;
    return cached.conn;
  }

  const MONGOOSE_URL = normalizeMongoUrl(process.env.MONGOOSE_URL);

  if (!MONGOOSE_URL) {
    throw new Error('MONGOOSE_URL environment variable is not defined');
  }

  try {
    console.log('[DB] Connecting to MongoDB...');

    cached.promise = mongoose.connect(MONGOOSE_URL, {
      bufferCommands: false, // Disable mongoose buffering for serverless
      maxPoolSize: 25,
      serverSelectionTimeoutMS: 10000, // 10 second timeout for initial connection
      socketTimeoutMS: 45000, // 45 second timeout for socket operations
      family: 4,
    });

    cached.conn = await cached.promise;
    console.log('[DB] MongoDB connected successfully');

    // Enforce wallets balance↔ledger match at Mongo layer (blocks raw Compass $set fraud).
    try {
      if (!cached.walletGuardPromise) {
        const { ensureWalletCollectionGuard } = require('@/lib/walletCollectionGuard');
        cached.walletGuardPromise = ensureWalletCollectionGuard(mongoose);
      }
      await cached.walletGuardPromise;
    } catch (guardErr) {
      console.warn('[DB] wallet collection guard skipped:', guardErr.message);
    }

    // Confirmed recharges must carry gateway + walletTxnId; HMAC-backfill legacy credits.
    try {
      if (!cached.fraudGuardPromise) {
        const {
          ensureWalletRechargeCollectionGuard,
          backfillWalletCreditProofs,
        } = require('@/lib/mongoFraudGuards');
        cached.fraudGuardPromise = (async () => {
          await ensureWalletRechargeCollectionGuard(mongoose);
          await backfillWalletCreditProofs(mongoose);
        })();
      }
      await cached.fraudGuardPromise;
    } catch (fraudErr) {
      console.warn('[DB] mongo fraud guards skipped:', fraudErr.message);
    }

    return cached.conn;
  } catch (error) {
    console.error('[DB] MongoDB connection error:', error.message);
    cached.promise = null; // Reset promise so next call can retry
    throw error; // Don't process.exit - let the API handle the error gracefully
  }
}

export default connectDB;