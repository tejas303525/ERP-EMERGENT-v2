import React, { useState, useEffect } from 'react';
import { productAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatCurrency } from '../lib/utils';
import { Plus, Package, Trash2 } from 'lucide-react';

const CATEGORIES = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'finished_product', label: 'Finished Product' },
];

const UNITS = ['KG', 'MT', 'LTR', 'PCS', 'DRUMS', 'IBC', 'BAGS'];

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [form, setForm] = useState({
    sku: '',
    name: '',
    description: '',
    unit: 'KG',
    price_usd: 0,
    price_aed: 0,
    price_eur: 0,
    category: 'finished_product',
    min_stock: 0,
    type: 'MANUFACTURED',
  });

  useEffect(() => {
    loadData();
  }, [categoryFilter]);

  const loadData = async () => {
    try {
      const category = categoryFilter === 'all' ? null : categoryFilter;
      const res = await productAPI.getAll(category);
      setProducts(res.data);
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.sku || !form.name) {
      toast.error('Please enter SKU and name');
      return;
    }
    try {
      await productAPI.create(form);
      toast.success('Product created');
      setCreateOpen(false);
      setForm({ sku: '', name: '', description: '', unit: 'KG', price_usd: 0, price_aed: 0, price_eur: 0, category: 'finished_product', min_stock: 0, type: 'MANUFACTURED' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create product');
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Are you sure you want to delete "${product.name}" (${product.sku})?\n\nThis action cannot be undone.`)) {
      return;
    }
    try {
      await productAPI.delete(product.id);
      toast.success(`Product "${product.name}" deleted successfully`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete product');
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryLabel = (cat) => {
    const found = CATEGORIES.find(c => c.value === cat);
    return found ? found.label : cat;
  };

  return (
    <div className="page-container" data-testid="products-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Products</h1>
          <p className="text-muted-foreground text-sm">Manage products and materials</p>
        </div>
        <div className="module-actions">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-product-btn" className="rounded-sm">
                <Plus className="w-4 h-4 mr-2" /> New Product
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Product</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="form-grid">
                  <div className="form-field">
                    <Label>SKU *</Label>
                    <Input
                      value={form.sku}
                      onChange={(e) => setForm({...form, sku: e.target.value})}
                      placeholder="e.g., PRD-001"
                      data-testid="product-sku-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({...form, name: e.target.value})}
                      placeholder="Product name"
                      data-testid="product-name-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
                      <SelectTrigger data-testid="product-category-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="form-field">
                    <Label>Product Type *</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MANUFACTURED">Manufacturing Product</SelectItem>
                        <SelectItem value="TRADED">Trading Product</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="form-field">
                    <Label>Unit</Label>
                    <Select value={form.unit} onValueChange={(v) => setForm({...form, unit: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-field">
                    <Label>Price (USD)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price_usd || ''}
                      onChange={(e) => setForm({...form, price_usd: parseFloat(e.target.value)})}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Price (AED)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price_aed || ''}
                      onChange={(e) => setForm({...form, price_aed: parseFloat(e.target.value)})}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Price (EUR)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.price_eur || ''}
                      onChange={(e) => setForm({...form, price_eur: parseFloat(e.target.value)})}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Min Stock Level</Label>
                    <Input
                      type="number"
                      value={form.min_stock || ''}
                      onChange={(e) => setForm({...form, min_stock: parseFloat(e.target.value)})}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({...form, description: e.target.value})}
                    placeholder="Product description..."
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} data-testid="submit-product-btn">Create Product</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Input
          className="w-64"
          placeholder="Search by name or SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="search-input"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48" data-testid="category-filter">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Products List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Products ({filteredProducts.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Package className="empty-state-icon" />
            <p className="empty-state-title">No products found</p>
            <p className="empty-state-description">Add products to manage inventory</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Unit</th>
                <th>Price (USD)</th>
                <th>Price (AED)</th>
                <th>Price (EUR)</th>
                <th>Stock</th>
                <th>Min Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} data-testid={`product-row-${product.sku}`}>
                  <td className="font-medium">{product.sku}</td>
                  <td>{product.name}</td>
                  <td>
                    <Badge variant="outline" className="text-xs">{getCategoryLabel(product.category)}</Badge>
                  </td>
                  <td>
                    <Badge variant={product.type === 'TRADED' ? 'secondary' : 'default'} className="text-xs">
                      {product.type === 'TRADED' ? 'Trading' : 'Manufacturing'}
                    </Badge>
                  </td>
                  <td>{product.unit}</td>
                  <td className="font-mono">{formatCurrency(product.price_usd, 'USD')}</td>
                  <td className="font-mono">{formatCurrency(product.price_aed, 'AED')}</td>
                  <td className="font-mono">{formatCurrency(product.price_eur, 'EUR')}</td>
                  <td className={`font-mono ${product.current_stock < product.min_stock ? 'text-red-400' : ''}`}>
                    {product.current_stock?.toLocaleString()}
                  </td>
                  <td className="font-mono text-muted-foreground">{product.min_stock?.toLocaleString()}</td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(product)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
