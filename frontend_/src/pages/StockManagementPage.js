import React, { useState, useEffect } from 'react';
import { productAPI } from '../lib/api';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { Package, Plus, TrendingUp, TrendingDown, Edit, AlertTriangle } from 'lucide-react';

export default function StockManagementPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [adjustForm, setAdjustForm] = useState({
    adjustment_type: 'add',
    quantity: 0,
    reason: '',
    notes: ''
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const res = await productAPI.getAll();
      setProducts(res.data);
    } catch (error) {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdjust = (product) => {
    setSelectedProduct(product);
    setAdjustForm({
      adjustment_type: 'add',
      quantity: 0,
      reason: '',
      notes: ''
    });
    setAdjustDialogOpen(true);
  };

  const handleAdjustStock = async () => {
    if (!adjustForm.quantity || adjustForm.quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    if (!adjustForm.reason) {
      toast.error('Please provide a reason for adjustment');
      return;
    }

    try {
      const adjustmentData = {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        sku: selectedProduct.sku,
        movement_type: adjustForm.adjustment_type === 'add' ? 'manual_add' : 'manual_subtract',
        quantity: adjustForm.adjustment_type === 'add' ? adjustForm.quantity : -adjustForm.quantity,
        reason: adjustForm.reason,
        notes: adjustForm.notes,
        previous_stock: selectedProduct.current_stock
      };

      // Create inventory movement
      await api.post('/inventory/movements', adjustmentData);

      // Update product stock
      const newStock = adjustForm.adjustment_type === 'add' 
        ? selectedProduct.current_stock + parseFloat(adjustForm.quantity)
        : selectedProduct.current_stock - parseFloat(adjustForm.quantity);
      
      await api.put(`/products/${selectedProduct.id}`, {
        current_stock: newStock
      });

      toast.success(`Stock ${adjustForm.adjustment_type === 'add' ? 'increased' : 'decreased'} successfully`);
      setAdjustDialogOpen(false);
      loadProducts();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to adjust stock');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStockStatus = (product) => {
    if (product.current_stock <= 0) return { label: 'Out of Stock', color: 'bg-red-500' };
    if (product.current_stock <= product.reorder_level) return { label: 'Low Stock', color: 'bg-amber-500' };
    return { label: 'In Stock', color: 'bg-green-500' };
  };

  return (
    <div className="page-container">
      <div className="module-header">
        <div>
          <h1 className="module-title">Stock Management</h1>
          <p className="text-muted-foreground text-sm">Manually adjust product inventory levels</p>
        </div>
        <div className="flex gap-3">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <div className="data-grid">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Package className="empty-state-icon" />
            <p className="empty-state-title">No products found</p>
            <p className="empty-state-description">Products will appear here once created</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Unit</th>
                <th>Reorder Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const status = getStockStatus(product);
                return (
                  <tr key={product.id}>
                    <td className="font-mono font-medium">{product.sku}</td>
                    <td>{product.name}</td>
                    <td>
                      <Badge variant="outline">
                        {product.category?.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="font-mono text-lg font-semibold">
                      {product.current_stock?.toFixed(2) || 0}
                    </td>
                    <td className="text-muted-foreground">{product.unit}</td>
                    <td className="font-mono">{product.reorder_level || 0}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status.color}`} />
                        <span className="text-sm">{status.label}</span>
                      </div>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenAdjust(product)}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Adjust
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Stock Adjustment Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              <div className="p-4 border border-border rounded-lg bg-muted/50">
                <div className="font-medium">{selectedProduct.name}</div>
                <div className="text-sm text-muted-foreground">SKU: {selectedProduct.sku}</div>
                <div className="text-sm mt-2">
                  Current Stock: <span className="font-mono font-semibold text-lg">{selectedProduct.current_stock?.toFixed(2) || 0}</span> {selectedProduct.unit}
                </div>
              </div>

              <div>
                <Label>Adjustment Type</Label>
                <Select 
                  value={adjustForm.adjustment_type} 
                  onValueChange={(v) => setAdjustForm({...adjustForm, adjustment_type: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        Add Stock
                      </div>
                    </SelectItem>
                    <SelectItem value="subtract">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4 text-red-400" />
                        Remove Stock
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjustForm.quantity}
                  onChange={(e) => setAdjustForm({...adjustForm, quantity: parseFloat(e.target.value) || 0})}
                  placeholder="Enter quantity"
                />
                {adjustForm.quantity > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    New Stock: {adjustForm.adjustment_type === 'add' 
                      ? (selectedProduct.current_stock + parseFloat(adjustForm.quantity)).toFixed(2)
                      : (selectedProduct.current_stock - parseFloat(adjustForm.quantity)).toFixed(2)
                    } {selectedProduct.unit}
                  </p>
                )}
              </div>

              <div>
                <Label>Reason <span className="text-red-400">*</span></Label>
                <Select 
                  value={adjustForm.reason} 
                  onValueChange={(v) => setAdjustForm({...adjustForm, reason: v})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stock_count">Physical Stock Count</SelectItem>
                    <SelectItem value="correction">Correction/Error</SelectItem>
                    <SelectItem value="damage">Damage/Wastage</SelectItem>
                    <SelectItem value="return">Customer Return</SelectItem>
                    <SelectItem value="initial_stock">Initial Stock Entry</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({...adjustForm, notes: e.target.value})}
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>

              {adjustForm.adjustment_type === 'subtract' && 
               adjustForm.quantity > selectedProduct.current_stock && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-400">
                    Warning: This will result in negative stock ({(selectedProduct.current_stock - adjustForm.quantity).toFixed(2)} {selectedProduct.unit})
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAdjustStock}
                  className={adjustForm.adjustment_type === 'add' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                >
                  {adjustForm.adjustment_type === 'add' ? 'Add Stock' : 'Remove Stock'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

