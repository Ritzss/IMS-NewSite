// Seed script to populate initial data for VastraDrobe IMS
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'vastradrobe_ims';

async function seedDatabase() {
  const client = new MongoClient(MONGO_URL);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db(DB_NAME);
    
    // Clear existing collections
    const collections = ['users', 'warehouses', 'categories', 'products', 'product_variants', 'inventory', 'stock_movements', 'orders', 'activity_logs'];
    for (const coll of collections) {
      await db.collection(coll).deleteMany({});
      console.log(`Cleared ${coll} collection`);
    }
    
    // Create admin user
    const adminId = uuidv4();
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.collection('users').insertOne({
      id: adminId,
      email: 'admin@vastradrobe.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✓ Created admin user (admin@vastradrobe.com / admin123)');
    
    // Create inventory manager
    const managerId = uuidv4();
    await db.collection('users').insertOne({
      id: managerId,
      email: 'manager@vastradrobe.com',
      password: await bcrypt.hash('manager123', 10),
      name: 'Inventory Manager',
      role: 'inventory_manager',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✓ Created inventory manager (manager@vastradrobe.com / manager123)');
    
    // Create warehouse staff
    const staffId = uuidv4();
    await db.collection('users').insertOne({
      id: staffId,
      email: 'staff@vastradrobe.com',
      password: await bcrypt.hash('staff123', 10),
      name: 'Warehouse Staff',
      role: 'warehouse_staff',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✓ Created warehouse staff (staff@vastradrobe.com / staff123)');
    
    // Create warehouses
    const warehouse1Id = uuidv4();
    const warehouse2Id = uuidv4();
    const store1Id = uuidv4();
    
    await db.collection('warehouses').insertMany([
      {
        id: warehouse1Id,
        name: 'Main Warehouse Delhi',
        location: 'Delhi',
        type: 'warehouse',
        contactPerson: 'Rajesh Kumar',
        phone: '+91-9876543210',
        address: 'Plot 45, Sector 18, Delhi - 110001',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: warehouse2Id,
        name: 'Secondary Warehouse Mumbai',
        location: 'Mumbai',
        type: 'warehouse',
        contactPerson: 'Priya Sharma',
        phone: '+91-9876543211',
        address: 'Godown 12, Andheri East, Mumbai - 400069',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: store1Id,
        name: 'VastraDrobe Store - Bangalore',
        location: 'Bangalore',
        type: 'store',
        contactPerson: 'Amit Patel',
        phone: '+91-9876543212',
        address: 'MG Road, Bangalore - 560001',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
    console.log('✓ Created warehouses and stores');
    
    // Create categories
    const categories = [
      { id: uuidv4(), name: 'T-Shirts', type: 'men', parentCategory: null, isActive: true, createdAt: new Date() },
      { id: uuidv4(), name: 'Shirts', type: 'men', parentCategory: null, isActive: true, createdAt: new Date() },
      { id: uuidv4(), name: 'Jeans', type: 'men', parentCategory: null, isActive: true, createdAt: new Date() },
      { id: uuidv4(), name: 'Dresses', type: 'women', parentCategory: null, isActive: true, createdAt: new Date() },
      { id: uuidv4(), name: 'Tops', type: 'women', parentCategory: null, isActive: true, createdAt: new Date() },
      { id: uuidv4(), name: 'Kids T-Shirts', type: 'kids', parentCategory: null, isActive: true, createdAt: new Date() },
      { id: uuidv4(), name: 'Accessories', type: 'unisex', parentCategory: null, isActive: true, createdAt: new Date() }
    ];
    await db.collection('categories').insertMany(categories);
    console.log('✓ Created categories');
    
    // Create products with variants
    const products = [];
    const variants = [];
    const inventory = [];
    
    // Product 1: Men's Cotton T-Shirt
    const product1Id = uuidv4();
    products.push({
      id: product1Id,
      name: 'Premium Cotton T-Shirt',
      description: 'Comfortable 100% cotton t-shirt',
      category: categories[0].id,
      brand: 'VastraDrobe Essentials',
      basePrice: 499,
      images: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: adminId
    });
    
    // Variants for Product 1
    const colors = ['Black', 'White', 'Navy Blue', 'Grey'];
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
    
    for (const color of colors) {
      for (const size of sizes) {
        const variantId = uuidv4();
        const sku = `TSHIRT-${color.substring(0, 3).toUpperCase()}-${size}`;
        
        variants.push({
          id: variantId,
          productId: product1Id,
          sku,
          barcode: `BAR${Math.floor(Math.random() * 1000000000)}`,
          size,
          color,
          additionalPrice: size === 'XXL' ? 50 : 0,
          isActive: true,
          createdAt: new Date()
        });
        
        // Add inventory for each variant
        inventory.push({
          id: uuidv4(),
          variantId,
          warehouseId: warehouse1Id,
          quantity: Math.floor(Math.random() * 100) + 20,
          reorderLevel: 10,
          reorderQuantity: 50,
          lastUpdated: new Date(),
          updatedBy: adminId
        });
        
        inventory.push({
          id: uuidv4(),
          variantId,
          warehouseId: warehouse2Id,
          quantity: Math.floor(Math.random() * 50) + 10,
          reorderLevel: 10,
          reorderQuantity: 50,
          lastUpdated: new Date(),
          updatedBy: adminId
        });
      }
    }
    
    // Product 2: Men's Formal Shirt
    const product2Id = uuidv4();
    products.push({
      id: product2Id,
      name: 'Formal Cotton Shirt',
      description: 'Classic formal shirt for office wear',
      category: categories[1].id,
      brand: 'VastraDrobe Premium',
      basePrice: 1299,
      images: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: adminId
    });
    
    const shirtColors = ['White', 'Light Blue', 'Pink'];
    for (const color of shirtColors) {
      for (const size of sizes) {
        const variantId = uuidv4();
        const sku = `SHIRT-${color.substring(0, 3).toUpperCase()}-${size}`;
        
        variants.push({
          id: variantId,
          productId: product2Id,
          sku,
          barcode: `BAR${Math.floor(Math.random() * 1000000000)}`,
          size,
          color,
          additionalPrice: size === 'XXL' ? 100 : 0,
          isActive: true,
          createdAt: new Date()
        });
        
        inventory.push({
          id: uuidv4(),
          variantId,
          warehouseId: warehouse1Id,
          quantity: Math.floor(Math.random() * 50) + 5,
          reorderLevel: 15,
          reorderQuantity: 40,
          lastUpdated: new Date(),
          updatedBy: adminId
        });
      }
    }
    
    // Product 3: Women's Summer Dress
    const product3Id = uuidv4();
    products.push({
      id: product3Id,
      name: 'Floral Summer Dress',
      description: 'Light and breezy summer dress',
      category: categories[3].id,
      brand: 'VastraDrobe Women',
      basePrice: 1899,
      images: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: adminId
    });
    
    const dressColors = ['Floral Blue', 'Floral Pink', 'Solid White'];
    const dressSizes = ['XS', 'S', 'M', 'L', 'XL'];
    for (const color of dressColors) {
      for (const size of dressSizes) {
        const variantId = uuidv4();
        const sku = `DRESS-${color.substring(0, 3).toUpperCase()}-${size}`;
        
        variants.push({
          id: variantId,
          productId: product3Id,
          sku,
          barcode: `BAR${Math.floor(Math.random() * 1000000000)}`,
          size,
          color,
          additionalPrice: 0,
          isActive: true,
          createdAt: new Date()
        });
        
        inventory.push({
          id: uuidv4(),
          variantId,
          warehouseId: warehouse1Id,
          quantity: Math.floor(Math.random() * 30) + 2, // Some will be low stock
          reorderLevel: 10,
          reorderQuantity: 30,
          lastUpdated: new Date(),
          updatedBy: adminId
        });
      }
    }
    
    // Insert all products, variants, and inventory
    await db.collection('products').insertMany(products);
    console.log(`✓ Created ${products.length} products`);
    
    await db.collection('product_variants').insertMany(variants);
    console.log(`✓ Created ${variants.length} product variants`);
    
    await db.collection('inventory').insertMany(inventory);
    console.log(`✓ Created ${inventory.length} inventory records`);
    
    // Create some sample stock movements
    const movements = [];
    for (let i = 0; i < 10; i++) {
      const randomVariant = variants[Math.floor(Math.random() * variants.length)];
      movements.push({
        id: uuidv4(),
        variantId: randomVariant.id,
        fromWarehouseId: null,
        toWarehouseId: warehouse1Id,
        quantity: Math.floor(Math.random() * 50) + 10,
        type: 'in',
        reason: 'Initial stock',
        referenceNumber: `PO-2024-${1000 + i}`,
        notes: 'Seed data',
        performedBy: adminId,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) // Random date in last 30 days
      });
    }
    
    await db.collection('stock_movements').insertMany(movements);
    console.log(`✓ Created ${movements.length} stock movements`);
    
    console.log('\\n✅ Database seeded successfully!');
    console.log('\\n📝 Login Credentials:');
    console.log('Admin: admin@vastradrobe.com / admin123');
    console.log('Manager: manager@vastradrobe.com / manager123');
    console.log('Staff: staff@vastradrobe.com / staff123');
    
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await client.close();
  }
}

seedDatabase();
