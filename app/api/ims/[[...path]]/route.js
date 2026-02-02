/**
 * VastraDrobe Internal Inventory Management System (IMS) API
 *
 * This API integrates with existing VastraDrobe database without breaking it.
 * Handles warehouse-wise inventory tracking, stock movements, and admin operations.
 */

import { connectDB } from "@/lib/db";
import { verifyToken, checkRole, generateToken } from "@/lib/auth";
import {
  Product,
  Orders,
  IMSAdminUser,
  IMSWarehouse,
  IMSInventory,
  IMSStockMovement,
  IMSActivityLog,
} from "@/models/index";
import {
  addStock,
  removeStock,
  transferStock,
  recordSale,
  recordReturn,
  getProductInventory,
  getLowStockItems,
  getStockMovements,
} from "@/services/inventoryService";
import bcrypt from "bcryptjs";
import { runTransaction } from "@/lib/runTransaction";
import cloudinary from "@/lib/cloudinary";

// Helper to log activities
async function logActivity(
  userId,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  ipAddress,
) {
  try {
    await IMSActivityLog.create({
      userId,
      action,
      entityType,
      entityId,
      oldValue,
      newValue,
      ipAddress: ipAddress || "unknown",
    });
  } catch (error) {
    console.error("Activity log error:", error);
  }
}

export async function POST(request, { params }) {
  try {
    await connectDB();

    const routePath = params?.path?.join("/") || "";
    const authHeader = request.headers.get("authorization");

    console.log("IMS POST path:", routePath); // Debug

    // =============================
    // PUBLIC ROUTES (No Auth)
    // =============================

    if (routePath === "auth/login") {
      const body = await request.json();

      const { email, password } = body;

      const user = await IMSAdminUser.findOne({ email, isActive: true });
      if (!user) {
        return Response.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return Response.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const token = generateToken({
        id: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      await logActivity(
        user._id,
        "login",
        "auth",
        user._id.toString(),
        null,
        null,
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    }

    // =============================
    // PROTECTED ROUTES (Auth Required)
    // =============================

    const user = verifyToken(authHeader);

    // ----- PRODUCTS -----

    if (routePath === "products/list") {
      const body = await request.json();

      const { search, category, limit = 50, page = 1 } = body;

      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { subcategory: { $regex: search, $options: "i" } },
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

      return Response.json({
        products,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
      });
    }

    if (routePath === "products/create") {
      checkRole(user, ["admin"]);

      const formData = await request.formData();

      const name = formData.get("name");
      const description = formData.get("description");
      const category = formData.get("category");
      const subcategory = formData.get("subcategory");
      const brand = formData.get("brand");
      const price = Number(formData.get("price"));
      const mrp = Number(formData.get("mrp"));

      const sizes = (formData.get("sizes") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const color = (formData.get("color") || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const imageFiles = formData.getAll("images"); // File[]

      if (!name || !price) {
        return Response.json(
          { error: "Name & price required" },
          { status: 400 },
        );
      }

      const imagePaths = [];

      for (const file of imageFiles) {
        if (!file || typeof file === "string") continue;

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const uploadRes = await cloudinary.uploader.upload(base64, {
          folder: "products",
        });

        imagePaths.push(uploadRes.secure_url); // ✅ PUBLIC URL
      }

      const lastProduct = await Product.findOne().sort({ productId: -1 });
      const nextProductId = (lastProduct?.productId || 0) + 1;

      const product = await Product.create({
        productId: nextProductId,
        name,
        description,
        category,
        subcategory,
        brand,
        price,
        mrp: mrp || price,
        sizes,
        color,
        images: imagePaths, // ✅ NOW STORES
        stock: 0,
        isActive: true,
      });

      return Response.json({
        message: "Product created successfully",
        productId: product.productId,
        images: imagePaths,
      });
    }

    if (routePath === "products/update") {
      const body = await request.json();

      checkRole(user, ["admin"]);
      const { productId, ...updates } = body;

      const oldProduct = await Product.findOne({ productId }).lean();
      if (!oldProduct) {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }

      const product = await Product.findOneAndUpdate(
        { productId },
        { $set: updates },
        { new: true },
      );

      await logActivity(
        user.id,
        "update",
        "product",
        productId.toString(),
        oldProduct,
        updates,
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({
        message: "Product updated successfully",
        product,
      });
    }

    // ----- WAREHOUSES -----

    if (routePath === "warehouses/list") {
      const warehouses = await IMSWarehouse.find({ isActive: true }).lean();
      return Response.json({ warehouses });
    }

    if (routePath === "warehouses/create") {
      const body = await request.json();

      checkRole(user, ["admin"]);

      const { name, code, location, type, contactPerson, phone, address } =
        body;

      const warehouse = await IMSWarehouse.create({
        name,
        code: code || `WH-${Date.now()}`,
        location,
        type: type || "warehouse",
        contactPerson,
        phone,
        address,
      });

      await logActivity(
        user.id,
        "create",
        "warehouse",
        warehouse._id.toString(),
        null,
        warehouse.toObject(),
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({
        message: "Warehouse created successfully",
        warehouseId: warehouse._id.toString(),
      });
    }

    if (routePath === "warehouses/update") {
      const body = await request.json();

      checkRole(user, ["admin"]);

      const { warehouseId, ...updates } = body;

      const oldWarehouse = await IMSWarehouse.findById(warehouseId).lean();
      if (!oldWarehouse) {
        return Response.json({ error: "Warehouse not found" }, { status: 404 });
      }

      const warehouse = await IMSWarehouse.findByIdAndUpdate(
        warehouseId,
        { $set: updates },
        { new: true },
      );

      await logActivity(
        user.id,
        "update",
        "warehouse",
        warehouseId,
        oldWarehouse,
        updates,
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({
        message: "Warehouse updated successfully",
        warehouse,
      });
    }

    // -------- STOCK MOVEMENT ----------
    if (routePath === "stock-movements/create") {
      const body = await request.json();

      checkRole(user, ["admin", "inventory_manager"]);

      const {
        productId,
        size,
        quantity,
        type,
        fromWarehouseId,
        toWarehouseId,
        reason,
        referenceNumber,
      } = body;

      const pid = parseInt(productId);
      const qty = parseInt(quantity);

      const result = await runTransaction(async (session) => {
        // 1️⃣ Create movement (AUDIT)
        const movement = await IMSStockMovement.create(
          [
            {
              productId: pid,
              size,
              quantity: qty,
              type,
              fromWarehouseId: fromWarehouseId || null,
              toWarehouseId: toWarehouseId || null,
              performedBy: user.id,
              reason: reason || "",
              referenceNumber: referenceNumber || "",
            },
          ],
          { session },
        );

        // helper
        const adjustInventory = async (warehouseId, delta) => {
          return IMSInventory.findOneAndUpdate(
            { productId: pid, warehouseId, size },
            {
              $inc: { quantity: delta },
              $set: { lastUpdated: new Date(), updatedBy: user.id },
            },
            { new: true, upsert: true, session },
          );
        };

        if (["in", "return"].includes(type)) {
          await adjustInventory(toWarehouseId, qty);
        }

        if (["out", "sale", "damaged"].includes(type)) {
          await adjustInventory(fromWarehouseId, -qty);
        }

        if (type === "transfer") {
          await adjustInventory(fromWarehouseId, -qty);
          await adjustInventory(toWarehouseId, qty);
        }

        // 3️⃣ Recalculate product stock
        const inventories = await IMSInventory.find({ productId: pid }, null, {
          session,
        });

        const totalStock = inventories.reduce(
          (sum, inv) => sum + inv.quantity,
          0,
        );

        await Product.updateOne(
          { productId: pid },
          { $set: { stock: totalStock } },
          { session },
        );

        return movement[0];
      });

      return Response.json({
        message: "Stock movement created and inventory updated",
        movement: result,
      });
    }

    // ----- INVENTORY -----

    if (routePath === "inventory/add-stock") {
      const body = await request.json();

      checkRole(user, ["admin", "inventory_manager"]);

      const {
        productId,
        warehouseId,
        size,
        quantity,
        reason,
        referenceNumber,
      } = body;

      const inventory = await addStock(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        reason,
        referenceNumber,
      );

      return Response.json({
        message: "Stock added successfully",
        inventory,
      });
    }

    if (routePath === "inventory/remove-stock") {
      const body = await request.json();

      checkRole(user, ["admin", "inventory_manager"]);

      const {
        productId,
        warehouseId,
        size,
        quantity,
        reason,
        referenceNumber,
      } = body;

      const inventory = await removeStock(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        reason,
        referenceNumber,
      );

      return Response.json({
        message: "Stock removed successfully",
        inventory,
      });
    }

    if (routePath === "inventory/transfer") {
      const body = await request.json();

      checkRole(user, ["admin", "inventory_manager"]);

      const {
        productId,
        fromWarehouseId,
        toWarehouseId,
        size,
        quantity,
        reason,
        referenceNumber,
      } = body;

      const result = await transferStock(
        parseInt(productId),
        fromWarehouseId,
        toWarehouseId,
        size,
        parseInt(quantity),
        user.id,
        reason,
        referenceNumber,
      );

      return Response.json({
        message: "Stock transferred successfully",
        ...result,
      });
    }

    if (routePath === "inventory/record-sale") {
      const body = await request.json();

      checkRole(user, ["admin", "inventory_manager"]);

      const { productId, warehouseId, size, quantity, orderNumber } = body;

      const inventory = await recordSale(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        orderNumber,
      );

      return Response.json({
        message: "Sale recorded and stock deducted",
        inventory,
      });
    }

    if (routePath === "inventory/record-return") {
      const body = await request.json();

      checkRole(user, ["admin", "inventory_manager"]);

      const { productId, warehouseId, size, quantity, orderNumber } = body;

      const inventory = await recordReturn(
        parseInt(productId),
        warehouseId,
        size,
        parseInt(quantity),
        user.id,
        orderNumber,
      );

      return Response.json({
        message: "Return recorded and stock added back",
        inventory,
      });
    }

    if (routePath === "inventory/update") {
      const body = await request.json();

      checkRole(user, ["admin", "inventory_manager"]);

      const { inventoryId, quantity, reorderLevel, reorderQuantity } = body;

      const inventory = await IMSInventory.findByIdAndUpdate(
        inventoryId,
        {
          $set: {
            quantity: parseInt(quantity),
            reorderLevel: parseInt(reorderLevel),
            reorderQuantity: parseInt(reorderQuantity),
            lastUpdated: new Date(),
            updatedBy: user.id,
          },
        },
        { new: true },
      ).populate("warehouseId");

      if (!inventory) {
        return Response.json(
          { error: "Inventory record not found" },
          { status: 404 },
        );
      }

      // Update product total stock
      const allInventory = await IMSInventory.find({
        productId: inventory.productId,
      });
      const totalStock = allInventory.reduce(
        (sum, inv) => sum + inv.quantity,
        0,
      );
      await Product.updateOne(
        { productId: inventory.productId },
        { $set: { stock: totalStock } },
      );

      await logActivity(
        user.id,
        "update",
        "inventory",
        inventoryId,
        null,
        { quantity, reorderLevel, reorderQuantity },
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({
        message: "Inventory updated successfully",
        inventory,
      });
    }

    // ----- ORDERS -----
    // POST /api/ims/orders/fulfill
    if (routePath === "orders/fulfill") {
      checkRole(user, ["admin", "inventory_manager"]);

      const { orderId } = await request.json();

      if (!orderId) {
        return Response.json(
          { error: "Order ID is required" },
          { status: 400 },
        );
      }

      const result = await runTransaction(async (session) => {
        const order = await Orders.findById(orderId).session(session);

        if (!order) throw new Error("Order not found");
        if (order.status === "fulfilled") {
          throw new Error("Order already fulfilled");
        }

        for (const item of order.items) {
          const productId = Number(item.productId);

          // ✅ normalize quantity
          const quantity = Number(item.quantity) || Number(item.qty) || 1;

          if (!productId || !quantity || isNaN(quantity)) {
            console.error("Invalid order item detected:", item);
            throw new Error("Invalid order item data");
          }

          // ✅ fallback warehouse
          const warehouseId =
            item.warehouseId || (await IMSWarehouse.findOne().lean())?._id;

          if (!warehouseId) {
            throw new Error("No warehouse available to fulfill order");
          }

          // ✅ size fallback
          const size = item.size || "FREE";

          // 🔻 Deduct inventory
          await IMSInventory.findOneAndUpdate(
            { productId, warehouseId, size },
            {
              $inc: { quantity: -quantity },
              $set: { updatedBy: user.id, lastUpdated: new Date() },
            },
            { session, upsert: true },
          );

          // 📦 Stock movement log
          await IMSStockMovement.create(
            [
              {
                productId,
                size,
                quantity,
                type: "sale",
                fromWarehouseId: warehouseId,
                performedBy: user.id,
                referenceNumber: order._id.toString(),
              },
            ],
            { session },
          );
        }

        await Orders.updateOne(
          { _id: order._id },
          {
            $set: {
              status: "fulfilled",
              fulfilledAt: new Date(),
            },
          },
          { session },
        );

        return order;
      });

      await logActivity(
        user.id,
        "fulfill",
        "order",
        orderId,
        null,
        { status: "fulfilled" },
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({
        message: "Order fulfilled successfully",
        order: result,
      });
    }

    // ----- ADMIN USERS -----

    if (routePath === "admin-users/create") {
      try {
        checkRole(user, ["admin"]);

        const { name, email, password, role } = await request.json();

        if (!name || !email || !password) {
          return Response.json(
            { error: "Name, email and password are required" },
            { status: 400 },
          );
        }

        const existingUser = await IMSAdminUser.findOne({ email });
        if (existingUser) {
          return Response.json(
            { error: "User already exists" },
            { status: 409 },
          );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await IMSAdminUser.create({
          name,
          email,
          password: hashedPassword,
          role: role || "inventory_manager",
          isActive: true,
        });

        await logActivity(
          user.id,
          "create",
          "admin_user",
          newUser._id.toString(),
          null,
          { email, name, role: newUser.role },
          request.headers.get("x-forwarded-for"),
        );

        return Response.json(
          {
            message: "User created successfully",
            user: {
              id: newUser._id,
              name: newUser.name,
              email: newUser.email,
              role: newUser.role,
            },
          },
          { status: 201 },
        );
      } catch (err) {
        console.error(err);
        return Response.json(
          { error: err.message || "Internal server error" },
          { status: 500 },
        );
      }
    }
  } catch (error) {
    console.error("IMS API Error:", error);
    return Response.json(
      {
        error: error.message || "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

export async function GET(request, { params }) {
  try {
    await connectDB();

    const routePath = params?.path?.join("/") || "";
    const authHeader = request.headers.get("authorization");
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // =============================
    // PUBLIC ROUTES (No Auth)
    // =============================

    // GET /api/ims/public/products
    if (routePath === "public/products") {
      const category = searchParams.get("category");

      // pagination params
      const page = Math.max(parseInt(searchParams.get("page")) || 1, 1);
      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 50);
      const skip = (page - 1) * limit;

      const filter = { isActive: true };
      if (category) filter.category = category;

      const products = await Product.find(filter)
        .select(
          "productId name price mrp images category subcategory sizes stock",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return Response.json({ products });
    }

     if (routePath === "public/products/latest") {
      const products = await Product.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();

      return Response.json({ products });
    }

    // GET /api/ims/public/products/:productId
    if (routePath.startsWith("public/products/")) {
      const productId = Number(routePath.split("/")[2]);

      if (!Number.isInteger(productId)) {
        return Response.json({ error: "Invalid product ID" }, { status: 400 });
      }

      const product = await Product.findOne({
        productId,
        isActive: true,
      }).lean();

      if (!product) {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }

      return Response.json({ product });
    }

    // Auth required for all GET routes
    const user = verifyToken(authHeader);

    // ----- PRODUCTS -----

    if (routePath === "products/list") {
      const search = searchParams.get("search") || "";
      const category = searchParams.get("category") || "";
      const limit = parseInt(searchParams.get("limit") || "50");
      const page = parseInt(searchParams.get("page") || "1");

      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { category: { $regex: search, $options: "i" } },
          { subcategory: { $regex: search, $options: "i" } },
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

    if (routePath.startsWith("products/") && !routePath.includes("list")) {
      const productId = parseInt(routePath.split("/")[2]);

      const product = await Product.findOne({ productId }).lean();
      if (!product) {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }

      // Get inventory across all warehouses
      const inventory = await getProductInventory(productId);

      return Response.json({ product, inventory });
    }

    // ----- WAREHOUSES -----

    if (routePath === "warehouses/list") {
      const warehouses = await IMSWarehouse.find({ isActive: true }).lean();
      return Response.json({ warehouses });
    }

    // ----- INVENTORY -----

    if (routePath === "inventory/list") {
      const productId = searchParams.get("productId");
      const warehouseId = searchParams.get("warehouseId");
      const lowStock = searchParams.get("lowStock") === "true";
      const limit = parseInt(searchParams.get("limit") || "100");

      const query = {};
      if (productId) query.productId = parseInt(productId);
      if (warehouseId) query.warehouseId = warehouseId;
      if (lowStock) {
        query.$expr = { $lte: ["$quantity", "$reorderLevel"] };
      }

      const inventory = await IMSInventory.find(query)
        .populate("warehouseId")
        .limit(limit)
        .lean();

      // Enrich with product details
      const enrichedInventory = await Promise.all(
        inventory.map(async (inv) => {
          const product = await Product.findOne({
            productId: inv.productId,
          }).lean();
          return {
            ...inv,
            product: product || null,
          };
        }),
      );

      return Response.json({
        inventory: enrichedInventory,
        total: inventory.length,
      });
    }

    if (routePath === "inventory/low-stock") {
      const lowStockItems = await getLowStockItems();

      // Enrich with product details
      const enriched = await Promise.all(
        lowStockItems.map(async (item) => {
          const product = await Product.findOne({
            productId: item.productId,
          }).lean();
          return {
            ...item,
            product: product || null,
          };
        }),
      );

      return Response.json({ lowStockItems: enriched, count: enriched.length });
    }

    // ----- STOCK MOVEMENTS -----

    if (routePath === "stock-movements/list") {
      const filters = {
        productId: searchParams.get("productId")
          ? parseInt(searchParams.get("productId"))
          : undefined,
        type: searchParams.get("type"),
        warehouseId: searchParams.get("warehouseId"),
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
      };

      const limit = parseInt(searchParams.get("limit") || "50");

      const movements = await getStockMovements(filters, limit);

      // Enrich with product details
      const enrichedMovements = await Promise.all(
        movements.map(async (mov) => {
          const product = await Product.findOne({
            productId: mov.productId,
          }).lean();
          return {
            ...mov,
            product: product || null,
          };
        }),
      );

      return Response.json({
        movements: enrichedMovements,
        total: enrichedMovements.length,
      });
    }

    // ----- DASHBOARD -----

    if (routePath === "dashboard/stats") {
      // Total stock value
      const inventories = await IMSInventory.find().lean();
      const productIds = [...new Set(inventories.map((inv) => inv.productId))];

      const products = await Product.find({
        productId: { $in: productIds },
      }).lean();
      const productMap = Object.fromEntries(
        products.map((p) => [p.productId, p]),
      );

      let totalValue = 0;
      let totalQuantity = 0;

      inventories.forEach((inv) => {
        const product = productMap[inv.productId];
        if (product) {
          totalValue += product.price * inv.quantity;
          totalQuantity += inv.quantity;
        }
      });

      // Low stock count
      const lowStockCount = inventories.filter(
        (inv) => inv.quantity <= inv.reorderLevel,
      ).length;

      // Out of stock
      const outOfStockCount = inventories.filter(
        (inv) => inv.quantity === 0,
      ).length;

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
        recentMovements,
      });
    }

    // ----- ADMIN USERS -----

    if (routePath === "admin-users/list") {
      checkRole(user, ["admin"]);

      const users = await IMSAdminUser.find({ isActive: true })
        .select("-password")
        .lean();

      return Response.json({ users });
    }

    // ----- ACTIVITY LOGS -----

    if (routePath === "activity-logs/list") {
      checkRole(user, ["admin"]);

      const limit = parseInt(searchParams.get("limit") || "100");

      const logs = await IMSActivityLog.find()
        .populate("userId", "name email")
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return Response.json({ logs, total: logs.length });
    }

    // ----- CATEGORIES -----

    if (routePath === "categories/list") {
      // Get unique categories from existing products
      const categories = await Product.distinct("category");
      const categoriesArray = categories.filter(Boolean).map((cat) => ({
        id: cat,
        name: cat,
        isActive: true,
      }));
      return Response.json({ categories: categoriesArray });
    }

    // ----- ORDERS -----

    if (routePath === "orders/list") {
      const limit = parseInt(searchParams.get("limit") || "50");
      const page = parseInt(searchParams.get("page") || "1");
      const status = searchParams.get("status");

      const query = {};
      if (status) query.status = status;

      const orders = await Orders.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      // Transform orders to match expected format
      const transformedOrders = orders.map((order) => ({
        id: order._id.toString(),
        orderNumber: order._id.toString().slice(-8),
        items: order.items,
        totalAmount: order.totalAmount,
        deliveryAddress: order.deliveryAddress,
        status: order.status,
        createdAt: order.createdAt,
        fulfilledAt: order.updatedAt,
      }));

      const total = await Orders.countDocuments(query);

      return Response.json({ orders: transformedOrders, total, page, limit });
    }

    return Response.json({ error: "Route not found" }, { status: 404 });
  } catch (error) {
    console.error("IMS API Error:", error);
    return Response.json(
      {
        error: error.message || "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

// Add missing DELETE handler
export async function DELETE(request, { params }) {
  try {
    await connectDB();

    const routePath = params?.path?.join("/") || "";
    const authHeader = request.headers.get("authorization");
    const user = verifyToken(authHeader);

    // Delete admin user
    if (routePath.startsWith("admin-users/")) {
      checkRole(user, ["admin"]);

      const userId = routePath.split("/")[1];

      // Prevent self-deletion
      if (userId === user.id) {
        return Response.json(
          { error: "Cannot delete your own account" },
          { status: 400 },
        );
      }

      const deletedUser = await IMSAdminUser.findByIdAndUpdate(
        userId,
        { $set: { isActive: false } },
        { new: true },
      );

      if (!deletedUser) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      await logActivity(
        user.id,
        "delete",
        "admin_user",
        userId,
        null,
        { isActive: false },
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({ message: "User deleted successfully" });
    }
    // ----- ACTIVITY LOGS -----

    if (routePath === "activity-logs/list") {
      checkRole(user, ["admin"]);

      const limit = parseInt(searchParams.get("limit") || "100");

      const logs = await IMSActivityLog.find()
        .populate("userId", "name email")
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      return Response.json({ logs, total: logs.length });
    }

    // ----- CATEGORIES -----

    if (routePath === "categories/list") {
      // Get unique categories from products
      const categories = await Product.distinct("category");
      const categoriesArray = categories.map((cat) => ({ name: cat, id: cat }));
      return Response.json({ categories: categoriesArray });
    }

    // ----- ORDERS -----

    if (routePath === "orders/list") {
      const limit = parseInt(searchParams.get("limit") || "50");
      const page = parseInt(searchParams.get("page") || "1");
      const status = searchParams.get("status");

      const query = {};
      if (status) query.status = status;

      const orders = await Orders.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      const total = await Orders.countDocuments(query);

      return Response.json({ orders, total, page, limit });
    }

    return Response.json({ error: "Route not found" }, { status: 404 });
  } catch (error) {
    console.error("IMS DELETE Error:", error);
    return Response.json(
      {
        error: error.message || "Internal server error",
      },
      { status: 500 },
    );
  }
}
