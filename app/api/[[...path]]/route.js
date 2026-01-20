import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME || 'vastradrobe_ims';
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient.db(DB_NAME);
  }
  
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  cachedClient = client;
  return client.db(DB_NAME);
}

// JWT Middleware
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Role-based access control
function checkRole(user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Insufficient permissions');
  }
}

// Activity log function
async function logActivity(db, userId, action, entityType, entityId, oldValue, newValue, ipAddress) {
  await db.collection('activity_logs').insertOne({
    id: uuidv4(),
    userId,
    action,
    entityType,
    entityId,
    oldValue: oldValue || null,
    newValue: newValue || null,
    ipAddress: ipAddress || 'unknown',
    timestamp: new Date()
  });
}

export async function POST(request, { params }) {
  try {
    const path = params?.path?.join('/') || '';
    const body = await request.json();
    const db = await connectToDatabase();
    const authHeader = request.headers.get('authorization');
    
    // Public routes (no auth required)
    if (path === 'auth/login') {
      const { email, password } = body;
      
      const user = await db.collection('users').findOne({ email, isActive: true });
      if (!user) {
        return Response.json({ error: 'Invalid credentials' }, { status: 401 });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return Response.json({ error: 'Invalid credentials' }, { status: 401 });
      }
      
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      
      await logActivity(db, user.id, 'login', 'auth', user.id, null, null, request.headers.get('x-forwarded-for'));
      
      return Response.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    }
    
    if (path === 'auth/register') {
      const { email, password, name, role } = body;
      
      const existingUser = await db.collection('users').findOne({ email });
      if (existingUser) {
        return Response.json({ error: 'User already exists' }, { status: 400 });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();
      
      await db.collection('users').insertOne({
        id: userId,
        email,
        password: hashedPassword,
        name,
        role: role || 'warehouse_staff',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      return Response.json({ message: 'User registered successfully', id: userId });
    }
    
    // Protected routes (auth required)
    const user = verifyToken(authHeader);
    
    // Products
    if (path === 'products/create') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { name, description, category, brand, basePrice, images } = body;
      const productId = uuidv4();
      
      await db.collection('products').insertOne({
        id: productId,
        name,
        description,
        category,
        brand,
        basePrice,
        images: images || [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: user.id
      });
      
      await logActivity(db, user.id, 'create', 'product', productId, null, { name, category, brand }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Product created', id: productId });
    }
    
    if (path === 'products/update') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { id, ...updates } = body;
      const oldProduct = await db.collection('products').findOne({ id });
      
      await db.collection('products').updateOne(
        { id },
        { $set: { ...updates, updatedAt: new Date() } }
      );
      
      await logActivity(db, user.id, 'update', 'product', id, oldProduct, updates, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Product updated' });
    }
    
    // Product Variants
    if (path === 'variants/create') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { productId, sku, barcode, size, color, additionalPrice } = body;
      const variantId = uuidv4();
      
      await db.collection('product_variants').insertOne({
        id: variantId,
        productId,
        sku,
        barcode,
        size,
        color,
        additionalPrice: additionalPrice || 0,
        isActive: true,
        createdAt: new Date()
      });
      
      await logActivity(db, user.id, 'create', 'variant', variantId, null, { productId, sku, size, color }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Variant created', id: variantId });
    }
    
    if (path === 'variants/update') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { id, sku, barcode, size, color, additionalPrice } = body;
      const oldVariant = await db.collection('product_variants').findOne({ id });
      
      await db.collection('product_variants').updateOne(
        { id },
        { $set: { sku, barcode, size, color, additionalPrice } }
      );
      
      await logActivity(db, user.id, 'update', 'variant', id, oldVariant, { sku, barcode, size, color, additionalPrice }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Variant updated' });
    }
    
    // Warehouses
    if (path === 'warehouses/create') {
      checkRole(user, ['admin']);
      
      const { name, location, type, contactPerson, phone, address } = body;
      const warehouseId = uuidv4();
      
      await db.collection('warehouses').insertOne({
        id: warehouseId,
        name,
        location,
        type,
        contactPerson,
        phone,
        address,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await logActivity(db, user.id, 'create', 'warehouse', warehouseId, null, { name, location, type }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Warehouse created', id: warehouseId });
    }
    
    // Categories
    if (path === 'categories/create') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const { name, type, parentCategory } = body;
      const categoryId = uuidv4();
      
      await db.collection('categories').insertOne({
        id: categoryId,
        name,
        type,
        parentCategory: parentCategory || null,
        isActive: true,
        createdAt: new Date()
      });
      
      return Response.json({ message: 'Category created', id: categoryId });
    }
    
    // Inventory
    if (path === 'inventory/create') {
      checkRole(user, ['admin', 'inventory_manager', 'warehouse_staff']);
      
      const { variantId, warehouseId, quantity, reorderLevel, reorderQuantity } = body;
      const inventoryId = uuidv4();
      
      await db.collection('inventory').insertOne({
        id: inventoryId,
        variantId,
        warehouseId,
        quantity,
        reorderLevel: reorderLevel || 10,
        reorderQuantity: reorderQuantity || 50,
        lastUpdated: new Date(),
        updatedBy: user.id
      });
      
      return Response.json({ message: 'Inventory created', id: inventoryId });
    }
    
    if (path === 'inventory/update') {
      checkRole(user, ['admin', 'inventory_manager', 'warehouse_staff']);
      
      const { id, quantity, reorderLevel, reorderQuantity } = body;
      
      await db.collection('inventory').updateOne(
        { id },
        { 
          $set: { 
            quantity, 
            reorderLevel, 
            reorderQuantity,
            lastUpdated: new Date(),
            updatedBy: user.id
          } 
        }
      );
      
      await logActivity(db, user.id, 'update', 'inventory', id, null, { quantity }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Inventory updated' });
    }
    
    // Stock Movements
    if (path === 'stock-movements/create') {
      checkRole(user, ['admin', 'inventory_manager', 'warehouse_staff']);
      
      const { variantId, fromWarehouseId, toWarehouseId, quantity, type, reason, referenceNumber, notes } = body;
      const movementId = uuidv4();
      
      // Create stock movement record
      await db.collection('stock_movements').insertOne({
        id: movementId,
        variantId,
        fromWarehouseId: fromWarehouseId || null,
        toWarehouseId: toWarehouseId || null,
        quantity,
        type, // in/out/transfer/sale/return/damaged/adjustment
        reason: reason || '',
        referenceNumber: referenceNumber || '',
        notes: notes || '',
        performedBy: user.id,
        createdAt: new Date()
      });
      
      // Update inventory based on movement type
      if (type === 'in' || type === 'return') {
        await db.collection('inventory').updateOne(
          { variantId, warehouseId: toWarehouseId },
          { $inc: { quantity: quantity }, $set: { lastUpdated: new Date(), updatedBy: user.id } },
          { upsert: true }
        );
      } else if (type === 'out' || type === 'sale' || type === 'damaged') {
        await db.collection('inventory').updateOne(
          { variantId, warehouseId: fromWarehouseId },
          { $inc: { quantity: -quantity }, $set: { lastUpdated: new Date(), updatedBy: user.id } }
        );
      } else if (type === 'transfer') {
        // Deduct from source
        await db.collection('inventory').updateOne(
          { variantId, warehouseId: fromWarehouseId },
          { $inc: { quantity: -quantity }, $set: { lastUpdated: new Date(), updatedBy: user.id } }
        );
        // Add to destination
        await db.collection('inventory').updateOne(
          { variantId, warehouseId: toWarehouseId },
          { $inc: { quantity: quantity }, $set: { lastUpdated: new Date(), updatedBy: user.id } },
          { upsert: true }
        );
      }
      
      await logActivity(db, user.id, 'create', 'stock_movement', movementId, null, { type, variantId, quantity }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Stock movement recorded', id: movementId });
    }
    
    // Orders
    if (path === 'orders/create') {
      checkRole(user, ['admin', 'inventory_manager', 'warehouse_staff']);
      
      const { orderNumber, items, totalAmount, warehouseId } = body;
      const orderId = uuidv4();
      
      await db.collection('orders').insertOne({
        id: orderId,
        orderNumber,
        items, // [{ variantId, quantity, price }]
        totalAmount,
        warehouseId,
        status: 'pending',
        createdAt: new Date(),
        fulfilledAt: null
      });
      
      return Response.json({ message: 'Order created', id: orderId });
    }
    
    if (path === 'orders/fulfill') {
      checkRole(user, ['admin', 'inventory_manager', 'warehouse_staff']);
      
      const { orderId } = body;
      const order = await db.collection('orders').findOne({ id: orderId });
      
      if (!order) {
        return Response.json({ error: 'Order not found' }, { status: 404 });
      }
      
      // Deduct stock for each item
      for (const item of order.items) {
        await db.collection('inventory').updateOne(
          { variantId: item.variantId, warehouseId: order.warehouseId },
          { $inc: { quantity: -item.quantity }, $set: { lastUpdated: new Date(), updatedBy: user.id } }
        );
        
        // Record stock movement
        await db.collection('stock_movements').insertOne({
          id: uuidv4(),
          variantId: item.variantId,
          fromWarehouseId: order.warehouseId,
          toWarehouseId: null,
          quantity: item.quantity,
          type: 'sale',
          reason: 'Order fulfillment',
          referenceNumber: order.orderNumber,
          notes: '',
          performedBy: user.id,
          createdAt: new Date()
        });
      }
      
      await db.collection('orders').updateOne(
        { id: orderId },
        { $set: { status: 'fulfilled', fulfilledAt: new Date() } }
      );
      
      await logActivity(db, user.id, 'fulfill', 'order', orderId, { status: 'pending' }, { status: 'fulfilled' }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Order fulfilled' });
    }
    
    // Users management
    if (path === 'users/create') {
      checkRole(user, ['admin']);
      
      const { email, password, name, role } = body;
      
      const existingUser = await db.collection('users').findOne({ email });
      if (existingUser) {
        return Response.json({ error: 'User already exists' }, { status: 400 });
      }
      
      const hashedPassword = await bcrypt.hash(password, 10);
      const userId = uuidv4();
      
      await db.collection('users').insertOne({
        id: userId,
        email,
        password: hashedPassword,
        name,
        role,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await logActivity(db, user.id, 'create', 'user', userId, null, { email, name, role }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'User created', id: userId });
    }
    
    if (path === 'users/update') {
      checkRole(user, ['admin']);
      
      const { id, name, role, isActive } = body;
      
      await db.collection('users').updateOne(
        { id },
        { $set: { name, role, isActive, updatedAt: new Date() } }
      );
      
      await logActivity(db, user.id, 'update', 'user', id, null, { name, role, isActive }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'User updated' });
    }
    
    return Response.json({ error: 'Route not found' }, { status: 404 });
    
  } catch (error) {
    console.error('API Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request, { params }) {
  try {
    const path = params?.path?.join('/') || '';
    const db = await connectToDatabase();
    const authHeader = request.headers.get('authorization');
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    
    // Public routes
    if (path === 'auth/verify') {
      const user = verifyToken(authHeader);
      return Response.json({ valid: true, user });
    }
    
    // Protected routes
    const user = verifyToken(authHeader);
    
    // Dashboard
    if (path === 'dashboard/stats') {
      // Total stock value
      const inventoryPipeline = [
        {
          $lookup: {
            from: 'product_variants',
            localField: 'variantId',
            foreignField: 'id',
            as: 'variant'
          }
        },
        { $unwind: '$variant' },
        {
          $lookup: {
            from: 'products',
            localField: 'variant.productId',
            foreignField: 'id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $group: {
            _id: null,
            totalValue: {
              $sum: {
                $multiply: ['$quantity', { $add: ['$product.basePrice', '$variant.additionalPrice'] }]
              }
            },
            totalQuantity: { $sum: '$quantity' }
          }
        }
      ];
      
      const stockValue = await db.collection('inventory').aggregate(inventoryPipeline).toArray();
      
      // Low stock items
      const lowStock = await db.collection('inventory').find({
        $expr: { $lte: ['$quantity', '$reorderLevel'] }
      }).toArray();
      
      // Out of stock
      const outOfStock = await db.collection('inventory').countDocuments({ quantity: 0 });
      
      // Recent movements
      const recentMovements = await db.collection('stock_movements')
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
      
      return Response.json({
        totalStockValue: stockValue[0]?.totalValue || 0,
        totalQuantity: stockValue[0]?.totalQuantity || 0,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock,
        recentMovements
      });
    }
    
    // Products
    if (path === 'products/list') {
      const search = searchParams.get('search') || '';
      const category = searchParams.get('category') || '';
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '50');
      
      const query = { isActive: true };
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { brand: { $regex: search, $options: 'i' } }
        ];
      }
      if (category) {
        query.category = category;
      }
      
      const products = await db.collection('products')
        .find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      
      const total = await db.collection('products').countDocuments(query);
      
      return Response.json({ products, total, page, limit });
    }
    
    if (path.startsWith('products/') && path.split('/')[1] !== 'list') {
      const productId = path.split('/')[1];
      const product = await db.collection('products').findOne({ id: productId, isActive: true });
      
      if (!product) {
        return Response.json({ error: 'Product not found' }, { status: 404 });
      }
      
      // Get variants
      const variants = await db.collection('product_variants').find({ productId, isActive: true }).toArray();
      
      return Response.json({ product, variants });
    }
    
    // Variants
    if (path === 'variants/list') {
      const productId = searchParams.get('productId');
      const query = { isActive: true };
      if (productId) {
        query.productId = productId;
      }
      
      const variants = await db.collection('product_variants').find(query).toArray();
      return Response.json({ variants });
    }
    
    // Warehouses
    if (path === 'warehouses/list') {
      const warehouses = await db.collection('warehouses').find({ isActive: true }).toArray();
      return Response.json({ warehouses });
    }
    
    // Categories
    if (path === 'categories/list') {
      const type = searchParams.get('type');
      const query = { isActive: true };
      if (type) {
        query.type = type;
      }
      
      const categories = await db.collection('categories').find(query).toArray();
      return Response.json({ categories });
    }
    
    // Inventory
    if (path === 'inventory/list') {
      const warehouseId = searchParams.get('warehouseId');
      const lowStock = searchParams.get('lowStock') === 'true';
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '50');
      
      const query = {};
      if (warehouseId) {
        query.warehouseId = warehouseId;
      }
      if (lowStock) {
        query.$expr = { $lte: ['$quantity', '$reorderLevel'] };
      }
      
      const inventory = await db.collection('inventory')
        .find(query)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      
      // Enrich with product and variant details
      const enrichedInventory = await Promise.all(
        inventory.map(async (inv) => {
          const variant = await db.collection('product_variants').findOne({ id: inv.variantId });
          const product = variant ? await db.collection('products').findOne({ id: variant.productId }) : null;
          const warehouse = await db.collection('warehouses').findOne({ id: inv.warehouseId });
          
          return {
            ...inv,
            variant,
            product,
            warehouse
          };
        })
      );
      
      const total = await db.collection('inventory').countDocuments(query);
      
      return Response.json({ inventory: enrichedInventory, total, page, limit });
    }
    
    // Stock Movements
    if (path === 'stock-movements/list') {
      const type = searchParams.get('type');
      const warehouseId = searchParams.get('warehouseId');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '50');
      
      const query = {};
      if (type) query.type = type;
      if (warehouseId) {
        query.$or = [
          { fromWarehouseId: warehouseId },
          { toWarehouseId: warehouseId }
        ];
      }
      if (startDate && endDate) {
        query.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }
      
      const movements = await db.collection('stock_movements')
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      
      // Enrich with details
      const enrichedMovements = await Promise.all(
        movements.map(async (mov) => {
          const variant = await db.collection('product_variants').findOne({ id: mov.variantId });
          const product = variant ? await db.collection('products').findOne({ id: variant.productId }) : null;
          const fromWarehouse = mov.fromWarehouseId ? await db.collection('warehouses').findOne({ id: mov.fromWarehouseId }) : null;
          const toWarehouse = mov.toWarehouseId ? await db.collection('warehouses').findOne({ id: mov.toWarehouseId }) : null;
          const performedByUser = await db.collection('users').findOne({ id: mov.performedBy });
          
          return {
            ...mov,
            variant,
            product,
            fromWarehouse,
            toWarehouse,
            performedByUser
          };
        })
      );
      
      const total = await db.collection('stock_movements').countDocuments(query);
      
      return Response.json({ movements: enrichedMovements, total, page, limit });
    }
    
    // Orders
    if (path === 'orders/list') {
      const status = searchParams.get('status');
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '50');
      
      const query = {};
      if (status) query.status = status;
      
      const orders = await db.collection('orders')
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      
      const total = await db.collection('orders').countDocuments(query);
      
      return Response.json({ orders, total, page, limit });
    }
    
    // Users
    if (path === 'users/list') {
      checkRole(user, ['admin']);
      
      const users = await db.collection('users')
        .find({ isActive: true }, { projection: { password: 0 } })
        .toArray();
      
      return Response.json({ users });
    }
    
    // Activity Logs
    if (path === 'activity-logs/list') {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const entityType = searchParams.get('entityType');
      const userId = searchParams.get('userId');
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '100');
      
      const query = {};
      if (entityType) query.entityType = entityType;
      if (userId) query.userId = userId;
      
      const logs = await db.collection('activity_logs')
        .find(query)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      
      const total = await db.collection('activity_logs').countDocuments(query);
      
      return Response.json({ logs, total, page, limit });
    }
    
    return Response.json({ error: 'Route not found' }, { status: 404 });
    
  } catch (error) {
    console.error('API Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const path = params?.path?.join('/') || '';
    const db = await connectToDatabase();
    const authHeader = request.headers.get('authorization');
    const user = verifyToken(authHeader);
    
    // Soft delete implementations
    if (path.startsWith('products/')) {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const productId = path.split('/')[1];
      
      await db.collection('products').updateOne(
        { id: productId },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
      
      await logActivity(db, user.id, 'delete', 'product', productId, null, { isActive: false }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Product deleted (soft)' });
    }
    
    if (path.startsWith('variants/')) {
      checkRole(user, ['admin', 'inventory_manager']);
      
      const variantId = path.split('/')[1];
      
      await db.collection('product_variants').updateOne(
        { id: variantId },
        { $set: { isActive: false } }
      );
      
      await logActivity(db, user.id, 'delete', 'variant', variantId, null, { isActive: false }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Variant deleted (soft)' });
    }
    
    if (path.startsWith('warehouses/')) {
      checkRole(user, ['admin']);
      
      const warehouseId = path.split('/')[1];
      
      await db.collection('warehouses').updateOne(
        { id: warehouseId },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
      
      await logActivity(db, user.id, 'delete', 'warehouse', warehouseId, null, { isActive: false }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'Warehouse deleted (soft)' });
    }
    
    if (path.startsWith('users/')) {
      checkRole(user, ['admin']);
      
      const userId = path.split('/')[1];
      
      await db.collection('users').updateOne(
        { id: userId },
        { $set: { isActive: false, updatedAt: new Date() } }
      );
      
      await logActivity(db, user.id, 'delete', 'user', userId, null, { isActive: false }, request.headers.get('x-forwarded-for'));
      
      return Response.json({ message: 'User deleted (soft)' });
    }
    
    return Response.json({ error: 'Route not found' }, { status: 404 });
    
  } catch (error) {
    console.error('API Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}