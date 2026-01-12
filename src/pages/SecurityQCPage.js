import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { 
  Shield, ArrowDownToLine, ArrowUpFromLine, Scale, Check, X, 
  AlertTriangle, ClipboardCheck, FileCheck, Truck, Package,
  RefreshCw, Eye, FileText
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const SecurityQCPage = () => {
  const [activeTab, setActiveTab] = useState('inward');
  const [inwardTransports, setInwardTransports] = useState([]);
  const [outwardTransports, setOutwardTransports] = useState([]);
  const [pendingChecklists, setPendingChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(null);
  const [checklistType, setChecklistType] = useState('INWARD');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inwardRes, outwardRes, dashboardRes] = await Promise.all([
        api.get('/security/inward'),
        api.get('/security/outward'),
        api.get('/security/dashboard')
      ]);
      setInwardTransports(inwardRes.data || []);
      setOutwardTransports(outwardRes.data || []);
      setPendingChecklists(dashboardRes.data?.checklists || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const openChecklistModal = (transport, type) => {
    setSelectedTransport(transport);
    setChecklistType(type);
    setShowChecklistModal(true);
  };

  // Stats
  const inwardPending = inwardTransports.filter(t => !t.security_checklist || t.security_checklist?.status !== 'COMPLETED').length;
  const outwardPending = outwardTransports.filter(t => !t.security_checklist || t.security_checklist?.status !== 'COMPLETED').length;

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="security-qc-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-8 h-8 text-emerald-500" />
          Security & QC Module
        </h1>
        <p className="text-muted-foreground mt-1">
          Cargo checklist, weighment, and QC inspection workflow
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-blue-500/30">
          <p className="text-sm text-muted-foreground">Inward Pending Check</p>
          <p className="text-2xl font-bold text-blue-400">{inwardPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-amber-500/30">
          <p className="text-sm text-muted-foreground">Outward Pending Check</p>
          <p className="text-2xl font-bold text-amber-400">{outwardPending}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-purple-500/30">
          <p className="text-sm text-muted-foreground">In Progress Checklists</p>
          <p className="text-2xl font-bold text-purple-400">{pendingChecklists.length}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Total Active</p>
          <p className="text-2xl font-bold text-green-400">
            {inwardTransports.length + outwardTransports.length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={activeTab === 'inward' ? 'default' : 'outline'}
          onClick={() => setActiveTab('inward')}
          className={inwardPending > 0 ? 'border-blue-500/50' : ''}
          data-testid="tab-inward"
        >
          <ArrowDownToLine className="w-4 h-4 mr-2" />
          Inward Transport
          {inwardPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">
              {inwardPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'outward' ? 'default' : 'outline'}
          onClick={() => setActiveTab('outward')}
          className={outwardPending > 0 ? 'border-amber-500/50' : ''}
          data-testid="tab-outward"
        >
          <ArrowUpFromLine className="w-4 h-4 mr-2" />
          Outward Transport
          {outwardPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-400">
              {outwardPending}
            </span>
          )}
        </Button>
        <Button
          variant={activeTab === 'rfq' ? 'default' : 'outline'}
          onClick={() => setActiveTab('rfq')}
          data-testid="tab-rfq"
        >
          <FileText className="w-4 h-4 mr-2" />
          RFQ Window
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Inward Transport Tab */}
          {activeTab === 'inward' && (
            <InwardTransportTab
              transports={inwardTransports}
              onOpenChecklist={(t) => openChecklistModal(t, 'INWARD')}
              onRefresh={loadData}
            />
          )}

          {/* Outward Transport Tab */}
          {activeTab === 'outward' && (
            <OutwardTransportTab
              transports={outwardTransports}
              onOpenChecklist={(t) => openChecklistModal(t, 'OUTWARD')}
              onRefresh={loadData}
            />
          )}

          {/* RFQ Window Tab */}
          {activeTab === 'rfq' && (
            <RFQWindowTab />
          )}
        </>
      )}

      {/* Checklist Modal */}
      {showChecklistModal && selectedTransport && (
        <SecurityChecklistModal
          transport={selectedTransport}
          checklistType={checklistType}
          onClose={() => {
            setShowChecklistModal(false);
            setSelectedTransport(null);
          }}
          onComplete={() => {
            setShowChecklistModal(false);
            setSelectedTransport(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== INWARD TRANSPORT TAB ====================
const InwardTransportTab = ({ transports, onOpenChecklist, onRefresh }) => {
  return (
    <div className="space-y-4">
      <div className="glass rounded-lg border border-border">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ArrowDownToLine className="w-5 h-5 text-blue-400" />
              Inward Cargo - Security Check
            </h2>
            <p className="text-sm text-muted-foreground">
              Checklist + Weighment → QC Inspection → GRN → Stock Update → Notify Payables
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
            <p className="text-muted-foreground">No inward transports pending</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO / Ref</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Incoterm</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Security Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transports.map((transport) => {
                  const checklist = transport.security_checklist;
                  const hasChecklist = !!checklist;
                  const isComplete = checklist?.status === 'COMPLETED';
                  
                  return (
                    <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-3 font-mono font-medium">{transport.transport_number}</td>
                      <td className="p-3 text-blue-400">{transport.po_number || '-'}</td>
                      <td className="p-3">{transport.supplier_name || '-'}</td>
                      <td className="p-3">
                        <Badge className="bg-cyan-500/20 text-cyan-400">
                          {transport.incoterm || 'EXW'}
                        </Badge>
                      </td>
                      <td className="p-3">{transport.vehicle_number || '-'}</td>
                      <td className="p-3">
                        {isComplete ? (
                          <Badge className="bg-green-500/20 text-green-400">
                            <Check className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        ) : hasChecklist ? (
                          <Badge className="bg-amber-500/20 text-amber-400">
                            <Scale className="w-3 h-3 mr-1" />
                            In Progress
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-500/20 text-gray-400">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Button 
                          size="sm" 
                          onClick={() => onOpenChecklist(transport)}
                          disabled={isComplete}
                          className={isComplete ? 'opacity-50' : ''}
                        >
                          <ClipboardCheck className="w-4 h-4 mr-1" />
                          {hasChecklist ? 'Continue' : 'Start'} Check
                        </Button>
                      </td>
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

// ==================== OUTWARD TRANSPORT TAB ====================
const OutwardTransportTab = ({ transports, onOpenChecklist, onRefresh }) => {
  return (
    <div className="space-y-4">
      <div className="glass rounded-lg border border-border">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ArrowUpFromLine className="w-5 h-5 text-amber-400" />
              Outward Dispatch - Security Check
            </h2>
            <p className="text-sm text-muted-foreground">
              Checklist + Weighment → QC Inspection → Delivery Order → Notify Receivables (Invoice)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {transports.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No outward transports pending</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job / DO</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Container #</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Security Status</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transports.map((transport) => {
                  const checklist = transport.security_checklist;
                  const hasChecklist = !!checklist;
                  const isComplete = checklist?.status === 'COMPLETED';
                  
                  return (
                    <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="p-3 font-mono font-medium">{transport.transport_number}</td>
                      <td className="p-3 text-amber-400">
                        {transport.job_numbers?.join(', ') || transport.do_number || '-'}
                      </td>
                      <td className="p-3">{transport.customer_name || '-'}</td>
                      <td className="p-3">
                        <Badge className={transport.transport_type === 'CONTAINER' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}>
                          {transport.transport_type || 'LOCAL'}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-sm">{transport.container_number || '-'}</td>
                      <td className="p-3">
                        {isComplete ? (
                          <Badge className="bg-green-500/20 text-green-400">
                            <Check className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        ) : hasChecklist ? (
                          <Badge className="bg-amber-500/20 text-amber-400">
                            <Scale className="w-3 h-3 mr-1" />
                            In Progress
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-500/20 text-gray-400">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <Button 
                          size="sm" 
                          onClick={() => onOpenChecklist(transport)}
                          disabled={isComplete}
                          className={isComplete ? 'opacity-50' : ''}
                        >
                          <ClipboardCheck className="w-4 h-4 mr-1" />
                          {hasChecklist ? 'Continue' : 'Start'} Check
                        </Button>
                      </td>
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

// ==================== RFQ WINDOW TAB ====================
const RFQWindowTab = () => {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRFQs();
  }, []);

  const loadRFQs = async () => {
    try {
      const res = await api.get('/rfq');
      setRfqs(res.data || []);
    } catch (error) {
      console.error('Failed to load RFQs:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = {
    DRAFT: 'bg-gray-500/20 text-gray-400',
    SENT: 'bg-blue-500/20 text-blue-400',
    QUOTED: 'bg-green-500/20 text-green-400',
    CONVERTED: 'bg-emerald-500/20 text-emerald-400'
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          RFQ Status Window
        </h2>
        <p className="text-sm text-muted-foreground">
          View all Request for Quotations and their status
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </div>
      ) : rfqs.length === 0 ? (
        <div className="p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No RFQs found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">RFQ Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {rfqs.map((rfq) => (
                <tr key={rfq.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3 font-mono font-medium">{rfq.rfq_number}</td>
                  <td className="p-3">{rfq.supplier_name || '-'}</td>
                  <td className="p-3">
                    <Badge className={rfq.rfq_type === 'PACKAGING' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}>
                      {rfq.rfq_type || 'PRODUCT'}
                    </Badge>
                  </td>
                  <td className="p-3 text-green-400 font-medium">
                    {rfq.total_amount > 0 ? `${rfq.currency || 'USD'} ${rfq.total_amount?.toFixed(2)}` : '-'}
                  </td>
                  <td className="p-3">
                    <Badge className={statusColor[rfq.status] || statusColor.DRAFT}>
                      {rfq.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(rfq.created_at).toLocaleDateString()}
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

// ==================== SECURITY CHECKLIST MODAL ====================
const SecurityChecklistModal = ({ transport, checklistType, onClose, onComplete }) => {
  const [checklist, setChecklist] = useState(transport.security_checklist || null);
  const [form, setForm] = useState({
    vehicle_number: transport.vehicle_number || '',
    driver_name: '',
    driver_license: '',
    seal_number: '',
    gross_weight: '',
    tare_weight: '',
    container_number: transport.container_number || '',
    checklist_items: {
      vehicle_inspected: false,
      driver_verified: false,
      seal_checked: false,
      documents_verified: false,
      weight_recorded: false
    },
    notes: ''
  });
  const [saving, setSaving] = useState(false);

  // Calculate net weight
  const netWeight = form.gross_weight && form.tare_weight 
    ? (parseFloat(form.gross_weight) - parseFloat(form.tare_weight)).toFixed(2)
    : '';

  // Check if all items are complete
  const allItemsChecked = Object.values(form.checklist_items).every(v => v);
  const hasWeighment = form.gross_weight && form.tare_weight && netWeight;

  useEffect(() => {
    if (checklist) {
      setForm({
        vehicle_number: checklist.vehicle_number || form.vehicle_number,
        driver_name: checklist.driver_name || '',
        driver_license: checklist.driver_license || '',
        seal_number: checklist.seal_number || '',
        gross_weight: checklist.gross_weight || '',
        tare_weight: checklist.tare_weight || '',
        container_number: checklist.container_number || form.container_number,
        checklist_items: checklist.checklist_items || form.checklist_items,
        notes: checklist.notes || ''
      });
    }
  }, [checklist]);

  const handleStartChecklist = async () => {
    setSaving(true);
    try {
      const res = await api.post('/security/checklists', {
        ref_type: checklistType,
        ref_id: transport.id,
        ref_number: transport.transport_number || transport.po_number || '-',
        checklist_type: checklistType,
        vehicle_number: form.vehicle_number
      });
      setChecklist(res.data);
      toast.success('Checklist started');
    } catch (error) {
      toast.error('Failed to start checklist');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!checklist) return;
    setSaving(true);
    try {
      await api.put(`/security/checklists/${checklist.id}`, {
        ...form,
        gross_weight: form.gross_weight ? parseFloat(form.gross_weight) : null,
        tare_weight: form.tare_weight ? parseFloat(form.tare_weight) : null
      });
      toast.success('Checklist saved');
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!checklist) return;
    if (!hasWeighment) {
      toast.error('Please record weighment before completing');
      return;
    }
    
    setSaving(true);
    try {
      // Save first
      await api.put(`/security/checklists/${checklist.id}`, {
        ...form,
        gross_weight: parseFloat(form.gross_weight),
        tare_weight: parseFloat(form.tare_weight)
      });
      
      // Then complete
      const res = await api.put(`/security/checklists/${checklist.id}/complete`);
      toast.success(res.data.message);
      onComplete();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to complete');
    } finally {
      setSaving(false);
    }
  };

  const toggleChecklistItem = (key) => {
    setForm(prev => ({
      ...prev,
      checklist_items: {
        ...prev.checklist_items,
        [key]: !prev.checklist_items[key]
      }
    }));
  };

  const checklistLabels = {
    vehicle_inspected: 'Vehicle Inspected',
    driver_verified: 'Driver ID Verified',
    seal_checked: 'Seal Number Checked',
    documents_verified: 'Documents Verified',
    weight_recorded: 'Weight Recorded'
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-500" />
            Security Checklist - {checklistType === 'INWARD' ? 'Inward Cargo' : 'Outward Dispatch'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transport Info */}
          <div className="p-3 rounded bg-muted/20 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-muted-foreground">Transport:</span>
                <p className="font-mono font-medium">{transport.transport_number}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Reference:</span>
                <p className="font-medium">{transport.po_number || transport.job_numbers?.join(', ') || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{checklistType === 'INWARD' ? 'Supplier' : 'Customer'}:</span>
                <p className="font-medium">{transport.supplier_name || transport.customer_name || '-'}</p>
              </div>
            </div>
          </div>

          {!checklist ? (
            <div className="text-center py-8">
              <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No checklist started for this transport</p>
              <Button onClick={handleStartChecklist} disabled={saving}>
                Start Security Checklist
              </Button>
            </div>
          ) : (
            <>
              {/* Vehicle & Driver Info */}
              <div className="space-y-4">
                <h3 className="font-semibold">Vehicle & Driver Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Vehicle Number</Label>
                    <Input
                      value={form.vehicle_number}
                      onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
                      placeholder="Vehicle plate number"
                    />
                  </div>
                  <div>
                    <Label>Container Number (if applicable)</Label>
                    <Input
                      value={form.container_number}
                      onChange={(e) => setForm({...form, container_number: e.target.value})}
                      placeholder="Container number"
                    />
                  </div>
                  <div>
                    <Label>Driver Name</Label>
                    <Input
                      value={form.driver_name}
                      onChange={(e) => setForm({...form, driver_name: e.target.value})}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <Label>Driver License</Label>
                    <Input
                      value={form.driver_license}
                      onChange={(e) => setForm({...form, driver_license: e.target.value})}
                      placeholder="License number"
                    />
                  </div>
                  <div>
                    <Label>Seal Number</Label>
                    <Input
                      value={form.seal_number}
                      onChange={(e) => setForm({...form, seal_number: e.target.value})}
                      placeholder="Container seal #"
                    />
                  </div>
                </div>
              </div>

              {/* Weighment */}
              <div className="space-y-4 p-4 border border-emerald-500/30 rounded-lg bg-emerald-500/5">
                <h3 className="font-semibold flex items-center gap-2">
                  <Scale className="w-4 h-4 text-emerald-400" />
                  Weighment Entry
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Gross Weight (KG)</Label>
                    <Input
                      type="number"
                      value={form.gross_weight}
                      onChange={(e) => setForm({...form, gross_weight: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Tare Weight (KG)</Label>
                    <Input
                      type="number"
                      value={form.tare_weight}
                      onChange={(e) => setForm({...form, tare_weight: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label>Net Weight (KG)</Label>
                    <div className="p-2 bg-background border rounded text-lg font-bold text-emerald-400">
                      {netWeight || '0.00'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Checklist Items */}
              <div className="space-y-3">
                <h3 className="font-semibold">Checklist Items</h3>
                <div className="space-y-2">
                  {Object.entries(form.checklist_items).map(([key, checked]) => (
                    <label 
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded border cursor-pointer ${
                        checked ? 'bg-green-500/10 border-green-500/30' : 'bg-muted/10 border-border'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleChecklistItem(key)}
                      />
                      <span className={checked ? 'text-green-400' : ''}>
                        {checklistLabels[key]}
                      </span>
                      {checked && <Check className="w-4 h-4 text-green-400 ml-auto" />}
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({...form, notes: e.target.value})}
                  placeholder="Additional observations..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-4 border-t">
                <div>
                  {!hasWeighment && (
                    <p className="text-sm text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Record weighment to complete
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button variant="outline" onClick={handleSave} disabled={saving}>
                    Save Draft
                  </Button>
                  <Button 
                    onClick={handleComplete} 
                    disabled={saving || !hasWeighment}
                    className="bg-emerald-500 hover:bg-emerald-600"
                  >
                    <FileCheck className="w-4 h-4 mr-2" />
                    Complete & Send to QC
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SecurityQCPage;
