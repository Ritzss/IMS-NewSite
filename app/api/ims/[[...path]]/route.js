/**
 * VastraDrobe Internal Inventory Management System (IMS) API
 * 
 * This API integrates with existing VastraDrobe database without breaking it.
 * Handles warehouse-wise inventory tracking, stock movements, and admin operations.
 */

import { connectDB } from '@/lib/db';
import { verifyToken, checkRole, generateToken } from '@/lib/auth';
import { 
  Product, 
  Order, 
  IMSAdminUser, 
  IMSWarehouse, 
  IMSInventory,
  IMSStockMovement,
  IMSActivityLog 
} from '@/models/index';
import {
  addStock,
  removeStock,
  transferStock,
  recordSale,
  recordReturn,
  getProductInventory,
  getLowStockItems,
  getStockMovements
} from '@/services/inventoryService';
import bcrypt from 'bcryptjs';

// Helper to log activities
async function logActivity(userId, action, entityType, entityId, oldValue, newValue, ipAddress) {
  try {
    await IMSActivityLog.create({
      userId,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ipAddress: ipAddress || 'unknown'
    });
  } catch (error) {
    console.error('Activity log error:', error);
  }
}

export async function POST(request, { params }) {
  try {
    await connectDB();
    
    const path = params?.path?.join('/') || '';
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    
    console.log('IMS POST path:', path); // Debug
    
    // =============================
    // PUBLIC ROUTES (No Auth)
    // =============================
    
    if (path === 'auth/login') {
      const { email, password } = body;
      
      const user = await IMSAdminUser.findOne({ email, isActive: true });
      if (!user) {
        return Response.json({ error: 'Invalid credentials' }, { status: 401 });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return Response.json({ error: 'Invalid credentials' }, { status: 401 });
      }
      
      const token = generateToken({
        id: user._id.toString(),
        email: user.email,
        role: user.role
      });
      
      await logActivity(user._id, 'login', 'auth', user._id.toString(), null, null, request.headers.get('x-forwarded-for'));
      
      return Response.json({
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    }
    
    // =============================
    // PROTECTED ROUTES (Auth Required)
    // =============================
    
    const user = verifyToken(authHeader);
    
    // ----- PRODUCTS -----
    
    if (path === 'products/list') {
      const { search, category, limit = 50, page = 1 } = body;
      
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ];
      }
      if (category) {
        query.category = category;
      }
      
      const products = await Product.find(query)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .sort({ createdAt: -1 })
        .lean();
      
      const total = await Product.countDocuments(query);
      
      return Response.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
    }
    
    if (path === 'products/create') {
      checkRole(user, ['admin']);
      
      const { name, price, basePrice, mrp, category, subCategory, sizes, images, description, sku, brand } = body;
      
      // Get next productId
      const lastProduct = await Product.findOne().sort({ productId: -1 });
      const nextProductId = (lastProduct?.productId || 0) + 1;
      
      // Use basePrice if provided, otherwise use price
      const productPrice = basePrice || price;
      
      if (!productPrice) {
        return Response.json({ error: 'Price is required' }, { status: 400 });
      }
      
      const product = await Product.create({
        productId: nextProductId,
        name,
        price: productPrice,
        mrp: mrp || productPrice,
        category,
        subCategory: subCategory || '',
        sizes: sizes || [],
        images: images || [],
        description: description || '',
        sku: sku || `SKU-${nextProductId}`,
        brand: brand || 'VastraDrobe',
        stock: 0
      });
      
      await logActivity(user.id, 'create', 'product', product.productId.toString(), null, product.toObject(), request.headers.get('x-forwarded-for'));
      
      return Response.json({ 
        message: 'Product created successfully', 
        productId: product.productId,
        _id: product._id
      });
    }
    
    if (path === 'products/update') {
      checkRole(user, ['admin']);
      
      const { productId, ...updates } = body;
      
      const oldProduct = await Product.findOne({ productId }).lean();
      if (!oldProduct) {
        return Response.json({ error: 'Product not found' }, { status: 404 });
      }
      
      const product = await Product.findOneAndUpdate(
        { productId },
        { $set: updates },
        { new: true }
      );
      
      await logActivity(user.id, 'update', 'product', productId.toString(), oldProduct, updates, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Product updated successfully', product });
    }
    
    // ----- WAREHOUSES -----
    
    if (path === 'warehouses/list') {
      const warehouses = await IMSWarehouse.find({ isActive: true }).lean();
      return Response.json({ warehouses });
    }
    
    if (path === 'warehouses/create') {
      checkRole(user, ['admin']);
      
      const { name, code, location, type, contactPerson, phone, address } = body;
      
      const warehouse = await IMSWarehouse.create({
        name,
        code,
        location,
        type: type || 'warehouse',
        contactPerson,
        phone,
        address
      });
      
      await logActivity(user.id, 'create', 'warehouse', warehouse._id.toString(), null, warehouse.toObject(), request.headers.get('x-forwarded-for'));
      
      return Response.json({ 
        message: 'Warehouse created successfully', 
        warehouseId: warehouse._id.toString()
      });
    }
    
    if (path === 'warehouses/update') {
      checkRole(user, ['admin']);
      
      const { warehouseId, ...updates } = body;
      
      const oldWarehouse = await IMSWarehouse.findById(warehouseId).lean();
      if (!oldWarehouse) {
        return Response.json({ error: 'Warehouse not found' }, { status: 404 });
      }
      
      const warehouse = await IMSWarehouse.findByIdAndUpdate(
        warehouseId,
        { $set: updates },
        { new: true }
      );
      
      await logActivity(user.id, 'update', 'warehouse', warehouseId, oldWarehouse, updates, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Warehouse updated successfully', warehouse });
    }
    
    // ----- INVENTORY -----
    
    if (path === 'inventory/add-stock') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { productId, warehouseId, size, quantity, reason, referenceNumber } = body;
      
      const inventory = await addStock(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        reason,
        referenceNumber
      );
      
      return Response.json({ 
        message: 'Stock added successfully', 
        inventory 
      });
    }
    
    if (path === 'inventory/remove-stock') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { productId, warehouseId, size, quantity, reason, referenceNumber } = body;
      
      const inventory = await removeStock(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        reason,
        referenceNumber
      );
      
      return Response.json({ 
        message: 'Stock removed successfully', 
        inventory 
      });
    }
    
    if (path === 'inventory/transfer') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { productId, fromWarehouseId, toWarehouseId, size, quantity, reason, referenceNumber } = body;
      
      const result = await transferStock(
        parseInt(productId),
        fromWarehouseId,
        toWarehouseId,
        size,
        parseInt(quantity),
        user.id,
        reason,
        referenceNumber
      );
      
      return Response.json({ 
        message: 'Stock transferred successfully', 
        ...result 
      });
    }
    
    if (path === 'inventory/record-sale') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { productId, warehouseId, size, quantity, orderNumber } = body;
      
      const inventory = await recordSale(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        orderNumber
      );
      
      return Response.json({ 
        message: 'Sale recorded and stock deducted', 
        inventory 
      });
    }
    
    if (path === 'inventory/record-return') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { productId, warehouseId, size, quantity, orderNumber } = body;
      
      const inventory = await recordReturn(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        orderNumber
      );
      
      return Response.json({ 
        message: 'Return recorded and stock added back', 
        inventory 
      });
    }
    
    if (path === 'inventory/update') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { inventoryId, quantity, reorderLevel, reorderQuantity } = body;
      
      const inventory = await IMSInventory.findByIdAndUpdate(
        inventoryId,
        {
          $set: {
            quantity: parseInt(quantity),
            reorderLevel: parseInt(reorderLevel),
            reorderQuantity: parseInt(reorderQuantity),
            lastUpdated: new Date(),
            updatedBy: user.id
          }
        },
        { new: true }
      ).populate('warehouseId');
      
      if (!inventory) {
        return Response.json({ error: 'Inventory record not found' }, { status: 404 });
      }
      
      // Update product total stock
      const allInventory = await IMSInventory.find({ productId: inventory.productId });
      const totalStock = allInventory.reduce((sum, inv) => sum + inv.quantity, 0);
      await Product.updateOne({ productId: inventory.productId }, { $set: { stock: totalStock } });
      
      await logActivity(user.id, 'update', 'inventory', inventoryId, null, { quantity, reorderLevel, reorderQuantity }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ 
        message: 'Inventory updated successfully', 
        inventory 
      });
    }
    
    // ----- ADMIN USERS -----
    
    if (path === 'admin-users/create') {
      checkRole(user, ['admin']);
      
      const { email, password, name, role } = body;
      
      const existingUser = await IMSAdminUser.findOne({ email });
      if (existingUser) {
        return Response.json({ error: 'User already exists' }, { status: 400 });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = await IMSAdminUser.create({
        email,
        password: hashedPassword,
        name,
        role: role || 'inventory_manager'
      });
      
      await logActivity(user.id, 'create', 'admin_user', newUser._id.toString(), null, { email, name, role }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ 
        message: 'Admin user created successfully', 
        userId: newUser._id.toString() 
      });
    }
    
    return Response.json({ error: 'Route not found' }, { status: 404 });
    
  } catch (error) {
    console.error('IMS API Error:', error);
    return Response.json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    await connectDB();
    
    const path = params?.path?.join('/') || '';
    const authHeader = request.headers.get('authorization');
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    
    // Auth required for all GET routes
    const user = verifyToken(authHeader);
    
    // ----- PRODUCTS -----
    
    if (path === 'products/list') {
      const search = searchParams.get('search') || '';
      const category = searchParams.get('category') || '';
      const limit = parseInt(searchParams.get('limit') || '50');
      const page = parseInt(searchParams.get('page') || '1');
      
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } }
        ];
      }
      if (category) {
        query.category = category;
      }
      
      const products = await Product.find(query)
        .limit(limit)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 })
        .lean();
      
      const total = await Product.countDocuments(query);
      
      return Response.json({ products, total, page, limit });
    }
    
    if (path.startsWith('products/') && !path.includes('list')) {
      const productId = parseInt(path.split('/')[2]);
      
      const product = await Product.findOne({ productId }).lean();
      if (!product) {
        return Response.json({ error: 'Product not found' }, { status: 404 });
      }
      
      // Get inventory across all warehouses
      const inventory = await getProductInventory(productId);
      
      return Response.json({ product, inventory });
    }
    
    // ----- WAREHOUSES -----
    
    if (path === 'warehouses/list') {
      const warehouses = await IMSWarehouse.find({ isActive: true }).lean();
      return Response.json({ warehouses });
    }
    
    // ----- INVENTORY -----
    
    if (path === 'inventory/list') {
      const productId = searchParams.get('productId');
      const warehouseId = searchParams.get('warehouseId');
      const lowStock = searchParams.get('lowStock') === 'true';
      const limit = parseInt(searchParams.get('limit') || '100');
      
      const query = {};
      if (productId) query.productId = parseInt(productId);
      if (warehouseId) query.warehouseId = warehouseId;
      if (lowStock) {
        query.$expr = { $lte: ['$quantity', '$reorderLevel'] };
      }
      
      const inventory = await IMSInventory.find(query)
        .populate('warehouseId')
        .limit(limit)
        .lean();
      
      // Enrich with product details
      const enrichedInventory = await Promise.all(
        inventory.map(async (inv) => {
          const product = await Product.findOne({ productId: inv.productId }).lean();
          return {
            ...inv,
            product: product || null
          };
        })
      );
      
      return Response.json({ inventory: enrichedInventory, total: inventory.length });
    }
    
    if (path === 'inventory/low-stock') {
      const lowStockItems = await getLowStockItems();
      
      // Enrich with product details
      const enriched = await Promise.all(
        lowStockItems.map(async (item) => {
          const product = await Product.findOne({ productId: item.productId }).lean();
          return {
            ...item,
            product: product || null
          };
        })
      );
      
      return Response.json({ lowStockItems: enriched, count: enriched.length });
    }
    
    // ----- STOCK MOVEMENTS -----
    
    if (path === 'stock-movements/list') {
      const filters = {
        productId: searchParams.get('productId') ? parseInt(searchParams.get('productId')) : undefined,
        type: searchParams.get('type'),
        warehouseId: searchParams.get('warehouseId'),
        startDate: searchParams.get('startDate'),
        endDate: searchParams.get('endDate')
      };
      const limit = parseInt(searchParams.get('limit') || '50');
      
      const movements = await getStockMovements(filters, limit);
      
      // Enrich with product details
      const enrichedMovements = await Promise.all(
        movements.map(async (mov) => {
          const product = await Product.findOne({ productId: mov.productId }).lean();
          return {
            ...mov,
            product: product || null
          };
        })
      );
      
      return Response.json({ movements: enrichedMovements, total: enrichedMovements.length });
    }
    
    // ----- DASHBOARD -----
    
    if (path === 'dashboard/stats') {
      // Total stock value
      const inventories = await IMSInventory.find().lean();
      const productIds = [...new Set(inventories.map(inv => inv.productId))];
      
      const products = await Product.find({ productId: { $in: productIds } }).lean();
      const productMap = Object.fromEntries(products.map(p => [p.productId, p]));
      
      let totalValue = 0;
      let totalQuantity = 0;
      
      inventories.forEach(inv => {
        const product = productMap[inv.productId];
        if (product) {
          totalValue += product.price * inv.quantity;
          totalQuantity += inv.quantity;
        }
      });
      
      // Low stock count
      const lowStockCount = inventories.filter(inv => inv.quantity <= inv.reorderLevel).length;
      
      // Out of stock
      const outOfStockCount = inventories.filter(inv => inv.quantity === 0).length;
      
      // Recent movements
      const recentMovements = await IMSStockMovement.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      
      return Response.json({
        totalStockValue: Math.round(totalValue * 100) / 100,
        totalQuantity,
        lowStockCount,
        outOfStockCount,
        uniqueProducts: productIds.length,
        recentMovements
      });
    }
    
    // ----- ADMIN USERS -----
    
    if (path === 'admin-users/list') {
      checkRole(user, ['admin']);
      
      const users = await IMSAdminUser.find({ isActive: true })
        .select('-password')
        .lean();
      
      return Response.json({ users });
    }
    
    // ----- ACTIVITY LOGS -----
    
    if (path === 'activity-logs/list') {
      checkRole(user, ['admin']);
      
      const limit = parseInt(searchParams.get('limit') || '100');
      
      const logs = await IMSActivityLog.find()
        .populate('userId', 'name email')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      
      return Response.json({ logs, total: logs.length });
    }
    
    // ----- CATEGORIES -----
    
    if (path === 'categories/list') {
      // Get unique categories from existing products
      const categories = await Product.distinct('category');
      const categoriesArray = categories.filter(Boolean).map(cat => ({ 
        id: cat, 
        name: cat,
        isActive: true
      }));
      return Response.json({ categories: categoriesArray });
    }
    
    // ----- ORDERS -----
    
    if (path === 'orders/list') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const page = parseInt(searchParams.get('page') || '1');
      const status = searchParams.get('status');
      
      const query = {};
      if (status) query.status = status;
      
      const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();
      
      // Transform orders to match expected format
      const transformedOrders = orders.map(order => ({
        id: order._id.toString(),
        orderNumber: order._id.toString().slice(-8),
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
        fulfilledAt: order.updatedAt
      }));
      
      const total = await Order.countDocuments(query);
      
      return Response.json({ orders: transformedOrders, total, page, limit });
    }
    
    return Response.json({ error: 'Route not found' }, { status: 404 });
    
  } catch (error) {
    console.error('IMS API Error:', error);
    return Response.json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

// Add missing DELETE handler
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    
    const path = params?.path?.join('/') || '';
    const authHeader = request.headers.get('authorization');
    const user = verifyToken(authHeader);
    
    // Delete admin user
    if (path.startsWith('admin-users/')) {
      checkRole(user, ['admin']);
      
      const userId = path.split('/')[1];
      
      // Prevent self-deletion
      if (userId === user.id) {
        return Response.json({ error: 'Cannot delete your own account' }, { status: 400 });
      }
      
      const deletedUser = await IMSAdminUser.findByIdAndUpdate(
        userId,
        { $set: { isActive: false } },
        { new: true }
      );
      
      if (!deletedUser) {
        return Response.json({ error: 'User not found' }, { status: 404 });
      }
      
      await logActivity(user.id, 'delete', 'admin_user', userId, null, { isActive: false }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'User deleted successfully' });
    }
    // ----- ACTIVITY LOGS -----
    
    if (path === 'activity-logs/list') {
      checkRole(user, ['admin']);
      
      const limit = parseInt(searchParams.get('limit') || '100');
      
      const logs = await IMSActivityLog.find()
        .populate('userId', 'name email')
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      
      return Response.json({ logs, total: logs.length });
    }
    
    // ----- CATEGORIES -----
    
    if (path === 'categories/list') {
      // Get unique categories from products
      const categories = await Product.distinct('category');
      const categoriesArray = categories.map(cat => ({ name: cat, id: cat }));
      return Response.json({ categories: categoriesArray });
    }
    
    // ----- ORDERS -----
    
    if (path === 'orders/list') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const page = parseInt(searchParams.get('page') || '1');
      const status = searchParams.get('status');
      
      const query = {};
      if (status) query.status = status;
      
      const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();
      
      const total = await Order.countDocuments(query);
      
      return Response.json({ orders, total, page, limit });
    }
    
    return Response.json({ error: 'Route not found' }, { status: 404 });
    
    return Response.json({ error: 'Route not found' }, { status: 404 });
    
  } catch (error) {
    console.error('IMS DELETE Error:', error);
    return Response.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
