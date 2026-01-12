import React, { useState, useEffect } from 'react';
import { grnAPI, productAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { Plus, Receipt, Trash2 } from 'lucide-react';

export default function GRNPage() {
  const { user } = useAuth();
  const [grns, setGrns] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [form, setForm] = useState({
    supplier: '',
    delivery_note: '',
    notes: '',
    items: [],
  });

  const [newItem, setNewItem] = useState({
    product_id: '',
    product_name: '',
    sku: '',
    quantity: 0,
    unit: 'KG',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [grnsRes, productsRes] = await Promise.all([
        grnAPI.getAll(),
        productAPI.getAll(),
      ]);
      setGrns(grnsRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setNewItem({
        ...newItem,
        product_id: productId,
        product_name: product.name,
        sku: product.sku,
        unit: product.unit,
      });
    }
  };

  const addItem = () => {
    if (!newItem.product_id || newItem.quantity <= 0) {
      toast.error('Please select product and enter quantity');
      return;
    }
    setForm({
      ...form,
      items: [...form.items, { ...newItem }],
    });
    setNewItem({ product_id: '', product_name: '', sku: '', quantity: 0, unit: 'KG' });
  };

  const removeItem = (index) => {
    setForm({
      ...form,
      items: form.items.filter((_, i) => i !== index),
    });
  };

  const handleCreate = async () => {
    if (!form.supplier || form.items.length === 0) {
      toast.error('Please enter supplier and add items');
      return;
    }
    try {
      await grnAPI.create(form);
      toast.success('GRN created successfully. Inventory updated.');
      setCreateOpen(false);
      setForm({ supplier: '', delivery_note: '', notes: '', items: [] });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create GRN');
    }
  };

  const canCreate = ['admin', 'security', 'inventory'].includes(user?.role);

  return (
    <div className="page-container" data-testid="grn-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Goods Received Notes</h1>
          <p className="text-muted-foreground text-sm">Record incoming goods and update inventory</p>
        </div>
        <div className="module-actions">
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-grn-btn" className="rounded-sm">
                  <Plus className="w-4 h-4 mr-2" /> New GRN
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create GRN</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Supplier</Label>
                      <Input
                        value={form.supplier}
                        onChange={(e) => setForm({...form, supplier: e.target.value})}
                        placeholder="Supplier name"
                        data-testid="supplier-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Delivery Note #</Label>
                      <Input
                        value={form.delivery_note}
                        onChange={(e) => setForm({...form, delivery_note: e.target.value})}
                        placeholder="Delivery note number"
                      />
                    </div>
                  </div>

                  {/* Items Section */}
                  <div className="border-t border-border pt-4">
                    <h3 className="font-semibold mb-4">Items Received</h3>
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div className="col-span-2">
                        <Select value={newItem.product_id} onValueChange={handleProductSelect}>
                          <SelectTrigger data-testid="product-select">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        type="number"
                        placeholder="Quantity"
                        value={newItem.quantity || ''}
                        onChange={(e) => setNewItem({...newItem, quantity: parseFloat(e.target.value)})}
                        data-testid="quantity-input"
                      />
                      <Button type="button" variant="secondary" onClick={addItem} data-testid="add-item-btn">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>

                    {form.items.length > 0 && (
                      <div className="data-grid">
                        <table className="erp-table w-full">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>SKU</th>
                              <th>Quantity</th>
                              <th>Unit</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.items.map((item, idx) => (
                              <tr key={idx}>
                                <td>{item.product_name}</td>
                                <td>{item.sku}</td>
                                <td className="font-mono">{item.quantity}</td>
                                <td>{item.unit}</td>
                                <td>
                                  <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="form-field">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({...form, notes: e.target.value})}
                      placeholder="Additional notes..."
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} data-testid="submit-grn-btn">Create GRN</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* GRN List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">GRN Records ({grns.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : grns.length === 0 ? (
          <div className="empty-state">
            <Receipt className="empty-state-icon" />
            <p className="empty-state-title">No GRN records found</p>
            <p className="empty-state-description">Create a GRN when goods are received</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Delivery Note</th>
                <th>Received Date</th>
              </tr>
            </thead>
            <tbody>
              {grns.map((grn) => (
                <tr key={grn.id} data-testid={`grn-row-${grn.grn_number}`}>
                  <td className="font-medium">{grn.grn_number}</td>
                  <td>{grn.supplier}</td>
                  <td>{grn.items?.length || 0}</td>
                  <td>{grn.delivery_note || '-'}</td>
                  <td>{formatDate(grn.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
