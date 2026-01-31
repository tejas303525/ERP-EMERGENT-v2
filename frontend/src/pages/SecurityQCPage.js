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
  const getDeliveryDocumentUrl = async (doc) => {
    if (!doc) return null;
    if (doc.startsWith('http')) {
      return doc;
    }

    const token = localStorage.getItem('erp_token');
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

    // Check if this looks like a generated Delivery Note PDF (e.g., "DeliveryNote_DO-000043.pdf")
    const deliveryNoteMatch = doc.match(/^DeliveryNote_(DO-\d+)\.pdf$/i);
    if (deliveryNoteMatch) {
      // Extract DO number from filename
      const doNumber = deliveryNoteMatch[1];
      try {
        // Fetch delivery orders to find the one with this DO number
        const response = await api.get('/delivery-orders');
        const deliveryOrders = response.data || [];
        const deliveryOrder = deliveryOrders.find(item => item.do_number === doNumber);

        if (deliveryOrder && deliveryOrder.id) {
          // Use PDF generation endpoint
          return `${backendUrl}/api/pdf/delivery-note/${deliveryOrder.id}?token=${token}`;
        }
      } catch (error) {
        console.error('Failed to fetch delivery order:', error);
      }
    }

    // Fallback to file endpoint
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
    setShowChecklistModal(true);
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
      {inspectionStatusAlerts.length > 0 && (
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
      )}

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

      {/* Workflow Overview */}
      <div className="mb-6 p-4 glass rounded-lg border border-purple-500/30">
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {/* LEFT COLUMN - INWARD TRANSPORT */}
          <div className="glass rounded-lg border border-blue-500/30">
            <div className="p-4 border-b border-border bg-blue-500/10 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ArrowDownToLine className="w-5 h-5 text-blue-400" />
                    Inward Transport
                    {inwardPending > 0 && (
                      <Badge className="ml-2 bg-blue-500/20 text-blue-400">
                        {inwardPending} Pending
                      </Badge>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Security → QC → GRN → Payables
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              <InwardTransportTab
                transports={inwardTransports}
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
                onRefresh={loadData}
                getDeliveryDocumentUrl={getDeliveryDocumentUrl}
              />
            </div>
          </div>

          {/* RIGHT COLUMN - OUTWARD TRANSPORT */}
          <div className="glass rounded-lg border border-amber-500/30">
            <div className="p-4 border-b border-border bg-amber-500/10 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ArrowUpFromLine className="w-5 h-5 text-amber-400" />
                    Outward Transport
                    {outwardPending > 0 && (
                      <Badge className="ml-2 bg-amber-500/20 text-amber-400">
                        {outwardPending} Pending
                      </Badge>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Security → QC → Delivery Order → Receivables
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4">
              <OutwardTransportTab
                transports={outwardTransports}
                onOpenChecklist={(t) => openChecklistModal(t, 'OUTWARD')}
                onViewDetails={(t) => {
                  setSelectedTransport(t);
                  setChecklistType('OUTWARD');
                  setShowViewModal(true);
                }}
                onRefresh={loadData}
                getDeliveryDocumentUrl={getDeliveryDocumentUrl}
              />
            </div>
          </div>

          {/* THIRD COLUMN - RFQ WINDOW */}
          <div className="glass rounded-lg border border-purple-500/30">
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
            </div>
            <div className="p-4">
              <RFQWindowTab />
            </div>
          </div>
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
    </div>
  );
};

// ==================== INWARD TRANSPORT TAB ====================
const InwardTransportTab = ({ transports, onOpenChecklist, onViewDetails, onViewVehicle, onRefresh, getDeliveryDocumentUrl }) => {
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">PO / Ref</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle Type</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Driver Name</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Note</th>
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
                      <td className="p-3">
                        {transport.delivery_date ? (
                          <span className="text-cyan-400 font-medium">
                            {new Date(transport.delivery_date).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-blue-400">{transport.po_number || transport.transport_number || '-'}</td>
                      <td className="p-3 text-sm max-w-[200px] truncate" title={transport.products_summary || transport.product_names?.join(', ') || transport.po_items?.map(i => i.display_name || i.item_name).join(', ') || '-'}>
                        {transport.products_summary || transport.product_names?.join(', ') || transport.po_items?.map(i => i.display_name || i.item_name).join(', ') || '-'}
                      </td>
                      <td className="p-3">{transport.supplier_name || '-'}</td>
                      <td className="p-3">{transport.vehicle_number || '-'}</td>
                      <td className="p-3">
                        {transport.vehicle_type ? (
                          <Badge variant="outline" className="text-xs">
                            {transport.vehicle_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3">{transport.driver_name || '-'}</td>
                      <td className="p-3">
                        {transport.delivery_note_number || transport.delivery_note_document ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {transport.delivery_note_number || '-'}
                            </Badge>
                            {transport.delivery_note_document && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  const doc = transport.delivery_note_document;
                                  if (doc) {
                                    const url = await getDeliveryDocumentUrl(doc);
                                    if (url) {
                                      window.open(url, '_blank');
                                    }
                                  }
                                }}
                                title="View Delivery Note"
                              >
                                <FileText className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
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
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => onViewVehicle(transport)}
                            title="View Vehicle Information"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          {isComplete && (
                            <>
                              {checklist?.gross_weight && checklist?.tare_weight && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    const token = localStorage.getItem('erp_token');
                                    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                                    window.open(`${backendUrl}/api/pdf/weighment-slip/${checklist.id}?token=${token}`, '_blank');
                                  }}
                                  title="Download Weighment Slip"
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                          {!isComplete && (
                            <Button 
                              size="sm" 
                              onClick={() => onOpenChecklist(transport)}
                            >
                              <ClipboardCheck className="w-4 h-4 mr-1" />
                              {hasChecklist ? 'Continue' : 'Start'} Check
                            </Button>
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
      </div>
    </div>
  );
};

// ==================== OUTWARD TRANSPORT TAB ====================
const OutwardTransportTab = ({ transports, onOpenChecklist, onViewDetails, onRefresh, getDeliveryDocumentUrl }) => {
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
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Date</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Job / DO</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Container #</th>
                  <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Order</th>
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
                      <td className="p-3">
                        {transport.delivery_date ? (
                          <span className="text-cyan-400 font-medium">
                            {new Date(transport.delivery_date).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3 text-amber-400">
                        {transport.job_numbers?.join(', ') || transport.do_number || '-'}
                      </td>
                      <td className="p-3 text-sm max-w-[200px] truncate" title={transport.products_summary || transport.product_names?.join(', ') || transport.product_name || '-'}>
                        {transport.products_summary || transport.product_names?.join(', ') || transport.product_name || '-'}
                      </td>
                      <td className="p-3">{transport.customer_name || '-'}</td>
                      <td className="p-3">
                        <Badge className={transport.transport_type === 'CONTAINER' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}>
                          {transport.transport_type || 'LOCAL'}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-sm">{transport.container_number || '-'}</td>
                      <td className="p-3">
                        {transport.delivery_order_number || transport.delivery_order_document ? (
                          <div className="flex items-center gap-2">
                            {transport.delivery_order_number && (
                              <Badge variant="outline" className="text-xs text-amber-400">
                                {transport.delivery_order_number}
                              </Badge>
                            )}
                            {transport.delivery_order_document && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  const doc = transport.delivery_order_document;
                                  if (doc) {
                                    const url = await getDeliveryDocumentUrl(doc);
                                    if (url) {
                                      window.open(url, '_blank');
                                    }
                                  }
                                }}
                                title="View Delivery Order PDF"
                              >
                                <FileText className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
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
                        <div className="flex gap-1">
                          {isComplete && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => onViewDetails(transport)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View Details
                              </Button>
                              {checklist?.gross_weight && checklist?.tare_weight && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    const token = localStorage.getItem('erp_token');
                                    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                                    window.open(`${backendUrl}/api/pdf/weighment-slip/${checklist.id}?token=${token}`, '_blank');
                                  }}
                                  title="Download Weighment Slip"
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                          {!isComplete && (
                            <Button 
                              size="sm" 
                              onClick={() => onOpenChecklist(transport)}
                            >
                              <ClipboardCheck className="w-4 h-4 mr-1" />
                              {hasChecklist ? 'Continue' : 'Start'} Check
                            </Button>
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
                            // Fetch delivery order by DO number
                            const response = await api.get('/delivery-orders');
                            const deliveryOrder = response.data.find(
                              (d) => d.do_number === transport.delivery_note_number
                            );
                            
                            if (deliveryOrder) {
                              // Use the pdfAPI helper
                              const pdfUrl = pdfAPI.getDeliveryNoteUrl(deliveryOrder.id);
                              window.open(pdfUrl, '_blank');
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
                        onClick={() => openDocument(transport.delivery_note_document)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View PDF Document
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const url = await getDeliveryDocumentUrl(transport.delivery_note_document);
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
                        onClick={() => openDocument(transport.delivery_order_document)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View PDF Document
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const url = await getDeliveryDocumentUrl(transport.delivery_order_document);
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
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {transport.direction === 'inward' ? (
                        <ArrowDownToLine className="w-4 h-4 text-blue-400" />
                      ) : (
                        <ArrowUpFromLine className="w-4 h-4 text-amber-400" />
                      )}
                      <span className="text-sm font-medium capitalize">{transport.direction}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge className={transport.docType === 'DELIVERY_NOTE' ? "bg-blue-500/20 text-blue-400" : "bg-amber-500/20 text-amber-400"}>
                      {transport.docType.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <span className="font-mono font-medium">{transport.docNumber || '-'}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-sm">{transport.transport_number || transport.import_number || '-'}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-sm">{transport.po_number || transport.job_number || transport.job_numbers?.join(', ') || transport.import_number || '-'}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-sm">{transport.supplier_name || transport.customer_name || '-'}</span>
                  </td>
                  <td className="p-3">
                    <span className="text-sm font-medium text-green-400">
                      {formatDate(transport.expectedDate)}
                    </span>
                  </td>
                  <td className="p-3">
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
                            if (doc) {
                              const url = await getDeliveryDocumentUrl(doc);
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

export default SecurityQCPage;
