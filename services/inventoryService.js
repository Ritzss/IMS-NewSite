import mongoose from "mongoose";
import { IMSInventory, IMSStockMovement, Product } from "../models/index.js";
import { ensureSufficientStock } from "./validateStock.js";
import { runTransaction } from "@/lib/runTransaction.js";

/**
 * Inventory Service with Transaction Support
 * Prevents overselling and ensures data consistency
 */

// Get inventory for a product-size-warehouse
export async function getInventory(productId, warehouseId, size) {
  return await IMSInventory.findOne({ productId, warehouseId, size });
}

// Get all inventory for a product across warehouses
export async function getProductInventory(productId) {
  return await IMSInventory.find({ productId }).populate("warehouseId").lean();
}

// Add stock (IN operation)
export async function addStock(
  productId,
  warehouseId,
  size,
  quantity,
  userId,
  reason = "",
  referenceNumber = "",
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Update or create inventory record
    const inventory = await IMSInventory.findOneAndUpdate(
      { productId, warehouseId, size },
      {
        $inc: { quantity: quantity },
        $set: { lastUpdated: new Date(), updatedBy: userId },
      },
      {
        upsert: true,
        new: true,
        session,
        setDefaultsOnInsert: true,
      },
    );

    // Record stock movement
    await IMSStockMovement.create(
      [
        {
          productId,
          size,
          toWarehouseId: warehouseId,
          quantity,
          type: "in",
          reason,
          referenceNumber,
          performedBy: userId,
        },
      ],
      { session },
    );

    // Update denormalized stock in product (optional)
    await updateProductTotalStock(productId, session);

    await session.commitTransaction();
    return inventory;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// Remove stock (OUT operation) - with overselling prevention
export async function removeStock(
  productId,
  warehouseId,
  size,
  quantity,
  userId,
  reason = "",
  referenceNumber = "",
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ Centralized validation
    const inventory = await ensureSufficientStock(
      productId,
      warehouseId,
      size,
      quantity,
      session,
    );

    // Deduct stock
    inventory.quantity -= quantity;
    inventory.lastUpdated = new Date();
    inventory.updatedBy = userId;
    await inventory.save({ session });

    // Record stock movement
    await IMSStockMovement.create(
      [
        {
          productId,
          size,
          fromWarehouseId: warehouseId,
          quantity,
          type: "out",
          reason,
          referenceNumber,
          performedBy: userId,
        },
      ],
      { session },
    );

    // Update denormalized product stock
    await updateProductTotalStock(productId, session);

    await session.commitTransaction();
    return inventory;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
// Transfer stock between warehouses
export async function transferStock(
  productId,
  fromWarehouseId,
  toWarehouseId,
  size,
  quantity,
  userId,
  reason = "",
  referenceNumber = "",
) {
  return runTransaction(async (session) => {
    // 1️⃣ Validate source stock
    await ensureSufficientStock(
      productId,
      fromWarehouseId,
      size,
      quantity,
      session,
    );

    // 2️⃣ Deduct from source
    await IMSInventory.findOneAndUpdate(
      { productId, warehouseId: fromWarehouseId, size },
      {
        $inc: { quantity: -quantity },
        $set: { lastUpdated: new Date(), updatedBy: userId },
      },
      { session },
    );

    // 3️⃣ Add to destination
    await IMSInventory.findOneAndUpdate(
      { productId, warehouseId: toWarehouseId, size },
      {
        $inc: { quantity },
        $set: { lastUpdated: new Date(), updatedBy: userId },
      },
      { upsert: true, session, setDefaultsOnInsert: true },
    );

    // 4️⃣ Audit log
    await IMSStockMovement.create(
      [
        {
          productId,
          size,
          fromWarehouseId,
          toWarehouseId,
          quantity,
          type: "transfer",
          reason,
          referenceNumber,
          performedBy: userId,
        },
      ],
      { session },
    );

    // 5️⃣ Update product stock
    await updateProductTotalStock(productId, session);

    return { success: true };
  });
}

// Record sale (deducts stock and logs as sale)
export async function recordSale(
  productId,
  warehouseId,
  size,
  quantity,
  userId,
  orderNumber,
) {
  return await removeStock(
    productId,
    warehouseId,
    size,
    quantity,
    userId,
    "Sale",
    orderNumber,
  );
}

// Record return (adds stock back)
export async function recordReturn(
  productId,
  warehouseId,
  size,
  quantity,
  userId,
  orderNumber,
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Add stock back
    const inventory = await IMSInventory.findOneAndUpdate(
      { productId, warehouseId, size },
      {
        $inc: { quantity: quantity },
        $set: { lastUpdated: new Date(), updatedBy: userId },
      },
      {
        upsert: true,
        new: true,
        session,
        setDefaultsOnInsert: true,
      },
    );

    // Record stock movement
    await IMSStockMovement.create(
      [
        {
          productId,
          size,
          toWarehouseId: warehouseId,
          quantity,
          type: "return",
          reason: "Customer return",
          referenceNumber: orderNumber,
          performedBy: userId,
        },
      ],
      { session },
    );

    // Update denormalized stock in product
    await updateProductTotalStock(productId, session);

    await session.commitTransaction();
    return inventory;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// Update denormalized total stock in products collection
async function updateProductTotalStock(productId, session = null) {
  const inventories = await IMSInventory.find({ productId }).session(session);
  const totalStock = inventories.reduce((sum, inv) => sum + inv.quantity, 0);

  await Product.updateOne(
    { productId },
    { $set: { stock: totalStock } },
    { session },
  );
}

// Get low stock items
export async function getLowStockItems() {
  return await IMSInventory.find({
    $expr: { $lte: ["$quantity", "$reorderLevel"] },
  })
    .populate("warehouseId")
    .lean();
}

// Get stock movements with filters
export async function getStockMovements(filters = {}, limit = 50) {
  const query = {};

  if (filters.productId) query.productId = filters.productId;
  if (filters.type) query.type = filters.type;
  if (filters.warehouseId) {
    query.$or = [
      { fromWarehouseId: filters.warehouseId },
      { toWarehouseId: filters.warehouseId },
    ];
  }
  if (filters.startDate && filters.endDate) {
    query.createdAt = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate),
    };
  }

  return await IMSStockMovement.find(query)
    .populate("fromWarehouseId")
    .populate("toWarehouseId")
    .populate("performedBy", "name email")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}
