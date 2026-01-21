import mongoose from "mongoose";

/**
 * Runs a MongoDB transaction safely.
 * Use ONLY for stock-changing operations.
 */
export async function runTransaction(work) {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await work(session);
    });

    return result;
  } catch (error) {
    // MongoDB transient error retry hint
    if (error?.errorLabels?.includes("TransientTransactionError")) {
      console.error("TransientTransactionError, retry suggested");
    }
    throw error;
  } finally {
    session.endSession();
  }
}
