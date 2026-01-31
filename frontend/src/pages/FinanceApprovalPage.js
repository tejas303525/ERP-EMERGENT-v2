import React, { useState, useEffect, useCallback } from 'react';
import { purchaseOrderAPI, emailAPI, quotationAPI, pdfAPI } from '../lib/api';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { DollarSign, Check, X, Send, Mail, AlertCircle, CheckCircle, Clock, Eye, FileText, Download, Calculator, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import CostingModal from '../components/CostingModal';

const FinanceApprovalPage = () => {
  const [pendingPOs, setPendingPOs] = useState([]);
  const [approvedPOs, setApprovedPOs] = useState([]);
  const [pendingQuotations, setPendingQuotations] = useState([]);
  const [emailOutbox, setEmailOutbox] = useState({ smtp_configured: false, emails: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('quotations');
  const [viewPO, setViewPO] = useState(null);
  const [viewQuotation, setViewQuotation] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [costingModalOpen, setCostingModalOpen] = useState(false);
  const [costingQuotation, setCostingQuotation] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pendingPORes, approvedPORes, quotationsRes, emailRes] = await Promise.all([
        purchaseOrderAPI.getPendingApproval(),
        purchaseOrderAPI.getAll('APPROVED'),
        quotationAPI.getPendingFinanceApproval().catch((err) => {
          console.error('Failed to load quotations:', err);
          return { data: [] };
        }),
        emailAPI.getOutbox()
      ]);
      setPendingPOs(pendingPORes.data);
      setApprovedPOs(approvedPORes.data);
      setPendingQuotations(quotationsRes.data || []);
      setEmailOutbox(emailRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (poId) => {
    try {
      await purchaseOrderAPI.financeApprove(poId);
      toast.success('PO approved');
      loadData();
    } catch (error) {
      toast.error('Failed to approve PO: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleReject = async (poId, reason) => {
    try {
      await purchaseOrderAPI.financeReject(poId, reason || 'Rejected by finance');
      toast.success('PO rejected');
      loadData();
    } catch (error) {
      toast.error('Failed to reject PO');
    }
  };

  const handleSendPO = async (poId) => {
    try {
      const res = await purchaseOrderAPI.send(poId);
      toast.success(res.data.message);
      loadData();
    } catch (error) {
      toast.error('Failed to send PO: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleViewPO = (po) => {
    setViewPO(po);
    setShowViewModal(true);
  };

  const handleViewQuotation = (quotation) => {
    setViewQuotation(quotation);
    setShowViewModal(true);
  };

  const handleApproveQuotation = async (quotationId) => {
    try {
      await quotationAPI.financeApprove(quotationId);
      toast.success('Quotation approved - Now a Proforma Invoice');
      loadData();
    } catch (error) {
      toast.error('Failed to approve quotation: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleDownloadQuotationPDF = async (quotationId, pfiNumber) => {
    try {
      const token = localStorage.getItem('erp_token');
      const url = pdfAPI.getQuotationUrl(quotationId);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `PFI_${pfiNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('PDF downloaded');
    } catch (error) {
      toast.error('Failed to download PDF');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      DRAFT: 'bg-gray-500/20 text-gray-400',
      APPROVED: 'bg-green-500/20 text-green-400',
      SENT: 'bg-blue-500/20 text-blue-400',
      REJECTED: 'bg-red-500/20 text-red-400',
      QUEUED: 'bg-amber-500/20 text-amber-400',
      FAILED: 'bg-red-500/20 text-red-400',
      pending: 'bg-amber-500/20 text-amber-400',
      approved: 'bg-green-500/20 text-green-400',
      rejected: 'bg-red-500/20 text-red-400',
    };
    return colors[status] || colors.DRAFT;
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto" data-testid="finance-approval-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="w-8 h-8 text-green-500" />
          Finance Approval
        </h1>
        <p className="text-muted-foreground mt-1">Review and approve Purchase Orders</p>
      </div>

      {/* SMTP Status Banner */}
      {!emailOutbox.smtp_configured && (
        <div className="mb-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <div>
            <p className="font-medium text-amber-400">SMTP Not Configured</p>
            <p className="text-sm text-muted-foreground">
              Emails will remain QUEUED. Configure SMTP_HOST, SMTP_USER, SMTP_PASS in backend .env to enable email sending.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'quotations', label: 'Quotations (PFI)', count: pendingQuotations.length, icon: FileText },
          { id: 'pending', label: 'Purchase Orders', count: pendingPOs.length, icon: DollarSign },
          { id: 'approved', label: 'Approved POs (Ready to Send)', count: approvedPOs.length, icon: Send },
          { id: 'outbox', label: 'Email Outbox', count: emailOutbox.emails?.length || 0, icon: Mail },
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            {tab.icon && <tab.icon className="w-4 h-4 mr-2" />}
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-white/20">{tab.count}</span>
            )}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <>
          {/* Quotations Tab */}
          {activeTab === 'quotations' && (
            <div className="space-y-4">
              {pendingQuotations.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-border text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No quotations pending finance approval</p>
                </div>
              ) : (
                pendingQuotations.map((quotation) => (
                  <QuotationCard
                    key={quotation.id}
                    quotation={quotation}
                    onApprove={() => handleApproveQuotation(quotation.id)}
                    onView={() => handleViewQuotation(quotation)}
                    onDownloadPDF={() => handleDownloadQuotationPDF(quotation.id, quotation.pfi_number)}
                    onCheckCost={() => {
                      setCostingQuotation(quotation);
                      setCostingModalOpen(true);
                    }}
                  />
                ))
              )}
            </div>
          )}

          {/* Pending PO Approval Tab */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              {pendingPOs.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-border text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No POs pending approval</p>
                </div>
              ) : (
                pendingPOs.map((po) => (
                  <POCard
                    key={po.id}
                    po={po}
                    onApprove={() => handleApprove(po.id)}
                    onReject={(reason) => handleReject(po.id, reason)}
                    showApprovalActions
                  />
                ))
              )}
            </div>
          )}

          {/* Approved Tab */}
          {activeTab === 'approved' && (
            <div className="space-y-4">
              {approvedPOs.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-border text-center">
                  <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No approved POs ready to send</p>
                </div>
              ) : (
                approvedPOs.map((po) => (
                  <POCard
                    key={po.id}
                    po={po}
                    onView={() => handleViewPO(po)}
                    onSend={() => handleSendPO(po.id)}
                    showViewAction
                    showSendAction
                    smtpConfigured={emailOutbox.smtp_configured}
                  />
                ))
              )}
            </div>
          )}

          {/* Email Outbox Tab */}
          {activeTab === 'outbox' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <div className={`px-3 py-1.5 rounded-full text-sm font-medium ${emailOutbox.smtp_configured ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  SMTP: {emailOutbox.smtp_status}
                </div>
              </div>

              {emailOutbox.emails?.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-border text-center">
                  <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No emails in outbox</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emailOutbox.emails.map((email) => (
                    <div key={email.id} className="glass p-4 rounded-lg border border-border" data-testid={`email-${email.id}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(email.status)}`}>
                              {email.status}
                            </span>
                            {email.ref_type && (
                              <span className="text-xs text-muted-foreground">
                                {email.ref_type}
                              </span>
                            )}
                          </div>
                          <p className="font-medium">{email.subject}</p>
                          <p className="text-sm text-muted-foreground">To: {email.to_email}</p>
                          {email.last_error && (
                            <p className="text-xs text-red-400 mt-1">Error: {email.last_error}</p>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>{new Date(email.created_at).toLocaleDateString()}</div>
                          {email.sent_at && (
                            <div className="text-green-400">Sent: {new Date(email.sent_at).toLocaleTimeString()}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* View PO Modal */}
      {showViewModal && viewPO && (
        <POViewModal po={viewPO} onClose={() => { setShowViewModal(false); setViewPO(null); }} />
      )}

      {/* View Quotation Modal */}
      {showViewModal && viewQuotation && (
        <QuotationViewModal quotation={viewQuotation} onClose={() => { setShowViewModal(false); setViewQuotation(null); }} />
      )}

      {/* Costing Modal */}
      {costingQuotation && (
        <CostingModal
          quotation={costingQuotation}
          open={costingModalOpen}
          onClose={() => {
            setCostingModalOpen(false);
            setCostingQuotation(null);
          }}
          onConfirmed={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};

// Quotation Card Component
const QuotationCard = ({ quotation, onApprove, onView, onDownloadPDF, onCheckCost }) => {
  const [costing, setCosting] = useState(null);
  const [loadingCosting, setLoadingCosting] = useState(false);

  const loadCosting = useCallback(async () => {
    try {
      setLoadingCosting(true);
      const response = await api.get(`/costing/QUOTATION/${quotation.id}`);
      console.log('Costing data loaded for quotation', quotation.id, ':', response.data);
      setCosting(response.data);
    } catch (error) {
      console.error('Failed to load costing:', error);
      console.error('Error details:', error.response?.data);
      // Don't show error toast - costing might not exist yet
    } finally {
      setLoadingCosting(false);
    }
  }, [quotation.id]);

  useEffect(() => {
    // Fetch costing data if quotation has cost_confirmed
    if (quotation.cost_confirmed) {
      loadCosting();
    }
  }, [quotation.cost_confirmed, loadCosting]);

  // Function to generate cost breakdown rows
  const getCostBreakdown = () => {
    if (!costing) {
      console.log('getCostBreakdown: No costing data available');
      return [];
    }

    console.log('getCostBreakdown: Processing costing', costing);

    const hasCustom = !!costing.custom_breakdown;
    const isLocalGccByRoad =
      costing.costing_type === 'EXPORT_GCC_ROAD' &&
      quotation.order_type === 'local' &&
      (quotation.local_type === 'gcc_road_bulk' || quotation.local_type === 'gcc_road') &&
      hasCustom;

    const isLocalCustomType =
      ['LOCAL_PURCHASE_SALE', 'LOCAL_BULK_TO_PLANT', 'LOCAL_DRUM_TO_PLANT'].includes(
        costing.costing_type
      );

    // For GCC-by-road and custom local sheets, build rows from saved custom_breakdown
    // Or from the costing object itself if custom_breakdown is not set
    if (isLocalGccByRoad || isLocalCustomType) {
      const cb = costing.custom_breakdown || costing; // Fallback to costing object itself
      const rows = [];
      let srNo = 1;

      // For GCC-by-road we use a fixed list of charge fields for nice labels
      if (isLocalGccByRoad) {
        const chargeDefs = [
          { field: 'transportation', label: 'Transportation' },
          { field: 'border_charges', label: 'Border Charges' },
          { field: 'mofa', label: 'MOFA' },
          { field: 'rak_chamber', label: 'RAK Chamber' },
          { field: 'epda', label: 'EPDA' },
          { field: 'sira', label: 'SIRA' },
          { field: 'moh', label: 'MOH' },
          { field: 'certificate_of_origin', label: 'Certificate of Origin' },
          { field: 'steel_drum_210_reconditioned', label: 'Steel Drum 210 Ltr-Reconditioned' },
          { field: 'steel_drum_210_new', label: 'Steel Drum 210 Ltr-New' },
          { field: 'hdpe_drum_210_reconditioned', label: 'HDPE Drum 210 Ltr-Reconditioned' },
          { field: 'hdpe_drum_210_new', label: 'HDPE Drum 210 Ltr-New' },
          { field: 'hdpe_drum_250_new', label: 'HDPE Drum 250 Ltr-New' },
          { field: 'open_top_drum_210_reconditioned', label: 'Open Top Drum 210 Ltr-Reconditioned' },
          { field: 'ibc', label: 'IBC' },
          { field: 'flexi', label: 'Flexi' },
          { field: 'pallets', label: 'Pallets' },
        ];

        chargeDefs.forEach(({ field, label }) => {
          const rate = cb[`${field}_rate`] || 0;
          const units = cb[`${field}_units`] || 0;
          const total = cb[`${field}_total`] || rate * units;
          if (total && total !== 0) {
            rows.push({ srNo: srNo++, description: label, rate, units, total });
          }
        });
      } else if (isLocalCustomType) {
        // Generic handling for custom local sheets: use any *_total that has a rate or units
        Object.keys(cb).forEach((key) => {
          if (!key.endsWith('_total')) return;
          const base = key.slice(0, -6); // remove "_total"
          const rateKey = `${base}_rate`;
          const unitsKey = `${base}_units`;
          const total = cb[key] || 0;
          const rate = cb[rateKey];
          const units = cb[unitsKey];

          if (total && (rate !== undefined || units !== undefined)) {
            const pretty = base
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (ch) => ch.toUpperCase());
            rows.push({
              srNo: srNo++,
              description: pretty,
              rate: rate ?? total,
              units: units ?? 1,
              total,
            });
          }
        });

        // For LOCAL_PURCHASE_SALE, if no detail rows were found, show summary fields
        if (costing.costing_type === 'LOCAL_PURCHASE_SALE' && rows.length === 0) {
          // Show product cost and cost per MT as the main line items
          if (cb.product_cost && cb.product_cost > 0) {
            rows.push({
              srNo: srNo++,
              description: 'Product Cost',
              rate: cb.product_cost,
              units: 1,
              total: cb.product_cost,
            });
          }
          if (cb.cost_per_mt && cb.cost_per_mt > 0) {
            rows.push({
              srNo: srNo++,
              description: 'Cost Per MT',
              rate: cb.cost_per_mt,
              units: 1,
              total: cb.cost_per_mt,
            });
          }
        }

        // Add summary-style rows if present (for other costing types or additional details)
        if (cb.product_cost && costing.costing_type !== 'LOCAL_PURCHASE_SALE') {
          rows.push({
            srNo: srNo++,
            description: 'Product Cost (Cost/MT)',
            rate: cb.product_cost,
            units: 1,
            total: cb.product_cost,
          });
        }
        if (cb.import_shipment_charges) {
          rows.push({
            srNo: srNo++,
            description: 'Import Shipment Charges',
            rate: cb.import_shipment_charges,
            units: 1,
            total: cb.import_shipment_charges,
          });
        }
        if (cb.export_shipment_charges) {
          rows.push({
            srNo: srNo++,
            description: 'Export Shipment Charges',
            rate: cb.export_shipment_charges,
            units: 1,
            total: cb.export_shipment_charges,
          });
        }

        // Add key product detail metrics if present
        if (cb.loaded_weight_mt) {
          rows.push({
            srNo: srNo++,
            description: 'Loaded Weight (MT)',
            rate: cb.loaded_weight_mt,
            units: 1,
            total: cb.loaded_weight_mt,
          });
        }
        if (cb.cost_per_mt && costing.costing_type !== 'LOCAL_PURCHASE_SALE') {
          rows.push({
            srNo: srNo++,
            description: 'Cost Per MT ($)',
            rate: cb.cost_per_mt,
            units: 1,
            total: cb.cost_per_mt,
          });
        }
      }

      return rows;
    }

    const rows = [];
    let srNo = 1;
    const containerCount = quotation.container_count || 1;
    const currency = quotation.currency || 'USD';

    // Helper function to check if a cost value should be included
    const shouldIncludeCost = (value) => {
      return value !== undefined && value !== null && value !== 0;
    };

    // Raw Material Cost
    if (shouldIncludeCost(costing.raw_material_cost)) {
      rows.push({
        srNo: srNo++,
        description: 'Raw Material Cost',
        rate: costing.raw_material_cost,
        units: 1,
        total: costing.raw_material_cost
      });
    }

    // Packaging Costs (drums)
    if (shouldIncludeCost(costing.packaging_cost)) {
      const packagingType = costing.packaging_type || 'DRUM';
      const packagingName = packagingType === 'BULK' ? 'Packaging (Bulk)' : 
                           packagingType === 'DRUM' ? 'Drum Cost' : 
                           `${packagingType} Cost`;
      rows.push({
        srNo: srNo++,
        description: packagingName,
        rate: costing.packaging_cost,
        units: 1,
        total: costing.packaging_cost
      });
    }

    // Transport Costs
    if (shouldIncludeCost(costing.local_transport_cost)) {
      rows.push({
        srNo: srNo++,
        description: 'Transportation',
        rate: costing.local_transport_cost,
        units: 1,
        total: costing.local_transport_cost
      });
    }

    if (shouldIncludeCost(costing.inland_transport_cost)) {
      rows.push({
        srNo: srNo++,
        description: 'Inland Transport',
        rate: costing.inland_transport_cost,
        units: 1,
        total: costing.inland_transport_cost
      });
    }

    // Export-specific charges
    if (shouldIncludeCost(costing.thc_cost)) {
      const containerType = quotation.container_type || '40ft';
      const isDG = costing.is_dg ? 'DG' : '';
      const description = containerType === '40ft' ? `THC 40ft ${isDG}`.trim() : `THC ${containerType} ${isDG}`.trim();
      rows.push({
        srNo: srNo++,
        description: description || 'THC (Terminal Handling)',
        rate: containerCount > 0 ? costing.thc_cost / containerCount : costing.thc_cost,
        units: containerCount,
        total: costing.thc_cost
      });
    }

    if (shouldIncludeCost(costing.isps_cost)) {
      rows.push({
        srNo: srNo++,
        description: 'ISPS',
        rate: containerCount > 0 ? costing.isps_cost / containerCount : costing.isps_cost,
        units: containerCount,
        total: costing.isps_cost
      });
    }

    if (shouldIncludeCost(costing.bl_cost)) {
      rows.push({
        srNo: srNo++,
        description: 'BL Charges',
        rate: containerCount > 0 ? costing.bl_cost / containerCount : costing.bl_cost,
        units: containerCount,
        total: costing.bl_cost
      });
    }

    if (shouldIncludeCost(costing.documentation_cost)) {
      rows.push({
        srNo: srNo++,
        description: 'Document Processing Charges',
        rate: containerCount > 0 ? costing.documentation_cost / containerCount : costing.documentation_cost,
        units: containerCount,
        total: costing.documentation_cost
      });
    }

    if (shouldIncludeCost(costing.ocean_freight_cost)) {
      rows.push({
        srNo: srNo++,
        description: 'Ocean Freight',
        rate: containerCount > 0 ? costing.ocean_freight_cost / containerCount : costing.ocean_freight_cost,
        units: containerCount,
        total: costing.ocean_freight_cost
      });
    }

    if (shouldIncludeCost(costing.port_charges)) {
      rows.push({
        srNo: srNo++,
        description: 'Port Charges',
        rate: costing.port_charges,
        units: 1,
        total: costing.port_charges
      });
    }

    console.log('getCostBreakdown: Generated', rows.length, 'cost rows');
    return rows;
  };

  const costRows = getCostBreakdown();
  const usesCustomTotal =
    costing &&
    ((costing.costing_type === 'EXPORT_GCC_ROAD' &&
      quotation.order_type === 'local' &&
      (quotation.local_type === 'gcc_road_bulk' || quotation.local_type === 'gcc_road') &&
      costing.custom_breakdown) ||
      ['LOCAL_PURCHASE_SALE', 'LOCAL_BULK_TO_PLANT', 'LOCAL_DRUM_TO_PLANT'].includes(
        costing.costing_type
      ));

  // Calculate total cost: prefer costing.total_cost if available, otherwise calculate from custom_breakdown or sum costRows
  const customTotalFromRows = costRows.reduce((sum, row) => sum + (row.total || 0), 0);
  
  // Use costing.total_cost directly - the backend calculates this correctly for all costing types
  const totalCost = costing?.total_cost && costing.total_cost > 0
    ? costing.total_cost
    : (usesCustomTotal ? customTotalFromRows : 0);

  return (
    <div className="glass p-4 rounded-lg border border-border" data-testid={`quotation-${quotation.id}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-bold text-lg">{quotation.pfi_number}</span>
            <Badge variant="outline" className={quotation.status === 'pending' ? 'border-amber-500 text-amber-400' : 'border-green-500 text-green-400'}>
              {quotation.status?.toUpperCase()}
            </Badge>
            {quotation.finance_approved && (
              <Badge variant="outline" className="border-blue-500 text-blue-400">
                PROFORMA INVOICE
              </Badge>
            )}
            {quotation.cost_confirmed ? (
              <Badge variant="outline" className="border-green-500 text-green-400">
                Cost Confirmed
              </Badge>
            ) : (
              <Badge variant="outline" className="border-yellow-500 text-yellow-400">
                Cost Pending
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Customer: {quotation.customer_name}</p>
          <p className="text-sm text-muted-foreground">
            Type: {quotation.order_type?.toUpperCase()}
            {quotation.local_type && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({quotation.local_type === 'direct_to_customer' ? 'Direct to Customer' : 
                  quotation.local_type === 'bulk_to_plant' ? 'Bulk to Plant' :
                  quotation.local_type === 'packaged_to_plant' ? 'Drum to Plant' :
                  quotation.local_type})
              </span>
            )}
          </p>
          <p className="text-green-400 font-medium text-lg mt-1">
            {quotation.currency} {quotation.total?.toFixed(2)}
          </p>
          {quotation.margin !== undefined && quotation.margin !== null && (
            <p className={`text-sm mt-1 ${quotation.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              Margin: {quotation.currency} {quotation.margin?.toFixed(2)} ({quotation.margin_percentage?.toFixed(2) || 0}%)
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onCheckCost}
            className={!quotation.cost_confirmed ? "bg-yellow-500/20 hover:bg-yellow-500/30 border-yellow-500/50" : ""}
            data-testid={`check-cost-${quotation.id}`}
          >
            <Calculator className="w-4 h-4 mr-1" />
            Check Cost
          </Button>
          <Button size="sm" variant="outline" onClick={onView} data-testid={`view-quotation-${quotation.id}`}>
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
          <Button size="sm" variant="outline" onClick={onDownloadPDF} data-testid={`download-quotation-${quotation.id}`}>
            <Download className="w-4 h-4 mr-1" />
            PDF
          </Button>
          {!quotation.finance_approved && (
            <Button 
              size="sm" 
              onClick={onApprove} 
              className="bg-green-500 hover:bg-green-600" 
              data-testid={`approve-quotation-${quotation.id}`}
              disabled={!quotation.cost_confirmed || (quotation.margin !== undefined && quotation.margin < 0)}
              title={!quotation.cost_confirmed ? "Costing must be confirmed before approval" : (quotation.margin !== undefined && quotation.margin < 0 ? "Negative margin - cannot approve" : "Approve as PFI")}
            >
              <Check className="w-4 h-4 mr-1" />
              Approve as PFI
            </Button>
          )}
        </div>
      </div>

      {/* Items */}
      {quotation.items && quotation.items.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="grid grid-cols-5 gap-2 text-xs text-muted-foreground mb-2">
            <span className="col-span-2">Product</span>
            <span>Qty</span>
            <span>Packaging</span>
            <span className="text-right">Total</span>
          </div>
          {quotation.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-5 gap-2 text-sm py-1">
              <span className="col-span-2 truncate">{item.product_name}</span>
              <span>{item.quantity}</span>
              <span className="truncate text-xs">{item.packaging}</span>
              <span className="text-right">{quotation.currency} {item.total?.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Net Profit/Loss Display */}
      {quotation.cost_confirmed && (
        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Profit & Loss
          </h4>
          
          {loadingCosting ? (
            <div className="text-center py-4 text-muted-foreground">Loading costing...</div>
          ) : costing ? (
            <div className="bg-muted/20 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  {(() => {
                    const profit = (quotation.total || 0) - totalCost;
                    const profitPercentage = quotation.total > 0 ? (profit / quotation.total) * 100 : 0;
                    return (
                      <>
                        <p className="text-xs text-muted-foreground mb-1">Net {profit >= 0 ? 'Profit' : 'Loss'}</p>
                        <p className={`text-2xl font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {profit >= 0 ? '+' : ''}{quotation.currency} {profit.toFixed(2)}
                        </p>
                        <p className={`text-sm mt-1 ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {profitPercentage >= 0 ? '+' : ''}{profitPercentage.toFixed(2)}% margin
                        </p>
                      </>
                    );
                  })()}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-1">Selling Price</p>
                  <p className="text-lg font-semibold text-green-400">
                    {quotation.currency} {quotation.total?.toFixed(2) || '0.00'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Total Cost</p>
                  <p className="text-sm font-medium">
                    {quotation.currency} {totalCost.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-amber-400 text-sm border border-amber-500/30 bg-amber-500/10 rounded p-4">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No costing data found</p>
              <p className="text-xs text-muted-foreground mt-1">Click "Check Cost" button above to create costing calculation</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Quotation View Modal Component
const QuotationViewModal = ({ quotation, onClose }) => {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Quotation Details - {quotation.pfi_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">PFI Number</label>
                <p className="font-mono font-medium">{quotation.pfi_number}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <div>
                  <Badge variant="outline" className={quotation.status === 'pending' ? 'border-amber-500 text-amber-400' : 'border-green-500 text-green-400'}>
                    {quotation.status?.toUpperCase()}
                  </Badge>
                  {quotation.finance_approved && (
                    <Badge variant="outline" className="ml-2 border-blue-500 text-blue-400">
                      PROFORMA INVOICE
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Customer</label>
                <p className="font-medium">{quotation.customer_name}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Order Type</label>
                <p>{quotation.order_type?.toUpperCase()}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Payment Terms</label>
                <p>{quotation.payment_terms || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Currency</label>
                <p>{quotation.currency}</p>
              </div>
              {quotation.order_type === 'export' && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">Incoterm</label>
                    <p>{quotation.incoterm || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Port of Loading</label>
                    <p>{quotation.port_of_loading || '-'}</p>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Created At</label>
                <p className="text-sm">{new Date(quotation.created_at).toLocaleString()}</p>
              </div>
              {quotation.finance_approved_at && (
                <div>
                  <label className="text-xs text-muted-foreground">Finance Approved At</label>
                  <p className="text-sm text-green-400">{new Date(quotation.finance_approved_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Line Items */}
          {quotation.items && quotation.items.length > 0 && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3">Line Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Product</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Packaging</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Unit Price</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotation.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="p-2">{item.product_name}</td>
                        <td className="p-2 text-right font-mono">{item.quantity}</td>
                        <td className="p-2">{item.packaging}</td>
                        <td className="p-2 text-right font-mono">{quotation.currency} {item.unit_price?.toFixed(2) || '0.00'}</td>
                        <td className="p-2 text-right font-mono font-medium">
                          {quotation.currency} {item.total?.toFixed(2) || '0.00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/20">
                    <tr>
                      <td colSpan={4} className="p-2 text-right font-semibold">Subtotal:</td>
                      <td className="p-2 text-right font-mono">
                        {quotation.currency} {quotation.subtotal?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                    {quotation.vat_amount > 0 && (
                      <tr>
                        <td colSpan={4} className="p-2 text-right font-semibold">VAT (5%):</td>
                        <td className="p-2 text-right font-mono">
                          {quotation.currency} {quotation.vat_amount?.toFixed(2) || '0.00'}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} className="p-2 text-right font-semibold">Total Amount:</td>
                      <td className="p-2 text-right font-bold text-green-400 text-lg">
                        {quotation.currency} {quotation.total?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// PO Card Component
const POCard = ({ po, onApprove, onReject, onView, onSend, showApprovalActions, showViewAction, showSendAction, smtpConfigured }) => {
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = () => {
    onReject(rejectReason);
    setShowRejectModal(false);
  };

  return (
    <div className="glass p-4 rounded-lg border border-border" data-testid={`po-${po.id}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="font-bold text-lg">{po.po_number}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              po.status === 'DRAFT' ? 'bg-gray-500/20 text-gray-400' :
              po.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              {po.status}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">Supplier: {po.supplier_name}</p>
          <p className="text-green-400 font-medium text-lg mt-1">
            {po.currency} {po.total_amount?.toFixed(2)}
          </p>
        </div>

        <div className="flex gap-2">
          {showApprovalActions && (
            <>
              <Button size="sm" onClick={onApprove} className="bg-green-500 hover:bg-green-600" data-testid={`approve-po-${po.id}`}>
                <Check className="w-4 h-4 mr-1" />
                Approve
              </Button>
              <Button size="sm" variant="outline" className="border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={() => setShowRejectModal(true)} data-testid={`reject-po-${po.id}`}>
                <X className="w-4 h-4 mr-1" />
                Reject
              </Button>
            </>
          )}
          {showViewAction && (
            <Button size="sm" variant="outline" onClick={onView} data-testid={`view-po-${po.id}`}>
              <Eye className="w-4 h-4 mr-1" />
              View
            </Button>
          )}
          {showSendAction && (
            <Button size="sm" onClick={onSend} className="bg-blue-500 hover:bg-blue-600" data-testid={`send-po-${po.id}`}>
              <Send className="w-4 h-4 mr-1" />
              Send to Supplier
              {!smtpConfigured && <span className="ml-1 text-xs">(Queue)</span>}
            </Button>
          )}
        </div>
      </div>

      {/* Lines */}
      {po.lines && po.lines.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground mb-2">
            <span className="col-span-2">Item</span>
            <span>Qty</span>
            <span>Unit Price</span>
          </div>
          {po.lines.map((line, idx) => (
            <div key={idx} className="grid grid-cols-4 gap-2 text-sm py-1">
              <span className="col-span-2 truncate">{line.display_name || line.item_name}</span>
              <span>{line.qty} {line.uom}</span>
              <span>{line.unit_price?.toFixed(2) || '-'}</span>
            </div>
          ))}
        </div>
      )}

      {/* PFI Reference at the bottom */}
      {po.pfi_number && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Reference PFI:</span> <span className="text-blue-400 font-semibold">{po.pfi_number}</span>
          </p>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Reject PO {po.po_number}</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectModal(false)}>Cancel</Button>
              <Button onClick={handleReject} className="bg-red-500 hover:bg-red-600">
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// PO View Modal Component
const POViewModal = ({ po, onClose }) => {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Purchase Order Details - {po.po_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="glass rounded-lg p-4 border border-border">
            <h3 className="font-semibold mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">PO Number</label>
                <p className="font-mono font-medium">{po.po_number}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    po.status === 'DRAFT' ? 'bg-gray-500/20 text-gray-400' :
                    po.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' :
                    po.status === 'SENT' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {po.status}
                  </span>
                </div>
              </div>
              {po.pfi_number && (
                <div>
                  <label className="text-xs text-muted-foreground">Reference PFI</label>
                  <p className="font-medium">{po.pfi_number}</p>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">Supplier</label>
                <p className="font-medium">{po.supplier_name}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Incoterm</label>
                <p>{po.incoterm || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Payment Terms</label>
                <p>{po.payment_terms || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Delivery Date</label>
                <p>{po.delivery_date ? new Date(po.delivery_date).toLocaleDateString() : '-'}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Currency</label>
                <p>{po.currency}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Created At</label>
                <p className="text-sm">{new Date(po.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Line Items */}
          {po.lines && po.lines.length > 0 && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-3">Line Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">Item Name</th>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">SKU</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="p-2 text-left text-xs font-medium text-muted-foreground">UOM</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Unit Price</th>
                      <th className="p-2 text-right text-xs font-medium text-muted-foreground">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lines.map((line, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="p-2">
                          {line.display_name || line.item_name}
                          {line.packaging_qty && line.packaging_name && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Packaging: {line.packaging_qty} x {line.packaging_name}
                            </div>
                          )}
                        </td>
                        <td className="p-2 font-mono text-sm">{line.item_sku || '-'}</td>
                        <td className="p-2 text-right font-mono">{line.qty}</td>
                        <td className="p-2">{line.uom}</td>
                        <td className="p-2 text-right font-mono">{po.currency} {line.unit_price?.toFixed(2) || '0.00'}</td>
                        <td className="p-2 text-right font-mono font-medium">
                          {po.currency} {((line.qty || 0) * (line.unit_price || 0)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/20">
                    <tr>
                      <td colSpan={5} className="p-2 text-right font-semibold">Total Amount:</td>
                      <td className="p-2 text-right font-bold text-green-400 text-lg">
                        {po.currency} {po.total_amount?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          {po.notes && (
            <div className="glass rounded-lg p-4 border border-border">
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{po.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FinanceApprovalPage;
