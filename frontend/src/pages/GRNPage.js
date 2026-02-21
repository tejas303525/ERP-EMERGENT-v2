import React, { useState, useEffect } from 'react';
import { grnAPI, productAPI } from '../lib/api';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatDate, hasPagePermission } from '../lib/utils';
import { Plus, Receipt, Trash2, Eye, Printer, Download } from 'lucide-react';

export default function GRNPage() {
  const { user } = useAuth();
  const [grns, setGrns] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [poLines, setPOLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedGRN, setSelectedGRN] = useState(null);

  const [form, setForm] = useState({
    supplier: '',
    delivery_note: '',
    notes: '',
    items: [],
    po_id: '',
  });

  const [newItem, setNewItem] = useState({
    product_id: '',
    product_name: '',
    sku: '',
    quantity: 0,
    received_qty: 0,  // NEW: User input for this delivery only
    ordered_qty: 0,
    received_qty_till_date: 0,  // NEW: Cumulative received from PO line
    unit: 'KG',
    procurement_type: 'Bulk',
    packaging_item_id: '',
    packaging_qty: 0,
    net_weight_kg: 0,
    po_line_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [grnsRes, productsRes, rawItemsRes, packItemsRes, posRes] = await Promise.all([
        grnAPI.getAll(),
        productAPI.getAll(),
        api.get('/inventory-items?item_type=RAW'),
        api.get('/inventory-items?item_type=PACK'),
        api.get('/purchase-orders?status=SENT,PARTIAL').catch(() => ({ data: { data: [] } })),
      ]);
      setGrns(grnsRes.data);
      setPurchaseOrders(posRes.data?.data || []);
      
      // Combine products with inventory items for GRN selection
      const allProducts = [
        ...(productsRes.data || []),
        ...(rawItemsRes.data || []).map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.uom || 'KG',
          item_type: 'RAW'
        })),
        ...(packItemsRes.data || []).map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.uom || 'EA',
          item_type: 'PACK'
        }))
      ];
      setProducts(allProducts);
      
      // Store packaging materials separately for dropdown
      setPackagingMaterials(packItemsRes.data || []);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handlePOSelect = async (poId) => {
    setForm({ ...form, po_id: poId });
    
    if (poId) {
      try {
        const [poRes, linesRes] = await Promise.all([
          api.get(`/purchase-orders/${poId}`),
          api.get(`/purchase-order-lines?po_id=${poId}`)
        ]);
        
        const po = poRes.data;
        const lines = linesRes.data?.data || [];
        
        setSelectedPO(po);
        setPOLines(lines);
        
        // Auto-populate supplier
        if (po.supplier_name) {
          setForm(prev => ({ ...prev, supplier: po.supplier_name }));
        }
      } catch (error) {
        toast.error('Failed to load PO details');
      }
    } else {
      setSelectedPO(null);
      setPOLines([]);
    }
  };

  const handleProductSelect = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      // Check if this product is in the PO lines
      const matchingPOLine = poLines.find(line => line.item_id === productId);
      
      setNewItem({
        ...newItem,
        product_id: productId,
        product_name: product.name,
        sku: product.sku,
        unit: product.unit,
        ordered_qty: matchingPOLine ? matchingPOLine.qty : 0,
        received_qty_till_date: matchingPOLine ? (matchingPOLine.received_qty || 0) : 0,
        po_line_id: matchingPOLine ? matchingPOLine.id : '',
        received_qty: 0,  // Always blank on product select
        quantity: 0,  // Reset quantity
      });
    }
  };

  const addItem = () => {
    const receivedQty = newItem.received_qty || newItem.quantity || 0;
    if (!newItem.product_id || receivedQty <= 0) {
      toast.error('Please select product and enter received quantity');
      return;
    }
    setForm({
      ...form,
      items: [...form.items, { 
        ...newItem,
        received_qty: receivedQty,  // Use received_qty, fallback to quantity
        quantity: receivedQty,  // Keep quantity for backward compatibility
      }],
    });
    setNewItem({ 
      product_id: '', 
      product_name: '', 
      sku: '', 
      quantity: 0,
      received_qty: 0,  // Always blank on reset
      ordered_qty: 0,
      received_qty_till_date: 0,
      unit: 'KG',
      procurement_type: 'Bulk',
      packaging_item_id: '',
      packaging_qty: 0,
      net_weight_kg: 0,
      po_line_id: '',
    });
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
      // Prepare items with received_qty
      const itemsToSend = form.items.map(item => ({
        ...item,
        received_qty: item.received_qty || item.quantity,  // Use received_qty, fallback to quantity
      }));
      
      const response = await grnAPI.create({ ...form, items: itemsToSend });
      
      // Check if there were partial deliveries
      if (response.data?.has_partial_delivery) {
        toast.warning(`GRN created with ${response.data.partial_claims_count} partial delivery item(s). Shortages tracked for procurement.`);
      } else {
        toast.success('GRN created successfully. Stock will be updated after QC approval.');
      }
      
      setCreateOpen(false);
      setForm({ supplier: '', delivery_note: '', notes: '', items: [], po_id: '' });
      setSelectedPO(null);
      setPOLines([]);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create GRN');
    }
  };

  const canCreate = hasPagePermission(user, '/grn', ['admin', 'security', 'inventory']);

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
                <div className="space-y-6 py-4" onFocus={() => {
                  // Reset received_qty when modal opens
                  setNewItem(prev => ({ ...prev, received_qty: 0, quantity: 0 }));
                }}>
                  {/* PO Selection */}
                  <div className="form-field">
                    <Label>Purchase Order (Optional)</Label>
                    <Select value={form.po_id} onValueChange={handlePOSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select PO for partial delivery tracking" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">-- No PO (Manual GRN) --</SelectItem>
                        {purchaseOrders.map(po => (
                          <SelectItem key={po.id} value={po.id}>
                            {po.po_number} - {po.supplier_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.po_id && (
                      <p className="text-xs text-muted-foreground mt-1">
                        ✓ Partial deliveries will be automatically tracked
                      </p>
                    )}
                  </div>

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
                    
                    {/* Product Selection Row */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="col-span-2">
                        <Label className="text-xs">Product</Label>
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
                      <div>
                        <Label className="text-xs">Procurement Type</Label>
                        <Select 
                          value={newItem.procurement_type} 
                          onValueChange={(val) => setNewItem({...newItem, procurement_type: val})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Bulk">Bulk</SelectItem>
                            <SelectItem value="Drummed">Drummed/Packaged</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* PO Info Strip (read-only) - shown when PO is selected */}
                    {form.po_id && newItem.product_id && newItem.ordered_qty > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground">PO Qty:</span>
                            <p className="font-semibold">{newItem.ordered_qty} {newItem.unit}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Received Till Date:</span>
                            <p className="font-semibold">{newItem.received_qty_till_date || 0} {newItem.unit}</p>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground">Remaining PO Qty:</span>
                            <p className="font-semibold">{newItem.ordered_qty - (newItem.received_qty_till_date || 0)} {newItem.unit}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quantity and Unit Row */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <Label className="text-xs">Received Qty (This Delivery) *</Label>
                        <Input
                          type="number"
                          placeholder="Enter quantity for this delivery"
                          value={newItem.received_qty || ''}
                          onChange={(e) => setNewItem({...newItem, received_qty: parseFloat(e.target.value) || 0, quantity: parseFloat(e.target.value) || 0})}
                          data-testid="quantity-input"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Enter the quantity physically received in this delivery.
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs">Unit</Label>
                        <Select 
                          value={newItem.unit} 
                          onValueChange={(val) => setNewItem({...newItem, unit: val})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="KG">KG</SelectItem>
                            <SelectItem value="MT">MT</SelectItem>
                            <SelectItem value="EA">EA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Partial Delivery Warning */}
                    {form.po_id && newItem.ordered_qty > 0 && newItem.received_qty > 0 && (newItem.received_qty_till_date + newItem.received_qty) < newItem.ordered_qty && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">
                        <p className="text-xs text-yellow-800">
                          ⚠️ Partial delivery: {newItem.received_qty}/{newItem.ordered_qty} {newItem.unit} in this delivery
                          - Remaining: {newItem.ordered_qty - (newItem.received_qty_till_date + newItem.received_qty)} {newItem.unit} will be tracked for procurement
                        </p>
                      </div>
                    )}

                    {/* Packaging Fields (shown only when Drummed) */}
                    {newItem.procurement_type === 'Drummed' && (
                      <div className="grid grid-cols-3 gap-3 mb-3 p-3 bg-muted/50 rounded-md">
                        <div>
                          <Label className="text-xs">Packaging Type</Label>
                          <Select 
                            value={newItem.packaging_item_id} 
                            onValueChange={(val) => setNewItem({...newItem, packaging_item_id: val})}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select packaging" />
                            </SelectTrigger>
                            <SelectContent>
                              {packagingMaterials.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Package Qty</Label>
                          <Input
                            type="number"
                            placeholder="# of drums/IBCs"
                            value={newItem.packaging_qty || ''}
                            onChange={(e) => setNewItem({...newItem, packaging_qty: parseFloat(e.target.value)})}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Net Weight/Package (kg)</Label>
                          <Input
                            type="number"
                            placeholder="kg per drum"
                            value={newItem.net_weight_kg || ''}
                            onChange={(e) => setNewItem({...newItem, net_weight_kg: parseFloat(e.target.value)})}
                          />
                        </div>
                      </div>
                    )}

                    <Button type="button" variant="secondary" onClick={addItem} data-testid="add-item-btn" className="w-full">
                      <Plus className="w-4 h-4 mr-2" /> Add Item
                    </Button>

                    {form.items.length > 0 && (
                      <div className="data-grid mt-4">
                        <table className="erp-table w-full">
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>SKU</th>
                              {form.po_id && <th>Ordered</th>}
                              <th>Received (This Delivery)</th>
                              <th>Unit</th>
                              <th>Type</th>
                              <th>Packaging</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.items.map((item, idx) => (
                              <tr key={idx} className={item.ordered_qty > 0 && (item.received_qty || item.quantity) < item.ordered_qty ? 'bg-yellow-50' : ''}>
                                <td>{item.product_name}</td>
                                <td>{item.sku}</td>
                                {form.po_id && (
                                  <td className="font-mono">
                                    {item.ordered_qty || '-'}
                                  </td>
                                )}
                                <td className="font-mono">
                                  {item.received_qty || item.quantity}
                                  {item.ordered_qty > 0 && (item.received_qty || item.quantity) < item.ordered_qty && (
                                    <span className="text-xs text-yellow-600 ml-1">
                                      (Partial)
                                    </span>
                                  )}
                                </td>
                                <td>{item.unit}</td>
                                <td>
                                  <Badge variant={item.procurement_type === 'Drummed' ? 'default' : 'secondary'}>
                                    {item.procurement_type}
                                  </Badge>
                                </td>
                                <td>
                                  {item.procurement_type === 'Drummed' && item.packaging_qty > 0 ? (
                                    <span className="text-xs">
                                      {item.packaging_qty} units × {item.net_weight_kg}kg
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </td>
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
                <th>Products</th>
                <th>PO</th>
                <th>QC #</th>
                <th>Received Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grns.map((grn) => (
                <tr key={grn.id} data-testid={`grn-row-${grn.grn_number}`}>
                  <td className="font-medium">{grn.grn_number}</td>
                  <td>{grn.supplier}</td>
                  <td>
                    {grn.items?.map(item => item.display_name || item.product_name).join(', ') || '-'}
                  </td>
                  <td>{grn.po_number || '-'}</td>
                  <td>{grn.qc_number || '-'}</td>
                  <td>{formatDate(grn.received_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSelectedGRN(grn); setViewOpen(true); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const token = localStorage.getItem('erp_token');
                          const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                          window.open(`${backendUrl}/api/pdf/grn/${grn.id}?token=${token}`, '_blank');
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View GRN Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>GRN Details - {selectedGRN?.grn_number}</DialogTitle>
          </DialogHeader>
          {selectedGRN && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">GRN Number:</span>
                  <p className="font-medium font-mono">{selectedGRN.grn_number}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <p className="font-medium">{selectedGRN.supplier}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Delivery Note:</span>
                  <p className="font-medium">{selectedGRN.delivery_note || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Received Date:</span>
                  <p className="font-medium">{formatDate(selectedGRN.received_at)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Items:</span>
                  <p className="font-medium">{selectedGRN.items?.length || 0}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created By:</span>
                  <p className="font-medium">{selectedGRN.created_by || '-'}</p>
                </div>
              </div>

              {selectedGRN.notes && (
                <div>
                  <span className="text-muted-foreground text-sm">Notes:</span>
                  <p className="mt-1 p-2 bg-muted/30 rounded text-sm">{selectedGRN.notes}</p>
                </div>
              )}

              {selectedGRN.items?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Items Received</h4>
                  <div className="data-grid max-h-64 overflow-y-auto">
                    <table className="erp-table w-full">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>SKU</th>
                          <th>Quantity</th>
                          <th>Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGRN.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              {item.display_name || item.product_name}
                              {item.packaging_qty && item.packaging_name && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Packaging: {item.packaging_qty} x {item.packaging_name}
                                </div>
                              )}
                            </td>
                            <td className="font-mono text-sm">{item.sku}</td>
                            <td className="font-mono">{item.quantity?.toFixed(2)}</td>
                            <td>{item.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => window.print()}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" onClick={() => setViewOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
