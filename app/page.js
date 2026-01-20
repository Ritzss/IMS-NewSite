'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Package, Warehouse, ArrowLeftRight, ShoppingCart, BarChart3, Users, LogOut, Plus, Search, AlertTriangle, TrendingUp, TrendingDown, Activity, Edit, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

const API_BASE = '/api/ims';

export default function VastraDrobeIMS() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerRole, setRegisterRole] = useState('warehouse_staff');
  
  // Dashboard state
  const [dashboardStats, setDashboardStats] = useState(null);
  
  // Products state
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState({
    id: '',
    name: '',
    description: '',
    category: '',
    brand: '',
    basePrice: 0,
    images: []
  });
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  
  // Variants state
  const [variants, setVariants] = useState([]);
  const [variantForm, setVariantForm] = useState({
    id: '',
    productId: '',
    sku: '',
    barcode: '',
    size: '',
    color: '',
    additionalPrice: 0
  });
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [isEditingVariant, setIsEditingVariant] = useState(false);
  
  // Warehouses state
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseForm, setWarehouseForm] = useState({
    id: '',
    name: '',
    location: '',
    type: 'warehouse',
    contactPerson: '',
    phone: '',
    address: ''
  });
  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false);
  const [isEditingWarehouse, setIsEditingWarehouse] = useState(false);
  
  // Categories state
  const [categories, setCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'men',
    parentCategory: ''
  });
  
  // Inventory state
  const [inventory, setInventory] = useState([]);
  const [inventoryFilter, setInventoryFilter] = useState('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [showEditInventoryDialog, setShowEditInventoryDialog] = useState(false);
  const [editInventoryForm, setEditInventoryForm] = useState({
    inventoryId: '',
    quantity: 0,
    reorderLevel: 0,
    reorderQuantity: 0
  });
  
  // Add Inventory state
  const [showAddInventoryDialog, setShowAddInventoryDialog] = useState(false);
  const [addInventoryForm, setAddInventoryForm] = useState({
    productId: '',
    warehouseId: '',
    size: '',
    quantity: 0,
    reorderLevel: 10,
    reorderQuantity: 50
  });
  
  // Stock Movements state
  const [stockMovements, setStockMovements] = useState([]);
  const [movementForm, setMovementForm] = useState({
    variantId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    quantity: 0,
    type: 'in',
    reason: '',
    referenceNumber: '',
    notes: ''
  });
  const [showMovementDialog, setShowMovementDialog] = useState(false);
  
  // Orders state
  const [orders, setOrders] = useState([]);
  const [orderForm, setOrderForm] = useState({
    orderNumber: '',
    items: [],
    totalAmount: 0,
    warehouseId: ''
  });
  
  // Users state
  const [users, setUsers] = useState([]);
  
  // Activity logs
  const [activityLogs, setActivityLogs] = useState([]);
  
  // Search
  const [searchTerm, setSearchTerm] = useState('');
  
  // API helper
  const apiCall = async (endpoint, method = 'GET', body = null) => {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = {
      method,
      headers
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  };
  
  // Auth functions
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const data = await apiCall('/auth/login', 'POST', { email, password });
      setToken(data.token);
      setCurrentUser(data.user);
      setIsLoggedIn(true);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      toast.success('Login successful!');
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/auth/register', 'POST', {
        email: registerEmail,
        password: registerPassword,
        name: registerName,
        role: registerRole
      });
      toast.success('Registration successful! Please login.');
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPassword('');
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const handleLogout = () => {
    setToken(null);
    setCurrentUser(null);
    setIsLoggedIn(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    toast.success('Logged out successfully');
  };
  
  // Load data functions
  const loadDashboardStats = async () => {
    try {
      const data = await apiCall('/dashboard/stats');
      setDashboardStats(data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
    }
  };
  
  const loadProducts = async () => {
    try {
      const data = await apiCall(`/products/list?search=${searchTerm}`);
      setProducts(data.products);
    } catch (error) {
      toast.error('Failed to load products');
    }
  };
  
  const loadWarehouses = async () => {
    try {
      const data = await apiCall('/warehouses/list');
      setWarehouses(data.warehouses);
    } catch (error) {
      toast.error('Failed to load warehouses');
    }
  };
  
  const loadCategories = async () => {
    try {
      const data = await apiCall('/categories/list');
      setCategories(data.categories);
    } catch (error) {
      toast.error('Failed to load categories');
    }
  };
  
  const loadInventory = async () => {
    try {
      const lowStock = inventoryFilter === 'low' ? 'true' : 'false';
      const warehouseParam = selectedWarehouse ? `&warehouseId=${selectedWarehouse}` : '';
      const data = await apiCall(`/inventory/list?lowStock=${lowStock}${warehouseParam}`);
      setInventory(data.inventory);
    } catch (error) {
      toast.error('Failed to load inventory');
    }
  };
  
  const loadStockMovements = async () => {
    try {
      const data = await apiCall('/stock-movements/list');
      setStockMovements(data.movements);
    } catch (error) {
      toast.error('Failed to load stock movements');
    }
  };
  
  const loadOrders = async () => {
    try {
      const data = await apiCall('/orders/list');
      setOrders(data.orders);
    } catch (error) {
      toast.error('Failed to load orders');
    }
  };
  
  const loadUsers = async () => {
    try {
      const data = await apiCall('/admin-users/list');
      setUsers(data.users);
    } catch (error) {
      toast.error('Failed to load users');
    }
  };
  
  const loadActivityLogs = async () => {
    try {
      const data = await apiCall('/activity-logs/list');
      setActivityLogs(data.logs);
    } catch (error) {
      toast.error('Failed to load activity logs');
    }
  };
  
  // CRUD operations
  const createProduct = async (e) => {
    e.preventDefault();
    try {
      if (isEditingProduct) {
        await apiCall('/products/update', 'POST', productForm);
        toast.success('Product updated successfully');
      } else {
        await apiCall('/products/create', 'POST', productForm);
        toast.success('Product created successfully');
      }
      setShowProductDialog(false);
      setProductForm({ id: '', name: '', description: '', category: '', brand: '', basePrice: 0, images: [] });
      setIsEditingProduct(false);
      loadProducts();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const editProduct = (product) => {
    setProductForm({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      basePrice: product.basePrice,
      images: product.images || []
    });
    setIsEditingProduct(true);
    setShowProductDialog(true);
  };
  
  const createVariant = async (e) => {
    e.preventDefault();
    try {
      if (isEditingVariant) {
        await apiCall('/variants/update', 'POST', variantForm);
        toast.success('Variant updated successfully');
      } else {
        await apiCall('/variants/create', 'POST', variantForm);
        toast.success('Variant created successfully');
      }
      setShowVariantDialog(false);
      setVariantForm({ id: '', productId: '', sku: '', barcode: '', size: '', color: '', additionalPrice: 0 });
      setIsEditingVariant(false);
      loadProducts();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const editVariant = (variant) => {
    setVariantForm({
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      barcode: variant.barcode,
      size: variant.size,
      color: variant.color,
      additionalPrice: variant.additionalPrice || 0
    });
    setIsEditingVariant(true);
    setShowVariantDialog(true);
  };
  
  const createWarehouse = async (e) => {
    e.preventDefault();
    try {
      if (isEditingWarehouse) {
        await apiCall('/warehouses/update', 'POST', warehouseForm);
        toast.success('Warehouse updated successfully');
      } else {
        await apiCall('/warehouses/create', 'POST', warehouseForm);
        toast.success('Warehouse created successfully');
      }
      setShowWarehouseDialog(false);
      setWarehouseForm({ id: '', name: '', location: '', type: 'warehouse', contactPerson: '', phone: '', address: '' });
      setIsEditingWarehouse(false);
      loadWarehouses();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const editWarehouse = (warehouse) => {
    setWarehouseForm({
      id: warehouse.id,
      name: warehouse.name,
      location: warehouse.location,
      type: warehouse.type,
      contactPerson: warehouse.contactPerson,
      phone: warehouse.phone,
      address: warehouse.address
    });
    setIsEditingWarehouse(true);
    setShowWarehouseDialog(true);
  };
  
  const createCategory = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/categories/create', 'POST', categoryForm);
      toast.success('Category created successfully');
      setCategoryForm({ name: '', type: 'men', parentCategory: '' });
      loadCategories();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const createStockMovement = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/stock-movements/create', 'POST', movementForm);
      toast.success('Stock movement recorded successfully');
      setShowMovementDialog(false);
      setMovementForm({
        variantId: '',
        fromWarehouseId: '',
        toWarehouseId: '',
        quantity: 0,
        type: 'in',
        reason: '',
        referenceNumber: '',
        notes: ''
      });
      loadStockMovements();
      loadInventory();
      loadDashboardStats();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const fulfillOrder = async (orderId) => {
    try {
      await apiCall('/orders/fulfill', 'POST', { orderId });
      toast.success('Order fulfilled successfully');
      loadOrders();
      loadInventory();
      loadDashboardStats();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const createUser = async (userData) => {
    try {
      await apiCall('/admin-users/create', 'POST', userData);
      toast.success('User created successfully');
      loadUsers();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/admin-users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }
      
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const editInventory = (inv) => {
    setEditInventoryForm({
      inventoryId: inv._id,
      quantity: inv.quantity,
      reorderLevel: inv.reorderLevel,
      reorderQuantity: inv.reorderQuantity
    });
    setShowEditInventoryDialog(true);
  };
  
  const updateInventory = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/inventory/update', 'POST', editInventoryForm);
      toast.success('Inventory updated successfully');
      setShowEditInventoryDialog(false);
      loadInventory();
      loadDashboardStats();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  const addInventory = async (e) => {
    e.preventDefault();
    try {
      await apiCall('/inventory/add-stock', 'POST', {
        productId: parseInt(addInventoryForm.productId),
        warehouseId: addInventoryForm.warehouseId,
        size: addInventoryForm.size,
        quantity: parseInt(addInventoryForm.quantity),
        reorderLevel: parseInt(addInventoryForm.reorderLevel),
        reorderQuantity: parseInt(addInventoryForm.reorderQuantity),
        reason: 'Direct inventory addition',
        referenceNumber: `INV-${Date.now()}`
      });
      toast.success('Inventory added successfully');
      setShowAddInventoryDialog(false);
      setAddInventoryForm({
        productId: '',
        warehouseId: '',
        size: '',
        quantity: 0,
        reorderLevel: 10,
        reorderQuantity: 50
      });
      loadInventory();
      loadDashboardStats();
    } catch (error) {
      toast.error(error.message);
    }
  };
  
  // Check for existing token on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setCurrentUser(JSON.parse(savedUser));
      setIsLoggedIn(true);
    }
  }, []);
  
  // Load data when logged in and tab changes
  useEffect(() => {
    if (isLoggedIn && token) {
      if (activeTab === 'dashboard') {
        loadDashboardStats();
      } else if (activeTab === 'products') {
        loadProducts();
        loadCategories();
      } else if (activeTab === 'inventory') {
        loadInventory();
        loadWarehouses();
      } else if (activeTab === 'movements') {
        loadStockMovements();
        loadWarehouses();
      } else if (activeTab === 'orders') {
        loadOrders();
      } else if (activeTab === 'warehouses') {
        loadWarehouses();
      } else if (activeTab === 'users') {
        loadUsers();
      } else if (activeTab === 'logs') {
        loadActivityLogs();
      }
    }
  }, [isLoggedIn, token, activeTab, searchTerm, inventoryFilter, selectedWarehouse]);
  
  // Login screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">VastraDrobe IMS</CardTitle>
            <CardDescription className="text-center">Inventory Management System</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@vastradrobe.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">Login</Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Full Name</Label>
                    <Input
                      id="reg-name"
                      type="text"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Password</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-role">Role</Label>
                    <Select value={registerRole} onValueChange={setRegisterRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="inventory_manager">Inventory Manager</SelectItem>
                        <SelectItem value="warehouse_staff">Warehouse Staff</SelectItem>
                        <SelectItem value="store_manager">Store Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">Register</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <Toaster position="top-right" richColors />
      </div>
    );
  }
  
  // Main application
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">VastraDrobe IMS</h1>
            <p className="text-sm text-muted-foreground">Inventory Management System</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{currentUser?.name}</p>
              <p className="text-xs text-muted-foreground">{currentUser?.role}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-7 lg:grid-cols-8 mb-6">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Products</span>
            </TabsTrigger>
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Warehouse className="w-4 h-4" />
              <span className="hidden sm:inline">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="movements" className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" />
              <span className="hidden sm:inline">Movements</span>
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="warehouses" className="flex items-center gap-2">
              <Warehouse className="w-4 h-4" />
              <span className="hidden sm:inline">Locations</span>
            </TabsTrigger>
            {currentUser?.role === 'admin' && (
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Users</span>
              </TabsTrigger>
            )}
            {(currentUser?.role === 'admin' || currentUser?.role === 'inventory_manager') && (
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">Logs</span>
              </TabsTrigger>
            )}
          </TabsList>
          
          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₹{dashboardStats?.totalStockValue?.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dashboardStats?.totalQuantity || 0} units
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats?.lowStockCount || 0}</div>
                  <p className="text-xs text-muted-foreground">Need reorder</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats?.outOfStockCount || 0}</div>
                  <p className="text-xs text-muted-foreground">Unavailable</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Movements</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{dashboardStats?.recentMovements?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">Last 10 transactions</p>
                </CardContent>
              </Card>
            </div>
            
            {dashboardStats?.lowStockCount > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Alert:</strong> {dashboardStats.lowStockCount} items are running low on stock. Check inventory tab for details.
                </AlertDescription>
              </Alert>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>Recent Stock Movements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dashboardStats?.recentMovements?.map((movement) => (
                    <div key={movement.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <Badge variant={movement.type === 'in' ? 'default' : movement.type === 'out' ? 'destructive' : 'secondary'}>
                          {movement.type}
                        </Badge>
                        <span className="ml-2 text-sm">Qty: {movement.quantity}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(movement.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
                <Button variant="outline" onClick={loadProducts}>
                  <Search className="w-4 h-4" />
                </Button>
              </div>
              
              {(currentUser?.role === 'admin' || currentUser?.role === 'inventory_manager') && (
                <div className="flex gap-2">
                  <Dialog open={showVariantDialog} onOpenChange={setShowVariantDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Variant
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Product Variant</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={createVariant} className="space-y-4">
                        <div>
                          <Label>Product</Label>
                          <Select value={variantForm.productId} onValueChange={(val) => setVariantForm({...variantForm, productId: val})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>SKU</Label>
                          <Input value={variantForm.sku} onChange={(e) => setVariantForm({...variantForm, sku: e.target.value})} required />
                        </div>
                        <div>
                          <Label>Barcode</Label>
                          <Input value={variantForm.barcode} onChange={(e) => setVariantForm({...variantForm, barcode: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Size</Label>
                            <Input value={variantForm.size} onChange={(e) => setVariantForm({...variantForm, size: e.target.value})} required />
                          </div>
                          <div>
                            <Label>Color</Label>
                            <Input value={variantForm.color} onChange={(e) => setVariantForm({...variantForm, color: e.target.value})} required />
                          </div>
                        </div>
                        <div>
                          <Label>Additional Price (₹)</Label>
                          <Input type="number" value={variantForm.additionalPrice} onChange={(e) => setVariantForm({...variantForm, additionalPrice: parseFloat(e.target.value)})} />
                        </div>
                        <Button type="submit" className="w-full">Create Variant</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                  
                  <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Product
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{isEditingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                      </DialogHeader>
                      <form onSubmit={createProduct} className="space-y-4">
                        <div>
                          <Label>Product Name</Label>
                          <Input value={productForm.name} onChange={(e) => setProductForm({...productForm, name: e.target.value})} required />
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Input value={productForm.description} onChange={(e) => setProductForm({...productForm, description: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Category</Label>
                            <Input 
                              placeholder="e.g., Boys Clothing, Women Accessories" 
                              value={productForm.category} 
                              onChange={(e) => setProductForm({...productForm, category: e.target.value})} 
                              required 
                            />
                            <p className="text-xs text-muted-foreground mt-1">Enter new or existing category name</p>
                          </div>
                          <div>
                            <Label>Brand</Label>
                            <Input value={productForm.brand} onChange={(e) => setProductForm({...productForm, brand: e.target.value})} required />
                          </div>
                        </div>
                        <div>
                          <Label>Base Price (₹)</Label>
                          <Input type="number" value={productForm.basePrice} onChange={(e) => setProductForm({...productForm, basePrice: parseFloat(e.target.value)})} required />
                        </div>
                        <Button type="submit" className="w-full">{isEditingProduct ? 'Update Product' : 'Create Product'}</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Products</CardTitle>
                <CardDescription>Manage your product catalog</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Base Price</TableHead>
                      <TableHead>Created</TableHead>
                      {currentUser?.role === 'admin' && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.brand}</TableCell>
                        <TableCell>{product.category}</TableCell>
                        <TableCell>₹{product.basePrice}</TableCell>
                        <TableCell>{new Date(product.createdAt).toLocaleDateString()}</TableCell>
                        {currentUser?.role === 'admin' && (
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => editProduct(product)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Inventory Tab */}
          <TabsContent value="inventory" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Select value={inventoryFilter} onValueChange={setInventoryFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock</SelectItem>
                    <SelectItem value="low">Low Stock</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Warehouses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Warehouses</SelectItem>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2">
                <Dialog open={showAddInventoryDialog} onOpenChange={setShowAddInventoryDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Inventory
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Inventory</DialogTitle>
                      <DialogDescription>Add stock for a product in a warehouse</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={addInventory} className="space-y-4">
                      <div>
                        <Label>Product ID</Label>
                        <Input 
                          type="number" 
                          placeholder="Enter product ID" 
                          value={addInventoryForm.productId} 
                          onChange={(e) => setAddInventoryForm({...addInventoryForm, productId: e.target.value})} 
                          required 
                        />
                      </div>
                      <div>
                        <Label>Warehouse</Label>
                        <Select value={addInventoryForm.warehouseId} onValueChange={(val) => setAddInventoryForm({...addInventoryForm, warehouseId: val})}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select warehouse" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map(w => (
                              <SelectItem key={w._id} value={w._id}>{w.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Size</Label>
                        <Input 
                          placeholder="e.g., S, M, L, 5-6Y" 
                          value={addInventoryForm.size} 
                          onChange={(e) => setAddInventoryForm({...addInventoryForm, size: e.target.value})} 
                          required 
                        />
                      </div>
                      <div>
                        <Label>Initial Quantity</Label>
                        <Input 
                          type="number" 
                          value={addInventoryForm.quantity} 
                          onChange={(e) => setAddInventoryForm({...addInventoryForm, quantity: parseInt(e.target.value)})} 
                          required 
                          min="0"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Reorder Level</Label>
                          <Input 
                            type="number" 
                            value={addInventoryForm.reorderLevel} 
                            onChange={(e) => setAddInventoryForm({...addInventoryForm, reorderLevel: parseInt(e.target.value)})} 
                            required 
                            min="0"
                          />
                        </div>
                        <div>
                          <Label>Reorder Quantity</Label>
                          <Input 
                            type="number" 
                            value={addInventoryForm.reorderQuantity} 
                            onChange={(e) => setAddInventoryForm({...addInventoryForm, reorderQuantity: parseInt(e.target.value)})} 
                            required 
                            min="0"
                          />
                        </div>
                      </div>
                      <Button type="submit" className="w-full">Add Inventory</Button>
                    </form>
                  </DialogContent>
                </Dialog>
                
                <Button onClick={loadInventory} variant="outline">
                  <Search className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Inventory Levels</CardTitle>
                <CardDescription>Current stock across all locations</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Reorder Level</TableHead>
                      <TableHead>Status</TableHead>
                      {(currentUser?.role === 'admin' || currentUser?.role === 'inventory_manager') && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventory.map((inv) => (
                      <TableRow key={inv._id || inv.id}>
                        <TableCell className="font-medium">{inv.product?.name || 'N/A'}</TableCell>
                        <TableCell>{inv.size}</TableCell>
                        <TableCell>{inv.productId}</TableCell>
                        <TableCell>{inv.warehouseId?.name || inv.warehouse?.name}</TableCell>
                        <TableCell>{inv.quantity}</TableCell>
                        <TableCell>{inv.reorderLevel}</TableCell>
                        <TableCell>
                          {inv.quantity === 0 ? (
                            <Badge variant="destructive">Out of Stock</Badge>
                          ) : inv.quantity <= inv.reorderLevel ? (
                            <Badge variant="warning" className="bg-yellow-600">Low Stock</Badge>
                          ) : (
                            <Badge variant="default">In Stock</Badge>
                          )}
                        </TableCell>
                        {(currentUser?.role === 'admin' || currentUser?.role === 'inventory_manager') && (
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => editInventory(inv)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            
            {/* Edit Inventory Dialog */}
            <Dialog open={showEditInventoryDialog} onOpenChange={setShowEditInventoryDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Inventory</DialogTitle>
                  <DialogDescription>Update stock quantities and reorder levels</DialogDescription>
                </DialogHeader>
                <form onSubmit={updateInventory} className="space-y-4">
                  <div>
                    <Label>Quantity</Label>
                    <Input 
                      type="number" 
                      value={editInventoryForm.quantity} 
                      onChange={(e) => setEditInventoryForm({...editInventoryForm, quantity: parseInt(e.target.value)})} 
                      required 
                      min="0"
                    />
                  </div>
                  <div>
                    <Label>Reorder Level</Label>
                    <Input 
                      type="number" 
                      value={editInventoryForm.reorderLevel} 
                      onChange={(e) => setEditInventoryForm({...editInventoryForm, reorderLevel: parseInt(e.target.value)})} 
                      required 
                      min="0"
                    />
                  </div>
                  <div>
                    <Label>Reorder Quantity</Label>
                    <Input 
                      type="number" 
                      value={editInventoryForm.reorderQuantity} 
                      onChange={(e) => setEditInventoryForm({...editInventoryForm, reorderQuantity: parseInt(e.target.value)})} 
                      required 
                      min="0"
                    />
                  </div>
                  <Button type="submit" className="w-full">Update Inventory</Button>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>
          
          {/* Stock Movements Tab */}
          <TabsContent value="movements" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Stock Movements</h2>
              
              <Dialog open={showMovementDialog} onOpenChange={setShowMovementDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Record Movement
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Record Stock Movement</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={createStockMovement} className="space-y-4">
                    <div>
                      <Label>Movement Type</Label>
                      <Select value={movementForm.type} onValueChange={(val) => setMovementForm({...movementForm, type: val})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="in">Stock In</SelectItem>
                          <SelectItem value="out">Stock Out</SelectItem>
                          <SelectItem value="transfer">Transfer</SelectItem>
                          <SelectItem value="sale">Sale</SelectItem>
                          <SelectItem value="return">Return</SelectItem>
                          <SelectItem value="damaged">Damaged</SelectItem>
                          <SelectItem value="adjustment">Adjustment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label>Variant (SKU)</Label>
                      <Input 
                        placeholder="Enter SKU or variant ID" 
                        value={movementForm.variantId} 
                        onChange={(e) => setMovementForm({...movementForm, variantId: e.target.value})} 
                        required 
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {movementForm.type !== 'in' && movementForm.type !== 'return' && (
                        <div>
                          <Label>From Warehouse</Label>
                          <Select value={movementForm.fromWarehouseId} onValueChange={(val) => setMovementForm({...movementForm, fromWarehouseId: val})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select source warehouse" />
                            </SelectTrigger>
                            <SelectContent>
                              {warehouses.map(w => (
                                <SelectItem key={w._id || w.id} value={w._id || w.id}>{w.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      
                      {(movementForm.type === 'in' || movementForm.type === 'transfer' || movementForm.type === 'return') && (
                        <div>
                          <Label>To Warehouse</Label>
                          <Select value={movementForm.toWarehouseId} onValueChange={(val) => setMovementForm({...movementForm, toWarehouseId: val})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select destination warehouse" />
                            </SelectTrigger>
                            <SelectContent>
                              {warehouses.map(w => (
                                <SelectItem key={w._id || w.id} value={w._id || w.id}>{w.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <Label>Quantity</Label>
                      <Input type="number" value={movementForm.quantity} onChange={(e) => setMovementForm({...movementForm, quantity: parseInt(e.target.value)})} required />
                    </div>
                    
                    <div>
                      <Label>Reference Number</Label>
                      <Input value={movementForm.referenceNumber} onChange={(e) => setMovementForm({...movementForm, referenceNumber: e.target.value})} />
                    </div>
                    
                    <div>
                      <Label>Reason</Label>
                      <Input value={movementForm.reason} onChange={(e) => setMovementForm({...movementForm, reason: e.target.value})} />
                    </div>
                    
                    <div>
                      <Label>Notes</Label>
                      <Input value={movementForm.notes} onChange={(e) => setMovementForm({...movementForm, notes: e.target.value})} />
                    </div>
                    
                    <Button type="submit" className="w-full">Record Movement</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle>Movement History</CardTitle>
                <CardDescription>Track all stock movements</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Performed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell>{new Date(movement.createdAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={
                            movement.type === 'in' ? 'default' : 
                            movement.type === 'out' || movement.type === 'damaged' ? 'destructive' : 
                            'secondary'
                          }>
                            {movement.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{movement.product?.name || 'N/A'}</TableCell>
                        <TableCell>{movement.fromWarehouse?.name || '-'}</TableCell>
                        <TableCell>{movement.toWarehouse?.name || '-'}</TableCell>
                        <TableCell>{movement.quantity}</TableCell>
                        <TableCell>{movement.performedByUser?.name || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Orders</CardTitle>
                <CardDescription>Manage order fulfillment</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Number</TableHead>
                      <TableHead>Total Amount</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>₹{order.totalAmount}</TableCell>
                        <TableCell>{order.items?.length || 0}</TableCell>
                        <TableCell>
                          <Badge variant={order.status === 'fulfilled' ? 'default' : 'secondary'}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(order.createdAt).toLocaleString()}</TableCell>
                        <TableCell>
                          {order.status === 'pending' && (
                            <Button size="sm" onClick={() => fulfillOrder(order.id)}>
                              Fulfill
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Warehouses Tab */}
          <TabsContent value="warehouses" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Warehouses & Stores</h2>
              
              {currentUser?.role === 'admin' && (
                <Dialog open={showWarehouseDialog} onOpenChange={setShowWarehouseDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Location
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{isEditingWarehouse ? 'Edit Warehouse/Store' : 'Add Warehouse/Store'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={createWarehouse} className="space-y-4">
                      <div>
                        <Label>Name</Label>
                        <Input value={warehouseForm.name} onChange={(e) => setWarehouseForm({...warehouseForm, name: e.target.value})} required />
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select value={warehouseForm.type} onValueChange={(val) => setWarehouseForm({...warehouseForm, type: val})}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="warehouse">Warehouse</SelectItem>
                            <SelectItem value="store">Store</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Location</Label>
                        <Input value={warehouseForm.location} onChange={(e) => setWarehouseForm({...warehouseForm, location: e.target.value})} required />
                      </div>
                      <div>
                        <Label>Contact Person</Label>
                        <Input value={warehouseForm.contactPerson} onChange={(e) => setWarehouseForm({...warehouseForm, contactPerson: e.target.value})} />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input value={warehouseForm.phone} onChange={(e) => setWarehouseForm({...warehouseForm, phone: e.target.value})} />
                      </div>
                      <div>
                        <Label>Address</Label>
                        <Input value={warehouseForm.address} onChange={(e) => setWarehouseForm({...warehouseForm, address: e.target.value})} />
                      </div>
                      <Button type="submit" className="w-full">{isEditingWarehouse ? 'Update Location' : 'Create Location'}</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Phone</TableHead>
                      {currentUser?.role === 'admin' && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {warehouses.map((warehouse) => (
                      <TableRow key={warehouse.id}>
                        <TableCell className="font-medium">{warehouse.name}</TableCell>
                        <TableCell>
                          <Badge variant={warehouse.type === 'warehouse' ? 'default' : 'secondary'}>
                            {warehouse.type}
                          </Badge>
                        </TableCell>
                        <TableCell>{warehouse.location}</TableCell>
                        <TableCell>{warehouse.contactPerson}</TableCell>
                        <TableCell>{warehouse.phone}</TableCell>
                        {currentUser?.role === 'admin' && (
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => editWarehouse(warehouse)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Users Tab */}
          {currentUser?.role === 'admin' && (
            <TabsContent value="users" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>Manage system users and roles</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user._id || user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge>{user.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.isActive ? 'default' : 'destructive'}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {user._id !== currentUser?.id && (
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={() => deleteUser(user._id)}
                              >
                                Delete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
          
          {/* Activity Logs Tab */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'inventory_manager') && (
            <TabsContent value="logs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Logs</CardTitle>
                  <CardDescription>Audit trail of system actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Entity Type</TableHead>
                        <TableHead>Entity ID</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activityLogs.map((log) => (
                        <TableRow key={log._id || log.id}>
                          <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                          <TableCell>{log.userId?.name || log.userId?.email || 'Unknown'}</TableCell>
                          <TableCell>
                            <Badge>{log.action}</Badge>
                          </TableCell>
                          <TableCell>{log.entityType}</TableCell>
                          <TableCell className="font-mono text-xs">{log.entityId}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
      
      <Toaster position="top-right" richColors />
    </div>
  );
}