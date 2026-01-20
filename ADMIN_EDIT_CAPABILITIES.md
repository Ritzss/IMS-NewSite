# VastraDrobe IMS - Admin Edit Capabilities

## Overview
The admin user now has full edit capabilities across all entities in the Inventory Management System. This document outlines all the editing features available.

## Authentication & Roles

### Roles in the System:
1. **Admin** - Full access to all features including editing everything
2. **Inventory Manager** - Can edit products, variants, and categories
3. **Warehouse Staff** - Can view and record stock movements
4. **Store Manager** - Can view inventory and create orders

## Admin Edit Capabilities

### 1. Products Management ✅
**Backend Endpoints:**
- `POST /api/products/create` - Create new product
- `POST /api/products/update` - Update existing product
- `DELETE /api/products/{id}` - Soft delete product

**Frontend Features:**
- Edit button on each product row (pencil icon)
- Click to open pre-filled edit dialog
- Update: name, description, category, brand, base price
- Changes tracked in activity logs

**Editable Fields:**
- Product Name
- Description
- Category
- Brand
- Base Price
- Images (array)

---

### 2. Product Variants Management ✅
**Backend Endpoints:**
- `POST /api/variants/create` - Create variant
- `POST /api/variants/update` - Update variant *(NEWLY ADDED)*
- `DELETE /api/variants/{id}` - Soft delete variant

**Frontend Features:**
- Edit button for each variant
- Pre-filled edit dialog
- Update: SKU, barcode, size, color, additional price

**Editable Fields:**
- SKU
- Barcode
- Size
- Color
- Additional Price

---

### 3. Warehouses/Stores Management ✅
**Backend Endpoints:**
- `POST /api/warehouses/create` - Create warehouse/store
- `POST /api/warehouses/update` - Update warehouse/store *(NEWLY ADDED)*
- `DELETE /api/warehouses/{id}` - Soft delete

**Frontend Features:**
- Edit button on each warehouse row (admin only)
- Pre-filled edit dialog
- Update all warehouse details

**Editable Fields:**
- Name
- Location
- Type (warehouse/store)
- Contact Person
- Phone
- Address

---

### 4. Categories Management ✅
**Backend Endpoints:**
- `POST /api/categories/create` - Create category
- `POST /api/categories/update` - Update category *(NEWLY ADDED)*
- `DELETE /api/categories/{id}` - Soft delete

**Editable Fields:**
- Category Name
- Type (men/women/kids/unisex)
- Parent Category

---

### 5. Orders Management ✅
**Backend Endpoints:**
- `POST /api/orders/create` - Create order
- `POST /api/orders/update` - Update order *(NEWLY ADDED)*
- `POST /api/orders/fulfill` - Fulfill order (auto stock deduction)

**Editable Fields:**
- Order Number
- Items (array of {variantId, quantity, price})
- Total Amount
- Warehouse ID
- Status

---

### 6. Inventory Management ✅
**Backend Endpoints:**
- `POST /api/inventory/create` - Create inventory record
- `POST /api/inventory/update` - Update inventory
- Stock automatically updated via movements

**Editable Fields:**
- Quantity
- Reorder Level
- Reorder Quantity

---

### 7. Users Management ✅
**Backend Endpoints:**
- `POST /api/users/create` - Create user (admin only)
- `POST /api/users/update` - Update user (admin only)
- `DELETE /api/users/{id}` - Soft delete user

**Editable Fields:**
- Name
- Role (admin/inventory_manager/warehouse_staff/store_manager)
- Active Status

---

## Activity Logging

All edit operations are automatically logged with:
- User who performed the action
- Timestamp
- Old values
- New values
- IP address
- Entity type and ID

**View Activity Logs:**
- Navigate to "Logs" tab (admin/inventory_manager only)
- See full audit trail of all changes
- Filter by entity type, user, date

---

## Frontend Edit Flow

### How to Edit Any Entity:

1. **Navigate to the relevant tab** (Products, Warehouses, Users, etc.)
2. **Find the item** you want to edit in the table
3. **Click the pencil icon** in the Actions column
4. **Edit dialog opens** with pre-filled current values
5. **Make changes** to the fields
6. **Click "Update" button** to save
7. **Success toast** appears confirming the update
8. **Table refreshes** with updated data

### Edit Button Visibility:
- **Admin** - Can see edit buttons on ALL entities
- **Inventory Manager** - Can edit products, variants, categories
- **Other roles** - Read-only access (no edit buttons shown)

---

## Testing Edit Functionality

### Backend API Testing:
```bash
# Login as admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@vastradrobe.com","password":"admin123"}'

# Update a product
curl -X POST http://localhost:3000/api/products/update \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"id":"product-id","name":"Updated Name","basePrice":999}'

# Update a warehouse
curl -X POST http://localhost:3000/api/warehouses/update \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"id":"warehouse-id","name":"Updated Warehouse","location":"New Location"}'
```

### Frontend Testing:
1. Login as admin (admin@vastradrobe.com / admin123)
2. Go to Products tab
3. Click pencil icon on any product
4. Change the name and price
5. Click "Update Product"
6. Verify the table shows updated values
7. Check activity logs to see the edit was logged

---

## Soft Delete Feature

All deletions are "soft deletes" meaning:
- Records are marked as `isActive: false`
- Data is preserved for audit purposes
- Items don't appear in normal queries
- Can be restored by setting `isActive: true`

---

## Security

### Role-Based Access Control:
- All update endpoints check user roles
- Admin has full access
- Inventory Manager has limited access
- Other roles denied from edit operations
- JWT tokens verify user identity
- Activity logs track all changes

### Error Handling:
- Invalid IDs return 404
- Missing fields return 400
- Insufficient permissions return 500
- All errors logged for debugging

---

## Summary

✅ **Admin can edit:**
- Products (name, price, description, brand, category)
- Variants (SKU, size, color, price)
- Warehouses (name, location, contact details)
- Categories (name, type)
- Orders (items, amounts, status)
- Inventory (quantities, reorder levels)
- Users (names, roles, active status)

✅ **All edits are:**
- Tracked in activity logs
- Role-based access controlled
- Soft-deletable
- Immediately reflected in UI
- Validated on backend

✅ **Frontend provides:**
- Easy-to-use edit dialogs
- Pre-filled forms
- Real-time validation
- Success/error feedback
- Automatic table refresh
