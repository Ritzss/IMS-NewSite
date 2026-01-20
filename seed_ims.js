/**
 * Seed script for VastraDrobe IMS
 * This seeds IMS-specific collections WITHOUT touching existing VastraDrobe data
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from './lib/db.js';
import {
  Product,
  IMSAdminUser,
  IMSWarehouse,
  IMSInventory,
  IMSStockMovement
} from './models/index.js';

async function seedIMS() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB');
    
    // Clear only IMS collections (NOT existing VastraDrobe data)
    await IMSAdminUser.deleteMany({});
    await IMSWarehouse.deleteMany({});
    await IMSInventory.deleteMany({});
    await IMSStockMovement.deleteMany({});
    console.log('✅ Cleared IMS collections (existing VastraDrobe data untouched)');
    
    // Create IMS Admin Users
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = await IMSAdminUser.create({
      email: 'admin@vastradrobe-ims.com',
      password: hashedPassword,
      name: 'IMS Admin',
      role: 'admin'
    });
    
    const manager = await IMSAdminUser.create({
      email: 'manager@vastradrobe-ims.com',
      password: await bcrypt.hash('manager123', 10),
      name: 'Inventory Manager',
      role: 'inventory_manager'
    });
    
    console.log('✅ Created IMS admin users:');
    console.log('   - admin@vastradrobe-ims.com / admin123 (ADMIN)');
    console.log('   - manager@vastradrobe-ims.com / manager123 (INVENTORY_MANAGER)');
    
    // Create Warehouses
    const warehouse1 = await IMSWarehouse.create({
      name: 'Main Warehouse Delhi',
      code: 'WH-DEL-01',
      location: 'Delhi',
      type: 'warehouse',
      contactPerson: 'Rajesh Kumar',
      phone: '+91-9876543210',
      address: 'Plot 45, Sector 18, Delhi - 110001'
    });
    
    const warehouse2 = await IMSWarehouse.create({
      name: 'Mumbai Distribution Center',
      code: 'WH-MUM-01',
      location: 'Mumbai',
      type: 'warehouse',
      contactPerson: 'Priya Sharma',
      phone: '+91-9876543211',
      address: 'Godown 12, Andheri East, Mumbai - 400069'
    });
    
    const store1 = await IMSWarehouse.create({
      name: 'VastraDrobe Store - Bangalore',
      code: 'ST-BLR-01',
      location: 'Bangalore',
      type: 'store',
      contactPerson: 'Amit Patel',
      phone: '+91-9876543212',
      address: 'MG Road, Bangalore - 560001'
    });
    
    console.log('✅ Created 3 warehouses');
    
    // Check if products exist, if not create sample products
    let products = await Product.find().limit(5).lean();
    
    if (products.length === 0) {
      console.log('⚠️  No existing products found, creating sample products...');
      
      // Get next productId
      const lastProduct = await Product.findOne().sort({ productId: -1 });
      let nextProductId = (lastProduct?.productId || 0) + 1;
      
      // Create sample products
      const sampleProducts = [
        {
          productId: nextProductId++,
          name: 'Vastradrobe Girls Printed Cord-Set',
          price: 560,
          mrp: 999,
          category: 'Girls Clothing',
          subCategory: 'Cord Set',
          sizes: ['5-6Y', '6-7Y', '8-9Y', '10-11Y'],
          images: ['https://example.com/img1.jpg'],
          description: 'Cotton Soft Silk | Casual Wear',
          sku: 'GCS-001',
          brand: 'VastraDrobe',
          stock: 0
        },
        {
          productId: nextProductId++,
          name: 'Boys Cotton T-Shirt',
          price: 399,
          mrp: 699,
          category: 'Boys Clothing',
          subCategory: 'T-Shirt',
          sizes: ['5-6Y', '7-8Y', '9-10Y', '11-12Y'],
          images: ['https://example.com/img2.jpg'],
          description: '100% Cotton | Comfortable Fit',
          sku: 'BTS-001',
          brand: 'VastraDrobe',
          stock: 0
        },
        {
          productId: nextProductId++,
          name: 'Kids Ethnic Kurta Set',
          price: 899,
          mrp: 1499,
          category: 'Kids Clothing',
          subCategory: 'Kurta Set',
          sizes: ['4-5Y', '6-7Y', '8-9Y', '10-11Y', '12-13Y'],
          images: ['https://example.com/img3.jpg'],
          description: 'Premium Cotton Blend | Festival Wear',
          sku: 'KKS-001',
          brand: 'VastraDrobe',
          stock: 0
        }
      ];
      
      products = await Product.insertMany(sampleProducts);
      console.log(`✅ Created ${products.length} sample products`);
    } else {
      console.log(`✅ Found ${products.length} existing products`);
    }
    
    // Create inventory for products
    console.log('📦 Creating inventory records...');
    
    const inventoryRecords = [];
    const stockMovements = [];
    
    for (const product of products) {
      // Ensure product has sizes array
      const sizes = product.sizes && product.sizes.length > 0 
        ? product.sizes 
        : ['S', 'M', 'L', 'XL']; // Default sizes if none exist
      
      for (const size of sizes) {
        // Add inventory to warehouse 1
        const quantity1 = Math.floor(Math.random() * 50) + 20;
        inventoryRecords.push({
          productId: product.productId,
          warehouseId: warehouse1._id,
          size,
          quantity: quantity1,
          reorderLevel: 10,
          reorderQuantity: 50,
          updatedBy: admin._id
        });
        
        stockMovements.push({
          productId: product.productId,
          size,
          toWarehouseId: warehouse1._id,
          quantity: quantity1,
          type: 'in',
          reason: 'Initial stock',
          referenceNumber: `PO-SEED-${Date.now()}`,
          performedBy: admin._id
        });
        
        // Add inventory to warehouse 2
        const quantity2 = Math.floor(Math.random() * 30) + 10;
        inventoryRecords.push({
          productId: product.productId,
          warehouseId: warehouse2._id,
          size,
          quantity: quantity2,
          reorderLevel: 10,
          reorderQuantity: 50,
          updatedBy: admin._id
        });
        
        stockMovements.push({
          productId: product.productId,
          size,
          toWarehouseId: warehouse2._id,
          quantity: quantity2,
          type: 'in',
          reason: 'Initial stock',
          referenceNumber: `PO-SEED-${Date.now()}`,
          performedBy: admin._id
        });
        
        // Add some inventory to store
        const quantity3 = Math.floor(Math.random() * 15) + 5;
        inventoryRecords.push({
          productId: product.productId,
          warehouseId: store1._id,
          size,
          quantity: quantity3,
          reorderLevel: 5,
          reorderQuantity: 20,
          updatedBy: admin._id
        });
        
        stockMovements.push({
          productId: product.productId,
          size,
          toWarehouseId: store1._id,
          quantity: quantity3,
          type: 'in',
          reason: 'Store allocation',
          referenceNumber: `ALLOC-${Date.now()}`,
          performedBy: admin._id
        });
      }
      
      // Update product total stock
      const totalStock = inventoryRecords
        .filter(inv => inv.productId === product.productId)
        .reduce((sum, inv) => sum + inv.quantity, 0);
      
      await Product.updateOne(
        { productId: product.productId },
        { $set: { stock: totalStock } }
      );
    }
    
    await IMSInventory.insertMany(inventoryRecords);
    await IMSStockMovement.insertMany(stockMovements);
    
    console.log(`✅ Created ${inventoryRecords.length} inventory records`);
    console.log(`✅ Created ${stockMovements.length} stock movements`);
    
    // Summary
    console.log('\n═══════════════════════════════════════════════');
    console.log('🎉 VastraDrobe IMS Seed Complete!');
    console.log('═══════════════════════════════════════════════');
    console.log('\n📊 IMS Data Created:');
    console.log(`   - 2 IMS Admin Users`);
    console.log(`   - 3 Warehouses (2 warehouses + 1 store)`);
    console.log(`   - ${inventoryRecords.length} Inventory Records`);
    console.log(`   - ${stockMovements.length} Stock Movements`);
    console.log(`   - ${products.length} Products tracked`);
    
    console.log('\n🔑 IMS Login Credentials:');
    console.log('   Admin: admin@vastradrobe-ims.com / admin123');
    console.log('   Manager: manager@vastradrobe-ims.com / manager123');
    
    console.log('\n✅ Existing VastraDrobe Data:');
    console.log('   - Customer users: UNTOUCHED');
    console.log('   - Orders: UNTOUCHED');
    console.log('   - Products: Enhanced with IMS inventory tracking');
    
    console.log('\n📍 API Endpoint: /api/ims/*');
    console.log('═══════════════════════════════════════════════\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seedIMS();
