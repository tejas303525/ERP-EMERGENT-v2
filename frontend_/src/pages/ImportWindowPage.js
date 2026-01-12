import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Ship, FileText, Upload, Check, Clock, AlertTriangle, 
  Package, Download, Eye, Plus, X, CheckSquare, Square
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const ImportWindowPage = () => {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedImport, setSelectedImport] = useState(null);

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
  const pendingImports = imports.filter(i => i.status === 'PENDING_DOCS');
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
            {tab.count > 0 && (
              <span className={`ml-2 px-1.5 py-0.5 text-xs rounded bg-${tab.color}-500/20 text-${tab.color}-400`}>
                {tab.count}
              </span>
            )}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Import List */}
          <div className="col-span-2">
            <ImportList 
              imports={getTabImports()}
              onSelect={setSelectedImport}
              selectedId={selectedImport?.id}
              onRefresh={loadData}
            />
          </div>

          {/* Import Details / Document Checklist */}
          <div className="col-span-1">
            {selectedImport ? (
              <ImportDetails 
                importRecord={selectedImport}
                onRefresh={loadData}
                onClose={() => setSelectedImport(null)}
              />
            ) : (
              <div className="glass rounded-lg border border-border p-8 text-center">
                <Ship className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                <p className="text-muted-foreground">Select an import to view details</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Import List Component
const ImportList = ({ imports, onSelect, selectedId, onRefresh }) => {
  const statusColors = {
    PENDING_DOCS: 'bg-amber-500/20 text-amber-400',
    IN_TRANSIT: 'bg-blue-500/20 text-blue-400',
    AT_PORT: 'bg-purple-500/20 text-purple-400',
    CLEARED: 'bg-cyan-500/20 text-cyan-400',
    COMPLETED: 'bg-green-500/20 text-green-400'
  };

  if (imports.length === 0) {
    return (
      <div className="glass rounded-lg border border-border p-8 text-center">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
        <p className="text-muted-foreground">No imports in this category</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-lg border border-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/30">
          <tr>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Import #</th>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO Reference</th>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Origin</th>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">ETA</th>
            <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {imports.map(imp => (
            <tr 
              key={imp.id} 
              className={`border-t border-border/50 cursor-pointer hover:bg-muted/10 ${selectedId === imp.id ? 'bg-cyan-500/10' : ''}`}
              onClick={() => onSelect(imp)}
            >
              <td className="p-3 font-medium font-mono">{imp.import_number}</td>
              <td className="p-3 text-blue-400">{imp.po_number}</td>
              <td className="p-3">{imp.supplier_name}</td>
              <td className="p-3 text-sm">{imp.country_of_origin}</td>
              <td className="p-3">
                <span className="px-2 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400">
                  {imp.incoterm}
                </span>
              </td>
              <td className="p-3">{imp.eta ? new Date(imp.eta).toLocaleDateString() : '-'}</td>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded text-xs ${statusColors[imp.status] || statusColors.PENDING_DOCS}`}>
                  {imp.status?.replace(/_/g, ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Import Details with Document Checklist
const ImportDetails = ({ importRecord, onRefresh, onClose }) => {
  const [checklist, setChecklist] = useState(importRecord.document_checklist || getDefaultChecklist());
  const [uploading, setUploading] = useState(false);

  const handleCheckItem = async (docType) => {
    const newChecklist = checklist.map(item => 
      item.type === docType ? { ...item, received: !item.received, received_at: !item.received ? new Date().toISOString() : null } : item
    );
    setChecklist(newChecklist);
    
    try {
      await api.put(`/imports/${importRecord.id}/checklist`, { checklist: newChecklist });
      toast.success(`${docType} ${newChecklist.find(i => i.type === docType)?.received ? 'received' : 'unmarked'}`);
      onRefresh();
    } catch (error) {
      // Revert on error
      setChecklist(checklist);
      toast.error('Failed to update checklist');
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    try {
      await api.put(`/imports/${importRecord.id}/status`, { status: newStatus });
      toast.success(`Import status updated to ${newStatus}`);
      onRefresh();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const receivedCount = checklist.filter(c => c.received).length;
  const totalDocs = checklist.length;
  const allDocsReceived = receivedCount === totalDocs;

  return (
    <div className="glass rounded-lg border border-border">
      {/* Header */}
      <div className="p-4 border-b border-border flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-lg">{importRecord.import_number}</span>
          </div>
          <p className="text-sm text-muted-foreground">PO: {importRecord.po_number}</p>
          <p className="text-sm text-muted-foreground">Supplier: {importRecord.supplier_name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Import Info */}
      <div className="p-4 border-b border-border grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Incoterm:</span>
          <span className="ml-2 font-medium">{importRecord.incoterm}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Origin:</span>
          <span className="ml-2 font-medium">{importRecord.country_of_origin}</span>
        </div>
        <div>
          <span className="text-muted-foreground">ETA:</span>
          <span className="ml-2 font-medium">
            {importRecord.eta ? new Date(importRecord.eta).toLocaleDateString() : '-'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Port:</span>
          <span className="ml-2 font-medium">{importRecord.destination_port || '-'}</span>
        </div>
      </div>

      {/* Document Checklist */}
      <div className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Document Checklist</h3>
          <span className={`text-sm ${allDocsReceived ? 'text-green-400' : 'text-amber-400'}`}>
            {receivedCount}/{totalDocs} Received
          </span>
        </div>

        <div className="space-y-2">
          {checklist.map(doc => (
            <div 
              key={doc.type}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                doc.received 
                  ? 'border-green-500/30 bg-green-500/5' 
                  : doc.required 
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-border'
              }`}
              onClick={() => handleCheckItem(doc.type)}
            >
              <div className="flex items-center gap-3">
                {doc.received ? (
                  <CheckSquare className="w-5 h-5 text-green-400" />
                ) : (
                  <Square className="w-5 h-5 text-muted-foreground" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{doc.name}</span>
                    {doc.required && !doc.received && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">Required</span>
                    )}
                  </div>
                  {doc.received && doc.received_at && (
                    <span className="text-xs text-muted-foreground">
                      Received: {new Date(doc.received_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <FileText className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border">
        {importRecord.status === 'PENDING_DOCS' && allDocsReceived && (
          <Button 
            className="w-full bg-blue-500 hover:bg-blue-600"
            onClick={() => handleStatusUpdate('IN_TRANSIT')}
          >
            <Ship className="w-4 h-4 mr-2" />
            Mark as In Transit
          </Button>
        )}
        {importRecord.status === 'IN_TRANSIT' && (
          <Button 
            className="w-full bg-purple-500 hover:bg-purple-600"
            onClick={() => handleStatusUpdate('AT_PORT')}
          >
            <Package className="w-4 h-4 mr-2" />
            Arrived at Port
          </Button>
        )}
        {importRecord.status === 'AT_PORT' && (
          <Button 
            className="w-full bg-cyan-500 hover:bg-cyan-600"
            onClick={() => handleStatusUpdate('CLEARED')}
          >
            <Check className="w-4 h-4 mr-2" />
            Customs Cleared
          </Button>
        )}
        {importRecord.status === 'CLEARED' && (
          <Button 
            className="w-full bg-green-500 hover:bg-green-600"
            onClick={() => handleStatusUpdate('COMPLETED')}
          >
            <Check className="w-4 h-4 mr-2" />
            Complete Import
          </Button>
        )}
        {!allDocsReceived && importRecord.status === 'PENDING_DOCS' && (
          <p className="text-center text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            Complete document checklist to proceed
          </p>
        )}
      </div>
    </div>
  );
};

// Default document checklist for imports
const getDefaultChecklist = () => [
  { type: 'COMMERCIAL_INVOICE', name: 'Commercial Invoice', required: true, received: false },
  { type: 'PACKING_LIST', name: 'Packing List', required: true, received: false },
  { type: 'BILL_OF_LADING', name: 'Bill of Lading (B/L)', required: true, received: false },
  { type: 'CERTIFICATE_OF_ORIGIN', name: 'Certificate of Origin (COO)', required: true, received: false },
  { type: 'CERTIFICATE_OF_ANALYSIS', name: 'Certificate of Analysis (COA)', required: true, received: false },
  { type: 'INSURANCE_CERT', name: 'Insurance Certificate', required: false, received: false },
  { type: 'PHYTO_CERT', name: 'Phytosanitary Certificate', required: false, received: false },
  { type: 'MSDS', name: 'Material Safety Data Sheet', required: false, received: false },
];

export default ImportWindowPage;
