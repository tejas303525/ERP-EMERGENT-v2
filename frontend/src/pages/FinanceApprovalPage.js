import React, { useState, useEffect } from 'react';
import { purchaseOrderAPI, emailAPI, quotationAPI, pdfAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { DollarSign, Check, X, Send, Mail, AlertCircle, CheckCircle, Clock, Eye, FileText, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';

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
    </div>
  );
};

// Quotation Card Component
const QuotationCard = ({ quotation, onApprove, onView, onDownloadPDF }) => {
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
          </div>
          <p className="text-muted-foreground text-sm">Customer: {quotation.customer_name}</p>
          <p className="text-sm text-muted-foreground">Type: {quotation.order_type?.toUpperCase()}</p>
          <p className="text-green-400 font-medium text-lg mt-1">
            {quotation.currency} {quotation.total?.toFixed(2)}
          </p>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onView} data-testid={`view-quotation-${quotation.id}`}>
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
          <Button size="sm" variant="outline" onClick={onDownloadPDF} data-testid={`download-quotation-${quotation.id}`}>
            <Download className="w-4 h-4 mr-1" />
            PDF
          </Button>
          {!quotation.finance_approved && (
            <Button size="sm" onClick={onApprove} className="bg-green-500 hover:bg-green-600" data-testid={`approve-quotation-${quotation.id}`}>
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
              <span className="col-span-2 truncate">{line.item_name}</span>
              <span>{line.qty} {line.uom}</span>
              <span>{line.unit_price?.toFixed(2) || '-'}</span>
            </div>
          ))}
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
                        <td className="p-2">{line.item_name}</td>
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
