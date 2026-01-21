import { IMSInventory } from "../models/index.js";

export async function ensureSufficientStock(
  productId,
  warehouseId,
  size,
  quantity,
  session
) {
  const inventory = await IMSInventory.findOne(
    { productId, warehouseId, size },
    null,
    { session }
  );

  if (!inventory || inventory.quantity < quantity) {
    throw new Error(
      `Insufficient stock. Available: ${inventory?.quantity || 0}, Requested: ${quantity}`
    );
  }

  return inventory;
}
