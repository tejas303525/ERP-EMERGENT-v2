import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { 
  Truck, ArrowDownToLine, ArrowUpFromLine, Package, Check, Clock, 
  AlertTriangle, Plus, Calendar, MapPin, Ship, Container, RefreshCw,
  Globe, Home, Eye, Phone, User
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const TransportWindowPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inward_exw');
  const [inwardEXW, setInwardEXW] = useState([]);
  const [inwardImport, setInwardImport] = useState([]);
  const [localDispatch, setLocalDispatch] = useState([]);
  const [exportContainer, setExportContainer] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inwardRes, outwardRes, importsRes] = await Promise.all([
        api.get('/transport/inward'),
        api.get('/transport/outward'),
        api.get('/imports').catch(() => ({ data: [] }))
      ]);
      
      const inward = inwardRes.data || [];
      // Separate EXW inward from Import inward
      // Only show transports that have been properly booked (have transport_number)
      // Note: Job orders with EXW incoterm should be routed here for local pickup/transport
      setInwardEXW(inward.filter(t => 
        (t.source === 'PO_EXW' || t.incoterm === 'EXW') && 
        t.transport_number  // Only show booked transports
      ));
      
      // Import logistics from imports collection
      setInwardImport(importsRes.data || []);
      
      const outward = outwardRes.data || [];
      // CRITICAL: Only show transports that have been properly booked through Transport Planner
      // Check for transport_number (which indicates booking through planner) or source indicating proper booking
      setLocalDispatch(outward.filter(t => 
        t.transport_type === 'LOCAL' && 
        t.transport_number && 
        t.source !== 'JOB_LOCAL_AUTO'  // Exclude auto-created (unbooked) transports
      ));
      setExportContainer(outward.filter(t => 
        t.transport_type === 'CONTAINER' && 
        t.transport_number  // Only show booked container transports
      ));
    } catch (error) {
      console.error('Failed to load transport data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id, status, type) => {
    try {
      await api.put(`/transport/${type}/${id}/status`, null, { params: { status } });
      toast.success(`Transport ${status.toLowerCase()}`);
      loadData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleViewDetails = (transport) => {
    setSelectedTransport(transport);
    setShowDetailModal(true);
  };

  // Stats
  const exwPending = inwardEXW.filter(t => t.status === 'PENDING').length;
  const importPending = inwardImport.filter(t => t.status === 'PENDING').length;
  const localPending = localDispatch.filter(t => t.status === 'PENDING').length;
  const exportPending = exportContainer.filter(t => t.status === 'PENDING').length;

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="transport-window-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="w-8 h-8 text-blue-500" />
          Transport Window
        </h1>
        <p className="text-muted-foreground mt-1">
          Inward (EXW/Import) & Outward (Local Dispatch/Export Container) Management
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Inward EXW Pending</p>
          <p className="text-2xl font-bold text-blue-400">{exwPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">Inward Import Pending</p>
          <p className="text-2xl font-bold text-purple-400">{importPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Local Dispatch Pending</p>
          <p className="text-2xl font-bold text-amber-400">{localPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Export Container Pending</p>
          <p className="text-2xl font-bold text-green-400">{exportPending}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={activeTab === 'inward_exw' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward_exw')}
          className={exwPending > 0 ? 'border-blue-500/50' : ''}
          data-testid="tab-inward-exw"
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Inward (EXW)
          {exwPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">
              {exwPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'inward_import' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward_import')}
          className={importPending > 0 ? 'border-purple-500/50' : ''}
          data-testid="tab-inward-import"
        >
          <Ship className="w-4 h-4 mr-2" />
          Inward (Import/Logistics)
          {importPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">
              {importPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'local_dispatch' ? 'default' : 'outline'}
          onClick={() => setActiveTab('local_dispatch')}
          className={localPending > 0 ? 'border-amber-500/50' : ''}
          data-testid="tab-local-dispatch"
        >
          <Home className="w-4 h-4 mr-2" />
          Local Dispatch
          {localPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">
              {localPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'export_container' ? 'default' : 'outline'}
          onClick={() => setActiveTab('export_container')}
          className={exportPending > 0 ? 'border-green-500/50' : ''}
          data-testid="tab-export-container"
        >
          <Globe className="w-4 h-4 mr-2" />
          Export Container
          {exportPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-400">
              {exportPending}
            </span>
          )}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {activeTab === 'inward_exw' && (
            <InwardEXWTab 
              transports={inwardEXW} 
              onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'inward')}
              onRefresh={loadData}
              onViewDetails={handleViewDetails}
            />
          )}
          {activeTab === 'inward_import' && (
            <InwardImportTab 
              imports={inwardImport}
              onRefresh={loadData}
              onViewDetails={handleViewDetails}
            />
          )}
          {activeTab === 'local_dispatch' && (
            <LocalDispatchTab 
              transports={localDispatch}
              onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'outward')}
              onRefresh={loadData}
              onViewDetails={handleViewDetails}
            />
          )}
          {activeTab === 'export_container' && (
            <ExportContainerTab 
              transports={exportContainer}
              onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'outward')}
              onRefresh={loadData}
              onViewDetails={handleViewDetails}
            />
          )}
        </>
      )}

      {/* Detail View Modal */}
      <TransportDetailModal 
        transport={selectedTransport}
        open={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedTransport(null);
        }}
      />
    </div>
  );
};

// ==================== INWARD EXW TAB ====================
const InwardEXWTab = ({ transports, onStatusUpdate, onRefresh, onViewDetails }) => {
  const navigate = useNavigate();
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'IN_TRANSIT': return 'bg-blue-500/20 text-blue-400';
      case 'ARRIVED': return 'bg-amber-500/20 text-amber-400';
      case 'COMPLETED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowDownToLine className="w-5 h-5 text-blue-400" />
            Inward Transport (EXW)
          </h2>
          <p className="text-sm text-muted-foreground">
            Supplier-arranged transport to our location (EXW incoterm)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {transports.length === 0 ? (
        <div className="p-8 text-center">
          <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No EXW inward transports</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{transport.transport_number}</td>
                  <td className="p-3 text-blue-400 font-mono">{transport.po_number || '-'}</td>
                  <td className="p-3">{transport.supplier_name || '-'}</td>
                  <td className="p-3 text-sm max-w-[200px]">
                    {transport.po_items?.length > 0 ? (
                      <div className="space-y-1">
                        {transport.po_items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="truncate" title={item.product_name || item.item_name}>
                            {item.product_name || item.item_name || 'Unknown'}
                          </div>
                        ))}
                        {transport.po_items.length > 2 && (
                          <div className="text-xs text-muted-foreground">+{transport.po_items.length - 2} more</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{transport.products_summary || '-'}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {transport.total_quantity ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.total_quantity.toLocaleString()} {transport.total_unit || 'KG'}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 font-mono">{transport.vehicle_number || '-'}</td>
                  <td className="p-3 text-sm">
                    {transport.delivery_date ? new Date(transport.delivery_date).toLocaleDateString() : 
                     transport.expected_delivery ? new Date(transport.expected_delivery).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(transport.status)}>
                        {transport.status}
                      </Badge>
                      {!transport.transport_number && transport.status === 'PENDING' && (
                        <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                          Transportation yet to be booked
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewDetails(transport)}
                        className="h-8"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {!transport.transport_number && transport.status === 'PENDING' && (
                        <Button 
                          size="sm" 
                          onClick={() => {
                            // Navigate to Transport Planner to book transport
                            navigate('/transport-planner', { state: { poId: transport.po_id, autoOpen: 'INWARD_EXW' } });
                            toast.info('Redirecting to Transport Planner to book transport');
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Book Transport
                        </Button>
                      )}
                      {transport.transport_number && transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'IN_TRANSIT')}>
                          Mark In Transit
                        </Button>
                      )}
                      {transport.status === 'IN_TRANSIT' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'ARRIVED')}>
                          Mark Arrived
                        </Button>
                      )}
                    </div>
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

// ==================== INWARD IMPORT TAB ====================
const InwardImportTab = ({ imports, onRefresh, onViewDetails }) => {
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedImport, setSelectedImport] = useState(null);
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'DOCUMENTS_PENDING': return 'bg-amber-500/20 text-amber-400';
      case 'CUSTOMS_CLEARANCE': return 'bg-purple-500/20 text-purple-400';
      case 'IN_TRANSIT': return 'bg-blue-500/20 text-blue-400';
      case 'ARRIVED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const handleBookTransportClick = (importRecord) => {
    setSelectedImport(importRecord);
    setShowBookingModal(true);
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Ship className="w-5 h-5 text-purple-400" />
            Inward Transport (Import/Logistics)
          </h2>
          <p className="text-sm text-muted-foreground">
            International imports with FOB/CFR/CIF incoterms
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {imports.length === 0 ? (
        <div className="p-8 text-center">
          <Ship className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No import shipments</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Import #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Documents</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const docs = imp.document_checklist || {};
                const docsComplete = Object.values(docs).filter(Boolean).length;
                const docsTotal = Object.keys(docs).length || 5;
                const hasTransport = imp.transport_number || imp.transport_booked;
                
                return (
                  <tr key={imp.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{imp.import_number}</td>
                    <td className="p-3 text-purple-400 font-mono">{imp.po_number || '-'}</td>
                    <td className="p-3">
                      <div>
                        <div className="font-medium">{imp.supplier_name || '-'}</div>
                        {imp.supplier_contact && (
                          <div className="text-xs text-muted-foreground">{imp.supplier_contact}</div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm max-w-[200px]">
                      {imp.po_items?.length > 0 ? (
                        <div className="space-y-1">
                          {imp.po_items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="truncate" title={item.product_name || item.item_name}>
                              {item.product_name || item.item_name || 'Unknown'}
                            </div>
                          ))}
                          {imp.po_items.length > 2 && (
                            <div className="text-xs text-muted-foreground">+{imp.po_items.length - 2} more</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {imp.total_quantity ? (
                        <Badge variant="outline" className="font-mono">
                          {imp.total_quantity.toLocaleString()} {imp.total_unit || 'KG'}
                        </Badge>
                      ) : imp.po_items?.length > 0 ? (
                        <div className="text-sm">
                          {imp.po_items.reduce((sum, item) => sum + (item.quantity || 0), 0).toLocaleString()} 
                          {' '}{imp.po_items[0]?.unit || 'KG'}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {imp.delivery_date ? new Date(imp.delivery_date).toLocaleDateString() : 
                       imp.expected_delivery ? new Date(imp.expected_delivery).toLocaleDateString() : 
                       imp.eta ? new Date(imp.eta).toLocaleDateString() : '-'}
                    </td>
                    <td className="p-3">
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {imp.incoterm || 'FOB'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={docsComplete === docsTotal ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>
                        {docsComplete}/{docsTotal} docs
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <Badge className={getStatusColor(imp.status)}>
                          {imp.status}
                        </Badge>
                        {!hasTransport && imp.status !== 'COMPLETED' && (
                          <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                            Transportation yet to be booked
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => onViewDetails(imp)}
                          className="h-8"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        {!hasTransport && imp.status !== 'COMPLETED' && (
                          <Button 
                            size="sm" 
                            onClick={() => handleBookTransportClick(imp)}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Book Transport
                          </Button>
                        )}
                        {hasTransport && (
                          <Badge className="bg-green-500/20 text-green-400">
                            Transport Booked
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Transport Booking Modal */}
      {showBookingModal && selectedImport && (
        <ImportTransportBookingModal
          importRecord={selectedImport}
          onClose={() => {
            setShowBookingModal(false);
            setSelectedImport(null);
          }}
          onBooked={() => {
            setShowBookingModal(false);
            setSelectedImport(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
};

// ==================== IMPORT TRANSPORT BOOKING MODAL ====================
const ImportTransportBookingModal = ({ importRecord, onClose, onBooked }) => {
  const [form, setForm] = useState({
    transporter: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    pickup_date: '',
    delivery_date: '',
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.transporter) {
      toast.error('Please enter transporter name');
      return;
    }
    
    setSaving(true);
    try {
      await api.post('/transport/inward/book-import', {
        import_id: importRecord.id,
        po_id: importRecord.po_id,
        transporter: form.transporter,
        vehicle_number: form.vehicle_number,
        driver_name: form.driver_name,
        driver_phone: form.driver_phone,
        pickup_date: form.pickup_date,
        delivery_date: form.delivery_date
      });
      
      toast.success('Transport booked successfully');
      onBooked();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to book transport');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-purple-400" />
            Book Transport - Import {importRecord.import_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Import Details */}
          <div className="p-3 bg-muted/30 rounded-lg border border-border">
            <h3 className="text-sm font-semibold mb-2">Import Details</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Import #:</span>
                <span className="ml-2 font-mono">{importRecord.import_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">PO #:</span>
                <span className="ml-2 font-mono text-purple-400">{importRecord.po_number || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Supplier:</span>
                <span className="ml-2">{importRecord.supplier_name || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Incoterm:</span>
                <span className="ml-2">{importRecord.incoterm || 'FOB'}</span>
              </div>
            </div>
          </div>

          {/* Transport Details Form */}
          <div>
            <Label>Transporter Name *</Label>
            <Input
              value={form.transporter}
              onChange={(e) => setForm({...form, transporter: e.target.value})}
              placeholder="Enter transporter company name"
            />
          </div>

          <div>
            <Label>Vehicle Number</Label>
            <Input
              value={form.vehicle_number}
              onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
              placeholder="License plate number"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Driver Name</Label>
              <Input
                value={form.driver_name}
                onChange={(e) => setForm({...form, driver_name: e.target.value})}
                placeholder="Driver full name"
              />
            </div>
            <div>
              <Label>Driver Phone</Label>
              <Input
                value={form.driver_phone}
                onChange={(e) => setForm({...form, driver_phone: e.target.value})}
                placeholder="+971 XX XXX XXXX"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Pickup Date</Label>
              <Input
                type="datetime-local"
                value={form.pickup_date}
                onChange={(e) => setForm({...form, pickup_date: e.target.value})}
              />
            </div>
            <div>
              <Label>Delivery Date</Label>
              <Input
                type="date"
                value={form.delivery_date}
                onChange={(e) => setForm({...form, delivery_date: e.target.value})}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              placeholder="Additional notes or instructions..."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Booking...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Book Transport
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== LOCAL DISPATCH TAB ====================
const LocalDispatchTab = ({ transports, onStatusUpdate, onRefresh, onViewDetails }) => {
  const [loadingBooking, setLoadingBooking] = useState({});
  
  // #region agent log
  useEffect(() => {
    transports.forEach(transport => {
      if (transport.total_quantity) {
        fetch('http://127.0.0.1:7245/ingest/b639d9b5-860e-4e6f-85ad-5a85f91095a5', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'TransportWindowPage.js:useEffect',
            message: 'Local dispatch quantity display',
            data: {
              total_quantity: transport.total_quantity,
              unit: transport.unit,
              job_number: transport.job_number,
              transport_number: transport.transport_number
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'initial',
            hypothesisId: 'A,B,C'
          })
        }).catch(() => {});
      }
    });
  }, [transports]);
  // #endregion
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'LOADING': return 'bg-amber-500/20 text-amber-400';
      case 'DISPATCHED': return 'bg-blue-500/20 text-blue-400';
      case 'DELIVERED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const handleBookTransport = async (transport) => {
    setLoadingBooking({ [transport.id]: true });
    try {
      await api.post('/transport/outward/book', {
        job_order_id: transport.job_order_id || transport.job_order_ids?.[0],
        transporter_name: '',
        vehicle_type: 'tanker',
        vehicle_number: '',
        driver_name: '',
        driver_contact: '',
        scheduled_date: '',
        notes: '',
        transport_type: 'LOCAL'
      });
      toast.success('Transport booked successfully');
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to book transport');
    } finally {
      setLoadingBooking({ [transport.id]: false });
    }
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Home className="w-5 h-5 text-amber-400" />
            Local Dispatch
          </h2>
          <p className="text-sm text-muted-foreground">
            Local deliveries via tanker/trailer
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {transports.length === 0 ? (
        <div className="p-8 text-center">
          <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No local dispatches</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job Orders</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Products</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{transport.transport_number}</td>
                  <td className="p-3 text-amber-400 font-mono">
                    {transport.job_number || transport.job_numbers?.join(', ') || '-'}
                  </td>
                  <td className="p-3">{transport.customer_name || '-'}</td>
                  <td className="p-3 text-sm max-w-[200px] truncate" title={transport.products_summary}>
                    {transport.products_summary || '-'}
                  </td>
                  <td className="p-3">
                    {transport.total_quantity ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.total_quantity} {transport.packaging || 'units'}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 font-mono">{transport.vehicle_number || '-'}</td>
                  <td className="p-3 text-sm">
                    {transport.delivery_date ? new Date(transport.delivery_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(transport.status)}>
                        {transport.status}
                      </Badge>
                      {!transport.transport_number && transport.status === 'PENDING' && (
                        <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                          Transportation yet to be booked
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewDetails(transport)}
                        className="h-8"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {!transport.transport_number && transport.status === 'PENDING' && (
                        <Button 
                          size="sm" 
                          onClick={() => handleBookTransport(transport)}
                          disabled={loadingBooking[transport.id]}
                        >
                          {loadingBooking[transport.id] ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                              Booking...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-1" />
                              Book Transport
                            </>
                          )}
                        </Button>
                      )}
                      {transport.transport_number && transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'LOADING')}>
                          Start Loading
                        </Button>
                      )}
                      {transport.status === 'LOADING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED')}>
                          Dispatch
                        </Button>
                      )}
                    </div>
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

// ==================== EXPORT CONTAINER TAB ====================
const ExportContainerTab = ({ transports, onStatusUpdate, onRefresh, onViewDetails }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'LOADING': return 'bg-amber-500/20 text-amber-400';
      case 'DISPATCHED': return 'bg-blue-500/20 text-blue-400';
      case 'AT_PORT': return 'bg-purple-500/20 text-purple-400';
      case 'SHIPPED': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-green-400" />
            Export Container
          </h2>
          <p className="text-sm text-muted-foreground">
            Container shipments for export orders
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {transports.length === 0 ? (
        <div className="p-8 text-center">
          <Container className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No export containers</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Containers</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">SI/LL Cutoff</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Pull Out</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Gate In</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Container #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job Orders</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Destination</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{transport.transport_number}</td>
                  <td className="p-3 text-sm max-w-[200px] truncate" title={transport.products_summary || transport.product_names?.join(', ')}>
                    {transport.products_summary || transport.product_names?.join(', ') || '-'}
                  </td>
                  <td className="p-3">
                    {transport.container_count ? (
                      <Badge variant="outline" className="font-mono">
                        {transport.container_count} {transport.container_type || 'Container'}{transport.container_count > 1 ? 's' : ''}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-sm">
                    {transport.si_cutoff ? (
                      <span className="font-mono">{new Date(transport.si_cutoff).toLocaleDateString()}</span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-sm">
                    {transport.pull_out_date ? (
                      <span className="font-mono">{new Date(transport.pull_out_date).toLocaleDateString()}</span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-sm">
                    {transport.gate_in_date ? (
                      <span className="font-mono">{new Date(transport.gate_in_date).toLocaleDateString()}</span>
                    ) : '-'}
                  </td>
                  <td className="p-3 font-mono text-green-400">{transport.container_number || '-'}</td>
                  <td className="p-3 font-mono text-green-400">{transport.job_number || transport.job_numbers?.join(', ') || '-'}</td>
                  <td className="p-3">{transport.customer_name || '-'}</td>
                  <td className="p-3">{transport.destination || '-'}</td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <Badge className={getStatusColor(transport.status)}>
                        {transport.status}
                      </Badge>
                      {!transport.transport_number && transport.status === 'PENDING' && (
                        <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                          Transportation yet to be booked
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => onViewDetails(transport)}
                        className="h-8"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {transport.transport_number && transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'LOADING')}>
                          Start Loading
                        </Button>
                      )}
                      {!transport.transport_number && transport.status === 'PENDING' && (
                        <Badge className="bg-amber-500/20 text-amber-400">
                          Book Transport First
                        </Badge>
                      )}
                      {transport.status === 'LOADING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'DISPATCHED')}>
                          Dispatch
                        </Button>
                      )}
                      {transport.status === 'DISPATCHED' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'AT_PORT')}>
                          At Port
                        </Button>
                      )}
                    </div>
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

// ==================== TRANSPORT DETAIL MODAL ====================
const TransportDetailModal = ({ transport, open, onClose }) => {
  if (!transport) return null;

  const isInward = transport.po_number || transport.import_number;
  const isImport = transport.import_number;
  const isOutward = transport.job_number || transport.job_numbers;
  const isContainer = transport.container_number;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isInward ? <ArrowDownToLine className="w-5 h-5 text-blue-400" /> : <ArrowUpFromLine className="w-5 h-5 text-amber-400" />}
            Transport Details - {transport.transport_number || transport.import_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Basic Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Transport Number</Label>
                <p className="font-mono font-medium">{transport.transport_number || transport.import_number}</p>
              </div>
              {isInward && !isImport && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">PO Number</Label>
                    <p className="text-blue-400 font-mono">{transport.po_number || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Supplier</Label>
                    <p>{transport.supplier_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Incoterm</Label>
                    <Badge className="bg-blue-500/20 text-blue-400">{transport.incoterm || 'EXW'}</Badge>
                  </div>
                </>
              )}
              {isImport && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">PO Number</Label>
                    <p className="text-purple-400 font-mono">{transport.po_number || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Supplier</Label>
                    <p>{transport.supplier_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Incoterm</Label>
                    <Badge className="bg-purple-500/20 text-purple-400">{transport.incoterm || 'FOB'}</Badge>
                  </div>
                </>
              )}
              {isOutward && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">Job Order(s)</Label>
                    <p className="text-amber-400 font-mono">
                      {transport.job_number || transport.job_numbers?.join(', ') || '-'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Customer</Label>
                    <p>{transport.customer_name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Transport Type</Label>
                    <Badge className={isContainer ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}>
                      {isContainer ? 'CONTAINER' : 'LOCAL'}
                    </Badge>
                  </div>
                </>
              )}
              <div>
                <Label className="text-muted-foreground text-xs">Status</Label>
                <Badge className="bg-blue-500/20 text-blue-400">{transport.status}</Badge>
              </div>
            </div>
          </div>

          {/* Vehicle & Driver Information */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Vehicle & Driver Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Transport Company</Label>
                <p className="font-medium">{transport.transporter_name || transport.transporter || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Vehicle Number</Label>
                <p className="font-mono font-medium">{transport.vehicle_number || 'Not assigned'}</p>
              </div>
              {isContainer && (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs">Container Number</Label>
                    <p className="font-mono font-medium text-green-400">{transport.container_number || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Container Type</Label>
                    <p className="font-mono">{transport.container_type || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Number of Containers</Label>
                    <p className="font-mono font-medium">{transport.container_count || 1}</p>
                  </div>
                </>
              )}
              <div>
                <Label className="text-muted-foreground text-xs">Driver Name</Label>
                <p className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {transport.driver_name || '-'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Driver Contact</Label>
                <p className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {transport.driver_contact || transport.driver_phone || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Products/Items */}
          {((transport.po_items && transport.po_items.length > 0) || 
            (transport.job_items && transport.job_items.length > 0)) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Products/Items
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Product Name</th>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Quantity</th>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Unit</th>
                      {transport.job_items && (
                        <th className="p-2 text-left text-xs font-medium text-muted-foreground">Packaging</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(transport.po_items || transport.job_items || []).map((item, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="p-2">{item.product_name || item.name}</td>
                        <td className="p-2 font-mono text-sm">{item.sku || item.product_sku || '-'}</td>
                        <td className="p-2 text-right font-mono">{item.quantity}</td>
                        <td className="p-2">{item.unit || 'KG'}</td>
                        {transport.job_items && (
                          <td className="p-2">{item.packaging || 'Bulk'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/20">
                    <tr>
                      <td colSpan={2} className="p-2 font-semibold">Total</td>
                      <td className="p-2 text-right font-mono font-semibold">
                        {(transport.po_items || transport.job_items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)}
                      </td>
                      <td className="p-2 font-semibold">KG</td>
                      {transport.job_items && <td></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Container Shipping Information */}
          {isContainer && (transport.si_cutoff || transport.pull_out_date || transport.gate_in_date) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Container className="w-4 h-4" />
                Container Shipping Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {transport.si_cutoff && (
                  <div>
                    <Label className="text-muted-foreground text-xs">SI/LL Cutoff</Label>
                    <p className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      {new Date(transport.si_cutoff).toLocaleString()}
                    </p>
                  </div>
                )}
                {transport.pull_out_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Pull Out Date</Label>
                    <p className="flex items-center gap-1 font-mono">
                      <Truck className="w-3 h-3" />
                      {new Date(transport.pull_out_date).toLocaleString()}
                    </p>
                  </div>
                )}
                {transport.gate_in_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Gate In Date</Label>
                    <p className="flex items-center gap-1 font-mono">
                      <MapPin className="w-3 h-3" />
                      {new Date(transport.gate_in_date).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location & Timeline */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Location & Timeline
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {transport.destination && (
                <div>
                  <Label className="text-muted-foreground text-xs">Destination</Label>
                  <p>{transport.destination}</p>
                </div>
              )}
              {transport.actual_arrival && (
                <div>
                  <Label className="text-muted-foreground text-xs">Actual Arrival</Label>
                  <p className="flex items-center gap-1">
                    <Check className="w-3 h-3 text-green-400" />
                    {new Date(transport.actual_arrival).toLocaleString()}
                  </p>
                </div>
              )}
              {transport.dispatch_date && (
                <div>
                  <Label className="text-muted-foreground text-xs">Dispatch Date</Label>
                  <p className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(transport.dispatch_date).toLocaleString()}
                  </p>
                </div>
              )}
              {transport.delivery_date && (
                <div>
                  <Label className="text-muted-foreground text-xs">Expected Delivery</Label>
                  <p className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(transport.delivery_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {transport.created_at && (
                <div>
                  <Label className="text-muted-foreground text-xs">Created At</Label>
                  <p className="text-sm text-muted-foreground">
                    {new Date(transport.created_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Import Documents (if applicable) */}
          {isImport && transport.document_checklist && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Document Checklist
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(transport.document_checklist).map(([doc, status]) => (
                  <div key={doc} className="flex items-center gap-2">
                    {status ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="text-sm">
                      {doc.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransportWindowPage;
