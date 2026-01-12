import React, { useState, useEffect } from 'react';
import { purchaseOrderAPI, emailAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { DollarSign, Check, X, Send, Mail, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const FinanceApprovalPage = () => {
  const [pendingPOs, setPendingPOs] = useState([]);
  const [approvedPOs, setApprovedPOs] = useState([]);
  const [emailOutbox, setEmailOutbox] = useState({ smtp_configured: false, emails: [] });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pendingRes, approvedRes, emailRes] = await Promise.all([
        purchaseOrderAPI.getPendingApproval(),
        purchaseOrderAPI.getAll('APPROVED'),
        emailAPI.getOutbox()
      ]);
      setPendingPOs(pendingRes.data);
      setApprovedPOs(approvedRes.data);
      setEmailOutbox(emailRes.data);
    } catch (error) {
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

  const getStatusColor = (status) => {
    const colors = {
      DRAFT: 'bg-gray-500/20 text-gray-400',
      APPROVED: 'bg-green-500/20 text-green-400',
      SENT: 'bg-blue-500/20 text-blue-400',
      REJECTED: 'bg-red-500/20 text-red-400',
      QUEUED: 'bg-amber-500/20 text-amber-400',
      FAILED: 'bg-red-500/20 text-red-400'
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
          { id: 'pending', label: 'Pending Approval', count: pendingPOs.length },
          { id: 'approved', label: 'Approved (Ready to Send)', count: approvedPOs.length },
          { id: 'outbox', label: 'Email Outbox', count: emailOutbox.emails?.length || 0 },
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
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
          {/* Pending Approval Tab */}
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
                    onSend={() => handleSendPO(po.id)}
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
    </div>
  );
};

// PO Card Component
const POCard = ({ po, onApprove, onReject, onSend, showApprovalActions, showSendAction, smtpConfigured }) => {
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

export default FinanceApprovalPage;
