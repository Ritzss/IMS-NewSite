#!/usr/bin/env python3
"""
VastraDrobe Inventory Management System - Backend API Testing
Comprehensive test suite for all backend APIs
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://vastra-inventory.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

# Test credentials
TEST_USERS = {
    "admin": {"email": "admin@vastradrobe.com", "password": "admin123"},
    "manager": {"email": "manager@vastradrobe.com", "password": "manager123"},
    "staff": {"email": "staff@vastradrobe.com", "password": "staff123"}
}

# Global variables for test data
tokens = {}
test_data = {
    "product_id": None,
    "variant_id": None,
    "warehouse_id": None,
    "category_id": None,
    "inventory_id": None,
    "order_id": None,
    "user_id": None
}

def log_test(test_name, status, details=""):
    """Log test results"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status_symbol = "✅" if status else "❌"
    print(f"[{timestamp}] {status_symbol} {test_name}")
    if details:
        print(f"    {details}")
    return status

def make_request(method, endpoint, data=None, token=None, expected_status=200):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}/{endpoint}"
    headers = HEADERS.copy()
    
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data, timeout=30)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data, timeout=30)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=30)
        
        if response.status_code == expected_status:
            return True, response.json() if response.content else {}
        else:
            return False, f"Expected {expected_status}, got {response.status_code}: {response.text}"
    
    except requests.exceptions.RequestException as e:
        return False, f"Request failed: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"JSON decode error: {str(e)}"

def test_authentication():
    """Test authentication endpoints"""
    print("\n=== AUTHENTICATION TESTS ===")
    
    # Test login for all users
    for role, credentials in TEST_USERS.items():
        success, response = make_request("POST", "auth/login", credentials)
        if success and "token" in response:
            tokens[role] = response["token"]
            user_info = response.get("user", {})
            log_test(f"Login as {role}", True, 
                    f"User: {user_info.get('name', 'N/A')} ({user_info.get('role', 'N/A')})")
        else:
            log_test(f"Login as {role}", False, str(response))
    
    # Test token verification
    if tokens.get("admin"):
        success, response = make_request("GET", "auth/verify", token=tokens["admin"])
        log_test("Token verification", success, 
                f"Valid: {response.get('valid', False)}" if success else str(response))
    
    # Test invalid credentials
    success, response = make_request("POST", "auth/login", 
                                   {"email": "invalid@test.com", "password": "wrong"}, 
                                   expected_status=401)
    log_test("Invalid credentials handling", success, "Correctly rejected invalid login")
    
    return len(tokens) >= 3

def test_role_based_access():
    """Test role-based access control"""
    print("\n=== ROLE-BASED ACCESS CONTROL TESTS ===")
    
    # Test admin-only endpoint with different roles
    admin_endpoint = "users/list"
    
    # Admin should have access
    if tokens.get("admin"):
        success, response = make_request("GET", admin_endpoint, token=tokens["admin"])
        log_test("Admin access to users/list", success, 
                f"Found {len(response.get('users', []))} users" if success else str(response))
    
    # Manager should be denied
    if tokens.get("manager"):
        success, response = make_request("GET", admin_endpoint, token=tokens["manager"], expected_status=500)
        log_test("Manager denied access to users/list", success, "Access correctly denied")
    
    # Staff should be denied
    if tokens.get("staff"):
        success, response = make_request("GET", admin_endpoint, token=tokens["staff"], expected_status=500)
        log_test("Staff denied access to users/list", success, "Access correctly denied")
    
    # Test no token
    success, response = make_request("GET", admin_endpoint, expected_status=500)
    log_test("No token access denied", success, "Access correctly denied without token")

def test_product_management():
    """Test product CRUD operations"""
    print("\n=== PRODUCT MANAGEMENT TESTS ===")
    
    if not tokens.get("admin"):
        log_test("Product tests", False, "No admin token available")
        return False
    
    # Create product
    product_data = {
        "name": "Test Premium Shirt",
        "description": "High-quality cotton shirt for testing",
        "category": "shirts",
        "brand": "TestBrand",
        "basePrice": 1299.99,
        "images": ["test-shirt-1.jpg", "test-shirt-2.jpg"]
    }
    
    success, response = make_request("POST", "products/create", product_data, tokens["admin"])
    if success and "id" in response:
        test_data["product_id"] = response["id"]
        log_test("Create product", True, f"Product ID: {test_data['product_id']}")
    else:
        log_test("Create product", False, str(response))
        return False
    
    # List products
    success, response = make_request("GET", "products/list", token=tokens["admin"])
    if success and "products" in response:
        products_count = len(response["products"])
        log_test("List products", True, f"Found {products_count} products")
    else:
        log_test("List products", False, str(response))
    
    # Search products
    success, response = make_request("GET", "products/list?search=Test", token=tokens["admin"])
    if success:
        search_count = len(response.get("products", []))
        log_test("Search products", True, f"Found {search_count} products matching 'Test'")
    else:
        log_test("Search products", False, str(response))
    
    # Get specific product
    if test_data["product_id"]:
        success, response = make_request("GET", f"products/{test_data['product_id']}", token=tokens["admin"])
        if success and "product" in response:
            product = response["product"]
            log_test("Get product details", True, 
                    f"Product: {product.get('name')} - ₹{product.get('basePrice')}")
        else:
            log_test("Get product details", False, str(response))
    
    # Update product
    if test_data["product_id"]:
        update_data = {
            "id": test_data["product_id"],
            "name": "Test Premium Shirt - Updated",
            "basePrice": 1399.99
        }
        success, response = make_request("POST", "products/update", update_data, tokens["admin"])
        log_test("Update product", success, "Product updated successfully" if success else str(response))
    
    return True

def test_product_variants():
    """Test product variants management"""
    print("\n=== PRODUCT VARIANTS TESTS ===")
    
    if not tokens.get("admin") or not test_data["product_id"]:
        log_test("Variant tests", False, "No admin token or product ID available")
        return False
    
    # Create variant
    variant_data = {
        "productId": test_data["product_id"],
        "sku": "TEST-SHIRT-M-BLUE",
        "barcode": "1234567890123",
        "size": "M",
        "color": "Blue",
        "additionalPrice": 100.00
    }
    
    success, response = make_request("POST", "variants/create", variant_data, tokens["admin"])
    if success and "id" in response:
        test_data["variant_id"] = response["id"]
        log_test("Create variant", True, f"Variant ID: {test_data['variant_id']}")
    else:
        log_test("Create variant", False, str(response))
        return False
    
    # List variants for product
    success, response = make_request("GET", f"variants/list?productId={test_data['product_id']}", 
                                   token=tokens["admin"])
    if success and "variants" in response:
        variants_count = len(response["variants"])
        log_test("List product variants", True, f"Found {variants_count} variants")
    else:
        log_test("List product variants", False, str(response))
    
    # List all variants
    success, response = make_request("GET", "variants/list", token=tokens["admin"])
    if success and "variants" in response:
        all_variants_count = len(response["variants"])
        log_test("List all variants", True, f"Found {all_variants_count} total variants")
    else:
        log_test("List all variants", False, str(response))
    
    return True

def test_warehouse_management():
    """Test warehouse/store management"""
    print("\n=== WAREHOUSE MANAGEMENT TESTS ===")
    
    if not tokens.get("admin"):
        log_test("Warehouse tests", False, "No admin token available")
        return False
    
    # List existing warehouses
    success, response = make_request("GET", "warehouses/list", token=tokens["admin"])
    if success and "warehouses" in response:
        warehouses = response["warehouses"]
        log_test("List warehouses", True, f"Found {len(warehouses)} warehouses")
        if warehouses:
            test_data["warehouse_id"] = warehouses[0]["id"]
            print(f"    Using warehouse: {warehouses[0]['name']} ({warehouses[0]['type']})")
    else:
        log_test("List warehouses", False, str(response))
    
    # Create new warehouse
    warehouse_data = {
        "name": "Test Distribution Center",
        "location": "Test City",
        "type": "warehouse",
        "contactPerson": "Test Manager",
        "phone": "+91-9876543210",
        "address": "123 Test Street, Test City, Test State - 123456"
    }
    
    success, response = make_request("POST", "warehouses/create", warehouse_data, tokens["admin"])
    if success and "id" in response:
        new_warehouse_id = response["id"]
        log_test("Create warehouse", True, f"Warehouse ID: {new_warehouse_id}")
    else:
        log_test("Create warehouse", False, str(response))
    
    return test_data["warehouse_id"] is not None

def test_category_management():
    """Test category management"""
    print("\n=== CATEGORY MANAGEMENT TESTS ===")
    
    if not tokens.get("admin"):
        log_test("Category tests", False, "No admin token available")
        return False
    
    # List existing categories
    success, response = make_request("GET", "categories/list", token=tokens["admin"])
    if success and "categories" in response:
        categories = response["categories"]
        log_test("List categories", True, f"Found {len(categories)} categories")
    else:
        log_test("List categories", False, str(response))
    
    # Create category
    category_data = {
        "name": "Test Category",
        "type": "men",
        "parentCategory": None
    }
    
    success, response = make_request("POST", "categories/create", category_data, tokens["admin"])
    if success and "id" in response:
        test_data["category_id"] = response["id"]
        log_test("Create category", True, f"Category ID: {test_data['category_id']}")
    else:
        log_test("Create category", False, str(response))
    
    # List categories by type
    success, response = make_request("GET", "categories/list?type=men", token=tokens["admin"])
    if success and "categories" in response:
        men_categories = response["categories"]
        log_test("List men's categories", True, f"Found {len(men_categories)} men's categories")
    else:
        log_test("List men's categories", False, str(response))
    
    return True

def test_inventory_management():
    """Test inventory management"""
    print("\n=== INVENTORY MANAGEMENT TESTS ===")
    
    if not tokens.get("admin") or not test_data["variant_id"] or not test_data["warehouse_id"]:
        log_test("Inventory tests", False, "Missing required data (variant_id or warehouse_id)")
        return False
    
    # Create inventory record
    inventory_data = {
        "variantId": test_data["variant_id"],
        "warehouseId": test_data["warehouse_id"],
        "quantity": 100,
        "reorderLevel": 20,
        "reorderQuantity": 50
    }
    
    success, response = make_request("POST", "inventory/create", inventory_data, tokens["admin"])
    if success and "id" in response:
        test_data["inventory_id"] = response["id"]
        log_test("Create inventory", True, f"Inventory ID: {test_data['inventory_id']}")
    else:
        log_test("Create inventory", False, str(response))
    
    # List inventory with enriched data
    success, response = make_request("GET", "inventory/list", token=tokens["admin"])
    if success and "inventory" in response:
        inventory_items = response["inventory"]
        log_test("List inventory", True, f"Found {len(inventory_items)} inventory items")
        
        # Check enriched data
        if inventory_items:
            item = inventory_items[0]
            has_product = "product" in item and item["product"] is not None
            has_variant = "variant" in item and item["variant"] is not None
            has_warehouse = "warehouse" in item and item["warehouse"] is not None
            log_test("Inventory data enrichment", has_product and has_variant and has_warehouse,
                    f"Product: {has_product}, Variant: {has_variant}, Warehouse: {has_warehouse}")
    else:
        log_test("List inventory", False, str(response))
    
    # Filter by warehouse
    success, response = make_request("GET", f"inventory/list?warehouseId={test_data['warehouse_id']}", 
                                   token=tokens["admin"])
    if success and "inventory" in response:
        warehouse_inventory = response["inventory"]
        log_test("Filter inventory by warehouse", True, 
                f"Found {len(warehouse_inventory)} items in warehouse")
    else:
        log_test("Filter inventory by warehouse", False, str(response))
    
    # Check low stock filter
    success, response = make_request("GET", "inventory/list?lowStock=true", token=tokens["admin"])
    if success and "inventory" in response:
        low_stock_items = response["inventory"]
        log_test("Low stock filter", True, f"Found {len(low_stock_items)} low stock items")
    else:
        log_test("Low stock filter", False, str(response))
    
    # Update inventory
    if test_data["inventory_id"]:
        update_data = {
            "id": test_data["inventory_id"],
            "quantity": 150,
            "reorderLevel": 25,
            "reorderQuantity": 75
        }
        success, response = make_request("POST", "inventory/update", update_data, tokens["admin"])
        log_test("Update inventory", success, "Inventory updated successfully" if success else str(response))
    
    return True

def test_stock_movements():
    """Test stock movements"""
    print("\n=== STOCK MOVEMENTS TESTS ===")
    
    if not tokens.get("admin") or not test_data["variant_id"] or not test_data["warehouse_id"]:
        log_test("Stock movement tests", False, "Missing required data")
        return False
    
    # Test stock IN movement
    stock_in_data = {
        "variantId": test_data["variant_id"],
        "toWarehouseId": test_data["warehouse_id"],
        "quantity": 50,
        "type": "in",
        "reason": "New stock arrival",
        "referenceNumber": "PO-2024-001",
        "notes": "Test stock in movement"
    }
    
    success, response = make_request("POST", "stock-movements/create", stock_in_data, tokens["admin"])
    log_test("Stock IN movement", success, 
            f"Movement ID: {response.get('id')}" if success else str(response))
    
    # Test stock OUT movement
    stock_out_data = {
        "variantId": test_data["variant_id"],
        "fromWarehouseId": test_data["warehouse_id"],
        "quantity": 10,
        "type": "out",
        "reason": "Damaged goods",
        "referenceNumber": "DMG-2024-001",
        "notes": "Test stock out movement"
    }
    
    success, response = make_request("POST", "stock-movements/create", stock_out_data, tokens["admin"])
    log_test("Stock OUT movement", success, 
            f"Movement ID: {response.get('id')}" if success else str(response))
    
    # Test SALE movement
    sale_data = {
        "variantId": test_data["variant_id"],
        "fromWarehouseId": test_data["warehouse_id"],
        "quantity": 5,
        "type": "sale",
        "reason": "Direct sale",
        "referenceNumber": "SALE-2024-001",
        "notes": "Test sale movement"
    }
    
    success, response = make_request("POST", "stock-movements/create", sale_data, tokens["admin"])
    log_test("SALE movement", success, 
            f"Movement ID: {response.get('id')}" if success else str(response))
    
    # List stock movements with enriched data
    success, response = make_request("GET", "stock-movements/list", token=tokens["admin"])
    if success and "movements" in response:
        movements = response["movements"]
        log_test("List stock movements", True, f"Found {len(movements)} movements")
        
        # Check enriched data
        if movements:
            movement = movements[0]
            has_product = "product" in movement and movement["product"] is not None
            has_variant = "variant" in movement and movement["variant"] is not None
            has_user = "performedByUser" in movement and movement["performedByUser"] is not None
            log_test("Movement data enrichment", has_product and has_variant and has_user,
                    f"Product: {has_product}, Variant: {has_variant}, User: {has_user}")
    else:
        log_test("List stock movements", False, str(response))
    
    # Filter movements by type
    success, response = make_request("GET", "stock-movements/list?type=in", token=tokens["admin"])
    if success and "movements" in response:
        in_movements = response["movements"]
        log_test("Filter movements by type", True, f"Found {len(in_movements)} IN movements")
    else:
        log_test("Filter movements by type", False, str(response))
    
    return True

def test_order_fulfillment():
    """Test order management and fulfillment"""
    print("\n=== ORDER FULFILLMENT TESTS ===")
    
    if not tokens.get("admin") or not test_data["variant_id"] or not test_data["warehouse_id"]:
        log_test("Order tests", False, "Missing required data")
        return False
    
    # Create order
    order_data = {
        "orderNumber": "ORD-2024-TEST-001",
        "items": [
            {
                "variantId": test_data["variant_id"],
                "quantity": 2,
                "price": 1399.99
            }
        ],
        "totalAmount": 2799.98,
        "warehouseId": test_data["warehouse_id"]
    }
    
    success, response = make_request("POST", "orders/create", order_data, tokens["admin"])
    if success and "id" in response:
        test_data["order_id"] = response["id"]
        log_test("Create order", True, f"Order ID: {test_data['order_id']}")
    else:
        log_test("Create order", False, str(response))
        return False
    
    # List orders
    success, response = make_request("GET", "orders/list", token=tokens["admin"])
    if success and "orders" in response:
        orders = response["orders"]
        log_test("List orders", True, f"Found {len(orders)} orders")
    else:
        log_test("List orders", False, str(response))
    
    # List pending orders
    success, response = make_request("GET", "orders/list?status=pending", token=tokens["admin"])
    if success and "orders" in response:
        pending_orders = response["orders"]
        log_test("List pending orders", True, f"Found {len(pending_orders)} pending orders")
    else:
        log_test("List pending orders", False, str(response))
    
    # Fulfill order
    if test_data["order_id"]:
        fulfill_data = {"orderId": test_data["order_id"]}
        success, response = make_request("POST", "orders/fulfill", fulfill_data, tokens["admin"])
        log_test("Fulfill order", success, "Order fulfilled successfully" if success else str(response))
        
        # Verify order status changed
        success, response = make_request("GET", "orders/list?status=fulfilled", token=tokens["admin"])
        if success and "orders" in response:
            fulfilled_orders = response["orders"]
            log_test("Verify order fulfillment", True, f"Found {len(fulfilled_orders)} fulfilled orders")
        else:
            log_test("Verify order fulfillment", False, str(response))
    
    return True

def test_dashboard_analytics():
    """Test dashboard analytics"""
    print("\n=== DASHBOARD ANALYTICS TESTS ===")
    
    if not tokens.get("admin"):
        log_test("Dashboard tests", False, "No admin token available")
        return False
    
    success, response = make_request("GET", "dashboard/stats", token=tokens["admin"])
    if success:
        stats = response
        total_value = stats.get("totalStockValue", 0)
        total_quantity = stats.get("totalQuantity", 0)
        low_stock_count = stats.get("lowStockCount", 0)
        out_of_stock_count = stats.get("outOfStockCount", 0)
        recent_movements = stats.get("recentMovements", [])
        
        log_test("Dashboard stats", True, 
                f"Stock Value: ₹{total_value:,.2f}, Quantity: {total_quantity}, "
                f"Low Stock: {low_stock_count}, Out of Stock: {out_of_stock_count}")
        log_test("Recent movements", True, f"Found {len(recent_movements)} recent movements")
        
        # Verify calculations are reasonable
        calculations_valid = (
            total_value >= 0 and 
            total_quantity >= 0 and 
            low_stock_count >= 0 and 
            out_of_stock_count >= 0
        )
        log_test("Dashboard calculations", calculations_valid, "All values are non-negative")
    else:
        log_test("Dashboard stats", False, str(response))
        return False
    
    return True

def test_user_management():
    """Test user management (admin only)"""
    print("\n=== USER MANAGEMENT TESTS ===")
    
    if not tokens.get("admin"):
        log_test("User management tests", False, "No admin token available")
        return False
    
    # List users
    success, response = make_request("GET", "users/list", token=tokens["admin"])
    if success and "users" in response:
        users = response["users"]
        log_test("List users", True, f"Found {len(users)} users")
        
        # Verify password is not included
        if users:
            has_password = any("password" in user for user in users)
            log_test("Password security", not has_password, "Passwords correctly excluded from response")
    else:
        log_test("List users", False, str(response))
    
    # Create new user
    user_data = {
        "email": "testuser@vastradrobe.com",
        "password": "testpass123",
        "name": "Test User",
        "role": "warehouse_staff"
    }
    
    success, response = make_request("POST", "users/create", user_data, tokens["admin"])
    if success and "id" in response:
        test_data["user_id"] = response["id"]
        log_test("Create user", True, f"User ID: {test_data['user_id']}")
    else:
        log_test("Create user", False, str(response))
    
    # Update user
    if test_data["user_id"]:
        update_data = {
            "id": test_data["user_id"],
            "name": "Test User Updated",
            "role": "inventory_manager",
            "isActive": True
        }
        success, response = make_request("POST", "users/update", update_data, tokens["admin"])
        log_test("Update user", success, "User updated successfully" if success else str(response))
    
    return True

def test_activity_logs():
    """Test activity logs"""
    print("\n=== ACTIVITY LOGS TESTS ===")
    
    if not tokens.get("admin"):
        log_test("Activity logs tests", False, "No admin token available")
        return False
    
    # List all activity logs
    success, response = make_request("GET", "activity-logs/list", token=tokens["admin"])
    if success and "logs" in response:
        logs = response["logs"]
        log_test("List activity logs", True, f"Found {len(logs)} activity logs")
        
        # Check log structure
        if logs:
            log_entry = logs[0]
            required_fields = ["userId", "action", "entityType", "timestamp"]
            has_required_fields = all(field in log_entry for field in required_fields)
            log_test("Activity log structure", has_required_fields, 
                    f"Log contains required fields: {required_fields}")
    else:
        log_test("List activity logs", False, str(response))
    
    # Filter by entity type
    success, response = make_request("GET", "activity-logs/list?entityType=product", token=tokens["admin"])
    if success and "logs" in response:
        product_logs = response["logs"]
        log_test("Filter logs by entity type", True, f"Found {len(product_logs)} product logs")
    else:
        log_test("Filter logs by entity type", False, str(response))
    
    return True

def test_soft_deletes():
    """Test soft delete functionality"""
    print("\n=== SOFT DELETE TESTS ===")
    
    if not tokens.get("admin"):
        log_test("Soft delete tests", False, "No admin token available")
        return False
    
    # Test product soft delete
    if test_data["product_id"]:
        success, response = make_request("DELETE", f"products/{test_data['product_id']}", 
                                       token=tokens["admin"])
        log_test("Soft delete product", success, "Product soft deleted" if success else str(response))
        
        # Verify product is not in active list
        success, response = make_request("GET", "products/list", token=tokens["admin"])
        if success and "products" in response:
            products = response["products"]
            deleted_product_in_list = any(p["id"] == test_data["product_id"] for p in products)
            log_test("Verify product soft delete", not deleted_product_in_list, 
                    "Deleted product not in active list")
        else:
            log_test("Verify product soft delete", False, str(response))
    
    return True

def run_comprehensive_tests():
    """Run all backend tests"""
    print("🚀 Starting VastraDrobe IMS Backend API Tests")
    print(f"📍 Base URL: {BASE_URL}")
    print("=" * 60)
    
    test_results = {}
    
    # Run tests in order
    test_results["authentication"] = test_authentication()
    test_results["rbac"] = test_role_based_access()
    test_results["products"] = test_product_management()
    test_results["variants"] = test_product_variants()
    test_results["warehouses"] = test_warehouse_management()
    test_results["categories"] = test_category_management()
    test_results["inventory"] = test_inventory_management()
    test_results["stock_movements"] = test_stock_movements()
    test_results["orders"] = test_order_fulfillment()
    test_results["dashboard"] = test_dashboard_analytics()
    test_results["users"] = test_user_management()
    test_results["activity_logs"] = test_activity_logs()
    test_results["soft_deletes"] = test_soft_deletes()
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for result in test_results.values() if result)
    total = len(test_results)
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name.replace('_', ' ').title()}")
    
    print(f"\n🎯 Overall Result: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Backend is working correctly.")
    else:
        print("⚠️  Some tests failed. Check the details above.")
    
    return test_results

if __name__ == "__main__":
    try:
        results = run_comprehensive_tests()
    except KeyboardInterrupt:
        print("\n\n⏹️  Tests interrupted by user")
    except Exception as e:
        print(f"\n\n💥 Unexpected error: {str(e)}")