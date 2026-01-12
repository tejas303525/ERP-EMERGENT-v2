import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Truck, ArrowDownToLine, ArrowUpFromLine, Package, Check, Clock, 
  AlertTriangle, Plus, Calendar, MapPin, Ship, Container, RefreshCw,
  Globe, Home
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const TransportWindowPage = () => {
  const [activeTab, setActiveTab] = useState('inward_exw');
  const [inwardEXW, setInwardEXW] = useState([]);
  const [inwardImport, setInwardImport] = useState([]);
  const [localDispatch, setLocalDispatch] = useState([]);
  const [exportContainer, setExportContainer] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inwardRes, outwardRes, importsRes, jobsRes] = await Promise.all([
        api.get('/transport/inward'),
        api.get('/transport/outward'),
        api.get('/imports').catch(() => ({ data: [] })),
        api.get('/job-orders', { params: { status: 'ready_for_dispatch' } }).catch(() => ({ data: [] }))
      ]);
      
      const inward = inwardRes.data || [];
      // Separate EXW inward from Import inward
      // Show all EXW transports (both booked and unbooked)
      setInwardEXW(inward.filter(t => t.source === 'PO_EXW' || t.incoterm === 'EXW'));
      
      // Import logistics from imports collection
      setInwardImport(importsRes.data || []);
      
      const outward = outwardRes.data || [];
      // Show all local dispatch transports (both booked and unbooked)
      // Also include jobs that are ready_for_dispatch but don't have transport booked yet
      const localTransports = outward.filter(t => t.transport_type === 'LOCAL');
      
      // Get jobs ready for dispatch that don't have transport booked
      const readyJobs = (jobsRes.data || []).filter(j => 
        j.status === 'ready_for_dispatch' && 
        !j.transport_outward_id && 
        !j.transport_booked &&
        (!j.incoterm || j.incoterm.toUpperCase() === 'EXW' || j.incoterm.toUpperCase() === 'DDP' || j.incoterm.toUpperCase() === 'DAP')
      );
      
      // Add unbooked jobs as transport records with "NEEDS_BOOKING" status
      const unbookedJobs = readyJobs.map(job => ({
        id: `unbooked-${job.id}`,
        job_order_id: job.id,
        job_number: job.job_number,
        customer_name: job.customer_name || '',
        product_name: job.product_name || '',
        quantity: job.quantity || 0,
        unit: job.unit || '',
        transport_type: 'LOCAL',
        status: 'NEEDS_BOOKING',
        transport_number: null,
        source: 'JOB_READY_FOR_DISPATCH'
      }));
      
      setLocalDispatch([...localTransports, ...unbookedJobs]);
      setExportContainer(outward.filter(t => t.transport_type === 'CONTAINER'));
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
            />
          )}
          {activeTab === 'inward_import' && (
            <InwardImportTab 
              imports={inwardImport}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'local_dispatch' && (
            <LocalDispatchTab 
              transports={localDispatch}
              onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'outward')}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'export_container' && (
            <ExportContainerTab 
              transports={exportContainer}
              onStatusUpdate={(id, s) => handleStatusUpdate(id, s, 'outward')}
              onRefresh={loadData}
            />
          )}
        </>
      )}
    </div>
  );
};

// ==================== INWARD EXW TAB ====================
const InwardEXWTab = ({ transports, onStatusUpdate, onRefresh }) => {
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
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{transport.transport_number}</td>
                  <td className="p-3 text-blue-400">{transport.po_number || '-'}</td>
                  <td className="p-3">{transport.supplier_name || '-'}</td>
                  <td className="p-3">
                    <Badge className="bg-blue-500/20 text-blue-400">EXW</Badge>
                  </td>
                  <td className="p-3">{transport.vehicle_number || '-'}</td>
                  <td className="p-3">
                    <Badge className={getStatusColor(transport.status)}>
                      {transport.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {transport.status === 'PENDING' && (
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
const InwardImportTab = ({ imports, onRefresh }) => {
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
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Documents</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((imp) => {
                const docs = imp.document_checklist || {};
                const docsComplete = Object.values(docs).filter(Boolean).length;
                const docsTotal = Object.keys(docs).length;
                
                return (
                  <tr key={imp.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{imp.import_number}</td>
                    <td className="p-3 text-purple-400">{imp.po_number || '-'}</td>
                    <td className="p-3">{imp.supplier_name || '-'}</td>
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
                      <Badge className={getStatusColor(imp.status)}>
                        {imp.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ==================== LOCAL DISPATCH TAB ====================
const LocalDispatchTab = ({ transports, onStatusUpdate, onRefresh }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING': return 'bg-gray-500/20 text-gray-400';
      case 'LOADING': return 'bg-amber-500/20 text-amber-400';
      case 'DISPATCHED': return 'bg-blue-500/20 text-blue-400';
      case 'DELIVERED': return 'bg-green-500/20 text-green-400';
      case 'NEEDS_BOOKING': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-gray-500/20 text-gray-400';
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
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transports.map((transport) => (
                <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">
                    {transport.transport_number || transport.job_number || '-'}
                  </td>
                  <td className="p-3 text-amber-400">
                    {transport.job_numbers?.join(', ') || transport.job_number || '-'}
                  </td>
                  <td className="p-3">{transport.customer_name || '-'}</td>
                  <td className="p-3">{transport.vehicle_number || '-'}</td>
                  <td className="p-3">
                    <Badge className={getStatusColor(transport.status)}>
                      {transport.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {transport.status === 'NEEDS_BOOKING' && (
                        <Badge className="bg-orange-500/20 text-orange-400 text-xs">
                          Transportation yet to be booked
                        </Badge>
                      )}
                      {transport.status === 'PENDING' && (
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
const ExportContainerTab = ({ transports, onStatusUpdate, onRefresh }) => {
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
                  <td className="p-3 font-mono text-green-400">{transport.container_number || '-'}</td>
                  <td className="p-3">{transport.job_numbers?.join(', ') || '-'}</td>
                  <td className="p-3">{transport.customer_name || '-'}</td>
                  <td className="p-3">{transport.destination || '-'}</td>
                  <td className="p-3">
                    <Badge className={getStatusColor(transport.status)}>
                      {transport.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {transport.status === 'PENDING' && (
                        <Button size="sm" onClick={() => onStatusUpdate(transport.id, 'LOADING')}>
                          Start Loading
                        </Button>
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

export default TransportWindowPage;
