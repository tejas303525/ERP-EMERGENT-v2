import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
  Ship, FileText, Check, Clock, AlertTriangle, 
  Package, Eye, CheckSquare, Square, Truck, RefreshCw, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const ImportWindowPage = () => {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedImport, setSelectedImport] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/imports');
      setImports(res.data || []);
    } catch (error) {
      setImports([]);
    } finally {
      setLoading(false);
    }
  };

  // Group imports by status
  const pendingImports = imports.filter(i => i.status === 'PENDING' || i.status === 'PENDING_DOCS');
  const inTransitImports = imports.filter(i => i.status === 'IN_TRANSIT');
  const atPortImports = imports.filter(i => i.status === 'AT_PORT');
  const clearedImports = imports.filter(i => i.status === 'CLEARED');
  const completedImports = imports.filter(i => i.status === 'COMPLETED');

  const getTabImports = () => {
    switch (activeTab) {
      case 'pending': return pendingImports;
      case 'transit': return inTransitImports;
      case 'port': return atPortImports;
      case 'cleared': return clearedImports;
      case 'completed': return completedImports;
      default: return imports;
    }
  };

  const handleUpdateStatus = async (importId, newStatus) => {
    try {
      await api.put(`/imports/${importId}/status`, null, { params: { status: newStatus } });
      toast.success(`Status updated to ${newStatus}`);
      loadData();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleUpdateDocument = async (importId, docKey, checked) => {
    try {
      await api.put(`/imports/${importId}/document`, { document_key: docKey, checked });
      toast.success('Document updated');
      loadData();
    } catch (error) {
      toast.error('Failed to update document');
    }
  };

  const handleMoveToTransport = async (importRecord) => {
    try {
      await api.post(`/imports/${importRecord.id}/move-to-transport`);
      toast.success('Moved to Transport Window (Import/Logistics)');
      loadData();
    } catch (error) {
      toast.error('Failed to move to transport');
    }
  };

  const openDetails = (imp) => {
    setSelectedImport(imp);
    setShowDetailsModal(true);
  };

  // Required documents for imports
  const requiredDocuments = [
    { key: 'delivery_order', label: 'Delivery Order' },
    { key: 'bill_of_lading', label: 'Bill of Lading' },
    { key: 'epda', label: 'EPDA' },
    { key: 'sira', label: 'SIRA' }
  ];

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="import-window-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Ship className="w-8 h-8 text-cyan-500" />
          Import Window
        </h1>
        <p className="text-muted-foreground mt-1">Manage import shipments and documentation</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Pending Docs</p>
          <p className="text-2xl font-bold text-amber-400">{pendingImports.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">In Transit</p>
          <p className="text-2xl font-bold text-blue-400">{inTransitImports.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">At Port</p>
          <p className="text-2xl font-bold text-purple-400">{atPortImports.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-cyan-500/30">
          <p className="text-sm text-muted-foreground">Customs Cleared</p>
          <p className="text-2xl font-bold text-cyan-400">{clearedImports.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="text-2xl font-bold text-green-400">{completedImports.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'pending', label: 'Pending Docs', count: pendingImports.length, color: 'amber' },
          { id: 'transit', label: 'In Transit', count: inTransitImports.length, color: 'blue' },
          { id: 'port', label: 'At Port', count: atPortImports.length, color: 'purple' },
          { id: 'cleared', label: 'Cleared', count: clearedImports.length, color: 'cyan' },
          { id: 'completed', label: 'Completed', count: completedImports.length, color: 'green' },
        ].map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            size="sm"
          >
            {tab.label}
            <Badge className="ml-2 bg-white/20">{tab.count}</Badge>
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Import Table */}
      <div className="glass rounded-lg border border-border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Import #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Documents</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : getTabImports().length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No imports in this status
                  </td>
                </tr>
              ) : (
                getTabImports().map((imp) => (
                  <tr key={imp.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="p-3 font-mono font-medium">{imp.import_number}</td>
                    <td className="p-3 text-blue-400">{imp.po_number || '-'}</td>
                    <td className="p-3">{imp.supplier_name || '-'}</td>
                    <td className="p-3">
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {imp.incoterm || 'FOB'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <DocumentChecklist 
                        checklist={imp.document_checklist || {}}
                        requiredDocs={requiredDocuments}
                        onUpdate={(key, checked) => handleUpdateDocument(imp.id, key, checked)}
                      />
                    </td>
                    <td className="p-3">
                      <Badge className={getStatusColor(imp.status)}>
                        {imp.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => openDetails(imp)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {imp.status === 'PENDING' && (
                          <Button size="sm" onClick={() => handleUpdateStatus(imp.id, 'IN_TRANSIT')}>
                            In Transit
                          </Button>
                        )}
                        {imp.status === 'IN_TRANSIT' && (
                          <Button size="sm" onClick={() => handleUpdateStatus(imp.id, 'AT_PORT')}>
                            At Port
                          </Button>
                        )}
                        {imp.status === 'AT_PORT' && (
                          <Button size="sm" onClick={() => handleUpdateStatus(imp.id, 'CLEARED')}>
                            Cleared
                          </Button>
                        )}
                        {imp.status === 'CLEARED' && (
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleMoveToTransport(imp)}>
                            <Truck className="w-4 h-4 mr-1" />
                            Move to Transport
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedImport && (
        <ImportDetailsModal
          importRecord={selectedImport}
          requiredDocs={requiredDocuments}
          onClose={() => { setShowDetailsModal(false); setSelectedImport(null); }}
          onMoveToTransport={() => {
            handleMoveToTransport(selectedImport);
            setShowDetailsModal(false);
            setSelectedImport(null);
          }}
        />
      )}
    </div>
  );
};

// Document Checklist Component
const DocumentChecklist = ({ checklist, requiredDocs, onUpdate }) => {
  const completedCount = requiredDocs.filter(d => checklist[d.key]).length;
  const totalCount = requiredDocs.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {requiredDocs.map(doc => (
          <button
            key={doc.key}
            onClick={() => onUpdate(doc.key, !checklist[doc.key])}
            className={`p-1 rounded transition-colors ${checklist[doc.key] ? 'text-green-400' : 'text-gray-500 hover:text-gray-400'}`}
            title={doc.label}
          >
            {checklist[doc.key] ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>
        ))}
      </div>
      <span className={`text-xs ${completedCount === totalCount ? 'text-green-400' : 'text-amber-400'}`}>
        {completedCount}/{totalCount}
      </span>
    </div>
  );
};

// Status color helper
const getStatusColor = (status) => {
  switch (status) {
    case 'PENDING':
    case 'PENDING_DOCS':
      return 'bg-amber-500/20 text-amber-400';
    case 'IN_TRANSIT':
      return 'bg-blue-500/20 text-blue-400';
    case 'AT_PORT':
      return 'bg-purple-500/20 text-purple-400';
    case 'CLEARED':
      return 'bg-cyan-500/20 text-cyan-400';
    case 'COMPLETED':
      return 'bg-green-500/20 text-green-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
};

// Import Details Modal
const ImportDetailsModal = ({ importRecord, requiredDocs, onClose, onMoveToTransport }) => {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-cyan-500" />
            Import Details - {importRecord.import_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">PO Number</p>
              <p className="font-medium text-blue-400">{importRecord.po_number || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Supplier</p>
              <p className="font-medium">{importRecord.supplier_name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Incoterm</p>
              <Badge className="bg-purple-500/20 text-purple-400">{importRecord.incoterm || 'FOB'}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge className={getStatusColor(importRecord.status)}>{importRecord.status}</Badge>
            </div>
          </div>

          {/* Items */}
          {importRecord.items && importRecord.items.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Items
              </h3>
              <div className="bg-muted/20 rounded-lg p-3">
                {importRecord.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span>{item.name || item.product_name}</span>
                    <span className="text-muted-foreground">{item.quantity} {item.unit || 'units'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Required Documents */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Required Documents
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {requiredDocs.map(doc => (
                <div key={doc.key} className="flex items-center gap-2 p-2 rounded bg-muted/20">
                  {importRecord.document_checklist?.[doc.key] ? (
                    <CheckSquare className="w-5 h-5 text-green-400" />
                  ) : (
                    <Square className="w-5 h-5 text-amber-400" />
                  )}
                  <span>{doc.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Move to Transport Action */}
          {importRecord.status === 'CLEARED' && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <p className="text-sm text-emerald-400 mb-3">
                This import has cleared customs. You can now move it to the Transport Window for logistics coordination.
              </p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onMoveToTransport}>
                <Truck className="w-4 h-4 mr-2" />
                Move to Transport Window (Import/Logistics)
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportWindowPage;
