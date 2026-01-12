import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  ClipboardCheck, CheckCircle, XCircle, FileText, Package, 
  RefreshCw, Scale, ArrowDownToLine, ArrowUpFromLine, Eye,
  FileCheck, AlertTriangle, Truck, Download
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const QCInspectionPage = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [inspections, setInspections] = useState([]);
  const [completedInspections, setCompletedInspections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pendingRes, completedRes] = await Promise.all([
        api.get('/qc/inspections', { params: { status: 'PENDING' } }),
        api.get('/qc/inspections')
      ]);
      setInspections(pendingRes.data || []);
      setCompletedInspections(completedRes.data?.filter(i => i.status !== 'PENDING') || []);
    } catch (error) {
      toast.error('Failed to load inspections');
    } finally {
      setLoading(false);
    }
  };

  const openInspectionModal = (inspection) => {
    setSelectedInspection(inspection);
    setShowInspectionModal(true);
  };

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="qc-inspection-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="w-8 h-8 text-blue-500" />
          QC Inspection
        </h1>
        <p className="text-muted-foreground mt-1">
          Quality control inspections, COA generation, and document management
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Pending Inspections</p>
          <p className="text-2xl font-bold text-amber-400">{inspections.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Passed Today</p>
          <p className="text-2xl font-bold text-green-400">
            {completedInspections.filter(i => i.status === 'PASSED').length}
          </p>
        </div>
        <div className="glass p-4 rounded-lg border border-red-500/30">
          <p className="text-sm text-muted-foreground">Failed</p>
          <p className="text-2xl font-bold text-red-400">
            {completedInspections.filter(i => i.status === 'FAILED').length}
          </p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">COAs Generated</p>
          <p className="text-2xl font-bold text-purple-400">
            {completedInspections.filter(i => i.coa_generated).length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'pending' ? 'default' : 'outline'}
          onClick={() => setActiveTab('pending')}
          className={inspections.length > 0 ? 'border-amber-500/50' : ''}
          data-testid="tab-pending"
        >
          <AlertTriangle className="w-4 h-4 mr-2" />
          Pending Inspection
          {inspections.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">
              {inspections.length}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'completed' ? 'default' : 'outline'}
          onClick={() => setActiveTab('completed')}
          data-testid="tab-completed"
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Completed
        </Button>
        <Button
          variant={activeTab === 'coa' ? 'default' : 'outline'}
          onClick={() => setActiveTab('coa')}
          data-testid="tab-coa"
        >
          <FileText className="w-4 h-4 mr-2" />
          COA Management
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {activeTab === 'pending' && (
            <PendingInspectionsTab
              inspections={inspections}
              onOpenInspection={openInspectionModal}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'completed' && (
            <CompletedInspectionsTab
              inspections={completedInspections}
              onOpenInspection={openInspectionModal}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'coa' && (
            <COAManagementTab
              inspections={completedInspections.filter(i => i.status === 'PASSED')}
              onRefresh={loadData}
            />
          )}
        </>
      )}

      {/* Inspection Modal */}
      {showInspectionModal && selectedInspection && (
        <InspectionModal
          inspection={selectedInspection}
          onClose={() => {
            setShowInspectionModal(false);
            setSelectedInspection(null);
          }}
          onComplete={() => {
            setShowInspectionModal(false);
            setSelectedInspection(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== PENDING INSPECTIONS TAB ====================
const PendingInspectionsTab = ({ inspections, onOpenInspection, onRefresh }) => {
  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Pending QC Inspections</h2>
          <p className="text-sm text-muted-foreground">
            Inspect materials from security checks
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {inspections.length === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-green-400 font-medium">All inspections complete</p>
          <p className="text-sm text-muted-foreground">No pending QC tasks</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">QC #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Net Weight</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((inspection) => (
                <tr key={inspection.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{inspection.qc_number}</td>
                  <td className="p-3">
                    <Badge className={inspection.ref_type === 'INWARD' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}>
                      {inspection.ref_type === 'INWARD' ? (
                        <ArrowDownToLine className="w-3 h-3 mr-1" />
                      ) : (
                        <ArrowUpFromLine className="w-3 h-3 mr-1" />
                      )}
                      {inspection.ref_type}
                    </Badge>
                  </td>
                  <td className="p-3">{inspection.ref_number || '-'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm">{inspection.product_name || '-'}</span>
                    </div>
                  </td>
                  <td className="p-3 font-medium">
                    {inspection.net_weight?.toFixed(2) || '-'} KG
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(inspection.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <Button size="sm" onClick={() => onOpenInspection(inspection)}>
                      <Eye className="w-4 h-4 mr-1" />
                      Inspect
                    </Button>
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

// ==================== COMPLETED INSPECTIONS TAB ====================
const CompletedInspectionsTab = ({ inspections, onOpenInspection, onRefresh }) => {
  const statusColor = {
    PASSED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-400'
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Completed Inspections</h2>
      </div>

      {inspections.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No completed inspections</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">QC #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">COA</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Completed</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((inspection) => (
                <tr key={inspection.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{inspection.qc_number}</td>
                  <td className="p-3">
                    <Badge className={inspection.ref_type === 'INWARD' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}>
                      {inspection.ref_type}
                    </Badge>
                  </td>
                  <td className="p-3">{inspection.ref_number || '-'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm">{inspection.product_name || '-'}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge className={statusColor[inspection.status]}>
                      {inspection.status === 'PASSED' ? (
                        <CheckCircle className="w-3 h-3 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      {inspection.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {inspection.coa_generated ? (
                      <Badge className="bg-purple-500/20 text-purple-400">
                        {inspection.coa_number}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {inspection.completed_at ? new Date(inspection.completed_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="ghost" onClick={() => onOpenInspection(inspection)}>
                      <Eye className="w-4 h-4" />
                    </Button>
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

// ==================== COA MANAGEMENT TAB ====================
const COAManagementTab = ({ inspections, onRefresh }) => {
  const generateCOA = async (inspectionId) => {
    try {
      const res = await api.post(`/qc/inspections/${inspectionId}/generate-coa`);
      toast.success(`COA ${res.data.coa_number} generated`);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate COA');
    }
  };

  // Filter to show only outward inspections (COA is for dispatch)
  const outwardInspections = inspections.filter(i => i.ref_type === 'OUTWARD');

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" />
            Certificate of Analysis (COA)
          </h2>
          <p className="text-sm text-muted-foreground">
            Generate COAs for outward shipments after QC pass
          </p>
        </div>
      </div>

      {outwardInspections.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No passed outward inspections</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">QC #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Net Weight</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">COA Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {outwardInspections.map((inspection) => (
                <tr key={inspection.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{inspection.qc_number}</td>
                  <td className="p-3">{inspection.ref_number || '-'}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm">{inspection.product_name || '-'}</span>
                    </div>
                  </td>
                  <td className="p-3">{inspection.net_weight?.toFixed(2) || '-'} KG</td>
                  <td className="p-3">
                    {inspection.coa_generated ? (
                      <Badge className="bg-green-500/20 text-green-400">
                        <FileCheck className="w-3 h-3 mr-1" />
                        {inspection.coa_number}
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500/20 text-gray-400">Not Generated</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {inspection.coa_generated ? (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          const token = localStorage.getItem('erp_token');
                          const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                          window.open(`${backendUrl}/api/pdf/coa/${inspection.id}?token=${token}`, '_blank');
                        }}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => generateCOA(inspection.id)}>
                        <FileText className="w-4 h-4 mr-1" />
                        Generate COA
                      </Button>
                    )}
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

// ==================== INSPECTION MODAL ====================
const InspectionModal = ({ inspection, onClose, onComplete }) => {
  const [form, setForm] = useState({
    batch_number: inspection.batch_number || '',
    test_results: inspection.test_results || {},
    specifications: inspection.specifications || {},
    inspector_notes: inspection.inspector_notes || ''
  });
  const [saving, setSaving] = useState(false);

  // Standard QC tests for manufacturing
  const standardTests = [
    { key: 'appearance', label: 'Appearance', type: 'text' },
    { key: 'color', label: 'Color', type: 'select', options: ['Pass', 'Fail', 'N/A'] },
    { key: 'moisture', label: 'Moisture Content (%)', type: 'number' },
    { key: 'ph', label: 'pH Level', type: 'number' },
    { key: 'density', label: 'Density (g/cm³)', type: 'number' },
    { key: 'purity', label: 'Purity (%)', type: 'number' },
    { key: 'viscosity', label: 'Viscosity (cP)', type: 'number' }
  ];

  const handleTestChange = (key, value) => {
    setForm(prev => ({
      ...prev,
      test_results: {
        ...prev.test_results,
        [key]: value
      }
    }));
  };

  const handlePass = async () => {
    setSaving(true);
    try {
      // Update inspection first
      await api.put(`/qc/inspections/${inspection.id}`, {
        ...form,
        status: 'IN_PROGRESS'
      });
      
      // Then pass it
      const res = await api.put(`/qc/inspections/${inspection.id}/pass`);
      toast.success(res.data.message);
      onComplete();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to pass inspection');
    } finally {
      setSaving(false);
    }
  };

  const handleFail = async () => {
    setSaving(true);
    try {
      await api.put(`/qc/inspections/${inspection.id}/fail`, null, {
        params: { reason: form.inspector_notes }
      });
      toast.success('Inspection failed. Material on hold.');
      onComplete();
    } catch (error) {
      toast.error('Failed to update inspection');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-500" />
            QC Inspection: {inspection.qc_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Info */}
          <div className="grid grid-cols-2 gap-4 p-3 rounded bg-muted/20 text-sm">
            <div>
              <span className="text-muted-foreground">Type:</span>
              <p className="font-medium flex items-center gap-1">
                {inspection.ref_type === 'INWARD' ? (
                  <ArrowDownToLine className="w-4 h-4 text-blue-400" />
                ) : (
                  <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
                )}
                {inspection.ref_type}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Reference:</span>
              <p className="font-medium">{inspection.ref_number}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Product:</span>
              <p className="font-medium flex items-center gap-1">
                <Package className="w-4 h-4 text-muted-foreground" />
                {inspection.product_name || '-'}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Net Weight:</span>
              <p className="font-medium">{inspection.net_weight?.toFixed(2) || '-'} KG</p>
            </div>
          </div>

          {/* Batch Number */}
          <div>
            <Label>Batch Number</Label>
            <Input
              value={form.batch_number}
              onChange={(e) => setForm({...form, batch_number: e.target.value})}
              placeholder="Enter batch/lot number"
            />
          </div>

          {/* Test Results */}
          <div className="space-y-4">
            <h3 className="font-semibold">Quality Tests</h3>
            <div className="grid grid-cols-2 gap-4">
              {standardTests.map((test) => (
                <div key={test.key}>
                  <Label>{test.label}</Label>
                  {test.type === 'select' ? (
                    <Select
                      value={form.test_results[test.key] || ''}
                      onValueChange={(v) => handleTestChange(test.key, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {test.options.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : test.type === 'number' ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={form.test_results[test.key] || ''}
                      onChange={(e) => handleTestChange(test.key, e.target.value)}
                      placeholder="0.00"
                    />
                  ) : (
                    <Input
                      value={form.test_results[test.key] || ''}
                      onChange={(e) => handleTestChange(test.key, e.target.value)}
                      placeholder={`Enter ${test.label.toLowerCase()}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Inspector Notes</Label>
            <Input
              value={form.inspector_notes}
              onChange={(e) => setForm({...form, inspector_notes: e.target.value})}
              placeholder="Observations, deviations, remarks..."
            />
          </div>

          {/* Info Banner */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm">
            <p className="text-blue-400">
              <strong>{inspection.ref_type === 'INWARD' ? 'Inward Flow:' : 'Outward Flow:'}</strong>{' '}
              {inspection.ref_type === 'INWARD' 
                ? 'On PASS → GRN created → Stock updated → Payables notified'
                : 'On PASS → Delivery Order generated → Receivables notified (Tax Invoice/Commercial Invoice)'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleFail}
              disabled={saving}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Fail Inspection
            </Button>
            <Button 
              onClick={handlePass}
              disabled={saving}
              className="bg-green-500 hover:bg-green-600"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Pass Inspection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QCInspectionPage;
