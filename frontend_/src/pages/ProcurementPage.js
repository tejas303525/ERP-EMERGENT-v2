import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { 
  ShoppingCart, Package, FileText, Plus, Check, X, 
  RefreshCw, Building, MapPin, Truck, AlertTriangle,
  DollarSign, Send, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const PAYMENT_TERMS = ['Advance', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'COD', 'LC', 'TT'];
const INCOTERMS = ['EXW', 'DDP', 'DAP', 'FOB', 'CFR', 'CIF', 'FCA'];

const ProcurementPage = () => {
  const [activeTab, setActiveTab] = useState('shortages');
  const [shortages, setShortages] = useState({ raw_shortages: [], pack_shortages: [] });
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedShortages, setSelectedShortages] = useState([]);
  const [showGeneratePO, setShowGeneratePO] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [shortagesRes, poRes, suppRes] = await Promise.all([
        api.get('/procurement/shortages'),
        api.get('/purchase-orders'),
        api.get('/suppliers')
      ]);
      setShortages(shortagesRes.data);
      setPurchaseOrders(poRes.data || []);
      setSuppliers(suppRes.data || []);
      
      try {
        const compRes = await api.get('/companies');
        setCompanies(compRes.data || []);
      } catch (e) {
        setCompanies([
          { id: '1', name: 'Main Factory', address: 'Industrial Area, UAE' },
          { id: '2', name: 'Warehouse A', address: 'Free Zone, UAE' }
        ]);
      }
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoGenerate = async () => {
    try {
      const res = await api.post('/procurement/auto-generate');
      toast.success(res.data.message);
      loadData();
    } catch (error) {
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    }
  };

  // Unique key for each shortage item (now per job order)
  const getShortageKey = (shortage) => {
    return `${shortage.item_id}-${shortage.job_id}`;
  };

  const toggleShortageSelection = useCallback((shortage) => {
    setSelectedShortages(prev => {
      const key = getShortageKey(shortage);
      const isSelected = prev.some(s => getShortageKey(s) === key);
      if (isSelected) {
        return prev.filter(s => getShortageKey(s) !== key);
      } else {
        return [...prev, shortage];
      }
    });
  }, []);

  const allShortages = [
    ...(shortages.raw_shortages || []).map(s => ({ ...s, shortage_type: 'RAW' })),
    ...(shortages.pack_shortages || []).map(s => ({ ...s, shortage_type: 'PACK' })),
    ...(shortages.traded_shortages || []).map(s => ({ ...s, shortage_type: 'TRADED' }))
  ];

  const pendingPOs = purchaseOrders.filter(po => po.status === 'DRAFT');
  const sentPOs = purchaseOrders.filter(po => po.status === 'SENT' || po.status === 'APPROVED');

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="procurement-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShoppingCart className="w-8 h-8 text-amber-500" />
          Procurement - Generate PO
        </h1>
        <p className="text-muted-foreground mt-1">Select shortages and generate Purchase Orders directly</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-red-500/30">
          <p className="text-sm text-muted-foreground">Raw Material Shortages</p>
          <p className="text-2xl font-bold text-red-400">{shortages.raw_shortages?.length || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Packaging Shortages</p>
          <p className="text-2xl font-bold text-amber-400">{shortages.pack_shortages?.length || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">Trading Product Shortages</p>
          <p className="text-2xl font-bold text-cyan-400">{shortages.traded_shortages?.length || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Selected Items</p>
          <p className="text-2xl font-bold text-blue-400">{selectedShortages.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">POs Pending Approval</p>
          <p className="text-2xl font-bold text-purple-400">{pendingPOs.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">POs Sent</p>
          <p className="text-2xl font-bold text-green-400">{sentPOs.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={activeTab === 'shortages' ? 'default' : 'outline'}
          onClick={() => setActiveTab('shortages')}
          className={allShortages.length > 0 ? 'border-red-500/50' : ''}
          data-testid="tab-shortages"
        >
          <AlertTriangle className="w-4 h-4 mr-2" />
          Material Shortages
          {allShortages.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">
              {allShortages.length}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'pending' ? 'default' : 'outline'}
          onClick={() => setActiveTab('pending')}
          data-testid="tab-pending"
        >
          <FileText className="w-4 h-4 mr-2" />
          Pending POs
          {pendingPOs.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">
              {pendingPOs.length}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'outline'}
          onClick={() => setActiveTab('history')}
          data-testid="tab-history"
        >
          <Package className="w-4 h-4 mr-2" />
          PO History
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Shortages Tab */}
          {activeTab === 'shortages' && (
            <ShortagesTab
              shortages={allShortages}
              selectedShortages={selectedShortages}
              onToggleSelection={toggleShortageSelection}
              onRefresh={loadData}
              onAutoGenerate={handleAutoGenerate}
              onGeneratePO={() => setShowGeneratePO(true)}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
            />
          )}

          {/* Pending POs Tab */}
          {activeTab === 'pending' && (
            <PendingPOsTab 
              purchaseOrders={pendingPOs}
              onRefresh={loadData}
            />
          )}

          {/* PO History Tab */}
          {activeTab === 'history' && (
            <POHistoryTab purchaseOrders={purchaseOrders} />
          )}
        </>
      )}

      {/* Generate PO Modal */}
      {showGeneratePO && (
        <GeneratePOModal
          selectedItems={selectedShortages}
          suppliers={suppliers}
          companies={companies}
          paymentTerms={paymentTerms}
          onClose={() => setShowGeneratePO(false)}
          onCreated={() => {
            setShowGeneratePO(false);
            setSelectedShortages([]);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== SHORTAGES TAB ====================
const ShortagesTab = ({ shortages, selectedShortages, onToggleSelection, onRefresh, onAutoGenerate, onGeneratePO, searchTerm, onSearchChange }) => {
  const getShortageKey = (shortage) => `${shortage.item_id}-${shortage.job_id}`;
  
  // Filter shortages based on search term
  const filteredShortages = shortages.filter(s => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      s.item_name?.toLowerCase().includes(search) ||
      s.item_sku?.toLowerCase().includes(search) ||
      s.job_number?.toLowerCase().includes(search) ||
      s.product_name?.toLowerCase().includes(search) ||
      s.item_type?.toLowerCase().includes(search)
    );
  });
  
  return (
    <div className="space-y-6">
      <div className="glass rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold">Material Shortages (Individual per Job Order)</h2>
              <p className="text-sm text-muted-foreground">
                Each row shows shortage for a specific job order. Select items and enter unit price to generate a Purchase Order
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onAutoGenerate} data-testid="refresh-shortages-btn">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh from BOMs
              </Button>
              <Button 
                onClick={onGeneratePO}
                disabled={selectedShortages.length === 0}
                className="bg-green-500 hover:bg-green-600"
                data-testid="generate-po-btn"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Generate PO ({selectedShortages.length})
              </Button>
            </div>
          </div>
          {/* Search Filter */}
          <div className="flex gap-2">
            <Input
              placeholder="Search by material name, SKU, job number, or product..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="max-w-md"
            />
            {searchTerm && (
              <Button variant="ghost" size="sm" onClick={() => onSearchChange('')}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {filteredShortages.length === 0 ? (
          <div className="p-8 text-center">
            {shortages.length === 0 ? (
              <>
                <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-green-400 font-medium">All materials available</p>
                <p className="text-sm text-muted-foreground">No procurement required</p>
              </>
            ) : (
              <>
                <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">No shortages match your search</p>
                <p className="text-sm text-muted-foreground">Try a different search term</p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground w-12">Select</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job Order</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Material</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">SKU</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Required</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">On Hand</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Shortage</th>
                </tr>
              </thead>
              <tbody>
                {filteredShortages.map((shortage) => {
                  const key = getShortageKey(shortage);
                  const isSelected = selectedShortages.some(s => getShortageKey(s) === key);
                  return (
                    <tr 
                      key={key} 
                      className={`border-b border-border/50 hover:bg-muted/10 cursor-pointer ${isSelected ? 'bg-blue-500/10' : ''}`}
                      onClick={() => onToggleSelection(shortage)}
                      data-testid={`shortage-row-${key}`}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleSelection(shortage)}
                          data-testid={`shortage-checkbox-${key}`}
                        />
                      </td>
                      <td className="p-3">
                        <Badge className={
                          shortage.item_type === 'RAW' ? 'bg-red-500/20 text-red-400' : 
                          shortage.item_type === 'PACK' ? 'bg-amber-500/20 text-amber-400' :
                          shortage.item_type === 'TRADED' ? 'bg-cyan-500/20 text-cyan-400' :
                          'bg-gray-500/20 text-gray-400'
                        }>
                          {shortage.item_type}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-sm text-blue-400">{shortage.job_number}</td>
                      <td className="p-3 text-sm text-muted-foreground">{shortage.product_name}</td>
                      <td className="p-3 font-medium">{shortage.item_name}</td>
                      <td className="p-3 font-mono text-sm text-muted-foreground">{shortage.item_sku}</td>
                      <td className="p-3 text-amber-400">{shortage.required_qty?.toFixed(2)} {shortage.uom}</td>
                      <td className="p-3">{shortage.on_hand?.toFixed(2)} {shortage.uom}</td>
                      <td className="p-3 text-red-400 font-bold">-{shortage.shortage?.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== PENDING POs TAB ====================
const PendingPOsTab = ({ purchaseOrders, onRefresh }) => {
  const handleSendForApproval = async (poId) => {
    try {
      // PO is already in DRAFT status pending finance approval
      toast.success('PO is pending finance approval');
      onRefresh();
    } catch (error) {
      toast.error('Failed to send for approval');
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Purchase Orders Pending Finance Approval</h2>
          <p className="text-sm text-muted-foreground">
            These POs will appear on the Finance Approval page
          </p>
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No pending POs</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {purchaseOrders.map((po) => (
              <POCard key={po.id} po={po} onRefresh={onRefresh} showStatus />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== PO HISTORY TAB ====================
const POHistoryTab = ({ purchaseOrders }) => {
  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Purchase Order History</h2>
      </div>
      
      {purchaseOrders.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No purchase orders found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{po.po_number}</td>
                  <td className="p-3">{po.supplier_name}</td>
                  <td className="p-3 text-green-400 font-medium">
                    {po.currency} {po.total_amount?.toFixed(2)}
                  </td>
                  <td className="p-3">
                    <Badge className={
                      po.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' :
                      po.status === 'SENT' ? 'bg-blue-500/20 text-blue-400' :
                      po.status === 'REJECTED' ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }>
                      {po.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(po.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== PO CARD ====================
const POCard = ({ po, onRefresh, showStatus }) => {
  const [showDetails, setShowDetails] = useState(false);

  const statusColor = {
    DRAFT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    APPROVED: 'bg-green-500/20 text-green-400 border-green-500/30',
    SENT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30'
  };

  return (
    <div className={`p-4 rounded-lg border ${statusColor[po.status] || 'border-border'} bg-muted/5`} data-testid={`po-card-${po.po_number}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg">{po.po_number}</span>
            <Badge className={statusColor[po.status]}>
              {po.status === 'DRAFT' ? 'PENDING APPROVAL' : po.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">Supplier: {po.supplier_name}</p>
          <p className="text-green-400 font-medium text-lg mt-1">
            {po.currency} {po.total_amount?.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Created: {new Date(po.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowDetails(!showDetails)}>
            <Eye className="w-4 h-4 mr-1" />
            {showDetails ? 'Hide' : 'View'} Items
          </Button>
        </div>
      </div>

      {showDetails && po.lines && po.lines.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground mb-2">
            <span className="col-span-2">Item</span>
            <span>Qty</span>
            <span>Unit Price</span>
          </div>
          {po.lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2 text-sm py-1">
              <span className="col-span-2 truncate">{line.item_name}</span>
              <span>{line.qty} {line.uom}</span>
              <span>{po.currency} {line.unit_price?.toFixed(2) || '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== GENERATE PO MODAL ====================
const GeneratePOModal = ({ selectedItems, suppliers, companies, paymentTerms, onClose, onCreated }) => {
  const [form, setForm] = useState({
    supplier_id: '',
    billing_company_id: '',
    shipping_company_id: '',
    delivery_date: '',
    payment_terms: 'Net 30',
    incoterm: 'EXW',
    currency: 'USD',
    notes: ''
  });
  
  const [lines, setLines] = useState(
    selectedItems.map(item => {
      // Convert KG to MT if UOM is KG
      let qty = item.shortage || 0; // Use individual shortage, not total
      let uom = item.uom || 'KG';
      if (uom === 'KG' || uom === 'kg') {
        qty = qty / 1000; // Convert KG to MT
        uom = 'MT';
      }
      return {
        item_id: item.item_id,
        item_name: item.item_name,
        item_sku: item.item_sku,
        item_type: item.item_type,
        qty: qty,
        uom: uom,
        unit_price: 0,
        job_number: item.job_number,
        job_id: item.job_id
      };
    })
  );
  const [submitting, setSubmitting] = useState(false);

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id);
  const billingCompany = companies.find(c => c.id === form.billing_company_id);
  const shippingCompany = companies.find(c => c.id === form.shipping_company_id);

  // Calculate total
  const totalAmount = lines.reduce((sum, line) => sum + (line.qty * line.unit_price), 0);

  const handleSubmit = async () => {
    if (!form.supplier_id) {
      toast.error('Please select a vendor');
      return;
    }
    
    const hasZeroPrice = lines.some(l => l.unit_price <= 0);
    if (hasZeroPrice) {
      toast.error('Please enter unit price for all items');
      return;
    }

    setSubmitting(true);
    try {
      // Generate PO directly
      const res = await api.post('/purchase-orders/generate', {
        supplier_id: form.supplier_id,
        supplier_name: selectedSupplier?.name || '',
        billing_company: billingCompany?.name,
        billing_address: billingCompany?.address,
        shipping_company: shippingCompany?.name,
        shipping_address: shippingCompany?.address,
        delivery_date: form.delivery_date,
        payment_terms: form.payment_terms,
        incoterm: form.incoterm,
        currency: form.currency,
        total_amount: totalAmount,
        lines: lines.map(l => ({
          item_id: l.item_id,
          item_name: l.item_name,
          item_type: l.item_type,
          qty: l.qty,
          uom: l.uom,
          unit_price: l.unit_price,
          required_by: form.delivery_date,
          job_numbers: l.job_number ? [l.job_number] : []
        })),
        notes: form.notes
      });
      
      toast.success(`PO ${res.data.po_number} created and sent to Finance Approval`);
      onCreated();
    } catch (error) {
      toast.error('Failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Generate Purchase Order
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Vendor & Company Selection */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Vendor *</Label>
                <Select value={form.supplier_id} onValueChange={(v) => setForm({...form, supplier_id: v})}>
                  <SelectTrigger data-testid="vendor-select">
                    <SelectValue placeholder="Select Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSupplier && (
                  <div className="mt-2 p-2 rounded bg-muted/30 text-sm">
                    <MapPin className="w-3 h-3 inline mr-1" />
                    {selectedSupplier.address || selectedSupplier.email || 'No contact info'}
                  </div>
                )}
              </div>

              <div>
                <Label>Billing Company</Label>
                <Select value={form.billing_company_id} onValueChange={(v) => setForm({...form, billing_company_id: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Billing Company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {billingCompany && (
                  <div className="mt-2 p-2 rounded bg-muted/30 text-sm">
                    <Building className="w-3 h-3 inline mr-1" />
                    {billingCompany.address}
                  </div>
                )}
              </div>

              <div>
                <Label>Shipping Company</Label>
                <Select value={form.shipping_company_id} onValueChange={(v) => setForm({...form, shipping_company_id: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Shipping Company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {shippingCompany && (
                  <div className="mt-2 p-2 rounded bg-muted/30 text-sm">
                    <Truck className="w-3 h-3 inline mr-1" />
                    {shippingCompany.address}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Required Delivery Date</Label>
                <Input
                  type="date"
                  value={form.delivery_date}
                  onChange={(e) => setForm({...form, delivery_date: e.target.value})}
                />
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Incoterm</Label>
                  <Select value={form.incoterm} onValueChange={(v) => setForm({...form, incoterm: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INCOTERMS.map(i => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
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
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({...form, notes: e.target.value})}
                  placeholder="Optional notes"
                />
              </div>
            </div>
          </div>

          {/* Items Table with Unit Price */}
          <div className="border-t border-border pt-4">
            <h3 className="font-semibold mb-3">PO Line Items - Enter Unit Price</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="p-2 text-left">Job Order</th>
                    <th className="p-2 text-left">Material</th>
                    <th className="p-2 text-left">SKU</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Quantity</th>
                    <th className="p-2 text-left">Unit Price *</th>
                    <th className="p-2 text-left">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="p-2 font-mono text-sm text-blue-400">{line.job_number}</td>
                      <td className="p-2 font-medium">{line.item_name}</td>
                      <td className="p-2 font-mono text-muted-foreground">{line.item_sku}</td>
                      <td className="p-2">
                        <Badge className={line.item_type === 'RAW' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}>
                          {line.item_type}
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={line.qty}
                          onChange={(e) => {
                            const newLines = [...lines];
                            newLines[idx].qty = parseFloat(e.target.value) || 0;
                            setLines(newLines);
                          }}
                          className="w-24"
                          data-testid={`qty-input-${idx}`}
                        />
                        <span className="ml-1 text-muted-foreground">{line.uom}</span>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">{form.currency}</span>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={line.unit_price || ''}
                            onChange={(e) => {
                              const newLines = [...lines];
                              newLines[idx].unit_price = parseFloat(e.target.value) || 0;
                              setLines(newLines);
                            }}
                            className="w-28"
                            data-testid={`price-input-${idx}`}
                          />
                        </div>
                      </td>
                      <td className="p-2 font-medium text-green-400">
                        {form.currency} {(line.qty * line.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/20">
                  <tr>
                    <td colSpan={6} className="p-3 text-right font-semibold">Total Amount:</td>
                    <td className="p-3 text-lg font-bold text-green-400">
                      {form.currency} {totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
            <p className="text-sm text-blue-400">
              <strong>Note:</strong> This PO will be sent to the Finance Approval page. 
              After finance approval, it can be sent to the vendor.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={submitting || !form.supplier_id}
              className="bg-green-500 hover:bg-green-600"
              data-testid="submit-po-btn"
            >
              {submitting ? 'Creating...' : `Generate PO (${form.currency} ${totalAmount.toFixed(2)})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProcurementPage;
