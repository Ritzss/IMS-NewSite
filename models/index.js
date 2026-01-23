import mongoose from 'mongoose';

// ========================
// EXISTING VASTRADROBE SCHEMAS (Read-only references)
// ========================

// Product Schema (Existing - DO NOT MODIFY STRUCTURE)
const ProductSchema = new mongoose.Schema({
  productId: { type: Number, unique: true }, // Auto-increment ID
  name: { type: String, required: true },
  price: { type: Number, required: true },
  mrp: { type: Number },
  category: { type: String, required: true },
  subcategory: { type: String },
  sizes: [{ type: String }], // e.g., ["5-6Y", "6-7Y", "8-9Y"]
  color: [{ type: String }], 
  images: [{ type: String }],
  description: { type: String },
  // Optional fields that IMS can add without breaking VastraDrobe
  sku: { type: String },
  brand: { type: String },
  stock: { type: Number, default: 0 }, // Denormalized total stock (optional)
   isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// Orders Schema (Existing - Read-only)
const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  items: [{
    productId: { type: Number, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true },
    qty: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  status: { type: String, required: true },
  deliveryAddress: {
    address: { type: String, required: true },
    phone: { type: String, required: true }
  }
}, { timestamps: true });

// Customer User Schema (Existing - Read-only)
const CustomerUserSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  cart: [{
    productId: { type: Number, required: true },
    qty: { type: Number, required: true }
  }],
  deliveryAddress: {
    address: String,
    phone: String
  }
}, { timestamps: true });

// ========================
// IMS-SPECIFIC SCHEMAS (New collections)
// ========================

// IMS Admin Users (Internal staff only)
const IMSAdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // bcrypt hashed
  name: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['admin', 'inventory_manager','store_manager'], 
    required: true 
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// IMS Warehouses
const IMSWarehouseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true }, // e.g., "WH-DEL-01"
  location: { type: String, required: true },
  type: { type: String, enum: ['warehouse', 'store'], default: 'warehouse' },
  contactPerson: String,
  phone: String,
  address: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// IMS Inventory (Warehouse-wise, Size-wise stock)
const IMSInventorySchema = new mongoose.Schema({
  productId: { type: Number, required: true, ref: 'Product' },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'IMSWarehouse' },
  size: { type: String, required: true }, // Must match product.sizes
  quantity: { type: Number, required: true, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 10 },
  reorderQuantity: { type: Number, default: 50 },
  lastUpdated: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'IMSAdminUser' }
}, { timestamps: true });

// Compound index for unique inventory per product-warehouse-size
IMSInventorySchema.index({ productId: 1, warehouseId: 1, size: 1 }, { unique: true });

// IMS Stock Movements (Audit trail)
const IMSStockMovementSchema = new mongoose.Schema({
  productId: { type: Number, required: true },
  size: { type: String, required: true },
  fromWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'IMSWarehouse' },
  toWarehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'IMSWarehouse' },
  quantity: { type: Number, required: true },
  type: { 
    type: String, 
    enum: ['in', 'out', 'transfer', 'sale', 'return', 'damaged', 'adjustment'],
    required: true 
  },
  reason: String,
  referenceNumber: String, // PO number, order ID, etc.
  notes: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'IMSAdminUser' },
  createdAt: { type: Date, default: Date.now }
});

// IMS Activity Logs
const IMSActivityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'IMSAdminUser' },
  action: { type: String, required: true }, // 'create', 'update', 'delete'
  entityType: { type: String, required: true }, // 'product', 'inventory', etc.
  entityId: { type: String, required: true },
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  timestamp: { type: Date, default: Date.now }
});

// ========================
// MODEL EXPORTS
// ========================

// Existing VastraDrobe models (read/write carefully)
export const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema, 'products');
export const Orders = mongoose.models.Orders || mongoose.model('Orders', OrderSchema, 'orders');
export const CustomerUser = mongoose.models.CustomerUser || mongoose.model('CustomerUser', CustomerUserSchema, 'users');

// IMS-specific models (new collections)
export const IMSAdminUser = mongoose.models.IMSAdminUser || mongoose.model('IMSAdminUser', IMSAdminUserSchema, 'ims_admin_users');
export const IMSWarehouse = mongoose.models.IMSWarehouse || mongoose.model('IMSWarehouse', IMSWarehouseSchema, 'ims_warehouses');
export const IMSInventory = mongoose.models.IMSInventory || mongoose.model('IMSInventory', IMSInventorySchema, 'ims_inventory');
export const IMSStockMovement = mongoose.models.IMSStockMovement || mongoose.model('IMSStockMovement', IMSStockMovementSchema, 'ims_stock_movements');
export const IMSActivityLog = mongoose.models.IMSActivityLog || mongoose.model('IMSActivityLog', IMSActivityLogSchema, 'ims_activity_logs');
