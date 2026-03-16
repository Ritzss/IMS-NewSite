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
  Counter,
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

    const resolveParam = await params;
    const routePath = resolveParam?.path?.join("/") || "";
    const authHeader = request.headers.get("authorization");
    function escapeRegex(text) {
      return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // console.log("IMS POST path:", routePath); // Debug

    // =============================
    // PUBLIC ROUTES (No Auth)
    // =============================

    if (routePath === "auth/login") {
      const body = await request.json();

      const { email, password } = body;

      const user = await IMSAdminUser.findOne({
        email: email.toLowerCase().trim(),
        isActive: true,
      });
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
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ----- PRODUCTS -----

    if (routePath === "products/list") {
      const body = await request.json();

      let { search, category, limit = 50, page = 1 } = body;

      const safeLimit = Math.min(parseInt(limit) || 50, 100);
      const safePage = Math.max(parseInt(page) || 1, 1);
      const query = {};
      if (search) {
        if (search) {
          search = search.trim().slice(0, 50);
        }
        const safeSearch = escapeRegex(search);
        query.$or = [
          { name: { $regex: safeSearch, $options: "i" } },
          { category: { $regex: safeSearch, $options: "i" } },
          { subcategory: { $regex: safeSearch, $options: "i" } },
        ];
      }
      if (category) {
        query.category = category;
      }

      const products = await Product.find(query)
        .select(
          "productId name brand category subcategory price mrp variants createdAt",
        )
        .limit(safeLimit)
        .skip((safePage - 1) * safeLimit)
        .sort({ createdAt: -1 })
        .lean();

      const total = await Product.countDocuments(query);

      return Response.json({
        products,
        total,
        page: parseInt(safePage),
        limit: parseInt(safeLimit),
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
      const color = formData.get("color")?.toLowerCase().trim();
      const capacity = Number(formData.get("capacity"));
      const weight = Number(formData.get("weight"));
      let details = {};
      const detailsRaw = formData.get("details");

      if (detailsRaw) {
        try {
          details = JSON.parse(detailsRaw);
        } catch {
          return Response.json(
            { error: "Invalid details format" },
            { status: 400 },
          );
        }
      }

      if (!name || !color || !price) {
        return Response.json(
          { error: "Name, color and price are required" },
          { status: 400 },
        );
      }

      const imageFiles = formData.getAll("images");

      // ===== Image Validation =====
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      const MAX_IMAGES = 5;
      const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

      if (imageFiles.length > MAX_IMAGES) {
        return Response.json(
          { error: `Maximum ${MAX_IMAGES} images allowed` },
          { status: 400 },
        );
      }

      for (const file of imageFiles) {
        if (!file || typeof file === "string") continue;

        if (!ALLOWED_TYPES.includes(file.type)) {
          return Response.json({ error: "Invalid file type" }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
          return Response.json(
            { error: "Image size exceeds 5MB" },
            { status: 400 },
          );
        }
      }

      const imagePaths = [];

      for (const file of imageFiles) {
        if (!file || typeof file === "string") continue;

        const buffer = Buffer.from(await file.arrayBuffer());

        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "products",
              transformation: [
                { width: 1200, height: 1200, crop: "limit" },
                { quality: "auto" },
              ],
            },
            (error, result) => {
              if (error) return reject(error);
              resolve(result);
            },
          );

          stream.end(buffer);
        });

        imagePaths.push(uploadResult.secure_url);
      }

      // 🔎 Check if product already exists (same name/category/subcategory)
      const existingProduct = await Product.findOne({
        name,
        category,
        subcategory,
      });

      if (existingProduct) {
        const duplicateVariant = existingProduct.variants.find(
          (v) => v.capacity === capacity && v.color === color,
        );

        if (duplicateVariant) {
          return Response.json(
            { error: "Variant already exists for this capacity and color" },
            { status: 400 },
          );
        }
        // Add new variant
        await Product.updateOne(
          { _id: existingProduct._id },
          {
            $push: {
              variants: {
                color,
                images: imagePaths,
                capacity,
                weight,
                price,
                mrp: mrp || price,
              },
            },
          },
        );

        return Response.json({
          message: "Variant added to existing product",
        });
      }

      // 🔒 Ensure counter synced
      const maxProduct = await Product.findOne().sort({ productId: -1 }).lean();

      if (maxProduct) {
        await Counter.updateOne(
          { name: "productId" },
          { $max: { value: maxProduct.productId } },
          { upsert: true },
        );
      }

      const counter = await Counter.findOneAndUpdate(
        { name: "productId" },
        { $inc: { value: 1 } },
        { new: true, upsert: true },
      );

      const nextProductId = counter.value;

      const product = await Product.create({
        productId: nextProductId,
        name,
        description,
        category,
        subcategory,
        brand,
        price,
        mrp: mrp || price,
        stock: 0,
        isActive: true,
        details,
        variants: [
          {
            color,
            images: imagePaths,
            capacity,
            weight,
            price,
            mrp: mrp || price,
          },
        ],
      });

      return Response.json({
        message: "Product created successfully",
        product,
      });
    }

    if (routePath === "products/update") {
      checkRole(user, ["admin"]);

      const formData = await request.formData();

      const productId = Number(formData.get("productId"));
      const name = formData.get("name");
      const description = formData.get("description");
      const category = formData.get("category");
      const subcategory = formData.get("subcategory");
      const brand = formData.get("brand");
      const price = Number(formData.get("price"));
      const mrp = Number(formData.get("mrp"));

      let details = {};
      const detailsRaw = formData.get("details");

      if (detailsRaw) {
        try {
          details = JSON.parse(detailsRaw);
        } catch {
          return Response.json(
            { error: "Invalid details format" },
            { status: 400 },
          );
        }
      }

      const product = await Product.findOneAndUpdate(
        { productId },
        {
          $set: {
            name,
            description,
            category,
            subcategory,
            brand,
            price,
            mrp,
            details,
          },
        },
        { new: true },
      );

      if (!product) {
        return Response.json({ error: "Product not found" }, { status: 404 });
      }

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

      if (!Number.isInteger(productId) || productId < 0) {
        return Response.json({ error: "Invalid product ID" }, { status: 400 });
      }

      if (!warehouseId || !size || quantity < 0) {
        return Response.json(
          { error: "Invalid inventory data" },
          { status: 400 },
        );
      }

      const inventory = await addStock(
        productId,
        warehouseId,
        size,
        quantity,
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
    // POST /api/ims/orders/update-status
    if (routePath === "orders/update-status") {
      checkRole(user, ["admin", "inventory_manager"]);

      const { orderId, newStatus } = await request.json();

      if (!orderId || !newStatus) {
        return Response.json(
          { error: "Order ID and new status are required" },
          { status: 400 },
        );
      }

      const STATUS_FLOW = [
        "pending",
        "paid",
        "packing",
        "shipping",
        "delivered",
      ];

      if (!STATUS_FLOW.includes(newStatus)) {
        return Response.json(
          { error: "Invalid order status" },
          { status: 400 },
        );
      }

      const order = await Orders.findById(orderId);
      if (!order) {
        return Response.json({ error: "Order not found" }, { status: 404 });
      }

      const currentIndex = STATUS_FLOW.indexOf(order.status);
      const nextIndex = STATUS_FLOW.indexOf(newStatus);

      if (nextIndex <= currentIndex) {
        return Response.json(
          { error: "Invalid status transition" },
          { status: 400 },
        );
      }

      // 🔻 Deduct inventory ONLY when moving to PACKING
      if (newStatus === "packing") {
        await runTransaction(async (session) => {
          for (const rawItem of order.items) {
            const item = rawItem.toObject ? rawItem.toObject() : rawItem;

            const productId = Number(item.productId);
            const quantity = Number(item.qty || item.quantity || 1);

            const size =
              typeof item.size === "string"
                ? item.size
                : Array.isArray(item.size)
                  ? item.size[0]
                  : null;

            if (!size) {
              console.warn("Order item missing size:", item);
              continue;
            }

            let warehouse = item.warehouseId;

            if (!warehouse) {
              const warehouseDoc =
                await IMSWarehouse.findOne().session(session);

              if (!warehouseDoc) {
                throw new Error("No warehouse configured");
              }

              warehouse = warehouseDoc._id;
            }

            const inventory = await IMSInventory.findOne(
              { productId, warehouseId: warehouse, size },
              null,
              { session },
            );

            if (!inventory) {
              throw new Error(
                `Inventory not found for product ${productId}, size ${size}, warehouse ${warehouse}`,
              );
            }

            if (inventory.quantity < quantity) {
              throw new Error(
                `Insufficient stock for product ${productId}. Available: ${inventory.quantity}`,
              );
            }

            await IMSInventory.updateOne(
              { _id: inventory._id },
              {
                $inc: { quantity: -quantity },
                $set: { updatedBy: user.id, lastUpdated: new Date() },
              },
              { session },
            );

            await IMSStockMovement.create(
              [
                {
                  productId,
                  size,
                  quantity,
                  type: "sale",
                  fromWarehouseId: warehouse,
                  performedBy: user.id,
                  referenceNumber: order._id.toString(),
                },
              ],
              { session },
            );
          }
        });
      }

      order.status = newStatus;
      await order.save();

      await logActivity(
        user.id,
        "update_status",
        "order",
        orderId,
        null,
        { status: newStatus },
        request.headers.get("x-forwarded-for"),
      );

      return Response.json({
        message: "Order status updated",
        status: order.status,
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
    const resolveParam = await params;
    const rawPath = resolveParam?.path?.join("/") || "";
    const routePath = rawPath.replace(/^ims\//, "");
    const authHeader = request.headers.get("authorization");
    const url = new URL(request.url);
    function escapeRegex(text) {
      return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    const searchParams = url.searchParams;

    // =============================
    // PUBLIC ROUTES (No Auth)
    // =============================

    // GET /api/ims/public/products
    if (routePath === "public/products") {
      // ✅ FAVORITES SUPPORT (ids=1,2,3)
      const idsParam = searchParams.get("ids");
      if (idsParam) {
        const ids = idsParam
          .split(",")
          .map((id) => Number(id))
          .filter(Number.isInteger);

        if (ids.length === 0) {
          return Response.json({ products: [] });
        }

        const products = await Product.find({
          productId: { $in: ids },
          isActive: true,
        })
          .select(
            "productId name stock description price mrp variants brand category subcategory details",
          )
          .lean();

        return Response.json({ products });
      }

      const category = searchParams.get("category");

      const page = Math.max(parseInt(searchParams.get("page")) || 1, 1);
      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 50);
      const skip = (page - 1) * limit;

      const filter = { isActive: true };
      if (category) {
        filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
      }

      const products = await Product.find(filter)
        .select(
          "productId name stock description price mrp variants brand category subcategory details",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      products.forEach((p) => {
        if (p.variants?.length) {
          p.thumbnail = p.variants[0].images?.[0] || null;
        }
      });

      return Response.json({ products });
    }

    if (routePath === "public/products/latest") {
      const products = await Product.find({ isActive: true })
        .select("productId name price mrp variants brand category")
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();

      products.forEach((p) => {
        if (p.variants?.length) {
          p.thumbnail = p.variants[0].images?.[0] || null;
        }
      });

      return Response.json({ products });
    }

    // GET /api/ims/public/products/:productId
    if (routePath.startsWith("public/products/")) {
      const segments = routePath.split("/");
      const productId = Number(segments[segments.length - 1]);

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

    // GET /api/ims/public/inventory/list/productId&lowstock&limit
    // if (routePath === "public/inventory/list") {
    //   const productId = searchParams.get("productId");
    //   const warehouseId = searchParams.get("warehouseId");
    //   const size = searchParams.get("size");
    //   const lowStock = searchParams.get("lowStock") === "true";
    //   const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 100);

    //   // const limit = parseInt(searchParams.get("limit") || "100");

    //   const query = {};
    //   if (productId) query.productId = parseInt(productId);
    //   if (warehouseId) query.warehouseId = warehouseId;
    //   if (size) query.size = size;
    //   if (lowStock) {
    //     query.$expr = { $lte: ["$quantity", "$reorderLevel"] };
    //   }

    //   const inventory = await IMSInventory.find(query)
    //     .populate("warehouseId")
    //     .limit(limit)
    //     .lean();

    //   // Enrich with product details
    //   const enrichedInventory = await Promise.all(
    //     inventory.map(async (inv) => {
    //       const product = await Product.findOne({
    //         productId: inv.productId,
    //       }).lean();
    //       return {
    //         ...inv,
    //         product: product || null,
    //       };
    //     }),
    //   );

    //   return Response.json({
    //     inventory: enrichedInventory,
    //     total: inventory.length,
    //   });
    // }
    if (routePath === "public/inventory/list") {
      const productId = parseInt(searchParams.get("productId"));
      const size = searchParams.get("size");

      if (!Number.isInteger(productId)) {
        return Response.json({ error: "Invalid product ID" }, { status: 400 });
      }

      const query = { productId };

      if (size) {
        query.size = size;
      }

      // Aggregate total stock across warehouses
      const result = await IMSInventory.aggregate([
        { $match: query },
        { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } },
      ]);

      const totalQuantity = result[0]?.totalQuantity || 0;

      return Response.json({
        productId,
        totalQuantity,
        inStock: totalQuantity > 0,
      });
    }

    // Auth required for all GET routes
    const user = verifyToken(authHeader);

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ----- PRODUCTS -----

    if (routePath === "products/list") {
      let search = searchParams.get("search") || "";
      const category = searchParams.get("category") || "";
      const limit = Math.min(parseInt(searchParams.get("limit")) || 50, 150);
      search = search.trim().slice(0, 50); // limit to 50 chars
      const page = Math.max(parseInt(searchParams.get("page")) || 1, 1);

      // const limit = parseInt(searchParams.get("limit") || "50");

      // const page = parseInt(searchParams.get("page") || 1,1);

      const query = {};
      if (search) {
        const safeSearch = escapeRegex(search);
        query.$or = [
          { name: { $regex: safeSearch, $options: "i" } },
          { category: { $regex: safeSearch, $options: "i" } },
          { subcategory: { $regex: safeSearch, $options: "i" } },
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
      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 100);

      // const limit = parseInt(searchParams.get("limit") || "100");

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
      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 50);

      // const limit = parseInt(searchParams.get("limit") || "50");

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

      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 100);

      // const limit = parseInt(searchParams.get("limit") || "100");

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
      checkRole(user, ["admin"]);
      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 50);
      const page = Math.max(parseInt(searchParams.get("page")) || 1, 1);
      // const limit = parseInt(searchParams.get("limit") || "50");
      // const page = parseInt(searchParams.get("page") || "1");
      const status = searchParams.get("status");

      const query = {};
      if (status) query.status = status;

      const orders = await Orders.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      const transformedOrders = orders.map((order) => ({
        id: order._id.toString(),
        orderNumber: order._id.toString().slice(-8),
        items: order.items,
        totalAmount: order.totalAmount,
        deliveryAddress: order.deliveryAddress,
        status: order.status, // pending | paid | packing | shipping | delivered
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      }));

      const total = await Orders.countDocuments(query);

      return Response.json({
        orders: transformedOrders,
        total,
        page,
        limit,
      });
    }
  } catch (error) {
    console.error("IMS get Error:", error);
    return Response.json(
      {
        error: error.message || "Internal server error",
      },
      { status: 500 },
    );
  }
}

// Add missing DELETE handler
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const resolveParam = await params;

    const routePath = resolveParam?.path?.join("/") || "";
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

      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 100);

      // const limit = parseInt(searchParams.get("limit") || "100");

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
      const limit = Math.min(parseInt(searchParams.get("limit")) || 8, 50);
      const page = Math.max(parseInt(searchParams.get("page")) || 1, 1);
      // const limit = parseInt(searchParams.get("limit") || "50");
      // const page = parseInt(searchParams.get("page") || "1");
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
