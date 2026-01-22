import React, { useState, useEffect, useMemo } from 'react';
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
  const [inwardTransports, setInwardTransports] = useState([]);
  const [outwardTransports, setOutwardTransports] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

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
      const [pendingRes, completedRes, inwardRes, outwardRes, jobsRes, posRes] = await Promise.all([
        api.get('/qc/inspections', { params: { status: 'PENDING' } }),
        api.get('/qc/inspections'),
        api.get('/security/inward'),
        api.get('/security/outward'),
        api.get('/job-orders').catch(() => ({ data: [] })), // Fetch job orders for product info
        api.get('/purchase-orders').catch(() => ({ data: [] })) // Fetch POs for product info
      ]);
      
      const inwardTransportsData = inwardRes.data || [];
      const outwardTransportsData = outwardRes.data || [];
      const jobsData = Array.isArray(jobsRes.data) ? jobsRes.data : [];
      const posData = Array.isArray(posRes.data) ? posRes.data : [];
      
      setInwardTransports(inwardTransportsData);
      setOutwardTransports(outwardTransportsData);
      
      // Create maps for job orders and purchase orders
      const jobMap = new Map();
      jobsData.forEach(job => {
        if (job.job_number) {
          jobMap.set(job.job_number, job);
        }
        if (job.id) {
          jobMap.set(job.id, job);
        }
      });
      
      const poMap = new Map();
      posData.forEach(po => {
        if (po.po_number) {
          poMap.set(po.po_number, po);
        }
        if (po.id) {
          poMap.set(po.id, po);
        }
      });
      
      // Create multiple maps for different lookup methods
      const transportById = new Map();
      const transportByNumber = new Map();
      const transportByPO = new Map();
      const transportByJob = new Map();
      
      [...inwardTransportsData, ...outwardTransportsData].forEach(transport => {
        if (transport.id) {
          transportById.set(transport.id, transport);
        }
        if (transport.transport_number) {
          transportByNumber.set(transport.transport_number, transport);
        }
        if (transport.po_number) {
          transportByPO.set(transport.po_number, transport);
        }
        if (transport.job_number) {
          transportByJob.set(transport.job_number, transport);
        }
        // Also handle job_numbers array
        if (Array.isArray(transport.job_numbers)) {
          transport.job_numbers.forEach(jobNum => {
            if (jobNum) transportByJob.set(jobNum, transport);
          });
        }
      });
      
      // Enrich inspections with transport data
      const enrichInspection = (inspection) => {
        // Try multiple methods to find the related transport
        let transport = null;
        
        // Method 1: Direct transport_id
        if (inspection.transport_id) {
          transport = transportById.get(inspection.transport_id);
        }
        
        // Method 2: ref_id (could be transport id)
        if (!transport && inspection.ref_id) {
          transport = transportById.get(inspection.ref_id) || 
                     transportByNumber.get(inspection.ref_id);
        }
        
        // Method 3: transport_number
        if (!transport && inspection.transport_number) {
          transport = transportByNumber.get(inspection.transport_number);
        }
        
        // Method 4: ref_number (could be PO number or job number)
        if (!transport && inspection.ref_number) {
          transport = transportByPO.get(inspection.ref_number) ||
                     transportByJob.get(inspection.ref_number);
        }
        
        // Method 5: po_number from inspection
        if (!transport && inspection.po_number) {
          transport = transportByPO.get(inspection.po_number);
        }
        
        // Method 6: job_number from inspection
        if (!transport && inspection.job_number) {
          transport = transportByJob.get(inspection.job_number);
        }
        
        if (transport) {
          // Try to get product name from job order or PO if not in transport
          let productName = inspection.product_name || 
                           transport.product_name || 
                           transport.products_summary || 
                           (Array.isArray(transport.product_names) && transport.product_names.length > 0 ? transport.product_names[0] : null) ||
                           (Array.isArray(transport.po_items) && transport.po_items.length > 0 ? transport.po_items[0].product_name || transport.po_items[0].item_name : null);
          
          // If still no product name, try to get from job order
          if (!productName && transport.job_number) {
            const job = jobMap.get(transport.job_number);
            if (job) {
              productName = job.product_name || 
                           (Array.isArray(job.items) && job.items.length > 0 ? job.items[0].product_name : null);
            }
          }
          
          // If still no product name, try to get from job_numbers array
          if (!productName && Array.isArray(transport.job_numbers) && transport.job_numbers.length > 0) {
            for (const jobNum of transport.job_numbers) {
              const job = jobMap.get(jobNum);
              if (job) {
                productName = job.product_name || 
                             (Array.isArray(job.items) && job.items.length > 0 ? job.items[0].product_name : null);
                if (productName) break;
              }
            }
          }
          
          // If still no product name, try to get from PO
          if (!productName && transport.po_number) {
            const po = poMap.get(transport.po_number);
            if (po) {
              const poItems = po.lines || po.po_items || [];
              if (poItems.length > 0) {
                productName = poItems[0].product_name || poItems[0].item_name;
              }
            }
          }
          
          // Determine vehicle type - check transport vehicle_type first, then infer from vehicle_number
          let vehicleType = inspection.vehicle_type || transport.vehicle_type || null;
          if (!vehicleType && transport.vehicle_number) {
            // Infer vehicle type from vehicle number or transport type
            if (transport.transport_type === 'CONTAINER') {
              vehicleType = 'container';
            } else if (transport.container_number) {
              vehicleType = 'container';
            } else {
              vehicleType = 'truck'; // Default for local transports
            }
          }
          
          // If still no vehicle type, check if it's a container transport
          if (!vehicleType && transport.transport_type === 'CONTAINER') {
            vehicleType = 'container';
          }
          
          return {
            ...inspection,
            // Product information
            product_name: productName,
            product_id: inspection.product_id || transport.product_id || null,
            // Seal number from transport or security checklist
            seal_number: inspection.seal_number || 
                        transport.seal_number || 
                        transport.security_checklist?.seal_number || 
                        null,
            // Container number from transport or security checklist
            container_number: inspection.container_number || 
                             transport.container_number || 
                             transport.security_checklist?.container_number || 
                             null,
            // Vehicle type from transport
            vehicle_type: vehicleType,
            // Vehicle number
            vehicle_number: inspection.vehicle_number || transport.vehicle_number || null,
            // Delivery note from transport
            delivery_note_number: inspection.delivery_note_number || 
                                transport.delivery_note_number || 
                                transport.delivery_order_number || 
                                null,
            delivery_order_number: inspection.delivery_order_number || 
                                  transport.delivery_order_number || 
                                  null,
            delivery_note_document: inspection.delivery_note_document || 
                                  transport.delivery_note_document || 
                                  transport.delivery_order_document || 
                                  null,
            // Security checklist data
            security_checklist: inspection.security_checklist || transport.security_checklist || null,
            // Delivery date from transport (booked during transport booking)
            expected_delivery_date: inspection.expected_delivery_date || 
                                  transport.delivery_date || 
                                  transport.eta || 
                                  transport.expected_delivery || 
                                  null,
            // Additional transport data
            transport_number: transport.transport_number || inspection.transport_number || null,
            po_number: transport.po_number || inspection.po_number || null,
            job_number: transport.job_number || (Array.isArray(transport.job_numbers) && transport.job_numbers.length > 0 ? transport.job_numbers[0] : null) || inspection.job_number || null
          };
        }
        return inspection;
      };
      
      const enrichedPending = (pendingRes.data || []).map(enrichInspection);
      const enrichedCompleted = (completedRes.data || []).map(enrichInspection);
      
      setInspections(enrichedPending);
      setCompletedInspections(enrichedCompleted.filter(i => i.status !== 'PENDING'));
    } catch (error) {
      toast.error('Failed to load data');
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
        <Button
          variant={activeTab === 'delivery_docs' ? 'default' : 'outline'}
          onClick={() => setActiveTab('delivery_docs')}
          data-testid="tab-delivery-docs"
        >
          <FileText className="w-4 h-4 mr-2" />
          Delivery Notes & Orders
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
              getDeliveryDocumentUrl={getDeliveryDocumentUrl}
            />
          )}
          {activeTab === 'completed' && (
            <CompletedInspectionsTab
              inspections={completedInspections}
              onOpenInspection={openInspectionModal}
              onRefresh={loadData}
              getDeliveryDocumentUrl={getDeliveryDocumentUrl}
            />
          )}
          {activeTab === 'coa' && (
            <COAManagementTab
              inspections={completedInspections.filter(i => i.status === 'PASSED')}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'delivery_docs' && (
            <DeliveryDocsTab
              inwardTransports={inwardTransports}
              outwardTransports={outwardTransports}
              onRefresh={loadData}
              getDeliveryDocumentUrl={getDeliveryDocumentUrl}
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
const PendingInspectionsTab = ({ inspections, onOpenInspection, onRefresh, getDeliveryDocumentUrl }) => {
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
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Expected Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Seal Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Container Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Order / Note</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Net Weight</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Created</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((inspection) => (
                <tr key={inspection.id} className="border-b border-border/50 hover:bg-muted/10">
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
                  <td className="p-3">
                    {inspection.expected_delivery_date ? (
                      <span className="text-cyan-400 font-medium">
                        {new Date(inspection.expected_delivery_date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm">{inspection.product_name || '-'}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {inspection.seal_number || inspection.security_checklist?.seal_number || '-'}
                  </td>
                  <td className="p-3 font-mono text-sm">
                    {inspection.container_number || inspection.security_checklist?.container_number || '-'}
                  </td>
                  <td className="p-3">
                    {inspection.vehicle_type ? (
                      <Badge variant="outline" className="text-xs capitalize">
                        {inspection.vehicle_type}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {(inspection.delivery_order_number || inspection.delivery_order_document || inspection.delivery_note_number || inspection.delivery_note_document) ? (
                      <div className="flex items-center gap-2">
                        {(inspection.delivery_order_number || inspection.delivery_note_number) && (
                          <Badge variant="outline" className={`text-xs ${inspection.delivery_order_number ? 'text-amber-400' : 'text-blue-400'}`}>
                            {inspection.delivery_order_number || inspection.delivery_note_number}
                          </Badge>
                        )}
                        {(inspection.delivery_order_document || inspection.delivery_note_document) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const doc = inspection.delivery_order_document || inspection.delivery_note_document;
                          if (doc) {
                            const url = await getDeliveryDocumentUrl(doc);
                            if (url) {
                              window.open(url, '_blank');
                            }
                          } else {
                            toast.info('Delivery document not available');
                          }
                        }}
                            title={inspection.delivery_order_document ? "View Delivery Order PDF" : "View Delivery Note PDF"}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        View
                      </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
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
const CompletedInspectionsTab = ({ inspections, onOpenInspection, onRefresh, getDeliveryDocumentUrl }) => {
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
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Expected Delivery Date</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Product</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Seal Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Container Number</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Vehicle Type</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Delivery Order / Note</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">COA</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Completed</th>
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((inspection) => (
                <tr key={inspection.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="p-3">
                    <Badge className={inspection.ref_type === 'INWARD' ? 'bg-blue-500/20 text-blue-400' : 'bg-amber-500/20 text-amber-400'}>
                      {inspection.ref_type}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {inspection.expected_delivery_date ? (
                      <span className="text-cyan-400 font-medium">
                        {new Date(inspection.expected_delivery_date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-sm">{inspection.product_name || '-'}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {inspection.seal_number || inspection.security_checklist?.seal_number || '-'}
                  </td>
                  <td className="p-3 font-mono text-sm">
                    {inspection.container_number || inspection.security_checklist?.container_number || '-'}
                  </td>
                  <td className="p-3">
                    {inspection.vehicle_type ? (
                      <Badge variant="outline" className="text-xs capitalize">
                        {inspection.vehicle_type}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {(inspection.delivery_order_number || inspection.delivery_order_document || inspection.delivery_note_number || inspection.delivery_note_document) ? (
                      <div className="flex items-center gap-2">
                        {(inspection.delivery_order_number || inspection.delivery_note_number) && (
                          <Badge variant="outline" className={`text-xs ${inspection.delivery_order_number ? 'text-amber-400' : 'text-blue-400'}`}>
                            {inspection.delivery_order_number || inspection.delivery_note_number}
                          </Badge>
                        )}
                        {(inspection.delivery_order_document || inspection.delivery_note_document) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const doc = inspection.delivery_order_document || inspection.delivery_note_document;
                          if (doc) {
                            const url = await getDeliveryDocumentUrl(doc);
                            if (url) {
                              window.open(url, '_blank');
                            }
                          } else {
                            toast.info('Delivery document not available');
                          }
                        }}
                            title={inspection.delivery_order_document ? "View Delivery Order PDF" : "View Delivery Note PDF"}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        View
                      </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
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

// ==================== DELIVERY DOCS TAB ====================
const DeliveryDocsTab = ({ inwardTransports, outwardTransports, onRefresh, getDeliveryDocumentUrl }) => {

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
          expectedDate: t.delivery_date || t.eta || t.scheduled_date || t.created_at,
          reference: t.po_number || t.import_number || '-'
        });
      }
    });

    // Add outward transports with delivery orders - show job order as reference
    outwardTransports.forEach(t => {
      if (t.delivery_order_number || t.delivery_order_document) {
        docs.push({
          ...t,
          docType: 'DELIVERY_ORDER',
          docNumber: t.delivery_order_number,
          docDocument: t.delivery_order_document,
          direction: 'outward',
          expectedDate: t.delivery_date || t.scheduled_date || t.created_at,
          reference: t.job_number || t.job_numbers?.join(', ') || t.do_number || '-' // Job order for outward
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
            Sorted by Expected Delivery Date (FIFO) - For outward, reference shows Job Order
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
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference / Job Order</th>
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
                    <span className="text-sm font-medium text-amber-400">{transport.reference}</span>
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
                      {transport.docDocument && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const url = await getDeliveryDocumentUrl(transport.docDocument);
                            if (url) {
                              window.open(url, '_blank');
                            }
                          }}
                          title="View Document"
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

export default QCInspectionPage;
