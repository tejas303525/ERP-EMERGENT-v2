import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Card, CardContent } from '../components/ui/card';
import { 
  Shield, ArrowDownToLine, ArrowUpFromLine, Scale, Check, X, 
  AlertTriangle, ClipboardCheck, FileCheck, Truck, Package,
  RefreshCw, Eye, FileText, Download, Bell, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import api, { pdfAPI } from '../lib/api';

const SecurityQCPage = () => {
  const [inwardTransports, setInwardTransports] = useState([]);
  const [outwardTransports, setOutwardTransports] = useState([]);
  const [pendingChecklists, setPendingChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(null);
  const [checklistType, setChecklistType] = useState('INWARD');
  const [dismissedNotifications, setDismissedNotifications] = useState(new Set());
  const [vehicleBookingNotifications, setVehicleBookingNotifications] = useState([]);
  const [qcInspections, setQcInspections] = useState([]);
  const [allTransports, setAllTransports] = useState([]); // Store all transports including completed
  const [showQCModal, setShowQCModal] = useState(false);
  const [selectedQCInspection, setSelectedQCInspection] = useState(null);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [dischargeData, setDischargeData] = useState(null);
  
  // Outward transport modals
  const [showVehicleArrivalModal, setShowVehicleArrivalModal] = useState(false);
  const [showLoadingQCModal, setShowLoadingQCModal] = useState(false);
  const [showDOModal, setShowDOModal] = useState(false);
  const [arrivalData, setArrivalData] = useState(null);

  useEffect(() => {
    setDismissedNotifications(new Set());
    loadData();
    loadVehicleBookingNotifications();
  }, []);

  const loadVehicleBookingNotifications = () => {
    // Check localStorage for vehicle booking notifications
    const notifications = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('security-vehicle-booked-')) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          notifications.push({
            key,
            ...data
          });
        } catch (e) {
          // Invalid JSON, remove it
          localStorage.removeItem(key);
        }
      }
    }
    setVehicleBookingNotifications(notifications);
  };

 
  const dismissVehicleNotification = (key) => {
    // Remove from localStorage
    localStorage.removeItem(key);
    // Remove from state
    setVehicleBookingNotifications(prev => prev.filter(n => n.key !== key));
    // Also mark as dismissed to prevent re-showing
    setDismissedNotifications(prev => new Set([...prev, key]));
  };

  // Helper function to get the correct URL for a delivery document
  const getDeliveryDocumentUrl = async (doc, deliveryNoteNumber = null) => {
    if (!doc) return null;
    if (doc.startsWith('http')) {
      return doc;
    }

    const token = localStorage.getItem('erp_token');
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

    // If we have a delivery note number (DO number), try to find the DO and use PDF generation
    if (deliveryNoteNumber) {
      try {
        const response = await api.get('/delivery-orders');
        const deliveryOrders = response.data || [];
        const deliveryOrder = deliveryOrders.find(item => item.do_number === deliveryNoteNumber);

        if (deliveryOrder && deliveryOrder.id) {
          // Use PDF generation endpoint for DOs
          return `${backendUrl}/api/pdf/delivery-note/${deliveryOrder.id}?token=${token}`;
        }
      } catch (error) {
        console.error('Failed to fetch delivery order:', error);
      }
    }

    // Check if this looks like a generated Delivery Note PDF filename pattern
    const deliveryNoteMatch = doc.match(/^DeliveryNote_(DO-\d+)\.pdf$/i);
    if (deliveryNoteMatch) {
      const doNumber = deliveryNoteMatch[1];
      try {
        const response = await api.get('/delivery-orders');
        const deliveryOrders = response.data || [];
        const deliveryOrder = deliveryOrders.find(item => item.do_number === doNumber);

        if (deliveryOrder && deliveryOrder.id) {
          return `${backendUrl}/api/pdf/delivery-note/${deliveryOrder.id}?token=${token}`;
        }
      } catch (error) {
        console.error('Failed to fetch delivery order:', error);
      }
    }

    // Fallback to file endpoint (for uploaded PDFs with UUID names)
    return `${backendUrl}/api/files/${doc}?token=${token}`;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [inwardRes, outwardRes, dashboardRes, inspectionsRes] = await Promise.all([
        api.get('/security/inward'),
        api.get('/security/outward'),
        api.get('/security/dashboard'),
        api.get('/qc/inspections').catch(() => ({ data: [] })) // Load QC inspections
      ]);
      
      // Store all transports (including completed) for inspection status alerts
      const allInward = inwardRes.data || [];
      const allOutward = outwardRes.data || [];
      setAllTransports([...allInward, ...allOutward]);
      
      // Filter out completed security status items and sort chronologically by delivery date
      const inwardFiltered = allInward
        .filter(t => !t.security_checklist || t.security_checklist?.status !== 'COMPLETED')
        .sort((a, b) => {
          const dateA = new Date(a.eta || a.delivery_date || a.created_at || 0);
          const dateB = new Date(b.eta || b.delivery_date || b.created_at || 0);
          return dateA - dateB; // Ascending order (earliest first)
        });
      const outwardFiltered = allOutward
        .filter(t => !t.security_checklist || t.security_checklist?.status !== 'COMPLETED')
        .sort((a, b) => {
          const dateA = new Date(a.eta || a.delivery_date || a.created_at || 0);
          const dateB = new Date(b.eta || b.delivery_date || b.created_at || 0);
          return dateA - dateB; // Ascending order (earliest first)
        });
      setInwardTransports(inwardFiltered);
      setOutwardTransports(outwardFiltered);
      setPendingChecklists(dashboardRes.data?.checklists || []);
      setQcInspections(inspectionsRes.data || []); // Store inspections
      // Reload vehicle booking notifications when data refreshes
      loadVehicleBookingNotifications();
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
    // For inward transports, use the new discharge modal
    if (type === 'INWARD') {
      setShowDischargeModal(true);
    } else if (type === 'OUTWARD') {
      // For outward transports, use the vehicle arrival modal
      setShowVehicleArrivalModal(true);
    } else {
      setShowChecklistModal(true);
    }
  };

  const handleReportQC = (dischargeFormData) => {
    // Store discharge data and open QC modal
    setDischargeData(dischargeFormData);
    setShowQCModal(true);
    // Keep discharge modal open in background (it will close when QC is submitted)
  };

  // QC Inspection Handlers
  const handleStartQCInspection = async (transport, refType = 'INWARD') => {
    try {
      await api.post('/qc/inspections', {
        ref_type: refType,
        ref_id: transport.id,
        ref_number: transport.transport_number || transport.po_number || transport.job_number,
        product_name: transport.products_summary || transport.product_names?.join(', ') || transport.product_name,
        supplier: transport.supplier_name,
        vehicle_number: transport.vehicle_number,
        po_number: transport.po_number,
        quantity: transport.quantity || 0,
      });
      
      toast.success('QC Inspection started');
      loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to start QC inspection:', error);
      toast.error('Failed to start QC inspection');
    }
  };

  const handlePassQC = async (inspectionId) => {
    if (!window.confirm('Are you sure you want to pass this QC inspection? This will trigger GRN/DO creation.')) {
      return;
    }
    
    try {
      await api.put(`/qc/inspections/${inspectionId}/pass`);
      toast.success('QC Inspection passed! Next steps triggered.');
      loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to pass QC:', error);
      toast.error(error.response?.data?.detail || 'Failed to pass QC inspection');
    }
  };

  const handleFailQC = async (inspectionId) => {
    const reason = window.prompt('Enter reason for QC failure:');
    if (!reason) return;
    
    try {
      await api.put(`/qc/inspections/${inspectionId}/fail`, null, {
        params: { reason }
      });
      toast.error('QC Inspection failed. Material on hold.');
      loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to fail QC:', error);
      toast.error('Failed to update QC status');
    }
  };

  const handleGenerateCOA = async (inspectionId) => {
    try {
      const response = await api.post(`/qc/inspections/${inspectionId}/generate-coa`);
      toast.success(`COA generated: ${response.data.coa_number}`);
      loadData(); // Refresh data
    } catch (error) {
      console.error('Failed to generate COA:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate COA');
    }
  };

  const onViewQCInspection = (inspection) => {
    setSelectedQCInspection(inspection);
    setShowQCModal(true);
  };

  // Stats - transports are already filtered, so just count them
  const inwardPending = inwardTransports.length;
  const outwardPending = outwardTransports.length;

  // Filter notifications by dismissed status
  const activeNotifications = vehicleBookingNotifications.filter(
    n => !dismissedNotifications.has(n.key)
  );

  // Get all transports with completed security checklists that need inspection status display
  const inspectionStatusAlerts = useMemo(() => {
    const alerts = [];
    
    // Helper function to get inspection status
    const getInspectionStatus = (transport) => {
      if (!transport.security_checklist || transport.security_checklist.status !== 'COMPLETED') {
        return null;
      }
      
      // Find QC inspection for this transport
      const inspection = qcInspections.find(ins => 
        ins.ref_id === transport.id || 
        ins.transport_id === transport.id ||
        ins.ref_number === transport.transport_number
      );
      
      if (!inspection) {
        return { status: 'NOT_DONE', inspection: null };
      }
      
      return {
        status: inspection.status === 'PASSED' || inspection.status === 'FAILED' ? 'DONE' : 'IN_PROGRESS',
        inspection: inspection
      };
    };
    
    // Check all transports (including completed ones) for inspection status
    allTransports.forEach(transport => {
      const inspectionStatus = getInspectionStatus(transport);
      if (inspectionStatus && transport.security_checklist?.status === 'COMPLETED') {
        // Only show if inspection is done or not done (not in progress)
        if (inspectionStatus.status === 'DONE' || inspectionStatus.status === 'NOT_DONE') {
          alerts.push({
            transport,
            inspectionStatus
          });
        }
      }
    });
    
    return alerts;
  }, [allTransports, qcInspections]);

  // Auto-dismiss notifications after 2 seconds
  useEffect(() => {
    const timers = [];
    
    // Auto-dismiss vehicle booking notifications
    activeNotifications.forEach((notification) => {
      const timer = setTimeout(() => {
        dismissVehicleNotification(notification.key);
      }, 200);
      timers.push(timer);
    });
    
    // Auto-dismiss inspection alerts
    inspectionStatusAlerts.forEach((alert, idx) => {
      const alertKey = `inspection-${alert.transport.id}-${idx}`;
      if (!dismissedNotifications.has(alertKey)) {
        const timer = setTimeout(() => {
          setDismissedNotifications(prev => new Set([...prev, alertKey]));
        }, 2000);
        timers.push(timer);
      }
    });
    
    // Cleanup timers
    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [activeNotifications, inspectionStatusAlerts, dismissedNotifications]);

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="security-qc-page">
      {/* Vehicle Booking Notifications */}
      {activeNotifications.length > 0 && (
        <div className="mb-4 space-y-2">
          {activeNotifications.map((notification) => (
            <Card key={notification.key} className="bg-emerald-500/10 border-emerald-500/30 transition-opacity duration-300">
              <CardContent className="p-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 flex-1">
                    <Bell className="w-4 h-4 text-emerald-400 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className="text-xs font-semibold text-emerald-400">Vehicle Booked</p>
                        <Badge className="bg-emerald-500/20 text-emerald-400">
                          {notification.transport_number}
                        </Badge>
                        {notification.vehicle_number && (
                          <Badge variant="outline" className="text-xs">
                            Vehicle: {notification.vehicle_number}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {notification.transporter_name && (
                          <p>Transporter: {notification.transporter_name}</p>
                        )}
                        {notification.driver_name && (
                          <p>Driver: {notification.driver_name}</p>
                        )}
                        {notification.driver_contact && (
                          <p>Contact: {notification.driver_contact}</p>
                        )}
                        {notification.po_number && (
                          <p>PO: {notification.po_number}</p>
                        )}
                        {notification.import_number && (
                          <p>Import: {notification.import_number}</p>
                        )}
                        {notification.job_number && (
                          <p>Job Order: {notification.job_number}</p>
                        )}
                        {notification.supplier_name && (
                          <p>Supplier: {notification.supplier_name}</p>
                        )}
                        {notification.customer_name && (
                          <p>Customer: {notification.customer_name}</p>
                        )}
                        <p className="text-xs text-emerald-400 font-medium">
                          Transport is booked and vehicle is assigned - Ready for security check
                        </p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissVehicleNotification(notification.key)}
                    className="ml-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Inspection Status Alerts */}
      {/* {inspectionStatusAlerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {inspectionStatusAlerts.map((alert, idx) => {
            const { transport, inspectionStatus } = alert;
            const isDone = inspectionStatus.status === 'DONE';
            const jobNumber = transport.job_number || transport.job_numbers?.[0] || transport.do_number || transport.po_number || '-';
            const productName = transport.product_name || transport.products_summary || transport.product_names?.[0] || transport.po_items?.[0]?.display_name || transport.po_items?.[0]?.item_name || '-';
            const deliveryNote = transport.delivery_note_number || transport.delivery_order_number || '-';
            const alertKey = `inspection-${transport.id}-${idx}`;
            
            // Skip if dismissed
            if (dismissedNotifications.has(alertKey)) {
              return null;
            }
            
            return (
              <Card 
                key={alertKey} 
                className={`${isDone ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'} transition-opacity duration-300`}
              >
                <CardContent className="p-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2 flex-1">
                      {isDone ? (
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-1 mb-0.5">
                          <p className={`text-xs font-semibold ${isDone ? 'text-green-400' : 'text-amber-400'}`}>
                            QC Inspection Status
                          </p>
                          <Badge className={isDone ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}>
                            {inspectionStatus.status === 'DONE' ? 'Done' : inspectionStatus.status === 'IN_PROGRESS' ? 'In Progress' : 'Not Done'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5 grid grid-cols-2 gap-1">
                          <div>
                            <span className="text-muted-foreground">Job Order:</span>
                            <span className="ml-2 font-mono text-amber-400">{jobNumber}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Product:</span>
                            <span className="ml-2">{productName}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Delivery Note:</span>
                            <span className="ml-2 font-mono text-blue-400">{deliveryNote}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Inspection Status:</span>
                            <span className={`ml-2 font-medium ${isDone ? 'text-green-400' : 'text-amber-400'}`}>
                              {inspectionStatus.inspection?.status || 'Not Started'}
                            </span>
                          </div>
                        </div>
                        {inspectionStatus.inspection && (
                          <p className={`text-xs mt-1 font-medium ${isDone ? 'text-green-400' : 'text-amber-400'}`}>
                            {isDone 
                              ? `✓ Inspection ${inspectionStatus.inspection.status} - ${inspectionStatus.inspection.qc_number || ''}`
                              : '⚠ Inspection pending or in progress'}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDismissedNotifications(prev => new Set([...prev, alertKey]));
                      }}
                      className="ml-2"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )} */}

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="w-6 h-6 text-emerald-500" />
          Security & QC Module
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cargo checklist, weighment, and QC inspection workflow
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="glass p-3 rounded-lg border border-blue-500/30">
          <p className="text-xs text-muted-foreground">Inward Pending Check</p>
          <p className="text-xl font-bold text-blue-400">{inwardPending}</p>
        </div>
        <div className="glass p-3 rounded-lg border border-amber-500/30">
          <p className="text-xs text-muted-foreground">Outward Pending Check</p>
          <p className="text-xl font-bold text-amber-400">{outwardPending}</p>
        </div>
        <div className="glass p-3 rounded-lg border border-purple-500/30">
          <p className="text-xs text-muted-foreground">In Progress Checklists</p>
          <p className="text-xl font-bold text-purple-400">{pendingChecklists.length}</p>
        </div>
        <div className="glass p-3 rounded-lg border border-green-500/30">
          <p className="text-xs text-muted-foreground">Total Active</p>
          <p className="text-xl font-bold text-green-400">
            {inwardTransports.length + outwardTransports.length}
          </p>
        </div>
      </div>

      {/* Workflow Overview */}
      {/* <div className="mb-6 p-4 glass rounded-lg border border-purple-500/30">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-blue-400 font-medium">Inward:</span>
            <span className="text-muted-foreground"> Security + Weight → QC → GRN → Payables</span>
          </div>
          <div>
            <span className="text-amber-400 font-medium">Outward:</span>
            <span className="text-muted-foreground"> Security + Weight → QC → DO → Receivables</span>
          </div>
          <div>
            <span className="text-purple-400 font-medium">RFQ:</span>
            <span className="text-muted-foreground"> Monitor quotation requests to suppliers</span>
          </div>
        </div>
      </div> */}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* LEFT COLUMN - INWARD TRANSPORT */}
          <div className="glass rounded-lg border border-blue-500/30">
            <div className="p-3 border-b border-border bg-blue-500/10 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 text-blue-400" />
                    Inward Transport
                    {inwardPending > 0 && (
                      <Badge className="ml-2 bg-blue-500/20 text-blue-400 text-xs">
                        {inwardPending} Pending
                      </Badge>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Security → QC → GRN → Payables
                  </p>
                </div>
              </div>
            </div>
            <div className="p-3">
              <InwardTransportTab
                transports={inwardTransports}
                qcInspections={qcInspections}
                onOpenChecklist={(t) => openChecklistModal(t, 'INWARD')}
                onViewDetails={(t) => {
                  setSelectedTransport(t);
                  setChecklistType('INWARD');
                  setShowViewModal(true);
                }}
                onViewVehicle={(t) => {
                  setSelectedTransport(t);
                  setShowVehicleModal(true);
                }}
                onViewQCInspection={onViewQCInspection}
                onStartQC={(t) => handleStartQCInspection(t, 'INWARD')}
                onPassQC={handlePassQC}
                onFailQC={handleFailQC}
                onGenerateCOA={handleGenerateCOA}
                onRefresh={loadData}
                getDeliveryDocumentUrl={getDeliveryDocumentUrl}
              />
            </div>
          </div>

          {/* RIGHT COLUMN - OUTWARD TRANSPORT */}
          <div className="glass rounded-lg border border-amber-500/30">
            <div className="p-3 border-b border-border bg-amber-500/10 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
                    Outward Transport
                    {outwardPending > 0 && (
                      <Badge className="ml-2 bg-amber-500/20 text-amber-400 text-xs">
                        {outwardPending} Pending
                      </Badge>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Security → QC → Delivery Order → Receivables
                  </p>
                </div>
              </div>
            </div>
            <div className="p-3">
              <OutwardTransportTab
                transports={outwardTransports}
                qcInspections={qcInspections}
                onOpenChecklist={(t) => openChecklistModal(t, 'OUTWARD')}
                onViewDetails={(t) => {
                  setSelectedTransport(t);
                  // If approved, open DO modal, otherwise view details
                  if (t.security_checklist?.load_status === 'APPROVED') {
                    setShowDOModal(true);
                  } else {
                    setChecklistType('OUTWARD');
                    setShowViewModal(true);
                  }
                }}
                onViewQCInspection={onViewQCInspection}
                onStartQC={(t) => handleStartQCInspection(t, 'OUTWARD')}
                onPassQC={handlePassQC}
                onFailQC={handleFailQC}
                onGenerateCOA={handleGenerateCOA}
                onRefresh={loadData}
                getDeliveryDocumentUrl={getDeliveryDocumentUrl}
              />
            </div>
          </div>

          {/* THIRD COLUMN - RFQ WINDOW */}
          {/* <div className="glass rounded-lg border border-purple-500/30">
            <div className="p-4 border-b border-border bg-purple-500/10 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-400" />
                    RFQ Status
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Request for Quotations
                  </p>
                </div>
              </div>
            </div> */}
            {/* <div className="p-4">
              <RFQWindowTab />
            </div> */}
          {/* </div> */}
        </div>
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

      {/* Discharge Processing Modal */}
      {showDischargeModal && selectedTransport && (
        <DischargeProcessingModal
          transport={selectedTransport}
          onClose={() => {
            setShowDischargeModal(false);
            setSelectedTransport(null);
          }}
          onReportQC={handleReportQC}
        />
      )}

      {/* View Details Modal */}
      {showViewModal && selectedTransport && (
        <SecurityChecklistViewModal
          transport={selectedTransport}
          checklistType={checklistType}
          onClose={() => {
            setShowViewModal(false);
            setSelectedTransport(null);
          }}
        />
      )}

      {/* Vehicle Info Modal */}
      {showVehicleModal && selectedTransport && (
        <VehicleInfoModal
          transport={selectedTransport}
          onClose={() => {
            setShowVehicleModal(false);
            setSelectedTransport(null);
          }}
          getDeliveryDocumentUrl={getDeliveryDocumentUrl}
        />
      )}

      {/* QC Inspection Modal - New Flow */}
      {showQCModal && dischargeData && (
        <QCInspectionModal
          dischargeData={dischargeData}
          onClose={() => {
            setShowQCModal(false);
            setDischargeData(null);
          }}
          onComplete={() => {
            setShowQCModal(false);
            setShowDischargeModal(false);
            setDischargeData(null);
            setSelectedTransport(null);
            loadData();
          }}
        />
      )}

      {/* Outward Transport Modals */}
      {showVehicleArrivalModal && selectedTransport && (
        <VehicleArrivalModal
          transport={selectedTransport}
          onClose={() => {
            setShowVehicleArrivalModal(false);
            setSelectedTransport(null);
          }}
          onOpenLoadingQC={(data) => {
            setArrivalData(data);
            setShowVehicleArrivalModal(false);
            setShowLoadingQCModal(true);
          }}
        />
      )}

      {showLoadingQCModal && arrivalData && (
        <LoadingQCModal
          arrivalData={arrivalData}
          onClose={() => {
            setShowLoadingQCModal(false);
            setArrivalData(null);
          }}
          onComplete={() => {
            setShowLoadingQCModal(false);
            setArrivalData(null);
            setSelectedTransport(null);
            loadData();
          }}
        />
      )}

      {showDOModal && selectedTransport && (
        <DOIssuanceModal
          transport={selectedTransport}
          onClose={() => {
            setShowDOModal(false);
            setSelectedTransport(null);
          }}
          onComplete={() => {
            setShowDOModal(false);
            setSelectedTransport(null);
            loadData();
          }}
        />
      )}

      {/* QC Inspection Modal - View Only (Old Flow) */}
      {showQCModal && selectedQCInspection && !dischargeData && (
        <Dialog open={true} onOpenChange={() => setShowQCModal(false)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-blue-500" />
                QC Inspection - {selectedQCInspection.qc_number || selectedQCInspection.ref_number}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Reference</Label>
                  <p className="font-mono">{selectedQCInspection.ref_number}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Type</Label>
                  <Badge className={selectedQCInspection.ref_type === 'INWARD' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}>
                    {selectedQCInspection.ref_type}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Status</Label>
                  <Badge className={
                    selectedQCInspection.status === 'PASSED' ? 'bg-green-500/20 text-green-400' :
                    selectedQCInspection.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                    'bg-blue-500/20 text-blue-400'
                  }>
                    {selectedQCInspection.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Product</Label>
                  <p>{selectedQCInspection.product_name || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Supplier/Customer</Label>
                  <p>{selectedQCInspection.supplier || selectedQCInspection.customer || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Vehicle Number</Label>
                  <p className="font-mono">{selectedQCInspection.vehicle_number || '-'}</p>
                </div>
                {selectedQCInspection.batch_number && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Batch Number</Label>
                    <p className="font-mono">{selectedQCInspection.batch_number}</p>
                  </div>
                )}
                {selectedQCInspection.sampling_size && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Sampling Size</Label>
                    <p>{selectedQCInspection.sampling_size}</p>
                  </div>
                )}
                {selectedQCInspection.coa_number && (
                  <div>
                    <Label className="text-muted-foreground text-xs">COA Number</Label>
                    <p className="font-mono text-purple-400">{selectedQCInspection.coa_number}</p>
                  </div>
                )}
                {selectedQCInspection.quantity && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Quantity</Label>
                    <p>{selectedQCInspection.quantity}</p>
                  </div>
                )}
              </div>
              
              {selectedQCInspection.inspector_notes && (
                <div>
                  <Label className="text-muted-foreground text-xs">Inspector Notes</Label>
                  <p className="text-sm p-2 bg-muted/20 rounded">{selectedQCInspection.inspector_notes}</p>
                </div>
              )}
              
              {selectedQCInspection.test_results && (
                <div>
                  <Label className="text-muted-foreground text-xs">Test Results</Label>
                  <pre className="text-xs p-2 bg-muted/20 rounded overflow-auto max-h-60">
                    {JSON.stringify(selectedQCInspection.test_results, null, 2)}
                  </pre>
                </div>
              )}
              
              {selectedQCInspection.specifications && (
                <div>
                  <Label className="text-muted-foreground text-xs">Specifications</Label>
                  <pre className="text-xs p-2 bg-muted/20 rounded overflow-auto max-h-40">
                    {JSON.stringify(selectedQCInspection.specifications, null, 2)}
                  </pre>
                </div>
              )}
              
              {selectedQCInspection.items && selectedQCInspection.items.length > 0 && (
                <div>
                  <Label className="text-muted-foreground text-xs">Items</Label>
                  <div className="space-y-2 mt-2">
                    {selectedQCInspection.items.map((item, idx) => (
                      <div key={idx} className="p-2 bg-muted/20 rounded text-sm">
                        <p className="font-medium">{item.name || item.item_name}</p>
                        {item.quantity && <p className="text-xs text-muted-foreground">Quantity: {item.quantity}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// ==================== INWARD TRANSPORT TAB ====================
const InwardTransportTab = ({ transports, qcInspections, onOpenChecklist, onViewDetails, onViewVehicle, onViewQCInspection, onStartQC, onPassQC, onFailQC, onGenerateCOA, onRefresh, getDeliveryDocumentUrl }) => {
  return (
    <div className="space-y-3">
      <div className="glass rounded-lg border border-border">
        <div className="p-2 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-blue-400" />
              Inward Cargo - Security Check
            </h2>
          
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        </div>

        {transports.length === 0 ? (
          <div className="p-8 text-center">
            <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No inward transports pending</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[800px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Date/Time</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">PO#</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Product</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Delivery Note</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Transporter Details</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Discharge Status</th>
                </tr>
              </thead>
              <tbody>
                {transports.map((transport) => {
                  const checklist = transport.security_checklist;
                  const hasChecklist = !!checklist;
                  const isComplete = checklist?.status === 'COMPLETED';
                  
                  // QC Inspection data
                  const qcInspection = qcInspections?.find(ins => 
                    ins.ref_id === transport.id || 
                    ins.transport_id === transport.id ||
                    ins.ref_number === transport.transport_number
                  );
                  const qcStatus = qcInspection?.status || 'PENDING';
                  const qcPassed = qcInspection?.passed;
                  
                  // Determine discharge status
                  const hasDischargeData = checklist && checklist.arrival_time;
                  const arrivalQtyMatch = qcInspection && qcInspection.arrival_quantity && 
                    qcInspection.arrival_quantity >= (transport.quantity || 0);
                  
                  return (
                    <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                      {/* Date/Time Column */}
                      <td className="p-2">
                        {transport.delivery_date ? (
                          <div className="flex flex-col">
                            <span className="text-cyan-400 font-medium text-sm">
                              {new Date(transport.delivery_date).toLocaleDateString()}
                            </span>
                            {checklist?.arrival_time && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(checklist.arrival_time).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      {/* PO# Column */}
                      <td className="p-2 text-blue-400 text-sm font-mono">
                        {transport.po_number || transport.transport_number || '-'}
                      </td>
                      
                      {/* Product Column */}
                      <td className="p-2 text-sm max-w-[200px] truncate" title={transport.products_summary || transport.product_names?.join(', ') || transport.po_items?.map(i => i.display_name || i.item_name).join(', ') || '-'}>
                        {transport.products_summary || transport.product_names?.join(', ') || transport.po_items?.map(i => i.display_name || i.item_name).join(', ') || '-'}
                      </td>
                      
                      {/* Delivery Note Column */}
                      <td className="p-2">
                        {transport.delivery_note_document ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const doc = transport.delivery_note_document;
                              const doNumber = transport.delivery_note_number;
                              if (doc) {
                                const url = await getDeliveryDocumentUrl(doc, doNumber);
                                if (url) {
                                  window.open(url, '_blank');
                                } else {
                                  toast.error('Failed to load delivery note');
                                }
                              }
                            }}
                            title="View Delivery Note PDF"
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            View Note
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">No document</span>
                        )}
                      </td>
                      
                      {/* Transporter Details Column */}
                      <td className="p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onOpenChecklist(transport)}
                          className="bg-blue-500/10 hover:bg-blue-500/20"
                        >
                          <Truck className="w-3 h-3 mr-1" />
                          Process Arrival
                        </Button>
                      </td>
                      
                      {/* Discharge Status Column */}
                      <td className="p-2">
                        {qcPassed && qcInspection?.grn_created ? (
                          <div className="flex flex-col gap-1">
                            <Badge className="bg-green-500/20 text-green-400 text-xs">
                              <Check className="w-3 h-3 mr-1" />
                              GRN {qcInspection.grn_number || 'Created'}
                            </Badge>
                            {!arrivalQtyMatch && (
                              <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                                Partial Delivery
                              </Badge>
                            )}
                          </div>
                        ) : qcPassed ? (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">
                            <Check className="w-3 h-3 mr-1" />
                            QC Passed
                          </Badge>
                        ) : qcInspection?.status === 'IN_PROGRESS' ? (
                          <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                            <ClipboardCheck className="w-3 h-3 mr-1" />
                            QC In Progress
                          </Badge>
                        ) : qcInspection?.status === 'FAILED' ? (
                          <Badge className="bg-red-500/20 text-red-400 text-xs">
                            <X className="w-3 h-3 mr-1" />
                            QC Failed
                          </Badge>
                        ) : hasDischargeData ? (
                          <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                            QC Pending
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-500/20 text-gray-400 text-xs">
                            Awaiting Processing
                          </Badge>
                        )}
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
const OutwardTransportTab = ({ transports, qcInspections, onOpenChecklist, onViewDetails, onViewQCInspection, onStartQC, onPassQC, onFailQC, onGenerateCOA, onRefresh, getDeliveryDocumentUrl }) => {
  return (
    <div className="space-y-3">
      <div className="glass rounded-lg border border-border">
        <div className="p-2 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
              Outward Dispatch - Security Check
            </h2>
            <p className="text-xs text-muted-foreground">
              Checklist + Weighment → QC Inspection → Delivery Order → Notify Receivables (Invoice)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Refresh
          </Button>
        </div>

        {transports.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No outward transports pending</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Date/Time</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Job Order</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Plate/Container #</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Delivery Note</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Load</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Delivery Order</th>
                </tr>
              </thead>
              <tbody>
                {transports.map((transport) => {
                  const checklist = transport.security_checklist;
                  const hasChecklist = !!checklist;
                  const isComplete = checklist?.status === 'COMPLETED';
                  
                  // QC Inspection data
                  const qcInspection = qcInspections?.find(ins => 
                    ins.ref_id === transport.id || 
                    ins.transport_id === transport.id ||
                    ins.ref_number === transport.transport_number ||
                    ins.ref_number === transport.job_number
                  );
                  const qcStatus = qcInspection?.status || 'PENDING';
                  const qcPassed = qcInspection?.passed;
                  
                  const loadStatus = checklist?.load_status || 'ASSIGNED';
                  const doCreated = transport.do_created || transport.do_number;
                  
                  return (
                    <tr key={transport.id} className="border-b border-border/50 hover:bg-muted/10">
                      {/* Date/Time */}
                      <td className="p-2">
                        {transport.delivery_date ? (
                          <span className="text-cyan-400 font-medium text-sm">
                            {new Date(transport.delivery_date).toLocaleDateString()} {new Date(transport.delivery_date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      
                      {/* Job Order */}
                      <td className="p-2">
                        <span className="font-mono text-amber-400 text-sm">
                          {transport.job_numbers?.join(', ') || transport.job_number || '-'}
                        </span>
                      </td>
                      
                      {/* Plate/Container # */}
                      <td className="p-2">
                        <span className="font-mono text-sm">
                          {transport.vehicle_number || transport.container_number || '-'}
                        </span>
                      </td>
                      
                      {/* Delivery Note Button */}
                      <td className="p-2">
                        <Button 
                          size="sm" 
                          variant={checklist ? "outline" : "default"}
                          onClick={() => onOpenChecklist(transport)}
                          className="text-xs"
                        >
                          <Truck className="w-3 h-3 mr-1" />
                          {checklist ? 'View Arrival' : 'Process Arrival'}
                        </Button>
                      </td>
                      
                      {/* Load Status */}
                      <td className="p-2">
                        {loadStatus === 'APPROVED' ? (
                          <Badge className="bg-green-500/20 text-green-400 text-xs">
                            <Check className="w-3 h-3 mr-1" />
                            Approved
                          </Badge>
                        ) : loadStatus === 'LOADED' ? (
                          <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                            <Package className="w-3 h-3 mr-1" />
                            Loaded
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-500/20 text-gray-400 text-xs">
                            Assigned
                          </Badge>
                        )}
                      </td>
                      
                      {/* Delivery Order */}
                      <td className="p-2">
                        {doCreated ? (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-green-500/20 text-green-400 text-xs">
                              <FileText className="w-3 h-3 mr-1" />
                              {transport.do_number || 'Issued'}
                            </Badge>
                          </div>
                        ) : loadStatus === 'APPROVED' ? (
                          <Button 
                            size="sm" 
                            onClick={() => onViewDetails(transport)}
                            className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs"
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            Issue DO
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">Pending Approval</span>
                        )}
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

// // ==================== RFQ WINDOW TAB ====================
// const RFQWindowTab = () => {
//   const [rfqs, setRfqs] = useState([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     loadRFQs();
//   }, []);

//   const loadRFQs = async () => {
//     try {
//       const res = await api.get('/rfq');
//       setRfqs(res.data || []);
//     } catch (error) {
//       console.error('Failed to load RFQs:', error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const statusColor = {
//     DRAFT: 'bg-gray-500/20 text-gray-400',
//     SENT: 'bg-blue-500/20 text-blue-400',
//     QUOTED: 'bg-green-500/20 text-green-400',
//     CONVERTED: 'bg-emerald-500/20 text-emerald-400'
//   };

//   return (
//     <div className="glass rounded-lg border border-border">
//       <div className="p-4 border-b border-border">
//         <h2 className="text-lg font-semibold flex items-center gap-2">
//           <FileText className="w-5 h-5 text-blue-400" />
//           RFQ Status Window
//         </h2>
//         <p className="text-sm text-muted-foreground">
//           View all Request for Quotations and their status
//         </p>
//       </div>

//       {loading ? (
//         <div className="p-8 text-center">
//           <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
//         </div>
//       ) : rfqs.length === 0 ? (
//         <div className="p-8 text-center">
//           <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
//           <p className="text-muted-foreground">No RFQs found</p>
//         </div>
//       ) : (
//         <div className="overflow-x-auto">
//           <table className="w-full">
//             <thead className="bg-muted/30">
//               <tr>
//                 <th className="p-3 text-left text-xs font-medium text-muted-foreground">RFQ Number</th>
//                 <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
//                 <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
//                 <th className="p-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
//                 <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
//                 <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
//               </tr>
//             </thead>
//             <tbody>
//               {rfqs.map((rfq) => (
//                 <tr key={rfq.id} className="border-b border-border/50 hover:bg-muted/10">
//                   <td className="p-2 font-mono font-medium">{rfq.rfq_number}</td>
//                   <td className="p-2">{rfq.supplier_name || '-'}</td>
//                   <td className="p-2">
//                     <Badge className={rfq.rfq_type === 'PACKAGING' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-amber-500/20 text-amber-400'}>
//                       {rfq.rfq_type || 'PRODUCT'}
//                     </Badge>
//                   </td>
//                   <td className="p-2 text-green-400 font-medium">
//                     {rfq.total_amount > 0 ? `${rfq.currency || 'USD'} ${rfq.total_amount?.toFixed(2)}` : '-'}
//                   </td>
//                   <td className="p-2">
//                     <Badge className={statusColor[rfq.status] || statusColor.DRAFT}>
//                       {rfq.status}
//                     </Badge>
//                   </td>
//                   <td className="p-2 text-sm text-muted-foreground">
//                     {new Date(rfq.created_at).toLocaleDateString()}
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </div>
//       )}
//     </div>
//   );
// };

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

// ==================== VEHICLE INFO MODAL ====================
const VehicleInfoModal = ({ transport, onClose, getDeliveryDocumentUrl }) => {
  const [viewingDocument, setViewingDocument] = useState(null);
  const [documentUrl, setDocumentUrl] = useState(null);

  const openDocument = async (doc, deliveryOrderNumber = null) => {
    if (!doc) return;
    const url = await getDeliveryDocumentUrl(doc);
    if (url) {
      setDocumentUrl(url);
      setViewingDocument(true);
    }
  };

  const closeDocumentViewer = () => {
    setViewingDocument(false);
    setDocumentUrl(null);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-500" />
            Vehicle Information - {transport.transport_number || transport.po_number || 'N/A'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transport Basic Info */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Transport Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Transport Number</Label>
                <p className="font-mono font-medium">{transport.transport_number || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">PO / Reference</Label>
                <p className="text-blue-400 font-mono">{transport.po_number || transport.import_number || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Supplier</Label>
                <p className="font-medium">{transport.supplier_name || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Products</Label>
                <p className="text-sm">
                  {transport.products_summary || transport.product_names?.join(', ') || transport.po_items?.map(i => i.display_name || i.item_name).join(', ') || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Vehicle & Driver Information */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Vehicle & Driver Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Vehicle Number</Label>
                <p className="font-mono font-medium">{transport.vehicle_number || 'Not assigned'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Vehicle Type</Label>
                <p className="font-medium capitalize">
                  {transport.vehicle_type ? transport.vehicle_type.replace('_', ' ') : '-'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Driver Name</Label>
                <p className="font-medium">{transport.driver_name || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Driver Contact</Label>
                <p className="font-mono">
                  {transport.driver_contact || transport.driver_phone || '-'}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">Transporter Company</Label>
                <p className="font-medium">{transport.transporter_name || transport.transporter || '-'}</p>
              </div>
              {transport.container_number && (
                <div>
                  <Label className="text-muted-foreground text-xs">Container Number</Label>
                  <p className="font-mono font-medium text-green-400">{transport.container_number}</p>
                </div>
              )}
            </div>
          </div>

          {/* Delivery Note Information */}
          {(transport.delivery_note_number || transport.delivery_note_document) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Delivery Note Information
              </h3>
              <div className="space-y-3">
                {transport.delivery_note_number && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Delivery Note Number</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="font-mono font-medium text-blue-400">{transport.delivery_note_number}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const doNumber = transport.delivery_note_number;
                            // Try DO lookup first if we have the number
                            if (doNumber) {
                              const response = await api.get('/delivery-orders');
                              const deliveryOrder = response.data.find(
                                (d) => d.do_number === doNumber
                              );
                              
                              if (deliveryOrder) {
                                // Use the pdfAPI helper
                                const pdfUrl = pdfAPI.getDeliveryNoteUrl(deliveryOrder.id);
                                window.open(pdfUrl, '_blank');
                                return;
                              }
                            }
                            
                            // Fallback to document file
                            if (transport.delivery_note_document) {
                              const url = await getDeliveryDocumentUrl(transport.delivery_note_document, doNumber);
                              if (url) {
                                window.open(url, '_blank');
                              } else {
                                toast.error('Delivery note PDF not found');
                              }
                            } else {
                              toast.error('Delivery note PDF not found');
                            }
                          } catch (error) {
                            console.error('Failed to open delivery note PDF:', error);
                            toast.error('Failed to open delivery note PDF');
                          }
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View PDF
                      </Button>
                    </div>
                  </div>
                )}
                {transport.delivery_note_document && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Attached Document</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <FileText className="w-4 h-4 text-blue-400" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const url = await getDeliveryDocumentUrl(transport.delivery_note_document, transport.delivery_note_number);
                          if (url) {
                            setDocumentUrl(url);
                            setViewingDocument(true);
                          }
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View PDF Document
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const url = await getDeliveryDocumentUrl(transport.delivery_note_document, transport.delivery_note_number);
                          if (url) {
                            window.open(url, '_blank');
                          }
                        }}
                        title="Open in new tab"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Transport Documents */}
          {(transport.delivery_order_number || transport.delivery_order_document) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Delivery Order Information
              </h3>
              <div className="space-y-3">
                {transport.delivery_order_number && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Delivery Order Number</Label>
                    <p className="font-mono font-medium text-amber-400">{transport.delivery_order_number}</p>
                  </div>
                )}
                {transport.delivery_order_document && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Attached Document</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <FileText className="w-4 h-4 text-amber-400" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const url = await getDeliveryDocumentUrl(transport.delivery_order_document, transport.delivery_order_number);
                          if (url) {
                            setDocumentUrl(url);
                            setViewingDocument(true);
                          }
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View PDF Document
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const url = await getDeliveryDocumentUrl(transport.delivery_order_document, transport.delivery_order_number);
                          if (url) {
                            window.open(url, '_blank');
                          }
                        }}
                        title="Open in new tab"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline Information */}
          {(transport.scheduled_date || transport.delivery_date || transport.pickup_date || transport.created_at) && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Timeline
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {transport.scheduled_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Scheduled Date</Label>
                    <p className="font-medium">{new Date(transport.scheduled_date).toLocaleString()}</p>
                  </div>
                )}
                {transport.pickup_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Pickup Date</Label>
                    <p className="font-medium">{new Date(transport.pickup_date).toLocaleString()}</p>
                  </div>
                )}
                {transport.delivery_date && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Expected Delivery</Label>
                    <p className="font-medium">{new Date(transport.delivery_date).toLocaleString()}</p>
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
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>

      {/* PDF Document Viewer Modal */}
      {viewingDocument && documentUrl && (
        <Dialog open={viewingDocument} onOpenChange={closeDocumentViewer}>
          <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                Document Viewer
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden border border-border rounded-lg bg-muted/20">
              <iframe
                src={documentUrl}
                className="w-full h-full min-h-[600px]"
                title="PDF Document Viewer"
                style={{ border: 'none' }}
              />
            </div>
            <div className="flex justify-between items-center pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  window.open(documentUrl, '_blank');
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Open in New Tab
              </Button>
              <Button variant="outline" onClick={closeDocumentViewer}>
                Close Viewer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
};

// ==================== SECURITY CHECKLIST VIEW MODAL (READ-ONLY) ====================
const SecurityChecklistViewModal = ({ transport, checklistType, onClose }) => {
  const checklist = transport.security_checklist;
  
  if (!checklist) {
    return null;
  }

  const checklistLabels = {
    vehicle_inspected: 'Vehicle Inspected',
    driver_verified: 'Driver ID Verified',
    seal_checked: 'Seal Number Checked',
    documents_verified: 'Documents Verified',
    weight_recorded: 'Weight Recorded'
  };

  const netWeight = checklist.gross_weight && checklist.tare_weight 
    ? (parseFloat(checklist.gross_weight) - parseFloat(checklist.tare_weight)).toFixed(2)
    : '0.00';

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-500" />
            Security Checklist Details - {checklistType === 'INWARD' ? 'Inward Cargo' : 'Outward Dispatch'}
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
                <span className="text-muted-foreground">Checklist #:</span>
                <p className="font-mono font-medium">{checklist.checklist_number}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge className="bg-green-500/20 text-green-400">
                  <Check className="w-3 h-3 mr-1" />
                  {checklist.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Reference:</span>
                <p className="font-medium">{transport.po_number || transport.job_numbers?.join(', ') || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{checklistType === 'INWARD' ? 'Supplier' : 'Customer'}:</span>
                <p className="font-medium">{transport.supplier_name || transport.customer_name || '-'}</p>
              </div>
              {checklist.completed_at && (
                <div>
                  <span className="text-muted-foreground">Completed At:</span>
                  <p className="font-medium">{new Date(checklist.completed_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Vehicle & Driver Info */}
          <div className="space-y-4">
            <h3 className="font-semibold">Vehicle & Driver Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">Vehicle Number</Label>
                <p className="font-mono font-medium">{checklist.vehicle_number || transport.vehicle_number || '-'}</p>
              </div>
              {checklist.container_number && (
                <div>
                  <Label className="text-muted-foreground text-xs">Container Number</Label>
                  <p className="font-mono font-medium">{checklist.container_number}</p>
                </div>
              )}
              {checklist.driver_name && (
                <div>
                  <Label className="text-muted-foreground text-xs">Driver Name</Label>
                  <p className="font-medium">{checklist.driver_name}</p>
                </div>
              )}
              {checklist.driver_license && (
                <div>
                  <Label className="text-muted-foreground text-xs">Driver License</Label>
                  <p className="font-mono">{checklist.driver_license}</p>
                </div>
              )}
              {checklist.seal_number && (
                <div>
                  <Label className="text-muted-foreground text-xs">Seal Number</Label>
                  <p className="font-mono">{checklist.seal_number}</p>
                </div>
              )}
            </div>
          </div>

          {/* Weighment */}
          {(checklist.gross_weight || checklist.tare_weight) && (
            <div className="space-y-4 p-4 border border-emerald-500/30 rounded-lg bg-emerald-500/5">
              <h3 className="font-semibold flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-400" />
                Weighment Details
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Gross Weight (KG)</Label>
                  <p className="text-lg font-bold font-mono">{checklist.gross_weight?.toFixed(2) || '0.00'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Tare Weight (KG)</Label>
                  <p className="text-lg font-bold font-mono">{checklist.tare_weight?.toFixed(2) || '0.00'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Net Weight (KG)</Label>
                  <p className="text-lg font-bold font-mono text-emerald-400">{netWeight}</p>
                </div>
              </div>
            </div>
          )}

          {/* Checklist Items */}
          {checklist.checklist_items && (
            <div className="space-y-3">
              <h3 className="font-semibold">Checklist Items</h3>
              <div className="space-y-2">
                {Object.entries(checklist.checklist_items).map(([key, checked]) => (
                  <div 
                    key={key}
                    className={`flex items-center gap-3 p-3 rounded border ${
                      checked ? 'bg-green-500/10 border-green-500/30' : 'bg-muted/10 border-border'
                    }`}
                  >
                    {checked ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className={checked ? 'text-green-400 font-medium' : 'text-muted-foreground'}>
                      {checklistLabels[key] || key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {checklist.notes && (
            <div>
              <Label className="text-muted-foreground text-xs">Notes</Label>
              <div className="p-3 bg-muted/20 rounded border border-border">
                <p className="text-sm whitespace-pre-wrap">{checklist.notes}</p>
              </div>
            </div>
          )}

          {/* Completed By */}
          {checklist.completed_by && (
            <div className="text-sm text-muted-foreground">
              Completed by: {checklist.completed_by}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            {checklist.gross_weight && checklist.tare_weight && (
              <Button 
                variant="outline"
                onClick={() => {
                  const token = localStorage.getItem('erp_token');
                  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                  window.open(`${backendUrl}/api/pdf/weighment-slip/${checklist.id}?token=${token}`, '_blank');
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Weighment Slip
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== DELIVERY DOCS TAB ====================
const DeliveryDocsTab = ({ inwardTransports, outwardTransports, onViewDetails, onRefresh, getDeliveryDocumentUrl }) => {
  const allDocsWithDates = useMemo(() => {
    const docs = [];

    // Add inward transports with delivery notes
    inwardTransports.forEach(t => {
      if (t.delivery_note_number || t.delivery_note_document) {
        docs.push({
          ...t,
          docType: 'DELIVERY_NOTE',
          docNumber: t.delivery_note_number,
          docDocument: t.delivery_note_document,
          direction: 'inward',
          expectedDate: t.delivery_date || t.eta || t.scheduled_date || t.created_at
        });
      }
    });

    // Add outward transports with delivery orders
    outwardTransports.forEach(t => {
      if (t.delivery_order_number || t.delivery_order_document) {
        docs.push({
          ...t,
          docType: 'DELIVERY_ORDER',
          docNumber: t.delivery_order_number,
          docDocument: t.delivery_order_document,
          direction: 'outward',
          expectedDate: t.delivery_date || t.scheduled_date || t.created_at
        });
      }
    });

    // Sort by expected date (FIFO - earliest first)
    return docs.sort((a, b) => {
      const dateA = new Date(a.expectedDate || 0);
      const dateB = new Date(b.expectedDate || 0);
      return dateA - dateB;
    });
  }, [inwardTransports, outwardTransports]);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Delivery Notes & Orders
          </h2>
          <p className="text-sm text-muted-foreground">
            Sorted by Expected Delivery Date (FIFO)
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="px-3 py-1 rounded text-sm bg-blue-500/20 text-blue-400">
            {allDocsWithDates.length} Documents
          </span>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {allDocsWithDates.length === 0 ? (
        <div className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-30 text-muted-foreground" />
          <p className="text-muted-foreground">No delivery notes or orders found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Direction</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Document Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Document #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Transport #</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Party</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Expected Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allDocsWithDates.map((transport) => (
                <tr key={`${transport.docType}-${transport.id}`} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {transport.direction === 'inward' ? (
                        <ArrowDownToLine className="w-4 h-4 text-blue-400" />
                      ) : (
                        <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
                      )}
                      <span className="text-sm font-medium capitalize">{transport.direction}</span>
                    </div>
                  </td>
                  <td className="p-2">
                    <Badge className={transport.docType === 'DELIVERY_NOTE' ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}>
                      {transport.docType.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="p-2">
                    <span className="font-mono font-medium">{transport.docNumber || '-'}</span>
                  </td>
                  <td className="p-2">
                    <span className="font-mono text-sm">{transport.transport_number || transport.import_number || '-'}</span>
                  </td>
                  <td className="p-2">
                    <span className="text-sm">{transport.po_number || transport.job_number || transport.job_numbers?.join(', ') || transport.import_number || '-'}</span>
                  </td>
                  <td className="p-2">
                    <span className="text-sm">{transport.supplier_name || transport.customer_name || '-'}</span>
                  </td>
                  <td className="p-2">
                    <span className="text-sm font-medium text-green-400">
                      {formatDate(transport.expectedDate)}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => onViewDetails(transport)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {transport.docDocument && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const doc = transport.docDocument;
                            const docNumber = transport.docNumber;
                            if (doc) {
                              const url = await getDeliveryDocumentUrl(doc, docNumber);
                              if (url) {
                                window.open(url, '_blank');
                              }
                            }
                          }}
                        >
                          <FileText className="w-4 h-4" />
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

// ==================== VEHICLE ARRIVAL MODAL (OUTWARD) ====================
const VehicleArrivalModal = ({ transport, onClose, onOpenLoadingQC }) => {
  const [formData, setFormData] = useState({
    arrival_time: new Date().toISOString(),
    empty_weight: '',
    vehicle_number: transport?.vehicle_number || '',
    driver_name: transport?.driver_name || '',
    transport_company: '',
    arrival_checklist: {
      vehicle_condition: false,
      documents_verified: false,
      driver_identity_checked: false,
      safety_equipment: false,
    },
    notes: ''
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      // Create or update security checklist for outward transport
      const checklistData = {
        ref_type: 'OUTWARD',
        ref_id: transport.id,
        ref_number: transport.job_numbers?.[0] || transport.job_number || '',
        checklist_type: 'OUTWARD',
        arrival_time: formData.arrival_time,
        tare_weight: parseFloat(formData.empty_weight) || null,
        vehicle_number: formData.vehicle_number,
        driver_name: formData.driver_name,
        transport_company: formData.transport_company,
        checklist_items: formData.arrival_checklist,
        notes: formData.notes,
      };

      if (transport.security_checklist?.id) {
        await api.put(`/security/checklists/${transport.security_checklist.id}`, checklistData);
      } else {
        await api.post('/security/checklists', checklistData);
      }

      toast.success('Vehicle arrival details saved');
      onClose();
      window.location.reload(); // Refresh to show updated data
    } catch (error) {
      console.error('Failed to save arrival details:', error);
      toast.error('Failed to save arrival details');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadingQC = async () => {
    // Save first, then open loading QC modal
    try {
      setIsSaving(true);
      
      const checklistData = {
        ref_type: 'OUTWARD',
        ref_id: transport.id,
        ref_number: transport.job_numbers?.[0] || transport.job_number || '',
        checklist_type: 'OUTWARD',
        arrival_time: formData.arrival_time,
        tare_weight: parseFloat(formData.empty_weight) || null,
        vehicle_number: formData.vehicle_number,
        driver_name: formData.driver_name,
        transport_company: formData.transport_company,
        checklist_items: formData.arrival_checklist,
        notes: formData.notes,
      };

      let checklistId;
      if (transport.security_checklist?.id) {
        await api.put(`/security/checklists/${transport.security_checklist.id}`, checklistData);
        checklistId = transport.security_checklist.id;
      } else {
        const res = await api.post('/security/checklists', checklistData);
        checklistId = res.data.id;
      }

      onOpenLoadingQC({
        ...formData,
        checklistId,
        transport
      });
    } catch (error) {
      console.error('Failed to save arrival details:', error);
      toast.error('Failed to save arrival details');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vehicle Arrival - {transport?.job_numbers?.join(', ') || transport?.job_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Arrival Time */}
          <div>
            <Label>Arrival Time</Label>
            <Input
              type="datetime-local"
              value={formData.arrival_time ? new Date(formData.arrival_time).toISOString().slice(0, 16) : ''}
              onChange={(e) => setFormData(prev => ({ ...prev, arrival_time: new Date(e.target.value).toISOString() }))}
            />
          </div>

          {/* Empty Weight */}
          <div>
            <Label>Empty Weight (Tare) - kg</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.empty_weight}
              onChange={(e) => setFormData(prev => ({ ...prev, empty_weight: e.target.value }))}
              placeholder="Vehicle empty weight"
            />
          </div>

          {/* Vehicle Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Vehicle Number</Label>
              <Input
                value={formData.vehicle_number}
                onChange={(e) => setFormData(prev => ({ ...prev, vehicle_number: e.target.value }))}
                placeholder="Vehicle plate number"
              />
            </div>
            <div>
              <Label>Driver Name</Label>
              <Input
                value={formData.driver_name}
                onChange={(e) => setFormData(prev => ({ ...prev, driver_name: e.target.value }))}
                placeholder="Driver name"
              />
            </div>
          </div>

          <div>
            <Label>Transport Company</Label>
            <Input
              value={formData.transport_company}
              onChange={(e) => setFormData(prev => ({ ...prev, transport_company: e.target.value }))}
              placeholder="Transport company name"
            />
          </div>

          {/* Arrival Checklist */}
          <div className="border border-border rounded-lg p-4">
            <Label className="text-base mb-3 block">Arrival Checklist</Label>
            <div className="space-y-2">
              {Object.entries(formData.arrival_checklist).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={value}
                    onCheckedChange={(checked) => 
                      setFormData(prev => ({
                        ...prev,
                        arrival_checklist: { ...prev.arrival_checklist, [key]: checked }
                      }))
                    }
                  />
                  <label htmlFor={key} className="text-sm cursor-pointer">
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Input
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button 
            onClick={handleLoadingQC} 
            disabled={isSaving}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {isSaving ? 'Saving...' : 'Report Loading QC'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== LOADING QC MODAL (OUTWARD) ====================
const LoadingQCModal = ({ arrivalData, onClose, onComplete }) => {
  const [batchNumber, setBatchNumber] = useState('');
  const [loadStatus, setLoadStatus] = useState('ASSIGNED');
  const [batchFound, setBatchFound] = useState(false);
  const [productionType, setProductionType] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const transport = arrivalData.transport;
  const emptyWeight = parseFloat(arrivalData.empty_weight) || 0;
  const netWeight = grossWeight ? parseFloat(grossWeight) - emptyWeight : 0;

  useEffect(() => {
    fetchBatchNumber();
  }, []);

  const fetchBatchNumber = async () => {
    const jobNumber = transport.job_numbers?.[0] || transport.job_number;
    if (!jobNumber) return;

    try {
      const response = await api.get(`/production/logs/batch/${jobNumber}`);
      if (response.data.found) {
        setBatchNumber(response.data.batch_number);
        setProductionType(response.data.production_type);
        setBatchFound(true);
      }
    } catch (error) {
      console.error('Failed to fetch batch:', error);
    }
  };

  const handleApprove = async () => {
    if (!batchNumber) {
      toast.error('Batch number is required');
      return;
    }

    if (loadStatus !== 'LOADED') {
      toast.error('Please set status to LOADED before approving');
      return;
    }

    try {
      setIsSaving(true);

      // Update security checklist with loading data and batch
      await api.put(`/security/checklists/${arrivalData.checklistId}`, {
        gross_weight: parseFloat(grossWeight),
        net_weight: netWeight,
        load_status: 'APPROVED',
        batch_number: batchNumber,
        loading_time: new Date().toISOString(),
      });

      toast.success('Loading approved successfully');
      onComplete();
    } catch (error) {
      console.error('Failed to approve loading:', error);
      toast.error('Failed to approve loading');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Loading QC - {transport?.job_numbers?.join(', ') || transport?.job_number}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Header Info */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/20 rounded">
            <div>
              <Label>Job Order</Label>
              <p className="font-mono text-amber-400 text-sm">
                {transport?.job_numbers?.join(', ') || transport?.job_number}
              </p>
            </div>
            <div>
              <Label>Vehicle</Label>
              <p className="font-mono text-sm">{arrivalData.vehicle_number}</p>
            </div>
            <div>
              <Label>Status</Label>
              <select
                value={loadStatus}
                onChange={(e) => setLoadStatus(e.target.value)}
                className="w-full p-2 rounded border border-border bg-background text-sm"
              >
                <option value="ASSIGNED">Assigned</option>
                <option value="LOADED">Loaded</option>
              </select>
            </div>
          </div>

          {/* Weighment */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Empty Weight (kg)</Label>
              <Input
                type="number"
                value={emptyWeight}
                disabled
                className="bg-muted"
              />
            </div>
            <div>
              <Label>Gross Weight (kg)</Label>
              <Input
                type="number"
                step="0.01"
                value={grossWeight}
                onChange={(e) => setGrossWeight(e.target.value)}
                placeholder="Loaded weight"
              />
            </div>
            <div>
              <Label>Net Weight (kg)</Label>
              <Input
                type="number"
                value={netWeight.toFixed(2)}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          {/* Batch Number */}
          <div>
            <Label>Batch Number {!batchFound && '*'}</Label>
            <div className="flex gap-2 items-center">
              <Input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder={batchFound ? "Auto-filled from production" : "Enter batch number"}
                disabled={batchFound}
                className={batchFound ? 'bg-muted' : ''}
              />
              {batchFound && (
                <Badge className="bg-green-500/20 text-green-400">
                  <Check className="w-3 h-3 mr-1" />
                  From Production
                </Badge>
              )}
            </div>
          </div>

          {productionType && (
            <div>
              <Label>Production Type</Label>
              <Badge>{productionType.toUpperCase()}</Badge>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            onClick={handleApprove}
            disabled={loadStatus !== 'LOADED' || !batchNumber || !grossWeight || isSaving}
            className="bg-green-500 hover:bg-green-600"
          >
            {isSaving ? 'Approving...' : 'Approve'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== DO ISSUANCE MODAL (OUTWARD) ====================
const DOIssuanceModal = ({ transport, onClose, onComplete }) => {
  const [formData, setFormData] = useState({
    exit_empty_weight: '',
    exit_gross_weight: '',
  });
  const [isIssuing, setIsIssuing] = useState(false);

  const checklist = transport.security_checklist;
  const batchNumber = checklist?.batch_number || '';
  
  const exit_net_weight = formData.exit_gross_weight && formData.exit_empty_weight
    ? parseFloat(formData.exit_gross_weight) - parseFloat(formData.exit_empty_weight)
    : 0;

    const handleIssueDO = async () => {
      // Validate required fields
      if (!formData.exit_empty_weight || !formData.exit_gross_weight) {
        toast.error('Please enter both empty and gross weights');
        return;
      }

      if (!batchNumber || batchNumber.trim() === '') {
        toast.error('Batch number is required. Please ensure the security checklist has a batch number assigned.');
        return;
      }

      if (!transport.job_order_id) {
        toast.error('Job order ID is missing');
        return;
      }
    
      try {
        setIsIssuing(true);
    
        // Issue DO through security endpoint
        const response = await api.post('/delivery-orders/from-security', {
          job_order_id: transport.job_order_id,
          batch_number: batchNumber,
          exit_empty_weight: parseFloat(formData.exit_empty_weight),
          exit_gross_weight: parseFloat(formData.exit_gross_weight),
          exit_net_weight: exit_net_weight,
        });
    
        toast.success(`Delivery Order ${response.data.do_number} issued successfully`);
        onComplete();
      } catch (error) {
        console.error('Failed to issue DO:', error);
        
        // Handle validation errors (array of error objects)
        let errorMessage = 'Failed to issue DO';
        if (error.response?.data?.detail) {
          const detail = error.response.data.detail;
          if (Array.isArray(detail)) {
            // Extract messages from validation error array
            errorMessage = detail.map(err => err.msg || JSON.stringify(err)).join(', ');
          } else if (typeof detail === 'string') {
            errorMessage = detail;
          } else {
            errorMessage = JSON.stringify(detail);
          }
        }
        
        toast.error(errorMessage);
      } finally {
        setIsIssuing(false);
      }
    };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue Delivery Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Job Order Info */}
          <div className="p-4 bg-muted/20 rounded">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Job Order</Label>
                <p className="font-mono text-amber-400 text-sm">
                  {transport.job_numbers?.join(', ') || transport.job_number}
                </p>
              </div>
              <div>
                <Label>Batch Number</Label>
                <p className="font-mono text-sm">{batchNumber || '-'}</p>
              </div>
            </div>
          </div>

          {/* Exit Weighment */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Exit Empty Weight (kg)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.exit_empty_weight}
                onChange={(e) => setFormData(prev => ({...prev, exit_empty_weight: e.target.value}))}
                placeholder="Empty weight"
              />
            </div>
            <div>
              <Label>Exit Gross Weight (kg)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.exit_gross_weight}
                onChange={(e) => setFormData(prev => ({...prev, exit_gross_weight: e.target.value}))}
                placeholder="Loaded weight"
              />
            </div>
            <div>
              <Label>Exit Net Weight (kg)</Label>
              <Input
                type="number"
                value={exit_net_weight.toFixed(2)}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
            <p className="text-sm text-amber-400">
              <strong>Note:</strong> Issuing this DO will automatically reduce stock based on the job order's packaging type.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isIssuing}>Cancel</Button>
          <Button
            onClick={handleIssueDO}
            disabled={!formData.exit_empty_weight || !formData.exit_gross_weight || isIssuing}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {isIssuing ? 'Issuing...' : 'Issue DO'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== DISCHARGE PROCESSING MODAL ====================
const DischargeProcessingModal = ({ transport, onClose, onReportQC }) => {
  const [formData, setFormData] = useState({
    arrival_time: new Date().toISOString(),
    arrival_quantity: '',
    empty_weight: '',
    gross_weight: '',
    vehicle_number: transport?.vehicle_number || '',
    driver_name: transport?.driver_name || '',
    transport_company: '',
    discharge_checklist: {
      container_condition: false,
      seal_intact: false,
      no_visible_damage: false,
      documents_verified: false,
      safety_compliance: false,
    },
    notes: ''
  });

  const [isSaving, setIsSaving] = useState(false);

  const net_weight = formData.gross_weight && formData.empty_weight 
    ? parseFloat(formData.gross_weight) - parseFloat(formData.empty_weight)
    : 0;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleChecklistChange = (field, checked) => {
    setFormData(prev => ({
      ...prev,
      discharge_checklist: {
        ...prev.discharge_checklist,
        [field]: checked
      }
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save discharge data to security checklist
      const checklistData = {
        ref_type: 'INWARD',
        ref_id: transport.id,
        ref_number: transport.po_number || transport.transport_number,
        checklist_type: 'INWARD',
        arrival_time: formData.arrival_time,
        arrival_quantity: parseFloat(formData.arrival_quantity),
        tare_weight: parseFloat(formData.empty_weight),
        gross_weight: parseFloat(formData.gross_weight),
        net_weight: net_weight,
        vehicle_number: formData.vehicle_number,
        driver_name: formData.driver_name,
        transport_company: formData.transport_company,
        discharge_checklist_items: formData.discharge_checklist,
        notes: formData.notes,
        status: 'COMPLETED'
      };

      await api.post('/security/checklists', checklistData);
      toast.success('Discharge data saved successfully');
      onClose();
    } catch (error) {
      console.error('Failed to save discharge data:', error);
      toast.error('Failed to save discharge data');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReportQC = async () => {
    // First save the discharge data
    setIsSaving(true);
    try {
      const checklistData = {
        ref_type: 'INWARD',
        ref_id: transport.id,
        ref_number: transport.po_number || transport.transport_number,
        checklist_type: 'INWARD',
        arrival_time: formData.arrival_time,
        arrival_quantity: parseFloat(formData.arrival_quantity),
        tare_weight: parseFloat(formData.empty_weight),
        gross_weight: parseFloat(formData.gross_weight),
        net_weight: net_weight,
        vehicle_number: formData.vehicle_number,
        driver_name: formData.driver_name,
        transport_company: formData.transport_company,
        discharge_checklist_items: formData.discharge_checklist,
        notes: formData.notes,
        status: 'COMPLETED'
      };

      const response = await api.post('/security/checklists', checklistData);
      
      // Pass the saved data to QC modal
      onReportQC({
        ...formData,
        net_weight,
        checklist_id: response.data.id,
        transport
      });
    } catch (error) {
      console.error('Failed to save discharge data:', error);
      toast.error('Failed to save discharge data');
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-500" />
            Process Arrival - {transport?.po_number || transport?.transport_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Arrival Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Arrival Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Arrival Time</Label>
                <Input
                  type="datetime-local"
                  value={formData.arrival_time.slice(0, 16)}
                  onChange={(e) => handleChange('arrival_time', new Date(e.target.value).toISOString())}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Arrival Quantity</Label>
                <Input
                  type="number"
                  placeholder="Enter quantity received"
                  value={formData.arrival_quantity}
                  onChange={(e) => handleChange('arrival_quantity', e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* Weighment */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Weighment</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Empty Weight (kg)</Label>
                <Input
                  type="number"
                  placeholder="Tare weight"
                  value={formData.empty_weight}
                  onChange={(e) => handleChange('empty_weight', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Gross Weight (kg)</Label>
                <Input
                  type="number"
                  placeholder="Total weight"
                  value={formData.gross_weight}
                  onChange={(e) => handleChange('gross_weight', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Net Weight (kg)</Label>
                <Input
                  type="number"
                  value={net_weight.toFixed(2)}
                  disabled
                  className="text-sm bg-muted"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Details */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Vehicle Details</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Vehicle Number</Label>
                <Input
                  type="text"
                  placeholder="Vehicle registration"
                  value={formData.vehicle_number}
                  onChange={(e) => handleChange('vehicle_number', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Driver Name</Label>
                <Input
                  type="text"
                  placeholder="Driver name"
                  value={formData.driver_name}
                  onChange={(e) => handleChange('driver_name', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Transport Company</Label>
                <Input
                  type="text"
                  placeholder="Company name"
                  value={formData.transport_company}
                  onChange={(e) => handleChange('transport_company', e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* Discharge Checklist */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Discharge Checklist</h3>
            <div className="space-y-2">
              {Object.entries({
                container_condition: 'Container/Package in Good Condition',
                seal_intact: 'Seal Intact (if applicable)',
                no_visible_damage: 'No Visible Damage',
                documents_verified: 'Documents Verified',
                safety_compliance: 'Safety Compliance Checked'
              }).map(([key, label]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={formData.discharge_checklist[key]}
                    onCheckedChange={(checked) => handleChecklistChange(key, checked)}
                  />
                  <Label htmlFor={key} className="text-sm cursor-pointer">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">Notes</Label>
            <textarea
              className="w-full min-h-[80px] p-2 text-sm border rounded-md bg-background"
              placeholder="Additional notes or observations..."
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={isSaving}>
            Save
          </Button>
          <Button onClick={handleReportQC} disabled={isSaving} className="bg-blue-500 hover:bg-blue-600">
            <ClipboardCheck className="w-4 h-4 mr-2" />
            Report QC
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ==================== QC INSPECTION MODAL ====================
const QCInspectionModal = ({ dischargeData, onClose, onComplete }) => {
  const [sampleType, setSampleType] = useState('SOLVENT');
  const [batchNumber, setBatchNumber] = useState('');
  const [qcParameters, setQcParameters] = useState([]);
  const [parameterResults, setParameterResults] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadQCParameters(sampleType);
  }, [sampleType]);

  const loadQCParameters = async (type) => {
    setIsLoading(true);
    try {
      const response = await api.get(`/qc/parameters?product_type=${type}`);
      setQcParameters(response.data);
      
      // Initialize parameter results
      const initialResults = {};
      response.data.forEach(param => {
        initialResults[param.id] = {
          parameter_id: param.id,
          parameter_name: param.parameter_name,
          result: null,
          reason: '',
          required: param.required
        };
      });
      setParameterResults(initialResults);
    } catch (error) {
      console.error('Failed to load QC parameters:', error);
      toast.error('Failed to load QC parameters');
    } finally {
      setIsLoading(false);
    }
  };

  const handleParameterResult = (parameterId, result) => {
    setParameterResults(prev => ({
      ...prev,
      [parameterId]: {
        ...prev[parameterId],
        result
      }
    }));
  };

  const handleParameterReason = (parameterId, reason) => {
    setParameterResults(prev => ({
      ...prev,
      [parameterId]: {
        ...prev[parameterId],
        reason
      }
    }));
  };

  const allRequiredParamsFilled = () => {
    return qcParameters
      .filter(param => param.required)
      .every(param => parameterResults[param.id]?.result !== null);
  };

  const allParametersPassed = () => {
    return Object.values(parameterResults).every(result => result.result === 'PASS' || !result.required);
  };

  const handleSubmit = async () => {
    if (!batchNumber) {
      toast.error('Please enter batch number');
      return;
    }

    if (!allRequiredParamsFilled()) {
      toast.error('Please complete all required QC parameters');
      return;
    }

    setIsSubmitting(true);
    try {
      const qcData = {
        ref_type: 'INWARD',
        ref_id: dischargeData.transport.id,
        ref_number: dischargeData.transport.po_number || dischargeData.transport.transport_number,
        product_name: dischargeData.transport.products_summary || dischargeData.transport.product_names?.join(', '),
        supplier: dischargeData.transport.supplier_name,
        batch_number: batchNumber,
        sample_type: sampleType,
        arrival_quantity: parseFloat(dischargeData.arrival_quantity) || null,
        qc_parameters: Object.values(parameterResults).map(result => ({
          parameter_id: result.parameter_id,
          parameter_name: result.parameter_name,
          result: result.result,
          reason: result.reason,
          required: result.required
        })),
        security_checklist_id: dischargeData.checklist_id,
        vehicle_number: dischargeData.vehicle_number,
        po_number: dischargeData.transport.po_number
      };

      await api.post('/qc/inspections', qcData);
      
      if (allParametersPassed()) {
        toast.success('QC Inspection passed! GRN will be created.');
      } else {
        toast.error('QC Inspection failed. Material on hold.');
      }

      onComplete();
    } catch (error) {
      console.error('Failed to submit QC inspection:', error);
      toast.error('Failed to submit QC inspection');
    } finally {
      setIsSubmitting(false);
    }
  };

  const passedCount = Object.values(parameterResults).filter(r => r.result === 'PASS').length;
  const failedCount = Object.values(parameterResults).filter(r => r.result === 'FAIL').length;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-blue-500" />
            QC Inspection - {dischargeData?.transport?.po_number || 'N/A'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Information */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted/20 rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">Date/Time</Label>
              <p className="text-sm font-medium">{new Date(dischargeData?.arrival_time).toLocaleString()}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">PO#</Label>
              <p className="text-sm font-mono text-blue-400">{dischargeData?.transport?.po_number || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Product</Label>
              <p className="text-sm">{dischargeData?.transport?.products_summary || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Delivery Note</Label>
              <p className="text-sm">{dischargeData?.transport?.delivery_note_number || '-'}</p>
            </div>
          </div>

          {/* Sample Type Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Sample Type</Label>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="solvent"
                  name="sampleType"
                  value="SOLVENT"
                  checked={sampleType === 'SOLVENT'}
                  onChange={(e) => setSampleType(e.target.value)}
                  className="cursor-pointer"
                />
                <Label htmlFor="solvent" className="cursor-pointer">Solvent</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="oil"
                  name="sampleType"
                  value="OIL"
                  checked={sampleType === 'OIL'}
                  onChange={(e) => setSampleType(e.target.value)}
                  className="cursor-pointer"
                />
                <Label htmlFor="oil" className="cursor-pointer">Oil</Label>
              </div>
            </div>
          </div>

          {/* Batch Number */}
          <div>
            <Label className="text-sm font-semibold">Batch Number *</Label>
            <Input
              type="text"
              placeholder="Enter batch number"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="max-w-md"
            />
          </div>

          {/* QC Parameters Table */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">QC Parameters</Label>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium">Parameter</th>
                      <th className="p-2 text-left text-xs font-medium">Type</th>
                      <th className="p-2 text-left text-xs font-medium">Result</th>
                      <th className="p-2 text-left text-xs font-medium">Reason (if fail)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qcParameters.map((param) => (
                      <tr key={param.id} className="border-b border-border/50">
                        <td className="p-2 text-sm">
                          {param.parameter_name}
                          {param.required && <span className="text-red-400 ml-1">*</span>}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {param.test_type}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={parameterResults[param.id]?.result === 'PASS' ? 'default' : 'outline'}
                              className={parameterResults[param.id]?.result === 'PASS' 
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                                : ''}
                              onClick={() => handleParameterResult(param.id, 'PASS')}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Pass
                            </Button>
                            <Button
                              size="sm"
                              variant={parameterResults[param.id]?.result === 'FAIL' ? 'default' : 'outline'}
                              className={parameterResults[param.id]?.result === 'FAIL' 
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                                : ''}
                              onClick={() => handleParameterResult(param.id, 'FAIL')}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Fail
                            </Button>
                          </div>
                        </td>
                        <td className="p-2">
                          {parameterResults[param.id]?.result === 'FAIL' && (
                            <Input
                              type="text"
                              placeholder="Enter reason"
                              value={parameterResults[param.id]?.reason || ''}
                              onChange={(e) => handleParameterReason(param.id, e.target.value)}
                              className="text-sm"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-muted/20 rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">Total Parameters</Label>
              <p className="text-lg font-bold">{qcParameters.length}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Passed</Label>
              <p className="text-lg font-bold text-green-400">{passedCount}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Failed</Label>
              <p className="text-lg font-bold text-red-400">{failedCount}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !allRequiredParamsFilled() || !batchNumber}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Submit QC
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SecurityQCPage;
