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
  DollarSign, Send, Eye, Download
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const PAYMENT_TERMS = ['Advance', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'COD', 'LC', 'TT'];
const LOCAL_INCOTERMS = ['EXW', 'DDP', 'DAP'];
const IMPORT_INCOTERMS = ['FOB', 'CFR', 'CIF', 'FCA'];

const ProcurementPage = () => {
  const [activeTab, setActiveTab] = useState('shortages');
  const [shortages, setShortages] = useState({ raw_shortages: [], pack_shortages: [] });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS);
  const [loading, setLoading] = useState(false);
  const [selectedShortages, setSelectedShortages] = useState([]);
  const [selectedLowStockItems, setSelectedLowStockItems] = useState([]);
  const [showGeneratePO, setShowGeneratePO] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [shortagesRes, poRes, suppRes, settingsRes, lowStockRes] = await Promise.all([
        api.get('/procurement/shortages'),
        api.get('/purchase-orders'),
        api.get('/suppliers'),
        api.get('/settings/all').catch(() => ({ data: {} })),
        api.get('/inventory/low-stock').catch(() => ({ data: { items: [] } }))
      ]);
      
      setShortages(shortagesRes.data);
      setPurchaseOrders(poRes.data || []);
      setSuppliers(suppRes.data || []);
      setLowStockItems(lowStockRes.data?.items || []);
      
      const settings = settingsRes.data || {};
      const paymentTermsFromSettings = settings.payment_terms || [];
      const termsFromSettings = paymentTermsFromSettings.map(t => t.name || t).filter(Boolean);
      const merged = [...PAYMENT_TERMS];
      
      termsFromSettings.forEach(term => {
        const existsIndex = merged.findIndex(t => t.toLowerCase() === term.toLowerCase());
        if (existsIndex < 0) {
          merged.push(term);
        }
      });
      
      setPaymentTerms(merged);
      
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

  const rmProductionShortages = (shortages.raw_shortages || []).map(s => ({ ...s, shortage_type: 'RAW', display_type: 'RM/Production' }));
  const rmTradingShortages = (shortages.traded_shortages || []).map(s => ({ ...s, shortage_type: 'TRADED', display_type: 'RM/Trading' }));
  const packagingShortages = (shortages.pack_shortages || []).map(s => ({ ...s, shortage_type: 'PACK', display_type: 'Packaging' }));
  const allShortages = [...rmProductionShortages, ...rmTradingShortages, ...packagingShortages];

  const pendingPOs = purchaseOrders.filter(po => po.status === 'DRAFT');
  const sentPOs = purchaseOrders.filter(po => po.status === 'SENT' || po.status === 'APPROVED');

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="procurement-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-gray-900">
          <ShoppingCart className="w-8 h-8 text-blue-600" />
          Procurement - Generate PO
        </h1>
        <p className="text-gray-600 mt-1">Select shortages and generate Purchase Orders directly</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-600">RM/Production Shortages</p>
          <p className="text-2xl font-bold text-gray-900">{shortages.raw_shortages?.length || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-600">RM/Trading Shortages</p>
          <p className="text-2xl font-bold text-gray-900">{shortages.traded_shortages?.length || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-600">Packaging Shortages</p>
          <p className="text-2xl font-bold text-gray-900">{shortages.pack_shortages?.length || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-600">POs Pending Approval</p>
          <p className="text-2xl font-bold text-gray-900">{pendingPOs.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-600">POs Sent</p>
          <p className="text-2xl font-bold text-gray-900">{sentPOs.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-red-200 shadow-sm border-2">
          <p className="text-sm text-red-600">Low Stock Items</p>
          <p className="text-2xl font-bold text-red-600">{lowStockItems.length}</p>
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
          variant={activeTab === 'low-stock' ? 'default' : 'outline'}
          onClick={() => setActiveTab('low-stock')}
          className={lowStockItems.length > 0 ? 'border-red-500/50' : ''}
          data-testid="tab-low-stock"
        >
          <AlertTriangle className="w-4 h-4 mr-2 text-red-500" />
          Low Stock
          {lowStockItems.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">
              {lowStockItems.length}
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
              rmProductionShortages={rmProductionShortages}
              rmTradingShortages={rmTradingShortages}
              packagingShortages={packagingShortages}
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

          {/* Low Stock Tab */}
          {activeTab === 'low-stock' && (
            <LowStockTab
              lowStockItems={lowStockItems}
              selectedItems={selectedLowStockItems}
              onToggleSelection={(item) => {
                setSelectedLowStockItems(prev => {
                  const isSelected = prev.some(i => i.item_id === item.item_id);
                  if (isSelected) {
                    return prev.filter(i => i.item_id !== item.item_id);
                  } else {
                    return [...prev, item];
                  }
                });
              }}
              onRefresh={loadData}
              onAutoCreatePO={async () => {
                try {
                  const itemIds = selectedLowStockItems.map(i => i.item_id);
                  const res = await api.post('/inventory/auto-create-po-low-stock', { item_ids: itemIds });
                  toast.success(res.data.message || `Created ${res.data.created_pos?.length || 0} purchase order(s)`);
                  setSelectedLowStockItems([]);
                  loadData();
                } catch (error) {
                  toast.error('Failed: ' + (error.response?.data?.detail || error.message));
                }
              }}
              onGeneratePO={() => {
                // Convert low stock items to shortage format for PO generation
                const convertedItems = selectedLowStockItems.map(item => ({
                  item_id: item.item_id,
                  item_name: item.item_name,
                  item_sku: item.item_sku,
                  item_type: item.item_type,
                  shortage: item.shortage,
                  reorder_qty: item.reorder_qty,
                  uom: item.uom,
                  unit: item.unit,
                  job_number: 'LOW_STOCK',
                  job_id: 'low_stock'
                }));
                setSelectedShortages(convertedItems);
                setShowGeneratePO(true);
              }}
              suppliers={suppliers}
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
const ShortagesTab = ({ rmProductionShortages, rmTradingShortages, packagingShortages, selectedShortages, onToggleSelection, onRefresh, onAutoGenerate, onGeneratePO, searchTerm, onSearchChange }) => {
  const getShortageKey = (shortage) => `${shortage.item_id}-${shortage.job_id}`;
  
  const filterShortages = (shortages) => {
    if (!searchTerm) return shortages;
    const search = searchTerm.toLowerCase();
    return shortages.filter(s => (
      s.item_name?.toLowerCase().includes(search) ||
      s.item_sku?.toLowerCase().includes(search) ||
      s.job_number?.toLowerCase().includes(search) ||
      s.product_name?.toLowerCase().includes(search) ||
      s.item_type?.toLowerCase().includes(search) ||
      s.display_type?.toLowerCase().includes(search)
    ));
  };
  
  const filteredRMProduction = filterShortages(rmProductionShortages);
  const filteredRMTrading = filterShortages(rmTradingShortages);
  const filteredPackaging = filterShortages(packagingShortages);
  const totalShortages = rmProductionShortages.length + rmTradingShortages.length + packagingShortages.length;
  
  const renderShortageTable = (shortages, title, badgeColor, badgeText) => {
    return (
      <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col shadow-sm">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Badge className={badgeColor}>{badgeText}</Badge>
            <span className="text-gray-900">{title}</span>
            <span className="text-sm text-gray-600">({shortages.length})</span>
          </h3>
        </div>
        <div className="overflow-x-auto flex-1">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200 w-12">Select</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Job Order</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Product</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Material</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">SKU</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Required</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">On Hand</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700">Shortage</th>
              </tr>
            </thead>
            <tbody>
              {shortages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500 border-t border-gray-200">
                    No shortages
                  </td>
                </tr>
              ) : (
                shortages.map((shortage, index) => {
                  const key = getShortageKey(shortage);
                  const isSelected = selectedShortages.some(s => getShortageKey(s) === key);
                  return (
                    <tr 
                      key={key} 
                      className={`border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 border-blue-300' : 'bg-white'}`}
                      onClick={() => onToggleSelection(shortage)}
                      data-testid={`shortage-row-${key}`}
                    >
                      <td className="p-3 border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleSelection(shortage)}
                          data-testid={`shortage-checkbox-${key}`}
                        />
                      </td>
                      <td className="p-3 font-mono text-sm text-blue-600 border-r border-gray-200">{shortage.job_number}</td>
                      <td className="p-3 text-sm text-gray-900 border-r border-gray-200">{shortage.product_name}</td>
                      <td className="p-3 font-medium text-gray-900 border-r border-gray-200">{shortage.item_name}</td>
                      <td className="p-3 font-mono text-sm text-gray-600 border-r border-gray-200">{shortage.item_sku}</td>
                      <td className="p-3 text-amber-600 font-medium border-r border-gray-200">{shortage.required_qty?.toFixed(2)} {shortage.uom}</td>
                      <td className="p-3 text-gray-900 border-r border-gray-200">{shortage.on_hand?.toFixed(2)} {shortage.uom}</td>
                      <td className="p-3 text-red-600 font-bold">{shortage.shortage?.toFixed(2)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold">Material Shortages (Individual per Job Order)</h2>
              <p className="text-sm text-gray-600">
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
                className="bg-green-600 hover:bg-green-700 text-white"
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
      </div>

      {totalShortages === 0 ? (
        <div className="p-8 text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-green-600 font-medium">All materials available</p>
          <p className="text-sm text-gray-600">No procurement required</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <div className="min-w-0">
            {renderShortageTable(filteredRMProduction, "RM/Production", "bg-red-100 text-red-700 border-red-300", "RM/Production")}
          </div>
          <div className="min-w-0">
            {renderShortageTable(filteredRMTrading, "RM/Trading", "bg-cyan-100 text-cyan-700 border-cyan-300", "RM/Trading")}
          </div>
          <div className="min-w-0">
            {renderShortageTable(filteredPackaging, "Packaging", "bg-amber-100 text-amber-700 border-amber-300", "Packaging")}
          </div>
        </div>
      )}
      
      {totalShortages > 0 && filteredRMProduction.length === 0 && filteredRMTrading.length === 0 && filteredPackaging.length === 0 && (
        <div className="p-8 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No shortages match your search</p>
          <p className="text-sm text-gray-500">Try a different search term</p>
        </div>
      )}
    </div>
  );
};

// ==================== PENDING POs TAB ====================
const PendingPOsTab = ({ purchaseOrders, onRefresh }) => {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Purchase Orders Pending Finance Approval</h2>
          <p className="text-sm text-gray-600">
            These POs will appear on the Finance Approval page
          </p>
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4 opacity-50" />
            <p className="text-gray-600">No pending POs</p>
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
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Purchase Order History</h2>
      </div>
      
      {purchaseOrders.length === 0 ? (
        <div className="p-8 text-center text-gray-500">No purchase orders found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-gray-700">PO Number</th>
                <th className="p-3 text-left text-xs font-medium text-gray-700">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-gray-700">Amount</th>
                <th className="p-3 text-left text-xs font-medium text-gray-700">Status</th>
                <th className="p-3 text-left text-xs font-medium text-gray-700">Created</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="border-b border-gray-200 hover:bg-blue-50">
                  <td className="p-3 font-mono font-medium text-gray-900">{po.po_number}</td>
                  <td className="p-3 text-gray-900">{po.supplier_name}</td>
                  <td className="p-3 text-green-600 font-medium">
                    {po.currency} {po.total_amount?.toFixed(2)}
                  </td>
                  <td className="p-3">
                    <Badge className={
                      po.status === 'APPROVED' ? 'bg-green-100 text-green-700 border-green-300' :
                      po.status === 'SENT' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                      po.status === 'REJECTED' ? 'bg-red-100 text-red-700 border-red-300' :
                      'bg-gray-100 text-gray-700 border-gray-300'
                    }>
                      {po.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-gray-600">
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
    DRAFT: 'bg-amber-100 text-amber-700 border-amber-300',
    APPROVED: 'bg-green-100 text-green-700 border-green-300',
    SENT: 'bg-blue-100 text-blue-700 border-blue-300',
    REJECTED: 'bg-red-100 text-red-700 border-red-300'
  };

  return (
    <div className={`p-4 rounded-lg border ${statusColor[po.status] || 'border-gray-200'} bg-white shadow-sm`} data-testid={`po-card-${po.po_number}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg text-gray-900">{po.po_number}</span>
            <Badge className={statusColor[po.status]}>
              {po.status === 'DRAFT' ? 'PENDING APPROVAL' : po.status}
            </Badge>
          </div>
          <p className="text-gray-600 text-sm">Supplier: {po.supplier_name}</p>
          <p className="text-green-600 font-medium text-lg mt-1">
            {po.currency} {po.total_amount?.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Created: {new Date(po.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => {
              const token = localStorage.getItem('erp_token');
              const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
              window.open(`${backendUrl}/api/pdf/purchase-order/${po.id}?token=${token}`, '_blank');
            }}
          >
            <Download className="w-4 h-4 mr-1" />
            PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowDetails(!showDetails)}>
            <Eye className="w-4 h-4 mr-1" />
            {showDetails ? 'Hide' : 'View'} Items
          </Button>
        </div>
      </div>

      {showDetails && po.lines && po.lines.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-3">
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 mb-2">
            <span className="col-span-2">Item</span>
            <span>Qty</span>
            <span>Unit Price</span>
          </div>
          {po.lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2 text-sm py-1 text-gray-900">
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
    shipment_type: '',
    incoterm: '',
    currency: 'USD',
    notes: ''
  });
  
  const [packagingMaterials, setPackagingMaterials] = useState([]);
  const [loadingPackaging, setLoadingPackaging] = useState(false);
  
  const [lines, setLines] = useState(
    selectedItems.map(item => {
      let qty = item.shortage || 0;
      let uom = item.uom || 'KG';
      if (uom === 'KG' || uom === 'kg') {
        qty = qty / 1000;
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
        job_id: item.job_id,
        procurement_type: (item.item_type === 'RAW' || item.item_type === 'TRADED') ? 'Bulk' : 'Bulk',
        packaging_item_id: null,
        packaging_qty: 0
      };
    })
  );
  const [submitting, setSubmitting] = useState(false);
  
  useEffect(() => {
    const loadPackagingMaterials = async () => {
      setLoadingPackaging(true);
      try {
        const res = await api.get('/inventory-items', { params: { item_type: 'PACK' } });
        setPackagingMaterials(res.data || []);
      } catch (error) {
        setPackagingMaterials([]);
      } finally {
        setLoadingPackaging(false);
      }
    };
    loadPackagingMaterials();
  }, []);

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id);
  const billingCompany = companies.find(c => c.id === form.billing_company_id);
  const shippingCompany = companies.find(c => c.id === form.shipping_company_id);

  const availableIncoterms = form.shipment_type === 'local' 
    ? LOCAL_INCOTERMS 
    : form.shipment_type === 'import' 
    ? IMPORT_INCOTERMS 
    : [];

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

    // Extract quotation_id and pfi_number from selected items (if available)
    // Try to find quotation info from any selected item
    // If multiple items have different quotations, use the most common one
    const quotationMap = new Map();
    selectedItems.forEach(item => {
      if (item.quotation_id || item.pfi_number) {
        const key = item.quotation_id || item.pfi_number;
        quotationMap.set(key, {
          quotation_id: item.quotation_id,
          pfi_number: item.pfi_number
        });
      }
    });
    
    // Get the first quotation found (typically all items are from same quotation)
    let quotation_id = null;
    let pfi_number = null;
    if (quotationMap.size > 0) {
      const firstQuotation = Array.from(quotationMap.values())[0];
      quotation_id = firstQuotation.quotation_id;
      pfi_number = firstQuotation.pfi_number;
    }
    
    // Debug logging
    console.log('Selected items for PO generation:', selectedItems.length);
    console.log('Quotation info found:', { quotation_id, pfi_number });
    if (selectedItems.length > 0 && !quotation_id && !pfi_number) {
      console.warn('No quotation_id or pfi_number found in selected items. First item:', selectedItems[0]);
    }

    setSubmitting(true);
    try {
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
        quotation_id: quotation_id,  // Link to quotation/PFI
        pfi_number: pfi_number,  // PFI number for display
        lines: lines.map(l => ({
          item_id: l.item_id,
          item_name: l.item_name,
          item_type: l.item_type,
          qty: l.qty,
          uom: l.uom,
          unit_price: l.unit_price,
          required_by: form.delivery_date,
          job_numbers: l.job_number ? [l.job_number] : (l.job_numbers || []),
          procurement_type: l.procurement_type || 'Bulk',
          packaging_item_id: l.packaging_item_id || null,
          packaging_qty: l.packaging_qty || 0
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

  const calculatePackagingQty = (qtyMT, packagingItem) => {
    if (!packagingItem || qtyMT <= 0) return 0;
    const qtyKG = qtyMT * 1000;
    const capacity = packagingItem.capacity_liters || packagingItem.net_weight_kg_default || 200;
    const netWeightPerUnit = capacity * 0.85;
    return Math.ceil(qtyKG / netWeightPerUnit);
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
                  <div className="mt-2 p-2 rounded bg-gray-50 text-sm">
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
                  <div className="mt-2 p-2 rounded bg-gray-50 text-sm">
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
                  <div className="mt-2 p-2 rounded bg-gray-50 text-sm">
                    <Truck className="w-3 h-3 inline mr-1" />
                    {shippingCompany.address}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Delivery Date</Label>
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
                    {paymentTerms?.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Shipment Type</Label>
                <Select 
                  value={form.shipment_type} 
                  onValueChange={(v) => setForm({...form, shipment_type: v, incoterm: ''})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Local or Import" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="import">Import</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Incoterm</Label>
                  <Select 
                    value={form.incoterm} 
                    onValueChange={(v) => setForm({...form, incoterm: v})}
                    disabled={!form.shipment_type}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.shipment_type ? "Select Incoterm" : "Select Shipment Type first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableIncoterms.map(i => (
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
          <div className="border-t border-gray-200 pt-4">
            <h3 className="font-semibold mb-3 text-gray-900">PO Line Items - Enter Unit Price</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Job Order</th>
                    <th className="p-2 text-left">Material</th>
                    <th className="p-2 text-left">SKU</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Procurement Type</th>
                    {lines.some(l => l.procurement_type === 'Drummed') && (
                      <>
                        <th className="p-2 text-left">Packaging Material</th>
                        <th className="p-2 text-left">Packaging Qty</th>
                      </>
                    )}
                    <th className="p-2 text-left">Quantity</th>
                    <th className="p-2 text-left">Unit Price *</th>
                    <th className="p-2 text-left">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const selectedPackaging = packagingMaterials.find(p => p.id === line.packaging_item_id);
                    
                    return (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="p-2 font-mono text-sm text-blue-600">{line.job_number}</td>
                        <td className="p-2 font-medium text-gray-900">{line.item_name}</td>
                        <td className="p-2 font-mono text-gray-600">{line.item_sku}</td>
                        <td className="p-2">
                          <Badge className={
                            line.item_type === 'RAW' ? 'bg-red-100 text-red-700 border-red-300' : 
                            line.item_type === 'TRADED' ? 'bg-cyan-100 text-cyan-700 border-cyan-300' :
                            line.item_type === 'PACK' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                            'bg-gray-100 text-gray-700 border-gray-300'
                          }>
                            {line.item_type === 'RAW' ? 'RM/Production' : line.item_type === 'TRADED' ? 'RM/Trading' : line.item_type === 'PACK' ? 'Packaging' : line.item_type}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {line.item_type === 'RAW' || line.item_type === 'TRADED' ? (
                            <Select
                              value={line.procurement_type || 'Bulk'}
                              onValueChange={(value) => {
                                const newLines = [...lines];
                                newLines[idx].procurement_type = value;
                                if (value === 'Bulk') {
                                  newLines[idx].packaging_item_id = null;
                                  newLines[idx].packaging_qty = 0;
                                }
                                setLines(newLines);
                              }}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Bulk">Bulk</SelectItem>
                                <SelectItem value="Drummed">Drummed</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        {lines.some(l => l.procurement_type === 'Drummed') && (
                          <>
                            <td className="p-2">
                              {(line.item_type === 'RAW' || line.item_type === 'TRADED') && line.procurement_type === 'Drummed' ? (
                                <Select
                                  value={line.packaging_item_id || ''}
                                  onValueChange={(value) => {
                                    const newLines = [...lines];
                                    newLines[idx].packaging_item_id = value;
                                    const packagingItem = packagingMaterials.find(p => p.id === value);
                                    if (packagingItem) {
                                      newLines[idx].packaging_qty = calculatePackagingQty(newLines[idx].qty, packagingItem);
                                    }
                                    setLines(newLines);
                                  }}
                                  disabled={loadingPackaging}
                                >
                                  <SelectTrigger className="w-40">
                                    <SelectValue placeholder="Select Packaging" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {packagingMaterials.map(pkg => (
                                      <SelectItem key={pkg.id} value={pkg.id}>
                                        {pkg.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                            <td className="p-2">
                              {(line.item_type === 'RAW' || line.item_type === 'TRADED') && line.procurement_type === 'Drummed' && line.packaging_item_id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={line.packaging_qty || 0}
                                    onChange={(e) => {
                                      const newLines = [...lines];
                                      newLines[idx].packaging_qty = parseFloat(e.target.value) || 0;
                                      setLines(newLines);
                                    }}
                                    className="w-20"
                                  />
                                  <span className="text-xs text-gray-600">EA</span>
                                </div>
                              ) : (
                                <span className="text-gray-500">-</span>
                              )}
                            </td>
                          </>
                        )}
                        <td className="p-2">
                          <Input
                            type="number"
                            value={line.qty}
                            onChange={(e) => {
                              const newLines = [...lines];
                              const newQty = parseFloat(e.target.value) || 0;
                              newLines[idx].qty = newQty;
                              if (newLines[idx].procurement_type === 'Drummed' && newLines[idx].packaging_item_id) {
                                const packagingItem = packagingMaterials.find(p => p.id === newLines[idx].packaging_item_id);
                                if (packagingItem) {
                                  newLines[idx].packaging_qty = calculatePackagingQty(newQty, packagingItem);
                                }
                              }
                              setLines(newLines);
                            }}
                            className="w-24"
                            data-testid={`qty-input-${idx}`}
                          />
                          <span className="ml-1 text-gray-600">{line.uom}</span>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-600">{form.currency}</span>
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
                        <td className="p-2 font-medium text-green-600">
                          {form.currency} {(line.qty * line.unit_price).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={lines.some(l => l.procurement_type === 'Drummed') ? 9 : 7} className="p-3 text-right font-semibold text-gray-900">Total Amount:</td>
                    <td className="p-3 text-lg font-bold text-green-600">
                      {form.currency} {totalAmount.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> This PO will be sent to the Finance Approval page. 
              After finance approval, it can be sent to the vendor.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={submitting || !form.supplier_id}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="submit-po-btn"
            >
              {submitting ? 'Creating...' : `Create PO`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== LOW STOCK TAB ====================
const LowStockTab = ({ lowStockItems, selectedItems, onToggleSelection, onRefresh, onAutoCreatePO, onGeneratePO, suppliers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredItems = lowStockItems.filter(item => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.item_name?.toLowerCase().includes(search) ||
      item.item_sku?.toLowerCase().includes(search) ||
      item.item_type?.toLowerCase().includes(search)
    );
  });
  
  const itemsWithSupplier = filteredItems.filter(item => item.default_supplier_id);
  const itemsWithoutSupplier = filteredItems.filter(item => !item.default_supplier_id);
  
  const getItemTypeBadge = (itemType) => {
    const colors = {
      'FINISHED': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'RAW': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      'PACK': 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[itemType] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold">Low Stock Items (Below Minimum Stock)</h2>
              <p className="text-sm text-gray-600">
                Items that have fallen below their minimum stock level. Select items to create Purchase Orders.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              {selectedItems.length > 0 && (
                <>
                  {selectedItems.some(i => i.default_supplier_id) && (
                    <Button 
                      variant="default" 
                      onClick={onAutoCreatePO}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Auto-Create PO ({selectedItems.filter(i => i.default_supplier_id).length} items)
                    </Button>
                  )}
                  <Button 
                    variant="default" 
                    onClick={onGeneratePO}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create PO ({selectedItems.length} items)
                  </Button>
                </>
              )}
            </div>
          </div>
          <Input
            placeholder="Search by name, SKU, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200 w-12">Select</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Item Name</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">SKU</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Type</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Current Stock</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Min Stock</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Shortage</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Reorder Qty</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700 border-r border-gray-200">Unit</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-700">Default Supplier</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-500 border-t border-gray-200">
                    No low stock items found
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = selectedItems.some(i => i.item_id === item.item_id);
                  return (
                    <tr 
                      key={item.item_id} 
                      className={`border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 border-blue-300' : 'bg-white'}`}
                      onClick={() => onToggleSelection(item)}
                      data-testid={`low-stock-row-${item.item_id}`}
                    >
                      <td className="p-3 border-r border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleSelection(item)}
                        />
                      </td>
                      <td className="p-3 font-medium text-gray-900 border-r border-gray-200">{item.item_name}</td>
                      <td className="p-3 font-mono text-sm text-gray-600 border-r border-gray-200">{item.item_sku}</td>
                      <td className="p-3 border-r border-gray-200">
                        <Badge className={getItemTypeBadge(item.item_type)}>
                          {item.item_type}
                        </Badge>
                      </td>
                      <td className="p-3 text-red-600 font-medium border-r border-gray-200">
                        {item.current_stock?.toFixed(2)}
                      </td>
                      <td className="p-3 text-gray-900 border-r border-gray-200">
                        {item.min_stock?.toFixed(2)}
                      </td>
                      <td className="p-3 text-red-600 font-bold border-r border-gray-200">
                        {item.shortage?.toFixed(2)}
                      </td>
                      <td className="p-3 text-amber-600 font-medium border-r border-gray-200">
                        {item.reorder_qty?.toFixed(2)}
                      </td>
                      <td className="p-3 text-gray-600 border-r border-gray-200">{item.unit}</td>
                      <td className="p-3 text-sm border-r border-gray-200">
                        {item.default_supplier_name ? (
                          <span className="text-green-600">{item.default_supplier_name}</span>
                        ) : (
                          <span className="text-gray-400">No supplier</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {itemsWithoutSupplier.length > 0 && (
          <div className="p-4 bg-yellow-50 border-t border-yellow-200">
            <p className="text-sm text-yellow-700">
              <strong>Note:</strong> {itemsWithoutSupplier.length} item(s) do not have a default supplier. 
              You can still create a PO manually by selecting them and clicking "Create PO".
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcurementPage;
