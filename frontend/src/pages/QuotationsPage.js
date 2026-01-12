import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quotationAPI, customerAPI, productAPI, pdfAPI } from '../lib/api';
import api from '../lib/api';
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
import { Plus, FileText, Check, X, Eye, Trash2, Download, Globe, MapPin, Ship, AlertTriangle, Edit, RefreshCw } from 'lucide-react';

const CURRENCIES = ['USD', 'AED', 'EUR', 'INR'];
const ORDER_TYPES = ['local', 'export'];
const PAYMENT_TERMS = ['Cash', 'LC', 'CAD', 'TT', 'Net 30', 'Net 60', 'Advance 50%'];
const INCOTERMS = ['FOB', 'CFR', 'CIF', 'EXW', 'DDP', 'CIP', 'DAP'];
// Default packaging - will be replaced by settings data
const DEFAULT_PACKAGING = ['Bulk', '200L Drum', '210L Drum', 'IBC 1000L', 'Flexitank', 'ISO Tank'];

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
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagingTypes, setPackagingTypes] = useState(DEFAULT_PACKAGING);
  const [packagingObjects, setPackagingObjects] = useState([]); // Store full packaging objects
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [approving, setApproving] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingQuotation, setRejectingQuotation] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

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
    bank_id: '',
  });

  const [newItem, setNewItem] = useState({
    product_id: '',
    product_name: '',
    sku: '',
    quantity: 0,
    unit_price: 0,
    packaging: 'Bulk',
    net_weight_kg: null,
    availableNetWeights: [], // Store available netweights for current packaging
    palletized: false, // Palletized or non-palletized
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [quotationsRes, customersRes, productsRes, settingsRes] = await Promise.all([
        quotationAPI.getAll(),
        customerAPI.getAll(),
        productAPI.getAll(),
        api.get('/settings/all').catch(() => ({ data: {} }))
      ]);
      setQuotations(quotationsRes.data);
      setCustomers(customersRes.data);
      setProducts(productsRes.data.filter(p => p.category === 'finished_product'));
      
      // Load packaging types and bank accounts from settings
      const settings = settingsRes.data || {};
      const packagingFromSettings = settings.packaging_types || [];
      // Store full packaging objects
      setPackagingObjects(packagingFromSettings);
      // Always include "Bulk" as the first option, then add settings packaging types
      const allPackaging = ['Bulk', ...packagingFromSettings.map(p => p.name || p).filter(p => p !== 'Bulk')];
      setPackagingTypes(allPackaging.length > 1 ? allPackaging : DEFAULT_PACKAGING);
      setBankAccounts(settings.bank_accounts || []);
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

  const handlePackagingChange = async (packagingName) => {
    if (packagingName === 'Bulk') {
      setNewItem({ ...newItem, packaging: 'Bulk', net_weight_kg: null, quantity: 0 });
      return;
    }
    
    // First, try to lookup product-packaging configuration
    if (newItem.product_id) {
      try {
        const containerType = form.container_type || '20ft'; // Default to 20ft
        const configRes = await api.get('/product-packaging-configs/lookup', {
          params: {
            product_id: newItem.product_id,
            packaging_name: packagingName,
            container_type: containerType
          }
        });
        
        if (configRes.data) {
          const config = configRes.data;
          // Determine which filling field to use based on packaging_type from config
          let netWeight = config.net_weight_kg;
          const packagingType = config.packaging_type?.toLowerCase() || '';
          
          if (packagingType === 'drum' || packagingType === 'carton') {
            netWeight = config.drum_carton_filling_kg || netWeight;
          } else if (packagingType === 'ibc') {
            netWeight = config.ibc_filling_kg || netWeight;
          } else if (packagingType === 'flexi/iso' || packagingType === 'flexi' || packagingType === 'iso') {
            // For Flexi/ISO, convert MT to KG if needed
            netWeight = config.flexi_iso_filling_mt ? config.flexi_iso_filling_mt * 1000 : netWeight;
          }
          
          // Auto-fill quantity based on container capacity if available
          let autoQuantity = newItem.quantity || 0;
          if (containerType === '20ft') {
            // Prefer palletised, then non-palletised, then IBC
            if (config.total_units_palletised) {
              autoQuantity = config.total_units_palletised;
            } else if (config.total_units_non_palletised) {
              autoQuantity = config.total_units_non_palletised;
            } else if (config.total_ibc) {
              autoQuantity = config.total_ibc;
            }
          } else if (containerType === '40ft') {
            // Prefer palletised, then non-palletised, then IBC
            if (config.total_units_palletised) {
              autoQuantity = config.total_units_palletised;
            } else if (config.total_units_non_palletised) {
              autoQuantity = config.total_units_non_palletised;
            } else if (config.total_ibc) {
              autoQuantity = config.total_ibc;
            }
          }
          
          setNewItem({
            ...newItem,
            packaging: packagingName,
            net_weight_kg: netWeight,
            quantity: autoQuantity,
            hscode: config.hscode,
            country_of_origin: config.origin || form.country_of_origin || 'UAE'
          });
          return;
        }
      } catch (error) {
        // If lookup fails, fall back to packaging object
        console.log('Config lookup failed, using packaging object:', error);
      }
    }
    
    // Fallback: Find the packaging object
    const packagingObj = packagingObjects.find(p => p.name === packagingName);
    if (packagingObj) {
      // Get netweights array or fallback to net_weight_kg
      const netWeights = packagingObj.net_weights || (packagingObj.net_weight_kg ? [packagingObj.net_weight_kg] : []);
      
      // Auto-set the first netweight if available
      const autoNetWeight = netWeights.length > 0 ? netWeights[0] : null;
      
      setNewItem({ 
        ...newItem, 
        packaging: packagingName, 
        net_weight_kg: autoNetWeight,
        availableNetWeights: netWeights // Store available netweights for dropdown
      });
    } else {
      setNewItem({ ...newItem, packaging: packagingName, net_weight_kg: null, availableNetWeights: [] });
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
    setNewItem({ product_id: '', product_name: '', sku: '', quantity: 0, unit_price: 0, packaging: 'Bulk', net_weight_kg: null, availableNetWeights: [], palletized: false });
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
      
      if (isEditMode && editingQuotation) {
        await quotationAPI.update(editingQuotation.id, quotationData);
        toast.success('Quotation updated successfully');
      } else {
        await quotationAPI.create(quotationData);
        toast.success('Quotation created successfully');
      }
      setCreateOpen(false);
      resetForm();
      setIsEditMode(false);
      setEditingQuotation(null);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save quotation');
    }
  };

  const handleEditClick = async (quotation) => {
    try {
      // Load full quotation details
      const response = await quotationAPI.getOne(quotation.id);
      const fullQuotation = response.data;
      
      // Populate form with quotation data
      setForm({
        customer_id: fullQuotation.customer_id || '',
        customer_name: fullQuotation.customer_name || '',
        currency: fullQuotation.currency || 'USD',
        order_type: fullQuotation.order_type || 'local',
        incoterm: fullQuotation.incoterm || '',
        container_type: fullQuotation.container_type || '',
        container_count: fullQuotation.container_count || 1,
        port_of_loading: fullQuotation.port_of_loading || '',
        port_of_discharge: fullQuotation.port_of_discharge || '',
        delivery_place: fullQuotation.delivery_place || '',
        country_of_origin: fullQuotation.country_of_origin || 'UAE',
        country_of_destination: fullQuotation.country_of_destination || '',
        payment_terms: fullQuotation.payment_terms || 'Cash',
        validity_days: fullQuotation.validity_days || 30,
        notes: fullQuotation.notes || '',
        items: fullQuotation.items || [],
        required_documents: fullQuotation.required_documents || [],
        include_vat: fullQuotation.include_vat !== false,
        bank_id: fullQuotation.bank_id || '',
      });
      
      setEditingQuotation(fullQuotation);
      setIsEditMode(true);
      setCreateOpen(true);
    } catch (error) {
      toast.error('Failed to load quotation for editing');
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
    setRejectingQuotation(id);
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async (shouldRevise = false, shouldEdit = false) => {
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }

    try {
      await quotationAPI.reject(rejectingQuotation, rejectionReason);
      toast.success('Quotation rejected');
      setRejectDialogOpen(false);
      setRejectionReason('');
      
      if (shouldRevise) {
        // Revise the quotation
        setTimeout(async () => {
          try {
            const response = await quotationAPI.revise(rejectingQuotation);
            toast.success(`New quotation ${response.data.pfi_number} created from rejected quotation`);
            loadData();
          } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to revise quotation');
          }
        }, 500);
      } else if (shouldEdit) {
        // Edit the quotation
        setTimeout(async () => {
          try {
            const response = await quotationAPI.edit(rejectingQuotation);
            toast.success(`Quotation updated to ${response.data.pfi_number}. You can now edit it.`);
            loadData();
            // Open edit dialog
            const updatedQuotation = await quotationAPI.getOne(rejectingQuotation);
            handleEditClick(updatedQuotation.data);
          } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to edit quotation');
          }
        }, 500);
      } else {
        setRejectingQuotation(null);
        loadData();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject');
    }
  };

  const handleRevise = async (id) => {
    try {
      const response = await quotationAPI.revise(id);
      toast.success(`New quotation ${response.data.pfi_number} created from rejected quotation`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to revise quotation');
    }
  };

  const handleEdit = async (id) => {
    try {
      await quotationAPI.edit(id);
      toast.success('Quotation status changed to pending. You can now edit it.');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to edit quotation');
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
      bank_id: '',
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
              <DialogTitle>{isEditMode ? 'Edit Quotation / PFI' : 'Create Quotation / PFI'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Order Type Selection */}
              <div className="grid grid-cols-3 gap-4">
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
                <div>
                  <Label>Bank Account</Label>
                  <Select value={form.bank_id || undefined} onValueChange={(v) => setForm({...form, bank_id: v})} disabled={bankAccounts.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={bankAccounts.length === 0 ? "No banks configured" : "-- Select Bank --"} />
                    </SelectTrigger>
                    {bankAccounts.length > 0 && (
                      <SelectContent>
                        {bankAccounts.map(bank => (
                          <SelectItem key={bank.id} value={bank.id}>
                            {bank.bank_name} ({bank.account_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    )}
                  </Select>
                  {bankAccounts.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Configure banks in Settings</p>
                  )}
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
                
                {/* Column Headers */}
                <div className="grid grid-cols-8 gap-2 mb-2 text-xs text-muted-foreground font-medium">
                  <div className="col-span-2">Product</div>
                  <div>Quantity</div>
                  <div>Price/MT</div>
                  <div>Packaging</div>
                  <div>Net Wt (kg)</div>
                  <div>Palletized</div>
                  <div>Action</div>
                </div>
                
                {/* Input Row */}
                <div className="grid grid-cols-8 gap-2 mb-3">
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
                  <Select value={newItem.packaging} onValueChange={handlePackagingChange}>
                    <SelectTrigger data-testid="packaging-select">
                      <SelectValue placeholder="Packaging" />
                    </SelectTrigger>
                    <SelectContent>
                      {packagingTypes.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newItem.packaging !== 'Bulk' ? (
                    newItem.availableNetWeights && newItem.availableNetWeights.length > 1 ? (
                      <Select 
                        value={newItem.net_weight_kg?.toString() || ''} 
                        onValueChange={(v) => setNewItem({...newItem, net_weight_kg: parseFloat(v)})}
                      >
                        <SelectTrigger className="placeholder:text-xs">
                          <SelectValue placeholder="Select Net Weight" />
                        </SelectTrigger>
                        <SelectContent>
                          {newItem.availableNetWeights.map((weight, idx) => (
                            <SelectItem key={idx} value={weight.toString()}>{weight} kg</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="number"
                        placeholder="Net Wt (kg)"
                        value={newItem.net_weight_kg || ''}
                        onChange={(e) => setNewItem({...newItem, net_weight_kg: parseFloat(e.target.value)})}
                        className="placeholder:text-xs"
                      />
                    )
                  ) : (
                    <div className="text-xs text-muted-foreground flex items-center">-</div>
                  )}
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="palletized"
                      checked={newItem.palletized || false}
                      onCheckedChange={(checked) => setNewItem({...newItem, palletized: checked === true})}
                    />
                    <Label htmlFor="palletized" className="text-xs cursor-pointer">
                      Palletized
                    </Label>
                  </div>
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
                            <th>Palletized</th>
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
                              <td className="text-center">
                                {item.palletized ? (
                                  <Check className="w-4 h-4 text-green-400 mx-auto" />
                                ) : (
                                  <X className="w-4 h-4 text-muted-foreground mx-auto" />
                                )}
                              </td>
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
                <Button variant="outline" onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                  setIsEditMode(false);
                  setEditingQuotation(null);
                }}>Cancel</Button>
                <Button onClick={handleCreate} className="btn-primary" data-testid="create-quotation-submit">
                  {isEditMode ? 'Update Quotation' : 'Create Quotation'}
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
                <th>Country of Destination</th>
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
                  <td>
                    {q.country_of_destination ? (
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-400">
                        {q.country_of_destination}
                      </Badge>
                    ) : '-'}
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
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => navigate(`/quotations/view/${q.id}`)}
                        title="View Full Page"
                      >
                        <FileText className="w-4 h-4 text-blue-500" />
                      </Button>
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
                      {(q.status === 'pending' || q.status === 'rejected') && (user?.role === 'admin' || user?.role === 'finance' || user?.role === 'sales') && (
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(q)} title="Edit quotation">
                          <Edit className="w-4 h-4 text-blue-500" />
                        </Button>
                      )}
                      {q.status === 'rejected' && (user?.role === 'admin' || user?.role === 'finance' || user?.role === 'sales') && (
                        <Button variant="ghost" size="icon" onClick={() => handleRevise(q.id)} title="Create new revision">
                          <RefreshCw className="w-4 h-4 text-purple-500" />
                        </Button>
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
            <div className="flex justify-between items-center">
              <DialogTitle>Quotation Details - {selectedQuotation?.pfi_number}</DialogTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const token = localStorage.getItem('erp_token');
                    const baseUrl = pdfAPI.getQuotationUrl(selectedQuotation.id, false);
                    const url = token ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : baseUrl;
                    window.open(url, '_blank');
                  }}
                >
                  <Download className="w-4 h-4 mr-1" /> View PDF
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    const token = localStorage.getItem('erp_token');
                    const baseUrl = pdfAPI.getQuotationUrl(selectedQuotation.id, true);
                    const url = token ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : baseUrl;
                    window.open(url, '_blank');
                  }}
                >
                  <Download className="w-4 h-4 mr-1" /> Print PDF
                </Button>
              </div>
            </div>
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

              {/* Rejection Reason */}
              {selectedQuotation.status === 'rejected' && selectedQuotation.rejection_reason && (
                <div className="border-t border-border pt-4">
                  <h4 className="font-medium mb-2 text-red-400">Rejection Reason:</h4>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-sm">{selectedQuotation.rejection_reason}</p>
                    {selectedQuotation.rejected_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Rejected on: {formatDate(selectedQuotation.rejected_at)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Bank Details */}
              {selectedQuotation.bank_id && (() => {
                const selectedBank = bankAccounts.find(b => b.id === selectedQuotation.bank_id);
                return selectedBank ? (
                  <div className="border-t border-border pt-4">
                    <h4 className="font-medium mb-3">Bank Details:</h4>
                    <div className="bg-muted/20 rounded-lg p-4 space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Beneficiary Name:</span>
                        <p className="font-medium">Asia Petrochemicals LLC</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bank Name:</span>
                        <p className="font-medium">{selectedBank.bank_name}</p>
                      </div>
                      {selectedBank.branch_address && (
                        <div>
                          <span className="text-muted-foreground">Branch Address:</span>
                          <p className="font-medium">{selectedBank.branch_address}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Account Type:</span>
                        <p className="font-medium">{selectedBank.account_type}</p>
                      </div>
                      {selectedBank.iban && (
                        <div>
                          <span className="text-muted-foreground">IBAN:</span>
                          <p className="font-mono font-medium">{selectedBank.iban}</p>
                        </div>
                      )}
                      {selectedBank.swift && (
                        <div>
                          <span className="text-muted-foreground">SWIFT:</span>
                          <p className="font-mono font-medium">{selectedBank.swift}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Quotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter the reason for rejecting this quotation..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                After rejecting, you can choose to revise or edit this quotation.
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setRejectDialogOpen(false);
                    setRejectionReason('');
                    setRejectingQuotation(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => handleConfirmReject(false, false)}
                  disabled={!rejectionReason.trim()}
                >
                  Reject Only
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleConfirmReject(true, false)}
                  disabled={!rejectionReason.trim()}
                >
                  Reject & Revise
                </Button>
                <Button 
                  variant="default" 
                  onClick={() => handleConfirmReject(false, true)}
                  disabled={!rejectionReason.trim()}
                >
                  Reject & Edit
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
