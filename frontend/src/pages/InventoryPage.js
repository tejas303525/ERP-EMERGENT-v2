import React, { useState, useEffect } from 'react';
import { inventoryAPI, inventoryItemAPI, productAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { Boxes, AlertTriangle, TrendingUp, TrendingDown, Eye, Package, Layers } from 'lucide-react';

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'raw_material', label: 'Raw Materials' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'finished_product', label: 'Finished Products' },
];

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState('finished');
  const [finishedProducts, setFinishedProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [movements, setMovements] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'finished') {
        const category = categoryFilter === 'all' ? null : categoryFilter;
        const res = await inventoryAPI.getAll(category, lowStockOnly || null);
        setFinishedProducts(res.data || []);
      } else if (activeTab === 'raw') {
        const res = await inventoryItemAPI.getAll('RAW');
        setRawMaterials(res.data || []);
      } else if (activeTab === 'packaging') {
        const res = await inventoryItemAPI.getAll('PACK');
        setPackagingMaterials(res.data || []);
      }
    } catch (error) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const viewMovements = async (product) => {
    setSelectedProduct(product);
    try {
      const res = await inventoryAPI.getMovements(product.id);
      setMovements(res.data || []);
    } catch (error) {
      setMovements([]);
    }
    setMovementsOpen(true);
  };

  // Stats for finished products
  const totalItems = finishedProducts.length;
  const lowStockItems = finishedProducts.filter(p => p.current_stock < p.min_stock).length;
  const totalValue = finishedProducts.reduce((sum, p) => sum + (p.current_stock * p.price_usd), 0);

  // Stats for raw materials
  const rawOutOfStock = rawMaterials.filter(r => r.status === 'OUT_OF_STOCK').length;
  const rawInbound = rawMaterials.filter(r => r.status === 'INBOUND').length;

  // Stats for packaging
  const packOutOfStock = packagingMaterials.filter(p => p.status === 'OUT_OF_STOCK').length;
  const packInbound = packagingMaterials.filter(p => p.status === 'INBOUND').length;

  return (
    <div className="page-container" data-testid="inventory-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Inventory</h1>
          <p className="text-muted-foreground text-sm">Track stock levels for all inventory types</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'finished' ? 'default' : 'outline'}
          onClick={() => setActiveTab('finished')}
          data-testid="tab-finished"
        >
          <Package className="w-4 h-4 mr-2" />
          Finished Products
        </Button>
        <Button
          variant={activeTab === 'raw' ? 'default' : 'outline'}
          onClick={() => setActiveTab('raw')}
          data-testid="tab-raw"
        >
          <Layers className="w-4 h-4 mr-2" />
          Raw Materials
          {rawOutOfStock > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">{rawOutOfStock}</span>
          )}
        </Button>
        <Button
          variant={activeTab === 'packaging' ? 'default' : 'outline'}
          onClick={() => setActiveTab('packaging')}
          data-testid="tab-packaging"
        >
          <Boxes className="w-4 h-4 mr-2" />
          Packaging Materials
          {packOutOfStock > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">{packOutOfStock}</span>
          )}
        </Button>
      </div>

      {/* Finished Products Tab */}
      {activeTab === 'finished' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="kpi-value">{totalItems}</p>
                  <p className="kpi-label">Total Products</p>
                </div>
                <Boxes className="w-8 h-8 text-sky-400" />
              </div>
            </div>
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="kpi-value text-red-400">{lowStockItems}</p>
                  <p className="kpi-label">Low Stock Items</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            <div className="bg-card border border-border rounded-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="kpi-value text-emerald-400">${totalValue.toLocaleString()}</p>
                  <p className="kpi-label">Total Value (USD)</p>
                </div>
                <TrendingUp className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="w-64">
              <Input
                placeholder="Search by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="search-input"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); loadData(); }}>
              <SelectTrigger className="w-48" data-testid="category-filter">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={lowStockOnly ? 'default' : 'outline'}
              onClick={() => { setLowStockOnly(!lowStockOnly); loadData(); }}
              data-testid="low-stock-filter"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Low Stock Only
            </Button>
          </div>

          {/* Inventory Table */}
          <FinishedProductsTable 
            products={finishedProducts.filter(p =>
              p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              p.sku.toLowerCase().includes(searchTerm.toLowerCase())
            )}
            loading={loading}
            onViewMovements={viewMovements}
          />
        </>
      )}

      {/* Raw Materials Tab */}
      {activeTab === 'raw' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card border border-border rounded-sm p-4">
              <p className="kpi-value">{rawMaterials.length}</p>
              <p className="kpi-label">Total Raw Materials</p>
            </div>
            <div className="bg-card border border-green-500/30 rounded-sm p-4">
              <p className="kpi-value text-green-400">{rawMaterials.filter(r => r.status === 'IN_STOCK').length}</p>
              <p className="kpi-label">In Stock</p>
            </div>
            <div className="bg-card border border-amber-500/30 rounded-sm p-4">
              <p className="kpi-value text-amber-400">{rawInbound}</p>
              <p className="kpi-label">Inbound (PO Open)</p>
            </div>
            <div className="bg-card border border-red-500/30 rounded-sm p-4">
              <p className="kpi-value text-red-400">{rawOutOfStock}</p>
              <p className="kpi-label">Out of Stock</p>
            </div>
          </div>

          <RawMaterialsTable materials={rawMaterials} loading={loading} />
        </>
      )}

      {/* Packaging Materials Tab */}
      {activeTab === 'packaging' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card border border-border rounded-sm p-4">
              <p className="kpi-value">{packagingMaterials.length}</p>
              <p className="kpi-label">Total Packaging Items</p>
            </div>
            <div className="bg-card border border-green-500/30 rounded-sm p-4">
              <p className="kpi-value text-green-400">{packagingMaterials.filter(p => p.status === 'IN_STOCK').length}</p>
              <p className="kpi-label">In Stock</p>
            </div>
            <div className="bg-card border border-amber-500/30 rounded-sm p-4">
              <p className="kpi-value text-amber-400">{packInbound}</p>
              <p className="kpi-label">Inbound (PO Open)</p>
            </div>
            <div className="bg-card border border-red-500/30 rounded-sm p-4">
              <p className="kpi-value text-red-400">{packOutOfStock}</p>
              <p className="kpi-label">Out of Stock</p>
            </div>
          </div>

          <RawMaterialsTable materials={packagingMaterials} loading={loading} title="Packaging Materials" />
        </>
      )}

      {/* Movements Dialog */}
      <Dialog open={movementsOpen} onOpenChange={setMovementsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Stock Movements - {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-muted-foreground">SKU:</span> {selectedProduct?.sku}</div>
              <div><span className="text-muted-foreground">Current Stock:</span> <span className="font-mono">{selectedProduct?.current_stock}</span></div>
              <div><span className="text-muted-foreground">Unit:</span> {selectedProduct?.unit}</div>
            </div>

            {movements.length > 0 ? (
              <div className="data-grid max-h-96 overflow-y-auto">
                <table className="erp-table w-full">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Qty</th>
                      <th>Previous</th>
                      <th>New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m, idx) => (
                      <tr key={idx}>
                        <td>{formatDate(m.created_at)}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            {m.movement_type === 'grn_add' ? (
                              <TrendingUp className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-400" />
                            )}
                            <span>{m.movement_type?.replace(/_/g, ' ').toUpperCase()}</span>
                          </div>
                        </td>
                        <td>{m.reference_number}</td>
                        <td className={`font-mono ${m.movement_type === 'grn_add' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.movement_type === 'grn_add' ? '+' : '-'}{m.quantity}
                        </td>
                        <td className="font-mono text-muted-foreground">{m.previous_stock}</td>
                        <td className="font-mono">{m.new_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No movements recorded</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Finished Products Table Component
const FinishedProductsTable = ({ products, loading, onViewMovements }) => {
  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (products.length === 0) {
    return (
      <div className="empty-state">
        <Boxes className="empty-state-icon" />
        <p className="empty-state-title">No inventory items found</p>
        <p className="empty-state-description">Add products to see them here</p>
      </div>
    );
  }

  return (
    <div className="data-grid">
      <div className="data-grid-header">
        <h3 className="font-medium">Finished Products ({products.length})</h3>
      </div>
      <table className="erp-table w-full">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product Name</th>
            <th>Category</th>
            <th>Current Stock</th>
            <th>Min Stock</th>
            <th>Unit</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((item) => {
            const isLowStock = item.current_stock < item.min_stock;
            return (
              <tr key={item.id} data-testid={`inventory-row-${item.sku}`}>
                <td className="font-medium">{item.sku}</td>
                <td>{item.name}</td>
                <td>
                  <Badge variant="outline" className="text-xs">
                    {item.category?.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                </td>
                <td className={`font-mono ${isLowStock ? 'text-red-400' : ''}`}>
                  {item.current_stock?.toLocaleString()}
                </td>
                <td className="font-mono text-muted-foreground">{item.min_stock?.toLocaleString()}</td>
                <td>{item.unit}</td>
                <td>
                  {isLowStock ? (
                    <Badge className="status-rejected">Low Stock</Badge>
                  ) : (
                    <Badge className="status-approved">In Stock</Badge>
                  )}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onViewMovements(item)}
                    data-testid={`view-movements-${item.sku}`}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Raw Materials Table Component
const RawMaterialsTable = ({ materials, loading, title = "Raw Materials" }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = materials.filter(m =>
    m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="data-grid">
      <div className="data-grid-header flex justify-between items-center">
        <h3 className="font-medium">{title} ({filtered.length})</h3>
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No items found</p>
        </div>
      ) : (
        <table className="erp-table w-full">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Type</th>
              <th>On Hand</th>
              <th>Reserved</th>
              <th>Available</th>
              <th>Inbound (PO)</th>
              <th>UOM</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} data-testid={`raw-material-${item.sku}`}>
                <td className="font-medium font-mono">{item.sku}</td>
                <td>{item.name}</td>
                <td>
                  <Badge variant="outline" className="text-xs">
                    {item.item_type}
                  </Badge>
                </td>
                <td className="font-mono">{item.on_hand?.toLocaleString() || 0}</td>
                <td className="font-mono text-amber-400">{item.reserved?.toLocaleString() || 0}</td>
                <td className={`font-mono font-bold ${item.available > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {item.available?.toLocaleString() || 0}
                </td>
                <td className="font-mono text-cyan-400">{item.inbound?.toLocaleString() || 0}</td>
                <td>{item.uom}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    item.status === 'IN_STOCK' ? 'bg-green-500/20 text-green-400' :
                    item.status === 'INBOUND' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
