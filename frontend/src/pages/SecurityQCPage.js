import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { Card, CardContent } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { 
  Shield, ArrowDownToLine, ArrowUpFromLine, Scale, Check, X, 
  AlertTriangle, ClipboardCheck, FileCheck, Truck, Package,
  RefreshCw, Eye, FileText, Download, Bell, CheckCircle, Plus, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import api, { pdfAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { hasPagePermission } from '../lib/utils';

const SecurityQCPage = () => {
  const { user } = useAuth();
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
  
  // GRN modal
  const [showGRNModal, setShowGRNModal] = useState(false);
  const [selectedTransportForGRN, setSelectedTransportForGRN] = useState(null);
  const [selectedQCForGRN, setSelectedQCForGRN] = useState(null);
  
  // Multi-select for bulk DO
  const [selectedOutwardTransports, setSelectedOutwardTransports] = useState([]);
  const [showBulkDOModal, setShowBulkDOModal] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const [inwardRes, outwardRes, dashboardRes, inspectionsRes, deliveryOrdersRes, grnsRes] = await Promise.all([
        api.get('/security/inward'),
        api.get('/security/outward'),
        api.get('/security/dashboard'),
        api.get('/qc/inspections').catch(() => ({ data: [] })), // Load QC inspections
        api.get('/delivery-orders').catch(() => ({ data: [] })), // Load delivery orders to check for issued DOs
        api.get('/grn').catch(() => ({ data: [] })) // Load GRNs to check which transports have GRN created
      ]);
      
      // Store all transports (including completed) for inspection status alerts
      const allInward = inwardRes.data || [];
      const allOutward = outwardRes.data || [];
      const allInspections = inspectionsRes.data || [];
      const allDeliveryOrders = deliveryOrdersRes.data || [];
      const allGRNs = grnsRes.data || [];
      setAllTransports([...allInward, ...allOutward]);
      
      // Create a set of job order IDs that have DOs for quick lookup
      const jobOrderIdsWithDO = new Set();
      allDeliveryOrders.forEach(deliveryOrder => {
        if (deliveryOrder.job_order_id) {
          jobOrderIdsWithDO.add(deliveryOrder.job_order_id);
        }
      });
      
      // Deduplicate transports by PO number - keep the most relevant one
      const deduplicateByPO = (transports) => {
        const poMap = new Map();
        
        transports.forEach(transport => {
          // Use PO number as primary key, fallback to transport_number if no PO
          const poNumber = transport.po_number || transport.po_id;
          const transportNumber = transport.transport_number;
          
          // If no PO number, use transport_number as unique identifier
          const key = poNumber || transportNumber;
          if (!key) {
            // If no identifier at all, keep it (shouldn't happen but handle gracefully)
            return;
          }
          
          const existing = poMap.get(key);
          if (!existing) {
            poMap.set(key, transport);
          } else {
            // Priority: non-completed > completed, then most recent
            const existingCompleted = existing.security_checklist?.status === 'COMPLETED';
            const currentCompleted = transport.security_checklist?.status === 'COMPLETED';
            
            if (existingCompleted && !currentCompleted) {
              // Replace completed with non-completed
              poMap.set(key, transport);
            } else if (!existingCompleted && currentCompleted) {
              // Keep existing non-completed
              // Do nothing
            } else {
              // Both same completion status, keep the most recent one
              const existingDate = new Date(existing.created_at || existing.delivery_date || existing.eta || 0);
              const currentDate = new Date(transport.created_at || transport.delivery_date || transport.eta || 0);
              if (currentDate > existingDate) {
                poMap.set(key, transport);
              }
            }
          }
        });
        
        return Array.from(poMap.values());
      };
      
      // Helper function to check if a transport has a GRN created
      // GRN can be linked via:
      // 1. Direct PO link (po_id) -> transport.po_id
      // 2. QC inspection (qc_inspection_id) -> QC inspection (ref_id) -> transport.id or po_id
      const hasGRNCreated = (transport, inspections, grns) => {
        // First, check if there's a GRN directly linked to the PO
        if (transport.po_id) {
          const directGRN = grns.find(g => g.po_id === transport.po_id);
          if (directGRN) {
            return true;
          }
        }
        
        // Also check by PO number
        if (transport.po_number) {
          const grnByPONumber = grns.find(g => g.po_number === transport.po_number);
          if (grnByPONumber) {
            return true;
          }
        }
        
        // Then check via QC inspection path
        const qcInspection = inspections.find(ins => {
          if (ins.ref_type !== 'INWARD') {
            return false;
          }
          // Check by transport ID
          if (ins.ref_id === transport.id || 
              ins.transport_id === transport.id ||
              ins.ref_number === transport.transport_number) {
            return true;
          }
          // Check by PO ID (for DDP cases)
          if (transport.po_id && ins.ref_id === transport.po_id) {
            return true;
          }
          // Check by PO number (for DDP cases)
          if (transport.po_number && ins.ref_number === transport.po_number) {
            return true;
          }
          return false;
        });
        
        if (qcInspection) {
          // Check if there's a GRN with this QC inspection id
          const grn = grns.find(g => g.qc_inspection_id === qcInspection.id);
          if (grn) {
            return true;
          }
        }
        
        return false;
      };
      
      // Filter out completed security status items and transports with GRN created, deduplicate, and sort chronologically by delivery date
      const inwardFiltered = deduplicateByPO(
        allInward.filter(t => {
          // Filter out completed security checklists
          if (t.security_checklist?.status === 'COMPLETED') {
            return false;
          }
          // Filter out transports that have GRN created
          if (hasGRNCreated(t, allInspections, allGRNs)) {
            return false;
          }
          return true;
        })
      ).sort((a, b) => {
        const dateA = new Date(a.eta || a.delivery_date || a.created_at || 0);
        const dateB = new Date(b.eta || b.delivery_date || b.created_at || 0);
        return dateA - dateB; // Ascending order (earliest first)
      });
      
      // Helper function to check if a transport has an issued DO
      const hasIssuedDO = (transport) => {
        // Check various possible fields where DO information might be stored
        // First check direct DO fields
        if (transport.do_created === true || transport.do_created === 'true') {
          return true;
        }
        // Check if do_number exists (even if empty string, we want to check for truthy values)
        if (transport.do_number && transport.do_number.trim && transport.do_number.trim() !== '') {
          return true;
        }
        if (transport.do_number && typeof transport.do_number === 'string' && transport.do_number.length > 0) {
          return true;
        }
        // Check if DO number exists in nested delivery_order object
        if (transport.delivery_order?.do_number) {
          return true;
        }
        // Check if DO number pattern exists (e.g., "DO-000053")
        const doNumberPattern = /^DO-\d+/i;
        if (transport.do_number && typeof transport.do_number === 'string' && doNumberPattern.test(transport.do_number)) {
          return true;
        }
        // Check if any job orders linked to this transport have a DO
        if (transport.job_order_id && jobOrderIdsWithDO.has(transport.job_order_id)) {
          return true;
        }
        // Check if any job order IDs in job_numbers array have DOs
        if (transport.job_numbers && Array.isArray(transport.job_numbers)) {
          // Try to match job order IDs from job_numbers
          // Note: job_numbers might be strings like "JOB-000164", so we need to check if any DOs match
          const hasMatchingDO = allDeliveryOrders.some(deliveryOrder => {
            // Check if DO's job_order_id matches transport's job_order_id
            if (deliveryOrder.job_order_id && transport.job_order_id && deliveryOrder.job_order_id === transport.job_order_id) {
              return true;
            }
            // Also check if DO's job_order object has an id that matches
            if (deliveryOrder.job_order?.id && transport.job_order_id && deliveryOrder.job_order.id === transport.job_order_id) {
              return true;
            }
            // Check if DO's job_order_number matches any job number string in transport
            if (deliveryOrder.job_order_number && transport.job_numbers.includes(deliveryOrder.job_order_number)) {
              return true;
            }
            // Check if DO's job_order has a job_number that matches
            if (deliveryOrder.job_order?.job_number && transport.job_numbers.includes(deliveryOrder.job_order.job_number)) {
              return true;
            }
            return false;
          });
          if (hasMatchingDO) {
            return true;
          }
        }
        // Also check single job_order_id against all delivery orders
        if (transport.job_order_id) {
          const hasMatchingDO = allDeliveryOrders.some(deliveryOrder => {
            return (deliveryOrder.job_order_id === transport.job_order_id) || 
                   (deliveryOrder.job_order?.id === transport.job_order_id);
          });
          if (hasMatchingDO) {
            return true;
          }
        }
        return false;
      };
      
      // Filter out completed security status items and issued DOs, then sort chronologically by delivery date
      const outwardFiltered = allOutward
        .filter(t => {
          // Filter out completed security checklists
          if (t.security_checklist?.status === 'COMPLETED') {
            return false;
          }
          // Filter out issued DOs
          if (hasIssuedDO(t)) {
            return false;
          }
          return true;
        })
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

  const handleCreateGRN = (transport, qcInspection) => {
    setSelectedTransportForGRN(transport);
    setSelectedQCForGRN(qcInspection);
    setShowGRNModal(true);
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
      // Handle validation errors (array of error objects)
      let errorMessage = 'Failed to pass QC inspection';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      }
      toast.error(errorMessage);
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
      // Handle validation errors (array of error objects)
      let errorMessage = 'Failed to generate COA';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      }
      toast.error(errorMessage);
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
                onCreateGRN={handleCreateGRN}
                onRefresh={loadData}
                getDeliveryDocumentUrl={getDeliveryDocumentUrl}
                user={user}
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
                selectedTransports={selectedOutwardTransports}
                setSelectedTransports={setSelectedOutwardTransports}
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
                onBulkIssueDO={() => setShowBulkDOModal(true)}
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

      {showBulkDOModal && selectedOutwardTransports.length > 0 && (
        <BulkDOIssuanceModal
          transports={selectedOutwardTransports}
          onClose={() => {
            setShowBulkDOModal(false);
          }}
          onComplete={() => {
            setShowBulkDOModal(false);
            setSelectedOutwardTransports([]);
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

      {/* GRN Modal */}
      {showGRNModal && selectedTransportForGRN && (
        <GRNModal
          transport={selectedTransportForGRN}
          qcInspection={selectedQCForGRN}
          onClose={() => {
            setShowGRNModal(false);
            setSelectedTransportForGRN(null);
            setSelectedQCForGRN(null);
          }}
          onComplete={() => {
            setShowGRNModal(false);
            setSelectedTransportForGRN(null);
            setSelectedQCForGRN(null);
            loadData();
          }}
        />
      )}
    </div>
  );
};

// ==================== INWARD TRANSPORT TAB ====================
const InwardTransportTab = ({ transports, qcInspections, onOpenChecklist, onViewDetails, onViewVehicle, onViewQCInspection, onStartQC, onPassQC, onFailQC, onGenerateCOA, onCreateGRN, onRefresh, getDeliveryDocumentUrl, user }) => {
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
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Vehicle/Container</th>
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
                      
                      {/* Vehicle/Container Column */}
                      <td className="p-2 text-sm font-mono text-red-500">
                        {transport.vehicle_number || checklist?.vehicle_number || transport.container_number || checklist?.container_number || '-'}
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
                          <div className="flex flex-col gap-1">
                            <Badge className="bg-green-500/20 text-green-400 text-xs">
                              <Check className="w-3 h-3 mr-1" />
                              QC Passed
                            </Badge>
                            {hasPagePermission(user, '/grn', ['admin', 'security', 'inventory','sales','user','finance']) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onCreateGRN(transport, qcInspection)}
                                className="mt-1 bg-blue-500/10 hover:bg-blue-500/20 text-xs"
                              >
                                <Package className="w-3 h-3 mr-1" />
                                Create GRN
                              </Button>
                            )}
                          </div>
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
const OutwardTransportTab = ({ transports, qcInspections, selectedTransports, setSelectedTransports, onOpenChecklist, onViewDetails, onBulkIssueDO, onViewQCInspection, onStartQC, onPassQC, onFailQC, onGenerateCOA, onRefresh, getDeliveryDocumentUrl }) => {
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
          <div className="flex gap-2">
            {selectedTransports && selectedTransports.length > 0 && (
              <Button 
                size="sm" 
                className="bg-blue-500 hover:bg-blue-600"
                onClick={onBulkIssueDO}
              >
                <FileText className="w-3 h-3 mr-1" />
                Issue DO ({selectedTransports.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </Button>
          </div>
        </div>

        {transports.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No outward transports pending</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-muted/30">
                <tr>
                  <th className="p-2 text-center w-10">
                    <Checkbox 
                      checked={selectedTransports && selectedTransports.length > 0 && selectedTransports.length === transports.filter(t => t.security_checklist?.load_status === 'APPROVED' && !t.do_created && !t.do_number).length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const selectableTransports = transports.filter(t => 
                            t.security_checklist?.load_status === 'APPROVED' && !t.do_created && !t.do_number
                          );
                          setSelectedTransports(selectableTransports);
                        } else {
                          setSelectedTransports([]);
                        }
                      }}
                    />
                  </th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Date/Time</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Job Order</th>
                  <th className="p-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">Product</th>
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
                      {/* Checkbox */}
                      <td className="p-2 text-center">
                        {loadStatus === 'APPROVED' && !doCreated && (
                          <Checkbox 
                            checked={selectedTransports && selectedTransports.some(t => t.id === transport.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTransports(prev => [...prev, transport]);
                              } else {
                                setSelectedTransports(prev => prev.filter(t => t.id !== transport.id));
                              }
                            }}
                          />
                        )}
                      </td>
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
                      
                      {/* Product Column */}
                      <td className="p-2 text-sm max-w-[200px] truncate" title={transport.products_summary || transport.product_names?.join(', ') || transport.job_items?.map(i => i.display_name || i.item_name || i.product_name).join(', ') || transport.product_name || '-'}>
                        {transport.products_summary || transport.product_names?.join(', ') || transport.job_items?.map(i => i.display_name || i.item_name || i.product_name).join(', ') || transport.product_name || '-'}
                      </td>
                      
                      {/* Plate/Container # */}
                      <td className="p-2">
                        <span className="font-mono text-sm text-red-500">
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Handle validation errors (array of error objects)
      let errorMessage = 'Failed to complete';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      }
      toast.error(errorMessage);
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
  const [batchNumber, setBatchNumber] = useState('');

  // Load saved data from security checklist when modal opens
  useEffect(() => {
    if (transport?.security_checklist) {
      const checklist = transport.security_checklist;
      setFormData({
        arrival_time: checklist.arrival_time || new Date().toISOString(),
        empty_weight: checklist.tare_weight || '',
        vehicle_number: checklist.vehicle_number || transport?.vehicle_number || '',
        driver_name: checklist.driver_name || transport?.driver_name || '',
        transport_company: checklist.transport_company || '',
        arrival_checklist: checklist.checklist_items || {
          vehicle_condition: false,
          documents_verified: false,
          driver_identity_checked: false,
          safety_equipment: false,
        },
        notes: checklist.notes || ''
      });
      // Set batch number if available
      if (checklist.batch_number) {
        setBatchNumber(checklist.batch_number);
      }
    }
    // Fetch batch number from various sources
    fetchBatchNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);

  // Fetch batch number from job order, inward transport, or production
  const fetchBatchNumber = async () => {
    const jobNumber = transport?.job_numbers?.[0] || transport?.job_number;
    if (!jobNumber) return;

    try {
      // First, try to get from job order
      if (transport.job_order_id) {
        try {
          const jobResponse = await api.get(`/job-orders/${transport.job_order_id}`);
          if (jobResponse.data.batch_number) {
            setBatchNumber(jobResponse.data.batch_number);
            return;
          }
        } catch (error) {
          console.error('Failed to fetch job order:', error);
        }
      }

      // Second, try to get from production logs
      try {
        const prodResponse = await api.get(`/production/logs/batch/${jobNumber}`);
        if (prodResponse.data.found && prodResponse.data.batch_number) {
          setBatchNumber(prodResponse.data.batch_number);
          return;
        }
      } catch (error) {
        console.error('Failed to fetch from production:', error);
      }

      // Third, try to get from inward transport (if this is related to an inward transport)
      // This would require checking if there's a related inward transport
      // For now, we'll skip this as it's less common
    } catch (error) {
      console.error('Failed to fetch batch number:', error);
    }
  };

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchBatchNumber();
  }, []);

  const fetchBatchNumber = async () => {
    const jobNumber = transport.job_numbers?.[0] || transport.job_number;
    if (!jobNumber) return;

    try {
      // First, try to get from job order
      if (transport.job_order_id) {
        try {
          const jobResponse = await api.get(`/job-orders/${transport.job_order_id}`);
          if (jobResponse.data.batch_number) {
            setBatchNumber(jobResponse.data.batch_number);
            setBatchFound(true);
            return;
          }
        } catch (error) {
          console.error('Failed to fetch job order:', error);
        }
      }

      // Second, try to get from production logs
      try {
        const response = await api.get(`/production/logs/batch/${jobNumber}`);
        if (response.data.found) {
          setBatchNumber(response.data.batch_number);
          setProductionType(response.data.production_type);
          setBatchFound(true);
          return;
        }
      } catch (error) {
        console.error('Failed to fetch from production:', error);
      }

      // Third, check if batch number is already in security checklist
      if (arrivalData?.transport?.security_checklist?.batch_number) {
        setBatchNumber(arrivalData.transport.security_checklist.batch_number);
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
    // Delivery confirmation fields
    delivered_qty: '',
    delivery_notes: '',
    customer_name: '',
    receiver_name: '',
  });
  const [isIssuing, setIsIssuing] = useState(false);
  const [jobOrder, setJobOrder] = useState(null);
  const [loadingJobOrder, setLoadingJobOrder] = useState(false);

  const checklist = transport.security_checklist;
  const batchNumber = checklist?.batch_number || '';
  
  // Populate exit weights from security checklist (Loading QC data)
  useEffect(() => {
    if (checklist) {
      // Get tare_weight (empty weight) and gross_weight from Loading QC
      const emptyWeight = checklist.tare_weight || '';
      const grossWeight = checklist.gross_weight || '';
      
      setFormData(prev => ({
        ...prev,
        exit_empty_weight: emptyWeight ? String(emptyWeight) : prev.exit_empty_weight,
        exit_gross_weight: grossWeight ? String(grossWeight) : prev.exit_gross_weight,
      }));
    }
  }, [checklist]);
  
  // Fetch job order details if job_order_id exists
  useEffect(() => {
    const fetchJobOrder = async () => {
      if (transport.job_order_id && !jobOrder) {
        setLoadingJobOrder(true);
        try {
          const response = await api.get(`/job-orders/${transport.job_order_id}`);
          let fetchedJob = response.data;
          
          // Calculate product MT (individual product weight, not total job MT)
          // Formula: (net_weight_kg * quantity) / 1000 = product_mt
          if (fetchedJob.net_weight_kg && fetchedJob.quantity) {
            fetchedJob.product_mt = (fetchedJob.net_weight_kg * fetchedJob.quantity) / 1000;
          } else if (fetchedJob.unit === 'MT') {
            fetchedJob.product_mt = fetchedJob.quantity || 0;
          } else {
            fetchedJob.product_mt = fetchedJob.total_weight_mt || 0;
          }
          
          setJobOrder(fetchedJob);
        } catch (error) {
          console.error('Failed to fetch job order:', error);
        } finally {
          setLoadingJobOrder(false);
        }
      }
    };
    fetchJobOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport.job_order_id]);
  
  // Get expected quantity from job order - display "80 EA (14.8 MT)" for drums, "14.8 MT" for bulk
  // Input: EA for drums, MT for bulk
  let expectedQty, inputUnit, displayInfo;
  if (jobOrder) {
    if (jobOrder.unit && jobOrder.unit !== 'MT') {
      // Drums: show "80 EA (14.8 MT)", input in EA
      expectedQty = jobOrder.quantity || 0;
      inputUnit = jobOrder.unit; // EA
      const expectedMt = jobOrder.product_mt || 0;
      displayInfo = `${expectedQty} ${inputUnit} (${expectedMt.toFixed(2)} MT)`;
    } else {
      // Bulk: show "14.8 MT", input in MT
      expectedQty = jobOrder.product_mt || jobOrder.quantity || 0;
      inputUnit = 'MT';
      displayInfo = `${expectedQty.toFixed(2)} ${inputUnit}`;
    }
  } else {
    // Fallback to transport data if job order not loaded
    expectedQty = transport.quantity || transport.job_order?.quantity || 0;
    inputUnit = transport.unit || transport.job_order?.unit || 'MT';
    displayInfo = `${expectedQty} ${inputUnit}`;
  }
  
  const productName = jobOrder?.product_name || transport.product_name || transport.job_order?.product_name || '-';
  const isPartial = formData.delivered_qty && parseFloat(formData.delivered_qty) < parseFloat(expectedQty) && parseFloat(formData.delivered_qty) > 0;
  const undeliveredQty = parseFloat(expectedQty) - parseFloat(formData.delivered_qty || 0);
  
  const exit_net_weight = formData.exit_gross_weight && formData.exit_empty_weight
    ? parseFloat(formData.exit_gross_weight) - parseFloat(formData.exit_empty_weight)
    : 0;

  const handleConfirmDelivery = async (doData) => {
    if (!formData.delivered_qty || parseFloat(formData.delivered_qty) <= 0) {
      toast.error('Please enter delivered quantity');
      return;
    }

    if (parseFloat(formData.delivered_qty) > parseFloat(expectedQty)) {
      toast.error('Delivered quantity cannot exceed expected quantity');
      return;
    }

    if (!formData.receiver_name) {
      toast.error('Please enter receiver name');
      return;
    }

    try {
      const response = await api.post('/delivery/confirm', {
        transport_id: transport.id,
        delivery_order_id: doData.id,
        job_order_id: transport.job_order_id,
        delivered_qty: parseFloat(formData.delivered_qty),
        unit: inputUnit, // EA for drums, MT for bulk
        delivery_date: new Date().toISOString().split('T')[0],
        customer_name: formData.customer_name,
        receiver_name: formData.receiver_name,
        delivery_notes: formData.delivery_notes
      });

      if (response.data.is_partial) {
        toast.warning(
          `Partial delivery recorded. ${response.data.undelivered_qty} ${inputUnit} undelivered.`,
          { duration: 5000 }
        );
      } else {
        toast.success('Full delivery confirmed successfully!');
      }

      onComplete();
    } catch (error) {
      console.error('Delivery confirmation error:', error);
      // Handle validation errors (array of error objects)
      let errorMessage = 'Failed to confirm delivery';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      }
      toast.error(errorMessage);
    }
  };

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

    // If delivered quantity is provided, validate it
    if (formData.delivered_qty) {
      if (parseFloat(formData.delivered_qty) <= 0) {
        toast.error('Delivered quantity must be greater than 0');
        return;
      }
      if (parseFloat(formData.delivered_qty) > parseFloat(expectedQty)) {
        toast.error('Delivered quantity cannot exceed expected quantity');
        return;
      }
      if (isPartial && !formData.delivery_notes.trim()) {
        toast.error('Delivery notes are required for partial delivery');
        return;
      }
      if (!formData.receiver_name.trim()) {
        toast.error('Receiver name is required when confirming delivery');
        return;
      }
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
  
      const doData = response.data;
      toast.success(`Delivery Order ${doData.do_number} issued successfully`);
      
      // If delivered quantity is provided, confirm delivery immediately
      if (formData.delivered_qty && parseFloat(formData.delivered_qty) > 0) {
        await handleConfirmDelivery(doData);
      } else {
        onComplete();
      }
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div>
                <Label>Expected Quantity</Label>
                <p className="font-semibold text-blue-400">
                  {displayInfo}
                </p>
              </div>
              <div>
                <Label>Product</Label>
                <p className="text-sm">{productName}</p>
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

          {/* Delivery Confirmation Section */}
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-base font-semibold">Delivery Confirmation (Optional)</Label>
              <Badge variant="outline" className="text-xs">Can be filled later</Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="deliveredQty">
                  Actual Delivered Quantity ({inputUnit})
                </Label>
                <Input
                  id="deliveredQty"
                  type="number"
                  step={inputUnit === 'MT' ? "0.01" : "1"}
                  value={formData.delivered_qty}
                  onChange={(e) => setFormData(prev => ({...prev, delivered_qty: e.target.value}))}
                  placeholder={`Max: ${displayInfo}`}
                  max={expectedQty}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty if confirming delivery later
                </p>
              </div>
              <div>
                <Label htmlFor="receiverName">Receiver Name</Label>
                <Input
                  id="receiverName"
                  value={formData.receiver_name}
                  onChange={(e) => setFormData(prev => ({...prev, receiver_name: e.target.value}))}
                  placeholder="Person who received goods"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                value={formData.customer_name}
                onChange={(e) => setFormData(prev => ({...prev, customer_name: e.target.value}))}
                placeholder="Customer company name"
              />
            </div>

            <div>
              <Label htmlFor="deliveryNotes">
                Delivery Notes {isPartial && <span className="text-yellow-500">(Required for partial delivery)</span>}
              </Label>
              <Textarea
                id="deliveryNotes"
                value={formData.delivery_notes}
                onChange={(e) => setFormData(prev => ({...prev, delivery_notes: e.target.value}))}
                placeholder={isPartial 
                  ? "Explain reason for partial delivery (e.g., damaged goods, customer rejection, etc.)" 
                  : "Optional notes about the delivery"}
                rows={3}
                required={isPartial}
              />
            </div>

            {/* Partial Delivery Warning */}
            {isPartial && formData.delivered_qty && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-yellow-600 dark:text-yellow-400">Partial Delivery Detected</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                      {undeliveredQty.toFixed(inputUnit === 'MT' ? 2 : 0)} {inputUnit}
                    </span> will be marked as undelivered. Inventory adjustment will be required.
                  </p>
                </div>
              </div>
            )}

            {/* Full Delivery Success */}
            {!isPartial && formData.delivered_qty && parseFloat(formData.delivered_qty) === parseFloat(expectedQty) && (
              <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-600 dark:text-green-400">Full Delivery</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    All goods delivered successfully
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
            <p className="text-sm text-amber-400">
              <strong>Note:</strong> Issuing this DO will automatically reduce stock. If you enter delivered quantity now, delivery will be confirmed immediately. Otherwise, you can confirm delivery later from the Transport Window.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={isIssuing}>
            Cancel
          </Button>
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

// ==================== BULK DO ISSUANCE MODAL (MULTIPLE PRODUCTS) ====================
const BulkDOIssuanceModal = ({ transports, onClose, onComplete }) => {
  const [formData, setFormData] = useState({
    exit_empty_weight: '',
    exit_gross_weight: '',
  });
  // Per-product delivery confirmation data
  const [deliveryData, setDeliveryData] = useState({});
  const [commonDeliveryData, setCommonDeliveryData] = useState({
    customer_name: '',
    receiver_name: '',
    delivery_notes: '',
  });
  const [isIssuing, setIsIssuing] = useState(false);
  const [jobOrders, setJobOrders] = useState([]);
  const [loadingJobOrders, setLoadingJobOrders] = useState(false);

  // Populate exit weights from security checklist (Loading QC data)
  useEffect(() => {
    // Get weights from the first transport's security checklist (they should all be the same vehicle)
    const firstTransport = transports[0];
    if (firstTransport?.security_checklist) {
      const checklist = firstTransport.security_checklist;
      const emptyWeight = checklist.tare_weight || '';
      const grossWeight = checklist.gross_weight || '';
      
      setFormData(prev => ({
        ...prev,
        exit_empty_weight: emptyWeight ? String(emptyWeight) : prev.exit_empty_weight,
        exit_gross_weight: grossWeight ? String(grossWeight) : prev.exit_gross_weight,
      }));
    }
  }, [transports]);

  // Fetch job order details for all transports
  useEffect(() => {
    const fetchJobOrders = async () => {
      const jobOrderIds = transports
        .map(t => t.job_order_id)
        .filter(id => id);
      
      if (jobOrderIds.length === 0) return;

      setLoadingJobOrders(true);
      try {
        const jobOrderPromises = jobOrderIds.map(id => 
          api.get(`/job-orders/${id}`).catch(() => null)
        );
        const responses = await Promise.all(jobOrderPromises);
        const fetchedJobs = responses
          .filter(r => r && r.data)
          .map(r => r.data);
        
        // Calculate product MT weight (individual product MT, not total job MT)
        // Formula: (net_weight_kg * quantity) / 1000 = product_mt
        const enrichedJobs = fetchedJobs.map(job => {
          // Calculate individual product MT from net_weight_kg and quantity
          if (job.net_weight_kg && job.quantity) {
            job.product_mt = (job.net_weight_kg * job.quantity) / 1000;
          } else if (job.unit === 'MT') {
            // If unit is already MT, use quantity as product MT
            job.product_mt = job.quantity || 0;
          } else {
            // Fallback: use total_weight_mt if available (but this is job total, not product)
            job.product_mt = job.total_weight_mt || 0;
          }
          return job;
        });
        
        // Debug: Log job order data to check available fields
        console.log('Fetched Job Orders:', enrichedJobs.map(job => ({
          id: job.id,
          job_number: job.job_number,
          quantity: job.quantity,
          unit: job.unit,
          net_weight_kg: job.net_weight_kg,
          total_weight_mt: job.total_weight_mt, // This is job total (24.7)
          product_mt: job.product_mt // This is individual product MT (14.8 or 9.9)
        })));
        
        setJobOrders(enrichedJobs);
        
        // Initialize delivery data for each product
        const initialDeliveryData = {};
        fetchedJobs.forEach(job => {
          initialDeliveryData[job.id] = {
            delivered_qty: '',
            delivery_notes: '',
          };
        });
        setDeliveryData(initialDeliveryData);
      } catch (error) {
        console.error('Failed to fetch job orders:', error);
      } finally {
        setLoadingJobOrders(false);
      }
    };
    fetchJobOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate total quantity in MT from all job orders
  const totalQuantity = jobOrders.reduce((sum, job) => {
    // Use total_weight_mt if available (for EA/drum units), otherwise use quantity if unit is MT
    if (job.total_weight_mt) {
      return sum + parseFloat(job.total_weight_mt);
    } else if (job.unit === 'MT') {
      return sum + parseFloat(job.quantity || 0);
    } else {
      // Fallback: try to calculate from transport quantity if job order not loaded yet
      const transport = transports.find(t => t.job_order_id === job.id);
      return sum + parseFloat(transport?.quantity || 0);
    }
  }, 0);

  const exit_net_weight = formData.exit_gross_weight && formData.exit_empty_weight
    ? parseFloat(formData.exit_gross_weight) - parseFloat(formData.exit_empty_weight)
    : 0;

  // Get job order details for a transport
  const getJobOrderForTransport = (transport) => {
    return jobOrders.find(job => job.id === transport.job_order_id);
  };

  // Handle confirming delivery for a specific product
  const handleConfirmDeliveryForProduct = async (doData, transport, jobOrder) => {
    const productDeliveryData = deliveryData[jobOrder.id];
    if (!productDeliveryData || !productDeliveryData.delivered_qty || parseFloat(productDeliveryData.delivered_qty) <= 0) {
      return; // Skip if no delivered quantity entered
    }

    const deliveredQty = parseFloat(productDeliveryData.delivered_qty);
    // For drums: send EA, for bulk: send MT
    let expectedQty, unit;
    if (jobOrder.unit && jobOrder.unit !== 'MT') {
      // Drums: input and send in EA
      expectedQty = jobOrder.quantity || 0;
      unit = jobOrder.unit; // EA
    } else {
      // Bulk: input and send in MT
      expectedQty = jobOrder.product_mt || jobOrder.quantity || 0;
      unit = 'MT';
    }

    if (deliveredQty > expectedQty) {
      toast.error(`Delivered quantity for ${jobOrder.product_name} cannot exceed expected quantity`);
      return;
    }

    try {
      // Find the line item for this job order in the DO
      const lineItem = doData.delivery_order?.line_items?.find(
        item => item.job_order_id === jobOrder.id
      );

      if (!lineItem) {
        console.warn(`Line item not found for job order ${jobOrder.id}`);
        return;
      }

      const response = await api.post('/delivery/confirm', {
        transport_id: transport.id,
        delivery_order_id: doData.delivery_order.id,
        job_order_id: jobOrder.id,
        delivered_qty: deliveredQty,
        unit: unit, // EA for drums, MT for bulk
        delivery_date: new Date().toISOString().split('T')[0],
        customer_name: commonDeliveryData.customer_name,
        receiver_name: commonDeliveryData.receiver_name,
        delivery_notes: productDeliveryData.delivery_notes || commonDeliveryData.delivery_notes
      });

      if (response.data.is_partial) {
        toast.warning(
          `Partial delivery for ${jobOrder.product_name}: ${response.data.undelivered_qty} ${unit} undelivered.`,
          { duration: 5000 }
        );
      } else {
        toast.success(`Full delivery confirmed for ${jobOrder.product_name}`);
      }
    } catch (error) {
      console.error(`Failed to confirm delivery for ${jobOrder.product_name}:`, error);
      // Handle validation errors (array of error objects)
      let errorMessage = `Failed to confirm delivery for ${jobOrder.product_name}`;
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg || JSON.stringify(err)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      }
      toast.error(errorMessage);
    }
  };

  const handleIssueDO = async () => {
    if (!formData.exit_empty_weight || !formData.exit_gross_weight) {
      toast.error('Please enter both empty and gross weights');
      return;
    }

    // Validate delivery data if any is provided
    const hasAnyDeliveryData = Object.values(deliveryData).some(
      data => data.delivered_qty && parseFloat(data.delivered_qty) > 0
    );

    if (hasAnyDeliveryData) {
      if (!commonDeliveryData.receiver_name.trim()) {
        toast.error('Receiver name is required when confirming delivery');
        return;
      }

      // Validate each product's delivery data
      for (const jobOrder of jobOrders) {
        const productData = deliveryData[jobOrder.id];
        if (productData && productData.delivered_qty) {
          const deliveredQty = parseFloat(productData.delivered_qty);
          // Use product MT (individual product weight) for validation
          let expectedQty;
          if (jobOrder.product_mt && jobOrder.product_mt > 0) {
            expectedQty = jobOrder.product_mt;
          } else if (jobOrder.unit === 'MT') {
            expectedQty = jobOrder.quantity || 0;
          } else {
            expectedQty = jobOrder.quantity || 0;
          }

          if (deliveredQty <= 0) {
            toast.error(`Delivered quantity for ${jobOrder.product_name} must be greater than 0`);
            return;
          }

          if (deliveredQty > expectedQty) {
            toast.error(`Delivered quantity for ${jobOrder.product_name} cannot exceed expected quantity (${expectedQty.toFixed(2)} MT)`);
            return;
          }

          // If partial, require notes
          if (deliveredQty < expectedQty && !productData.delivery_notes.trim() && !commonDeliveryData.delivery_notes.trim()) {
            toast.error(`Delivery notes are required for partial delivery of ${jobOrder.product_name}`);
            return;
          }
        }
      }
    }

    try {
      setIsIssuing(true);

      // Collect all job order IDs and batch numbers
      const jobOrdersData = transports.map(t => ({
        job_order_id: t.job_order_id,
        batch_number: t.security_checklist?.batch_number || '',
      }));

      // Issue consolidated DO
      const response = await api.post('/delivery-orders/from-security-bulk', {
        job_orders: jobOrdersData,
        exit_empty_weight: parseFloat(formData.exit_empty_weight),
        exit_gross_weight: parseFloat(formData.exit_gross_weight),
        exit_net_weight: exit_net_weight,
      });

      const doData = response.data;
      toast.success(`Delivery Order ${doData.do_number} issued for ${doData.job_count} products`);

      // Confirm delivery for each product that has delivery data
      if (hasAnyDeliveryData) {
        const confirmationPromises = transports.map(transport => {
          const jobOrder = getJobOrderForTransport(transport);
          if (jobOrder && deliveryData[jobOrder.id]?.delivered_qty) {
            return handleConfirmDeliveryForProduct(doData, transport, jobOrder);
          }
          return Promise.resolve();
        });

        await Promise.all(confirmationPromises);
      }

      onComplete();
    } catch (error) {
      console.error('Failed to issue bulk DO:', error);
      
      // Handle validation errors
      let errorMessage = 'Failed to issue DO';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Delivery Order - Multiple Products</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Products List */}
          <div className="p-4 bg-muted/20 rounded max-h-60 overflow-y-auto">
            <Label className="mb-2 block">Products Included ({transports.length})</Label>
            {loadingJobOrders ? (
              <div className="text-center py-4">
                <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground mt-2">Loading product details...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {transports.map((transport, idx) => {
                  const jobOrder = getJobOrderForTransport(transport);
                  // For display: show "80 EA (14.8 MT)" for drums, "14.8 MT" for bulk
                  let displayText;
                  if (jobOrder) {
                    if (jobOrder.unit && jobOrder.unit !== 'MT' && jobOrder.quantity && jobOrder.product_mt) {
                      // Drums: show "80 EA (14.8 MT)"
                      displayText = `${jobOrder.quantity} ${jobOrder.unit} (${jobOrder.product_mt.toFixed(2)} MT)`;
                    } else if (jobOrder.unit === 'MT' || !jobOrder.unit) {
                      // Bulk: show "14.8 MT"
                      const qty = jobOrder.product_mt || jobOrder.quantity || 0;
                      displayText = `${qty.toFixed(2)} MT`;
                    } else {
                      // Fallback
                      displayText = `${jobOrder.quantity || 0} ${jobOrder.unit || 'MT'}`;
                    }
                  } else {
                    displayText = `${transport.quantity || 0} ${transport.unit || 'MT'}`;
                  }
                  
                  const productData = deliveryData[jobOrder?.id] || {};
                  const deliveredQty = parseFloat(productData.delivered_qty || 0);
                  
                  // Calculate expected quantity based on unit (EA for drums, MT for bulk)
                  let expectedQty, expectedUnit;
                  if (jobOrder?.unit && jobOrder.unit !== 'MT') {
                    // Drums: compare in EA
                    expectedQty = jobOrder.quantity || 0;
                    expectedUnit = jobOrder.unit;
                  } else {
                    // Bulk: compare in MT
                    expectedQty = jobOrder?.product_mt || jobOrder?.quantity || 0;
                    expectedUnit = 'MT';
                  }
                  
                  const isPartial = deliveredQty > 0 && deliveredQty < expectedQty;

                  return (
                    <div key={idx} className="flex justify-between items-center p-2 bg-background rounded">
                      <div className="flex-1">
                        <p className="font-mono text-amber-400 text-sm">
                          {transport.job_numbers?.join(', ') || transport.job_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {transport.product_name || jobOrder?.product_name} - {displayText}
                        </p>
                        <p className="text-xs text-blue-400">
                          Batch: {transport.security_checklist?.batch_number || 'N/A'}
                        </p>
                        {isPartial && (
                          <p className="text-xs text-yellow-500 mt-1">
                            ⚠️ Partial: {deliveredQty.toFixed(expectedUnit === 'MT' ? 2 : 0)}/{expectedQty.toFixed(expectedUnit === 'MT' ? 2 : 0)} {expectedUnit}
                          </p>
                        )}
                      </div>
                      <Badge>{transport.packaging || 'BULK'}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Weighment */}
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

          {/* Delivery Confirmation Section */}
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-base font-semibold">Delivery Confirmation (Optional)</Label>
              <Badge variant="outline" className="text-xs">Can be filled later</Badge>
            </div>

            {/* Common Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  value={commonDeliveryData.customer_name}
                  onChange={(e) => setCommonDeliveryData(prev => ({...prev, customer_name: e.target.value}))}
                  placeholder="Customer company name"
                />
              </div>
              <div>
                <Label htmlFor="receiverName">Receiver Name</Label>
                <Input
                  id="receiverName"
                  value={commonDeliveryData.receiver_name}
                  onChange={(e) => setCommonDeliveryData(prev => ({...prev, receiver_name: e.target.value}))}
                  placeholder="Person who received goods"
                />
              </div>
            </div>

            {/* Per-Product Delivery Quantities */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Per-Product Delivered Quantities</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {transports.map((transport, idx) => {
                  const jobOrder = getJobOrderForTransport(transport);
                  if (!jobOrder) return null;

                  // For delivery confirmation: input in EA for drums, MT for bulk
                  let expectedQty, inputUnit, displayInfo, maxQty;
                  if (jobOrder.unit && jobOrder.unit !== 'MT') {
                    // Drums: input in EA, show "80 EA (14.8 MT)"
                    expectedQty = jobOrder.quantity || 0;
                    inputUnit = jobOrder.unit; // EA
                    maxQty = expectedQty;
                    const expectedMt = jobOrder.product_mt || 0;
                    displayInfo = `${expectedQty} ${inputUnit} (${expectedMt.toFixed(2)} MT)`;
                  } else {
                    // Bulk: input in MT, show "14.8 MT"
                    expectedQty = jobOrder.product_mt || jobOrder.quantity || 0;
                    inputUnit = 'MT';
                    maxQty = expectedQty;
                    displayInfo = `${expectedQty.toFixed(2)} ${inputUnit}`;
                  }
                  
                  const productData = deliveryData[jobOrder.id] || {};
                  const deliveredQty = parseFloat(productData.delivered_qty || 0);
                  const isPartial = deliveredQty > 0 && deliveredQty < maxQty;
                  const undeliveredQty = maxQty - deliveredQty;

                  return (
                    <div key={idx} className="p-3 bg-muted/10 rounded border border-border">
                      <div className="grid grid-cols-3 gap-4 mb-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Product</Label>
                          <p className="text-sm font-medium">{jobOrder.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Expected: {displayInfo}
                          </p>
                        </div>
                        <div>
                          <Label htmlFor={`deliveredQty-${idx}`} className="text-xs">
                            Delivered Quantity ({inputUnit})
                          </Label>
                          <Input
                            id={`deliveredQty-${idx}`}
                            type="number"
                            step={inputUnit === 'MT' ? "0.01" : "1"}
                            value={productData.delivered_qty || ''}
                            onChange={(e) => {
                              setDeliveryData(prev => ({
                                ...prev,
                                [jobOrder.id]: {
                                  ...prev[jobOrder.id],
                                  delivered_qty: e.target.value,
                                  delivered_unit: inputUnit // Store the unit
                                }
                              }));
                            }}
                            placeholder={`Max: ${expectedQty.toFixed(2)}`}
                            max={expectedQty}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`deliveryNotes-${idx}`} className="text-xs">
                            Notes {isPartial && <span className="text-yellow-500">(Required)</span>}
                          </Label>
                          <Input
                            id={`deliveryNotes-${idx}`}
                            value={productData.delivery_notes || ''}
                            onChange={(e) => {
                              setDeliveryData(prev => ({
                                ...prev,
                                [jobOrder.id]: {
                                  ...prev[jobOrder.id],
                                  delivery_notes: e.target.value
                                }
                              }));
                            }}
                            placeholder={isPartial ? "Reason for partial delivery" : "Optional"}
                            className="text-sm"
                          />
                        </div>
                      </div>
                      {isPartial && (
                        <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs">
                          <AlertTriangle className="w-4 h-4 text-yellow-600 inline mr-1" />
                          <span className="text-yellow-600">
                            Partial delivery: {undeliveredQty.toFixed(inputUnit === 'MT' ? 2 : 0)} {inputUnit} undelivered
                          </span>
                        </div>
                      )}
                      {deliveredQty > 0 && deliveredQty === expectedQty && (
                        <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded text-xs">
                          <CheckCircle className="w-4 h-4 text-green-600 inline mr-1" />
                          <span className="text-green-600">Full delivery</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Common Delivery Notes */}
            <div>
              <Label htmlFor="commonDeliveryNotes">Common Delivery Notes</Label>
              <Textarea
                id="commonDeliveryNotes"
                value={commonDeliveryData.delivery_notes}
                onChange={(e) => setCommonDeliveryData(prev => ({...prev, delivery_notes: e.target.value}))}
                placeholder="Optional notes that apply to all products"
                rows={2}
              />
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded">
            <p className="text-sm text-amber-400">
              <strong>Total Products:</strong> {transports.length} | 
              <strong> Total Quantity:</strong> {totalQuantity.toFixed(2)} MT
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Stock will be reduced for all products and packaging automatically. If you enter delivered quantities now, delivery will be confirmed immediately. Otherwise, you can confirm delivery later from the Transport Window.
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
            {isIssuing ? 'Issuing...' : 'Issue DO for All'}
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
          text_value: '',
          number_value: null,
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

  const handleParameterTextValue = (parameterId, textValue) => {
    setParameterResults(prev => ({
      ...prev,
      [parameterId]: {
        ...prev[parameterId],
        text_value: textValue
      }
    }));
  };

  const handleParameterNumberValue = (parameterId, numberValue) => {
    setParameterResults(prev => ({
      ...prev,
      [parameterId]: {
        ...prev[parameterId],
        number_value: numberValue !== '' ? parseFloat(numberValue) : null
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
          text_value: result.text_value || '',
          number_value: result.number_value || null,
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
                          <div className="flex gap-2 items-center">
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
                            <Input
                              type="text"
                              placeholder="Appearence values"
                              value={parameterResults[param.id]?.text_value || ''}
                              onChange={(e) => handleParameterTextValue(param.id, e.target.value)}
                              className="w-32 text-sm"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Enter the value you recieved"
                              value={parameterResults[param.id]?.number_value !== null && parameterResults[param.id]?.number_value !== undefined 
                                ? parameterResults[param.id].number_value 
                                : ''}
                              onChange={(e) => handleParameterNumberValue(param.id, e.target.value)}
                              className="w-32 text-sm"
                            />
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

// ==================== GRN MODAL ====================
const GRNModal = ({ transport, qcInspection, onClose, onComplete }) => {
  const [formData, setFormData] = useState({
    supplier: transport?.supplier_name || '',
    delivery_note: transport?.delivery_note_number || '',
    notes: `GRN created from QC Inspection ${qcInspection?.qc_number || ''}`,
    items: []
  });
  const [poLines, setPoLines] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let loadedPoLines = [];
      
      // Load PO lines if PO ID exists
      if (transport?.po_id) {
        const poResponse = await api.get(`/purchase-orders/${transport.po_id}`);
        const po = poResponse.data;
        
        // Get PO lines
        const poLinesResponse = await api.get(`/purchase-order-lines?po_id=${transport.po_id}`);
        loadedPoLines = poLinesResponse.data?.data || poLinesResponse.data || [];
        setPoLines(loadedPoLines);
        
        // Set supplier from PO
        if (po?.supplier_name) {
          setFormData(prev => ({ ...prev, supplier: po.supplier_name }));
        }
      }
      
      // Load products and inventory items
      const [productsRes, rawItemsRes, packItemsRes] = await Promise.all([
        api.get('/products'),
        api.get('/inventory-items?item_type=RAW'),
        api.get('/inventory-items?item_type=PACK')
      ]);
      
      const allProducts = [
        ...(productsRes.data || []),
        ...(rawItemsRes.data || []).map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.uom || 'KG',
          item_type: 'RAW'
        })),
        ...(packItemsRes.data || []).map(item => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.uom || 'EA',
          item_type: 'PACK'
        }))
      ];
      
      setProducts(allProducts);
      const allInventoryItems = [...(rawItemsRes.data || []), ...(packItemsRes.data || [])];
      setInventoryItems(allInventoryItems);
      
      // Initialize items from transport or QC inspection
      const initialItems = [];
      if (transport?.po_items && transport.po_items.length > 0) {
        transport.po_items.forEach(poItem => {
          const matchingPoLine = loadedPoLines.find(
            line => line.item_id === poItem.item_id || line.item_id === poItem.id
          );
          
          const isDrummed = matchingPoLine?.procurement_type === 'Drummed';
          const packagingItem = matchingPoLine?.packaging_item_id ? 
            allInventoryItems.find(i => i.id === matchingPoLine.packaging_item_id) : null;
          
          // Calculate quantities
          const arrivalQty = qcInspection?.arrival_quantity || poItem.quantity || transport.quantity || 0;
          const orderedQty = matchingPoLine ? (matchingPoLine.qty - (matchingPoLine.received_qty || 0)) : 0;
          
          initialItems.push({
            product_id: poItem.item_id || poItem.id,
            product_name: poItem.display_name || poItem.item_name || poItem.name,
            sku: poItem.sku || '-',
            quantity: 0, // Always blank on modal open
            received_qty: 0, // NEW: Always blank on modal open
            ordered_qty: matchingPoLine ? matchingPoLine.qty : 0, // Total ordered from PO line
            received_qty_till_date: matchingPoLine ? (matchingPoLine.received_qty || 0) : 0, // Cumulative received
            unit: poItem.unit || poItem.uom || 'KG',
            net_weight_kg: null,
            is_drummed: isDrummed,
            packaging_name: packagingItem?.name || null,
            packaging_item_id: matchingPoLine?.packaging_item_id || null,
            po_line_id: matchingPoLine?.id || null, // Track PO line ID for partial delivery claims
            // For drummed items, calculate MT and drum count
            drum_count: isDrummed ? 0 : null  // Always blank on modal open
          });
        });
      } else if (qcInspection?.arrival_quantity) {
        // Fallback: create item from QC inspection
        initialItems.push({
          product_id: transport?.product_id || '',
          product_name: transport?.products_summary || transport?.product_names?.[0] || 'Unknown',
          sku: '-',
          quantity: 0, // Always blank on modal open
          received_qty: 0, // Always blank on modal open
          ordered_qty: 0, // Default to 0 if no PO
          received_qty_till_date: 0,
          unit: 'KG',
          net_weight_kg: null,
          is_drummed: false,
          drum_count: null,
          po_line_id: null // No PO line if no PO
        });
      }
      
      setFormData(prev => ({ ...prev, items: initialItems }));
    } catch (error) {
      console.error('Failed to load GRN data:', error);
      toast.error('Failed to load data for GRN');
    } finally {
      setIsLoading(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
        items: [...prev.items, {
          product_id: '',
          product_name: '',
          sku: '',
          quantity: 0,
          received_qty: 0,  // Always blank on add
          ordered_qty: 0,
          received_qty_till_date: 0,
          unit: 'KG',
          net_weight_kg: null,
          is_drummed: false,
          drum_count: null,
          packaging_name: null,
          packaging_item_id: null,
          po_line_id: null
        }]
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleProductSelect = async (index, productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      handleItemChange(index, 'product_id', productId);
      handleItemChange(index, 'product_name', product.name);
      handleItemChange(index, 'sku', product.sku || '-');
      handleItemChange(index, 'unit', product.unit || 'KG');
      
      // Find matching PO line and set ordered_qty, received_qty_till_date, and po_line_id
      const matchingPoLine = poLines.find(
        line => line.item_id === productId
      );
      if (matchingPoLine) {
        handleItemChange(index, 'ordered_qty', matchingPoLine.qty);  // Total ordered
        handleItemChange(index, 'received_qty_till_date', matchingPoLine.received_qty || 0);  // Cumulative received
        handleItemChange(index, 'po_line_id', matchingPoLine.id);
        // Reset received_qty when product is selected
        handleItemChange(index, 'received_qty', 0);
        handleItemChange(index, 'quantity', 0);
      } else {
        handleItemChange(index, 'ordered_qty', 0);
        handleItemChange(index, 'received_qty_till_date', 0);
        handleItemChange(index, 'po_line_id', null);
        handleItemChange(index, 'received_qty', 0);
        handleItemChange(index, 'quantity', 0);
      }
      
      // Auto-fill net_weight_kg for drummed items
      const item = formData.items[index];
      if (item.is_drummed && item.packaging_item_id) {
        try {
          // Try to get net weight from product-packaging config
          const configRes = await api.get('/product-packaging-configs/lookup', {
            params: {
              product_id: productId,
              packaging_id: item.packaging_item_id
            }
          });
          
          if (configRes.data && configRes.data.net_weight_kg) {
            handleItemChange(index, 'net_weight_kg', configRes.data.net_weight_kg);
          } else {
            // Fallback: try to get from packaging item default
            const packagingItem = inventoryItems.find(i => i.id === item.packaging_item_id);
            if (packagingItem?.net_weight_kg_default) {
              handleItemChange(index, 'net_weight_kg', packagingItem.net_weight_kg_default);
            } else if (packagingItem?.capacity_liters && product.density_kg_per_l) {
              // Calculate from density
              const netWeight = packagingItem.capacity_liters * product.density_kg_per_l * 0.9; // 90% fill
              handleItemChange(index, 'net_weight_kg', Math.round(netWeight));
            }
          }
        } catch (error) {
          console.error('Failed to fetch net weight:', error);
        }
      }
    }
  };

  const handleSubmit = async () => {
    // Validate items
    if (formData.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    for (const item of formData.items) {
      if (!item.product_id) {
        toast.error('Please select product for all items');
        return;
      }
      
      if (item.is_drummed) {
        // Validate drummed items
        if (!item.drum_count || item.drum_count <= 0) {
          toast.error(`Please provide drum count for: ${item.product_name}`);
          return;
        }
        if (!item.net_weight_kg || item.net_weight_kg <= 0) {
          toast.error(`Please provide net weight per drum (kg) for: ${item.product_name}`);
          return;
        }
      } else {
        // Validate bulk items - check received_qty or quantity
        const receivedQty = item.received_qty || item.quantity;
        if (!receivedQty || receivedQty <= 0) {
          toast.error(`Please provide received quantity for: ${item.product_name}`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const grnData = {
        supplier: formData.supplier,
        delivery_note: formData.delivery_note,
        notes: formData.notes,
        po_id: transport?.po_id || null,
        items: formData.items.map(item => {
          if (item.is_drummed) {
            // For drummed: send drum_count as quantity, and net_weight_kg
            // CRITICAL: Also send packaging fields so backend can update packaging stock
            const drumCount = item.drum_count || item.received_qty || 0;
            return {
              product_id: item.product_id,
              product_name: item.product_name,
              sku: item.sku,
              quantity: parseFloat(drumCount), // Number of drums (backward compatibility)
              received_qty: parseFloat(drumCount), // NEW: User input for this delivery
              unit: 'EA', // Each/drum
              net_weight_kg: parseFloat(item.net_weight_kg),
              procurement_type: 'Drummed',
              packaging_item_id: item.packaging_item_id,
              packaging_qty: parseFloat(drumCount),
              ordered_qty: item.ordered_qty || null, // Include ordered_qty for partial delivery tracking
              po_line_id: item.po_line_id || null // Include po_line_id for partial delivery claims
            };
          } else {
            // For bulk: send received_qty and unit
            const receivedQty = item.received_qty || item.quantity;
            return {
              product_id: item.product_id,
              product_name: item.product_name,
              sku: item.sku,
              quantity: parseFloat(receivedQty),  // Keep for backward compatibility
              received_qty: parseFloat(receivedQty),  // NEW: User input for this delivery
              unit: item.unit,
              net_weight_kg: null,
              procurement_type: 'Bulk',
              ordered_qty: item.ordered_qty || null, // Include ordered_qty for partial delivery tracking
              po_line_id: item.po_line_id || null // Include po_line_id for partial delivery claims
            };
          }
        })
      };

      const response = await api.post('/grn', grnData);
      
      // Check for partial deliveries and show appropriate message
      if (response.data?.has_partial_delivery) {
        toast.warning(`GRN created with ${response.data.partial_claims_count} partial delivery item(s). Shortages tracked for procurement.`);
      } else {
        toast.success('GRN created successfully. Stock updated immediately.');
      }
      
      onComplete();
    } catch (error) {
      console.error('Failed to create GRN:', error);
      // Handle validation errors (array of error objects)
      let errorMessage = 'Failed to create GRN';
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
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-500" />
            Create GRN - {transport?.po_number || transport?.transport_number || 'N/A'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Supplier and Vehicle Info */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/20 rounded-lg">
            <div>
              <Label className="text-xs text-muted-foreground">Supplier</Label>
              <Input
                value={formData.supplier}
                onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Delivery Note</Label>
              <Input
                value={formData.delivery_note}
                onChange={(e) => setFormData(prev => ({ ...prev, delivery_note: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Vehicle Number</Label>
              <p className="text-sm font-medium">{transport?.vehicle_number || '-'}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Driver Name</Label>
              <p className="text-sm font-medium">{transport?.driver_name || '-'}</p>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-semibold">Items</Label>
              <Button size="sm" variant="outline" onClick={handleAddItem}>
                <Plus className="w-4 h-4 mr-1" />
                Add Item
              </Button>
            </div>

            <div className="space-y-4">
              {formData.items.map((item, index) => {
                const matchingPoLine = poLines.find(
                  line => line.item_id === item.product_id
                );
                const isDrummed = item.is_drummed || matchingPoLine?.procurement_type === 'Drummed';
                
                // Calculate if this is a partial delivery
                const isPartial = transport?.po_id && item.ordered_qty > 0 && 
                  (isDrummed ? (parseFloat(item.drum_count || 0)) < item.ordered_qty : 
                   parseFloat(item.quantity || 0) < item.ordered_qty);
                const shortage = item.ordered_qty > 0 ? 
                  (isDrummed ? item.ordered_qty - parseFloat(item.drum_count || 0) : 
                   item.ordered_qty - parseFloat(item.quantity || 0)) : 0;
                
                return (
                  <Card key={index} className={`p-4 ${isPartial ? 'bg-yellow-50 border-yellow-200' : ''}`}>
                    <div className="space-y-4">
                      {/* Product Info */}
                      <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-12 md:col-span-4">
                          <Label className="text-xs">Product *</Label>
                          <Select
                            value={item.product_id}
                            onValueChange={(value) => handleProductSelect(index, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(product => (
                                <SelectItem key={product.id} value={product.id}>
                                  {product.name} {product.sku ? `(${product.sku})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* PO Info Strip (read-only) - shown when PO is selected */}
                      {transport?.po_id && item.product_id && item.ordered_qty > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                              <span className="text-xs text-muted-foreground">PO Qty:</span>
                              <p className="font-semibold">{item.ordered_qty} {item.unit}</p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">Received Till Date:</span>
                              <p className="font-semibold">{item.received_qty_till_date || 0} {item.unit}</p>
                            </div>
                            <div>
                              <span className="text-xs text-muted-foreground">Remaining PO Qty:</span>
                              <p className="font-semibold">{item.ordered_qty - (item.received_qty_till_date || 0)} {item.unit}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bulk Items Display */}
                      {!isDrummed && (
                        <>
                          <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-12 md:col-span-4">
                              <Label className="text-xs">Received Qty (This Delivery) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.received_qty || item.quantity || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  handleItemChange(index, 'received_qty', val);
                                  handleItemChange(index, 'quantity', val);  // Keep quantity for backward compatibility
                                }}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Enter the quantity physically received in this delivery.
                              </p>
                              {isPartial && (
                                <span className="text-xs text-yellow-600 ml-1">(Partial)</span>
                              )}
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <Label className="text-xs">Unit *</Label>
                              <Select
                                value={item.unit}
                                onValueChange={(value) => handleItemChange(index, 'unit', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="KG">KG</SelectItem>
                                  <SelectItem value="MT">MT</SelectItem>
                                  <SelectItem value="L">L</SelectItem>
                                  <SelectItem value="EA">EA</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-12 md:col-span-4">
                              <Label className="text-xs text-muted-foreground">Total (MT)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.unit === 'MT' ? item.quantity : (item.quantity / 1000).toFixed(3)}
                                disabled
                                className="bg-muted"
                              />
                            </div>
                            <div className="col-span-12 md:col-span-3 flex items-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveItem(index)}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                          </div>
                          {/* Partial Delivery Warning for Bulk Items */}
                          {transport?.po_id && item.ordered_qty > 0 && 
                           (parseFloat(item.received_qty || item.quantity || 0)) > 0 && 
                           (item.received_qty_till_date + (item.received_qty || item.quantity || 0)) < item.ordered_qty && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                              <p className="text-xs text-yellow-800">
                                ⚠️ Partial delivery: {item.received_qty || item.quantity}/{item.ordered_qty} {item.unit} in this delivery
                                - Remaining: {item.ordered_qty - (item.received_qty_till_date + (item.received_qty || item.quantity || 0))} {item.unit} will be tracked for procurement
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      {/* Drummed Items Display */}
                      {isDrummed && (
                        <>
                          <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                            <Label className="text-xs font-semibold text-blue-400 mb-2 block">
                              Packaging: {item.packaging_name || 'Not specified'}
                            </Label>
                          </div>
                          <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-12 md:col-span-4">
                              <Label className="text-xs">
                                Drum Count (This Delivery) *
                                <span className="text-muted-foreground ml-1">(Number of drums received)</span>
                              </Label>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                value={item.drum_count || item.received_qty || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  handleItemChange(index, 'drum_count', val);
                                  handleItemChange(index, 'received_qty', val);  // Also set received_qty
                                }}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Enter the number of drums physically received in this delivery.
                              </p>
                              {isPartial && (
                                <span className="text-xs text-yellow-600 ml-1">(Partial)</span>
                              )}
                            </div>
                            <div className="col-span-6 md:col-span-3">
                              <Label className="text-xs">
                                Net Weight per Drum (kg) *
                                <span className="text-muted-foreground ml-1">(Required)</span>
                              </Label>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="e.g., 180"
                                value={item.net_weight_kg || ''}
                                onChange={(e) => handleItemChange(index, 'net_weight_kg', e.target.value)}
                              />
                            </div>
                            <div className="col-span-12 md:col-span-3">
                              <Label className="text-xs text-muted-foreground">Total Weight (MT)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.drum_count && item.net_weight_kg ? 
                                  ((item.drum_count * item.net_weight_kg) / 1000).toFixed(3) : '0.000'}
                                disabled
                                className="bg-muted"
                              />
                            </div>
                            <div className="col-span-12 md:col-span-3 flex items-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveItem(index)}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                          </div>
                          {/* Partial Delivery Warning for Drummed Items */}
                          {transport?.po_id && item.ordered_qty > 0 && 
                           (item.drum_count || 0) > 0 && 
                           parseFloat(item.drum_count || 0) < item.ordered_qty && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                              <p className="text-xs text-yellow-800">
                                ⚠️ Partial delivery: {item.drum_count}/{item.ordered_qty} drums
                                - Shortage of {shortage} drums will be tracked for procurement
                              </p>
                            </div>
                          )}
                          {!item.net_weight_kg && (
                            <p className="text-xs text-amber-500 mt-2">
                              ⚠️ This item is procured as drummed. Please provide net weight per drum.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-sm font-semibold">Notes</Label>
            <textarea
              className="w-full min-h-[80px] p-2 text-sm border rounded-md bg-background mt-2"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-blue-500 hover:bg-blue-600">
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Package className="w-4 h-4 mr-2" />
                Create GRN
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SecurityQCPage;
