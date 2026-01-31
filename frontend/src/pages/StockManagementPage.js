import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Package, Plus, Minus, RefreshCw, Search, Edit, History,
  Box, Boxes, ArrowUpCircle, ArrowDownCircle, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const StockManagementPage = () => {
  const [stockItems, setStockItems] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stockRes, adjustmentsRes] = await Promise.all([
        api.get('/stock/all'),
        api.get('/stock/adjustments').catch(() => ({ data: [] }))
      ]);
      setStockItems(stockRes.data || []);
      setAdjustments(adjustmentsRes.data || []);
    } catch (error) {
      console.error('Failed to load stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAdjustModal = (item) => {
    setSelectedItem(item);
    setShowAdjustModal(true);
  };

  // Filter items
  const filteredItems = stockItems.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sku?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Stats
  const totalProducts = stockItems.filter(i => i.type === 'FINISHED_PRODUCT').length;
  const totalRaw = stockItems.filter(i => i.type === 'RAW_MATERIAL').length;
  const totalPackaging = stockItems.filter(i => i.type === 'PACKAGING').length;
  const lowStock = stockItems.filter(i => i.current_stock < 100).length;

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="stock-management-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Boxes className="w-8 h-8 text-emerald-500" />
          Stock Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage inventory levels, add items, and adjust stock manually
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-emerald-500/30">
          <p className="text-sm text-muted-foreground">Finished Products</p>
          <p className="text-2xl font-bold text-emerald-400">{totalProducts}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Raw Materials</p>
          <p className="text-2xl font-bold text-blue-400">{totalRaw}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Packaging</p>
          <p className="text-2xl font-bold text-purple-400">{totalPackaging}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Low Stock Items</p>
          <p className="text-2xl font-bold text-amber-400">{lowStock}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">Total Items</p>
          <p className="text-2xl font-bold text-cyan-400">{stockItems.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'stock' ? 'default' : 'outline'}
          onClick={() => setActiveTab('stock')}
        >
          <Boxes className="w-4 h-4 mr-2" />
          Stock Items
        </Button>
        <Button
          variant={activeTab === 'report' ? 'default' : 'outline'}
          onClick={() => setActiveTab('report')}
        >
          <FileText className="w-4 h-4 mr-2" />
          Product-Packaging Report
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'outline'}
          onClick={() => setActiveTab('history')}
        >
          <History className="w-4 h-4 mr-2" />
          Adjustment History
        </Button>
      </div>

      {activeTab === 'stock' && (
        <>
          {/* Filters & Actions */}
          <div className="flex gap-4 mb-6 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="FINISHED_PRODUCT">Finished Products</SelectItem>
                <SelectItem value="RAW_MATERIAL">Raw Materials</SelectItem>
                <SelectItem value="PACKAGING">Packaging</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Stock Table */}
          <div className="glass rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">SKU</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Packaging/Category</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Current Stock</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reserved</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Available</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Unit</th>
                    <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted-foreground">
                        No stock items found
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="p-3 font-mono text-sm">{item.sku || '-'}</td>
                        <td className="p-3 font-medium">{item.name}</td>
                        <td className="p-3">
                          <Badge className={
                            item.type === 'FINISHED_PRODUCT' ? 'bg-emerald-500/20 text-emerald-400' :
                            item.type === 'RAW_MATERIAL' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-purple-500/20 text-purple-400'
                          }>
                            {item.type?.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground">{item.packaging_info || item.category || '-'}</span>
                            {item.capacity_liters > 0 && (
                              <span className="text-xs text-muted-foreground/60">
                                Capacity: {item.capacity_liters}L
                              </span>
                            )}
                            {item.net_weight_kg_default > 0 && (
                              <span className="text-xs text-muted-foreground/60">
                                Net Weight: {item.net_weight_kg_default}kg
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={item.current_stock < 100 ? 'text-red-400 font-medium' : 'text-green-400'}>
                            {item.current_stock?.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3 text-amber-400">{item.reserved?.toFixed(2) || 0}</td>
                        <td className="p-3 text-cyan-400">{item.available?.toFixed(2) || item.current_stock?.toFixed(2)}</td>
                        <td className="p-3">{item.unit}</td>
                        <td className="p-3">
                          <Button size="sm" variant="outline" onClick={() => openAdjustModal(item)}>
                            <Edit className="w-4 h-4 mr-1" />
                            Adjust
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'report' && (
        <ProductPackagingReportTab />
      )}

      {activeTab === 'history' && (
        <AdjustmentHistoryTab adjustments={adjustments} />
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            loadData();
          }}
        />
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && selectedItem && (
        <AdjustStockModal
          item={selectedItem}
          onClose={() => {
            setShowAdjustModal(false);
            setSelectedItem(null);
          }}
          onAdjusted={() => {
            setShowAdjustModal(false);
            setSelectedItem(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== PRODUCT-PACKAGING REPORT TAB ====================
const ProductPackagingReportTab = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    loadReportData();
  }, []);
  
  const loadReportData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/stock/product-packaging-report');
      setReportData(res.data.items || []);
    } catch (error) {
      console.error('Failed to load product-packaging report:', error);
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };
  
  // Filter by search term
  const filteredProducts = reportData.filter(item =>
    item.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.packing?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Product-Packaging Stock Report</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Stock report showing products by packaging type with standard quantities
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Button variant="outline" onClick={loadReportData} size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="p-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No products found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground w-20">S.I. No.</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PRODUCT</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PACKING</th>
                <th className="p-3 text-right text-xs font-medium text-muted-foreground">QTY-STANDARD</th>
                <th className="p-3 text-right text-xs font-medium text-muted-foreground">CURRENT STOCK</th>
                <th className="p-3 text-right text-xs font-medium text-muted-foreground">DRUMS</th>
                <th className="p-3 text-center text-xs font-medium text-muted-foreground">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((item, index) => {
                return (
                  <tr key={item.product_id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 text-center text-muted-foreground">{index + 1}</td>
                    <td className="p-3">
                      <div className="font-medium">{item.product_name}</div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </td>
                    <td className="p-3 text-muted-foreground">{item.packing}</td>
                    <td className="p-3 text-right font-mono">
                      {item.qty_standard_display}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      <span className={
                        item.status === 'Low Stock' ? 'text-red-400' : 
                        item.status === 'Out of Stock' ? 'text-red-600' :
                        'text-green-400'
                      }>
                        {item.current_stock_display}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono text-cyan-400">
                      {item.drums_count}
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={
                        item.status === 'In Stock' ? 'bg-green-500/20 text-green-400' :
                        item.status === 'Low Stock' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-red-500/20 text-red-400'
                      }>
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      
      <div className="p-4 border-t border-border bg-muted/10">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            Total Products: <span className="font-semibold text-foreground">{filteredProducts.length}</span>
          </span>
          <span className="text-muted-foreground">
            Date: <span className="font-semibold text-foreground">{new Date().toLocaleDateString('en-GB')}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

// ==================== ADJUSTMENT HISTORY TAB ====================
const AdjustmentHistoryTab = ({ adjustments }) => {
  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Stock Adjustment History</h2>
      </div>
      
      {adjustments.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          No adjustment history
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Item</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Adjustment</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">New Stock</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adj) => (
                <tr key={adj.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(adj.adjusted_at).toLocaleString()}
                  </td>
                  <td className="p-3 font-medium">{adj.item_name}</td>
                  <td className="p-3">
                    <Badge className="bg-gray-500/20 text-gray-400">
                      {adj.item_type}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <span className={adj.adjustment >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {adj.adjustment >= 0 ? '+' : ''}{adj.adjustment}
                    </span>
                  </td>
                  <td className="p-3">{adj.new_stock?.toFixed(2)}</td>
                  <td className="p-3 text-muted-foreground">{adj.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== ADD ITEM MODAL ====================
const AddItemModal = ({ onClose, onAdded }) => {
  const [form, setForm] = useState({
    name: '',
    sku: '',
    type: 'RAW_MATERIAL',
    category: '',
    quantity: 0,
    unit: 'KG',
    price: 0
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name) {
      toast.error('Name is required');
      return;
    }
    
    setSaving(true);
    try {
      await api.post('/stock/add-item', form);
      toast.success('Item added successfully');
      onAdded();
    } catch (error) {
      toast.error('Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-500" />
            Add Stock Item
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="Item name"
            />
          </div>
          
          <div>
            <Label>SKU</Label>
            <Input
              value={form.sku}
              onChange={(e) => setForm({...form, sku: e.target.value})}
              placeholder="Auto-generated if empty"
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FINISHED_PRODUCT">Finished Product</SelectItem>
                <SelectItem value="RAW_MATERIAL">Raw Material</SelectItem>
                <SelectItem value="PACKAGING">Packaging</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm({...form, category: e.target.value})}
              placeholder="Category"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Initial Quantity</Label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({...form, quantity: parseFloat(e.target.value) || 0})}
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({...form, unit: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KG">KG</SelectItem>
                  <SelectItem value="L">Liters</SelectItem>
                  <SelectItem value="units">Units</SelectItem>
                  <SelectItem value="MT">Metric Tons</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Adding...' : 'Add Item'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== ADJUST STOCK MODAL ====================
const AdjustStockModal = ({ item, onClose, onAdjusted }) => {
  const [adjustment, setAdjustment] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const newStock = ((item.current_stock ?? item.available ?? 0) || 0) + adjustment;

  const handleSave = async () => {
    if (adjustment === 0) {
      toast.error('Please enter an adjustment amount');
      return;
    }
    if (newStock < 0) {
      toast.error('Stock cannot be negative');
      return;
    }
    
    setSaving(true);
    try {
      await api.put(`/stock/${item.id}/adjust`, null, {
        params: { adjustment, reason }
      });
      toast.success('Stock adjusted successfully');
      onAdjusted();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to adjust stock';
      toast.error(errorMessage);
      console.error('Stock adjustment error:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-blue-500" />
            Adjust Stock
          </DialogTitle>
          <DialogDescription>
            Adjust stock quantity for {item.name}. Enter a positive value to add stock or negative to remove stock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item Info */}
          <div className="p-3 rounded bg-muted/20">
            <p className="font-semibold">{item.name}</p>
            <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>
            <p className="text-lg mt-2">
              Current Stock: <span className="font-bold text-emerald-400">{(item.current_stock ?? item.available ?? 0).toFixed(2)} {item.unit}</span>
            </p>
          </div>

          {/* Quick Adjust Buttons */}
          <div className="flex gap-2 justify-center">
            <Button size="sm" variant="outline" onClick={() => setAdjustment(prev => prev - 100)}>
              <Minus className="w-4 h-4 mr-1" /> 100
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdjustment(prev => prev - 10)}>
              <Minus className="w-4 h-4 mr-1" /> 10
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdjustment(prev => prev + 10)}>
              <Plus className="w-4 h-4 mr-1" /> 10
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdjustment(prev => prev + 100)}>
              <Plus className="w-4 h-4 mr-1" /> 100
            </Button>
          </div>

          <div>
            <Label>Adjustment Amount</Label>
            <Input
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(parseFloat(e.target.value) || 0)}
              className="text-center text-lg"
            />
            <p className="text-sm text-muted-foreground mt-1 text-center">
              Positive to add, negative to remove
            </p>
          </div>

          <div className="p-3 rounded border border-dashed flex items-center justify-between">
            <span className="text-muted-foreground">New Stock:</span>
            <span className={`text-xl font-bold ${newStock >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {newStock.toFixed(2)} {item.unit}
            </span>
          </div>

          <div>
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for adjustment..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || newStock < 0}>
            {saving ? 'Saving...' : 'Save Adjustment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StockManagementPage;
