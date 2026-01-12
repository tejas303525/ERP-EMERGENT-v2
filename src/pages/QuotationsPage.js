import React, { useState, useEffect } from 'react';
import { quotationAPI, customerAPI, productAPI, pdfAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { formatCurrency, formatDate, getStatusColor, cn } from '../lib/utils';
import { Plus, FileText, Check, X, Eye, Trash2, Download, Globe, MapPin, Ship, AlertTriangle } from 'lucide-react';

const CURRENCIES = ['USD', 'AED', 'EUR', 'INR'];
const ORDER_TYPES = ['local', 'export'];
const PAYMENT_TERMS = ['Cash', 'LC', 'CAD', 'TT', 'Net 30', 'Net 60', 'Advance 50%'];
const INCOTERMS = ['FOB', 'CFR', 'CIF', 'EXW', 'DDP', 'CIP', 'DAP'];
const PACKAGING = ['Bulk', '200L Drum', '210L Drum', 'IBC 1000L', 'Flexitank', 'ISO Tank'];

// Container types with max capacity
const CONTAINER_TYPES = [
  { value: '20ft', label: '20ft Container', max_mt: 28 },
  { value: '40ft', label: '40ft Container', max_mt: 28 },
  { value: 'iso_tank', label: 'ISO Tank', max_mt: 25 },
  { value: 'bulk_tanker_45', label: 'Bulk Tanker 45T', max_mt: 45 },
  { value: 'bulk_tanker_25', label: 'Bulk Tanker 25T', max_mt: 25 },
  { value: 'road_trailer', label: 'Road Trailer', max_mt: 25 },
  { value: 'road_box_trailer', label: 'Road Box Trailer', max_mt: 25 },
];

// Document types that can be required
const DOCUMENT_TYPES = [
  { id: 'commercial_invoice', label: 'Commercial Invoice', defaultChecked: true },
  { id: 'packing_list', label: 'Packing List', defaultChecked: true },
  { id: 'certificate_of_origin', label: 'Certificate of Origin (COO)', defaultChecked: false },
  { id: 'certificate_of_analysis', label: 'Certificate of Analysis (COA)', defaultChecked: true },
  { id: 'bill_of_lading', label: 'Bill of Lading (B/L)', defaultChecked: false },
  { id: 'msds', label: 'Material Safety Data Sheet (MSDS)', defaultChecked: false },
  { id: 'phytosanitary', label: 'Phytosanitary Certificate', defaultChecked: false },
  { id: 'insurance', label: 'Insurance Certificate', defaultChecked: false },
  { id: 'weight_slip', label: 'Weight Slip', defaultChecked: false },
  { id: 'delivery_note', label: 'Delivery Note', defaultChecked: true },
];

// Countries list (common ones)
const COUNTRIES = [
  'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'India', 'Pakistan',
  'China', 'USA', 'UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands',
  'Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines',
  'South Africa', 'Nigeria', 'Egypt', 'Kenya', 'Australia', 'New Zealand',
  'Brazil', 'Mexico', 'Canada', 'Japan', 'South Korea', 'Turkey', 'Russia'
].sort();

const VAT_RATE = 0.05; // 5% VAT for local orders

const VALIDITY_OPTIONS = [
  { value: 7, label: '7 Days' },
  { value: 14, label: '14 Days' },
  { value: 30, label: '30 Days' },
  { value: 45, label: '45 Days' },
  { value: 60, label: '60 Days' },
  { value: 90, label: '90 Days' },
];

export default function QuotationsPage() {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [approving, setApproving] = useState(null);

  const [form, setForm] = useState({
    customer_id: '',
    customer_name: '',
    currency: 'USD',
    order_type: 'local',
    incoterm: '',
    container_type: '',
    container_count: 1,
    port_of_loading: '',
    port_of_discharge: '',
    delivery_place: '',
    country_of_origin: 'UAE',
    country_of_destination: '',
    payment_terms: 'Cash',
    validity_days: 30,
    notes: '',
    items: [],
    required_documents: DOCUMENT_TYPES.filter(d => d.defaultChecked).map(d => d.id),
    include_vat: true,
  });

  const [newItem, setNewItem] = useState({
    product_id: '',
    product_name: '',
    sku: '',
    quantity: 0,
    unit_price: 0,
    packaging: 'Bulk',
    net_weight_kg: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [quotationsRes, customersRes, productsRes] = await Promise.all([
        quotationAPI.getAll(),
        customerAPI.getAll(),
        productAPI.getAll(),
      ]);
      setQuotations(quotationsRes.data);
      setCustomers(customersRes.data);
      setProducts(productsRes.data.filter(p => p.category === 'finished_product'));
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    setForm({
      ...form,
      customer_id: customerId,
      customer_name: customer?.name || '',
      country_of_destination: customer?.country || '',
    });
  };

  const handleProductSelect = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setNewItem({
        ...newItem,
        product_id: productId,
        product_name: product.name,
        sku: product.sku,
        unit_price: product.price_usd || 0,
      });
    }
  };

  const addItem = () => {
    if (!newItem.product_id || newItem.quantity <= 0) {
      toast.error('Please select a product and enter quantity');
      return;
    }
    if (newItem.packaging !== 'Bulk' && !newItem.net_weight_kg) {
      toast.error('Please enter net weight (kg) for packaged items');
      return;
    }
    
    // Calculate total based on packaging type
    let total = 0;
    let weight_mt = 0;
    if (newItem.packaging !== 'Bulk' && newItem.net_weight_kg) {
      weight_mt = (newItem.net_weight_kg * newItem.quantity) / 1000;
      total = weight_mt * newItem.unit_price;
    } else {
      weight_mt = newItem.quantity;
      total = newItem.quantity * newItem.unit_price;
    }
    
    setForm({
      ...form,
      items: [...form.items, { ...newItem, weight_mt, total }],
    });
    setNewItem({ product_id: '', product_name: '', sku: '', quantity: 0, unit_price: 0, packaging: 'Bulk', net_weight_kg: null });
  };

  const removeItem = (index) => {
    setForm({
      ...form,
      items: form.items.filter((_, i) => i !== index),
    });
  };

  const toggleDocument = (docId) => {
    setForm(prev => ({
      ...prev,
      required_documents: prev.required_documents.includes(docId)
        ? prev.required_documents.filter(d => d !== docId)
        : [...prev.required_documents, docId]
    }));
  };

  // Calculate totals
  const subtotal = form.items.reduce((sum, i) => sum + i.total, 0);
  const vatAmount = form.order_type === 'local' && form.include_vat ? subtotal * VAT_RATE : 0;
  const grandTotal = subtotal + vatAmount;
  const totalWeightMT = form.items.reduce((sum, i) => sum + (i.weight_mt || i.quantity), 0);

  // Get max cargo capacity based on container type
  const getMaxContainerCapacity = () => {
    const container = CONTAINER_TYPES.find(c => c.value === form.container_type);
    return container ? container.max_mt * form.container_count : Infinity;
  };

  const maxCargoCapacity = getMaxContainerCapacity();
  const isOverweight = form.order_type === 'export' && form.container_type && totalWeightMT > maxCargoCapacity;

  const handleCreate = async () => {
    if (!form.customer_id || form.items.length === 0) {
      toast.error('Please select customer and add items');
      return;
    }
    if (form.order_type === 'export' && !form.container_type) {
      toast.error('Please select container type for export orders');
      return;
    }
    if (form.order_type === 'export' && !form.container_count) {
      toast.error('Please enter number of containers');
      return;
    }
    // Check max cargo exceeded
    if (isOverweight) {
      toast.error(`Max cargo exceeded! Total weight (${totalWeightMT.toFixed(2)} MT) exceeds container capacity (${maxCargoCapacity} MT). Please increase container count.`);
      return;
    }
    try {
      const quotationData = {
        ...form,
        subtotal,
        vat_amount: vatAmount,
        vat_rate: form.order_type === 'local' && form.include_vat ? VAT_RATE : 0,
        total: grandTotal,
        total_weight_mt: totalWeightMT,
      };
      await quotationAPI.create(quotationData);
      toast.success('Quotation created successfully');
      setCreateOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create quotation');
    }
  };

  const handleApprove = async (id) => {
    setApproving(id);
    try {
      const response = await quotationAPI.approve(id);
      toast.success('Quotation approved');
      // Immediately update local state to reflect approval
      setQuotations(prev => prev.map(q => 
        q.id === id ? { ...q, status: 'approved' } : q
      ));
      // Also reload to get any material check results
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve');
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (id) => {
    try {
      await quotationAPI.reject(id);
      toast.success('Quotation rejected');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject');
    }
  };

  const handleDownloadPDF = async (quotationId, pfiNumber) => {
    try {
      const token = localStorage.getItem('erp_token');
      const url = pdfAPI.getQuotationUrl(quotationId);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `PFI_${pfiNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('PDF downloaded');
    } catch (error) {
      toast.error('Failed to download PDF');
    }
  };

  const resetForm = () => {
    setForm({
      customer_id: '',
      customer_name: '',
      currency: 'USD',
      order_type: 'local',
      incoterm: '',
      container_type: '',
      port_of_loading: '',
      port_of_discharge: '',
      delivery_place: '',
      country_of_origin: 'UAE',
      country_of_destination: '',
      payment_terms: 'Cash',
      validity_days: 30,
      notes: '',
      items: [],
      required_documents: DOCUMENT_TYPES.filter(d => d.defaultChecked).map(d => d.id),
      include_vat: true,
    });
  };

  const filteredQuotations = quotations.filter(q => 
    statusFilter === 'all' || q.status === statusFilter
  );

  return (
    <div className="page-container" data-testid="quotations-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Quotations / PFI</h1>
          <p className="text-muted-foreground text-sm">Manage proforma invoices and quotations</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="new-quotation-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Quotation / PFI</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Order Type Selection */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label>Order Type</Label>
                  <Select value={form.order_type} onValueChange={(v) => setForm({...form, order_type: v, incoterm: v === 'local' ? '' : form.incoterm})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Customer</Label>
                  <Select value={form.customer_id} onValueChange={handleCustomerChange}>
                    <SelectTrigger data-testid="customer-select">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({...form, currency: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Terms</Label>
                  <Select value={form.payment_terms} onValueChange={(v) => setForm({...form, payment_terms: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quotation Validity</Label>
                  <Select value={String(form.validity_days)} onValueChange={(v) => setForm({...form, validity_days: parseInt(v)})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VALIDITY_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Export-specific fields */}
              {form.order_type === 'export' && (
                <div className="p-4 border border-cyan-500/30 rounded-lg bg-cyan-500/5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    Export Details
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Container Type</Label>
                      <Select value={form.container_type} onValueChange={(v) => setForm({...form, container_type: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select container" />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTAINER_TYPES.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label} (Max {c.max_mt} MT)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Number of Containers</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.container_count}
                        onChange={(e) => setForm({...form, container_count: parseInt(e.target.value) || 1})}
                        placeholder="1"
                      />
                      {form.container_type && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Total Capacity: {(CONTAINER_TYPES.find(c => c.value === form.container_type)?.max_mt || 0) * form.container_count} MT
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Incoterm</Label>
                      <Select value={form.incoterm} onValueChange={(v) => setForm({...form, incoterm: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select incoterm" />
                        </SelectTrigger>
                        <SelectContent>
                          {INCOTERMS.map(i => (
                            <SelectItem key={i} value={i}>{i}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Country of Origin</Label>
                      <Select value={form.country_of_origin} onValueChange={(v) => setForm({...form, country_of_origin: v})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Country of Destination</Label>
                      <Select value={form.country_of_destination} onValueChange={(v) => setForm({...form, country_of_destination: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* Local-specific fields */}
              {form.order_type === 'local' && (
                <div className="p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    Local Delivery Details
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Incoterm</Label>
                      <Select value={form.incoterm} onValueChange={(v) => setForm({...form, incoterm: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select incoterm" />
                        </SelectTrigger>
                        <SelectContent>
                          {INCOTERMS.map(i => (
                            <SelectItem key={i} value={i}>{i}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Point of Loading</Label>
                      <Input
                        value={form.port_of_loading}
                        onChange={(e) => setForm({...form, port_of_loading: e.target.value})}
                        placeholder="Loading location"
                      />
                    </div>
                    <div>
                      <Label>Point of Discharge</Label>
                      <Input
                        value={form.port_of_discharge}
                        onChange={(e) => setForm({...form, port_of_discharge: e.target.value})}
                        placeholder="Discharge location"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox 
                          checked={form.include_vat} 
                          onCheckedChange={(checked) => setForm({...form, include_vat: checked})}
                        />
                        <span className="text-sm">Include 5% VAT</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Port/Loading for Export */}
              {form.order_type === 'export' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Port of Loading</Label>
                    <Input
                      value={form.port_of_loading}
                      onChange={(e) => setForm({...form, port_of_loading: e.target.value})}
                      placeholder="e.g., Jebel Ali Port"
                    />
                  </div>
                  <div>
                    <Label>Port of Discharge</Label>
                    <Input
                      value={form.port_of_discharge}
                      onChange={(e) => setForm({...form, port_of_discharge: e.target.value})}
                      placeholder="Destination port"
                    />
                  </div>
                </div>
              )}

              {/* Items Section */}
              <div className="border-t border-border pt-4">
                <h3 className="font-semibold mb-4">Items</h3>
                <div className="grid grid-cols-7 gap-2 mb-3">
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
                    placeholder="Qty"
                    value={newItem.quantity || ''}
                    onChange={(e) => setNewItem({...newItem, quantity: parseFloat(e.target.value)})}
                  />
                  <Input
                    type="number"
                    placeholder="Price/MT"
                    value={newItem.unit_price || ''}
                    onChange={(e) => setNewItem({...newItem, unit_price: parseFloat(e.target.value)})}
                  />
                  <Select value={newItem.packaging} onValueChange={(v) => setNewItem({...newItem, packaging: v, net_weight_kg: v === 'Bulk' ? null : newItem.net_weight_kg})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PACKAGING.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newItem.packaging !== 'Bulk' && (
                    <Input
                      type="number"
                      placeholder="Net Wt (kg)"
                      value={newItem.net_weight_kg || ''}
                      onChange={(e) => setNewItem({...newItem, net_weight_kg: parseFloat(e.target.value)})}
                      className="placeholder:text-xs"
                    />
                  )}
                  <Button type="button" variant="secondary" onClick={addItem} data-testid="add-item-btn">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {newItem.packaging !== 'Bulk' && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Net weight per unit (e.g., 200 kg per drum)
                  </p>
                )}

                  {form.items.length > 0 && (
                    <div className="data-grid">
                      <table className="erp-table w-full">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>SKU</th>
                            <th>Qty</th>
                            <th>Packaging</th>
                            <th>Net Wt (kg)</th>
                            <th>Weight (MT)</th>
                            <th>Price/MT</th>
                            <th>Total</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map((item, idx) => (
                            <tr key={idx}>
                              <td>{item.product_name}</td>
                              <td>{item.sku}</td>
                              <td>{item.quantity}</td>
                              <td>{item.packaging}</td>
                              <td>{item.net_weight_kg || '-'}</td>
                              <td className="font-mono">{item.weight_mt?.toFixed(3) || item.quantity}</td>
                              <td>{formatCurrency(item.unit_price, form.currency)}</td>
                              <td className="font-bold">{formatCurrency(item.total, form.currency)}</td>
                              <td>
                                <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="p-4 border-t border-border">
                        <div className="flex justify-between items-end">
                          <div className="text-sm text-muted-foreground">
                            Total Weight: <span className="font-mono font-medium">{totalWeightMT.toFixed(3)} MT</span>
                            {form.container_type && (
                              <span className="ml-2">
                                | Container Capacity: {CONTAINER_TYPES.find(c => c.value === form.container_type)?.max_mt || 0} MT
                              </span>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <div className="flex justify-between gap-8">
                              <span className="text-sm text-muted-foreground">Subtotal:</span>
                              <span className="font-mono">{formatCurrency(subtotal, form.currency)}</span>
                            </div>
                            {form.order_type === 'local' && form.include_vat && (
                              <div className="flex justify-between gap-8">
                                <span className="text-sm text-muted-foreground">VAT (5%):</span>
                                <span className="font-mono">{formatCurrency(vatAmount, form.currency)}</span>
                              </div>
                            )}
                            <div className="flex justify-between gap-8 border-t pt-1">
                              <span className="font-medium">Grand Total:</span>
                              <span className="text-xl font-bold font-mono">{formatCurrency(grandTotal, form.currency)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              {/* Required Documents */}
              <div className="border-t border-border pt-4">
                <h3 className="font-semibold mb-3">Documents that need to be submitted</h3>
                <div className="grid grid-cols-3 gap-2">
                  {DOCUMENT_TYPES.map(doc => (
                    <label key={doc.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/20 cursor-pointer">
                      <Checkbox 
                        checked={form.required_documents.includes(doc.id)} 
                        onCheckedChange={() => toggleDocument(doc.id)}
                      />
                      <span className="text-sm">{doc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Overweight Warning */}
              {isOverweight && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="text-red-400 font-medium">Max Cargo Exceeded!</p>
                    <p className="text-sm text-red-400/80">
                      Total weight ({totalWeightMT.toFixed(2)} MT) exceeds container capacity ({maxCargoCapacity} MT). 
                      Please increase the number of containers.
                    </p>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({...form, notes: e.target.value})}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} className="btn-primary" data-testid="create-quotation-submit">
                  Create Quotation
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quotations List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Quotations ({filteredQuotations.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredQuotations.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <p className="empty-state-title">No quotations found</p>
            <p className="empty-state-description">Create a new quotation to get started</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>PFI Number</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Total</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.map((q) => (
                <tr key={q.id} data-testid={`quotation-row-${q.pfi_number}`}>
                  <td className="font-medium">{q.pfi_number}</td>
                  <td>{q.customer_name}</td>
                  <td>
                    <Badge variant="outline" className={cn(
                      'text-xs',
                      q.order_type === 'export' ? 'border-cyan-500 text-cyan-400' : 'border-amber-500 text-amber-400'
                    )}>
                      {q.order_type?.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="font-mono">{formatCurrency(q.total, q.currency)}</td>
                  <td>
                    <Badge className={getStatusColor(q.status)}>
                      {q.status?.toUpperCase()}
                    </Badge>
                  </td>
                  <td>{formatDate(q.created_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedQuotation(q); setViewOpen(true); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(q.id, q.pfi_number)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      {q.status === 'pending' && (user?.role === 'admin' || user?.role === 'finance') && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleApprove(q.id)}
                            disabled={approving === q.id}
                            data-testid={`approve-btn-${q.pfi_number}`}
                          >
                            <Check className={cn("w-4 h-4 text-green-500", approving === q.id && "animate-spin")} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleReject(q.id)}>
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quotation Details - {selectedQuotation?.pfi_number}</DialogTitle>
          </DialogHeader>
          {selectedQuotation && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-medium">{selectedQuotation.customer_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Order Type:</span>
                  <p className="font-medium">{selectedQuotation.order_type?.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={getStatusColor(selectedQuotation.status)}>
                    {selectedQuotation.status?.toUpperCase()}
                  </Badge>
                </div>
                {selectedQuotation.container_type && (
                  <div>
                    <span className="text-muted-foreground">Container:</span>
                    <p className="font-medium">{selectedQuotation.container_type}</p>
                  </div>
                )}
                {selectedQuotation.incoterm && (
                  <div>
                    <span className="text-muted-foreground">Incoterm:</span>
                    <p className="font-medium">{selectedQuotation.incoterm}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Payment Terms:</span>
                  <p className="font-medium">{selectedQuotation.payment_terms}</p>
                </div>
              </div>

              <div className="data-grid">
                <table className="erp-table w-full">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Packaging</th>
                      <th>Weight (MT)</th>
                      <th>Price/MT</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuotation.items?.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.product_name}</td>
                        <td>{item.quantity}</td>
                        <td>{item.packaging}</td>
                        <td className="font-mono">{item.weight_mt?.toFixed(3) || item.quantity}</td>
                        <td>{formatCurrency(item.unit_price, selectedQuotation.currency)}</td>
                        <td className="font-bold">{formatCurrency(item.total, selectedQuotation.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-right space-y-1 p-4 bg-muted/20 rounded">
                <div>Subtotal: <span className="font-mono">{formatCurrency(selectedQuotation.subtotal, selectedQuotation.currency)}</span></div>
                {selectedQuotation.vat_amount > 0 && (
                  <div>VAT (5%): <span className="font-mono">{formatCurrency(selectedQuotation.vat_amount, selectedQuotation.currency)}</span></div>
                )}
                <div className="text-lg font-bold">Total: <span className="font-mono">{formatCurrency(selectedQuotation.total, selectedQuotation.currency)}</span></div>
              </div>

              {selectedQuotation.required_documents?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Required Documents:</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedQuotation.required_documents.map(docId => {
                      const doc = DOCUMENT_TYPES.find(d => d.id === docId);
                      return doc ? (
                        <Badge key={docId} variant="outline">{doc.label}</Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
