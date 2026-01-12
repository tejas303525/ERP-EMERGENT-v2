import React, { useState, useEffect } from 'react';
import { payablesAPI, grnAPI } from '../lib/api';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { DollarSign, Check, Clock, AlertTriangle, FileText, Book, TrendingDown, Building, ClipboardCheck, Eye, Package } from 'lucide-react';
import { toast } from 'sonner';

const PayablesPage = () => {
  const [bills, setBills] = useState([]);
  const [aging, setAging] = useState({ current: 0, '30_days': 0, '60_days': 0, '90_plus': 0 });
  const [pendingGRNs, setPendingGRNs] = useState([]);
  const [qcReports, setQcReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ledger');
  const [selectedQCReport, setSelectedQCReport] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [billsRes, grnsRes, qcRes] = await Promise.all([
        payablesAPI.getBills(),
        grnAPI.getPendingPayables(),
        api.get('/qc/inspections/completed').catch(() => ({ data: [] }))
      ]);
      setBills(billsRes.data.bills || []);
      setAging(billsRes.data.aging || {});
      setPendingGRNs(grnsRes.data || []);
      setQcReports(qcRes.data || []);
    } catch (error) {
      toast.error('Failed to load payables data');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveBill = async (billId) => {
    try {
      await payablesAPI.approveBill(billId);
      toast.success('Bill approved for payment');
      loadData();
    } catch (error) {
      toast.error('Failed to approve bill');
    }
  };

  const handlePayBill = async (billId) => {
    try {
      await payablesAPI.payBill(billId);
      toast.success('Bill marked as paid');
      loadData();
    } catch (error) {
      toast.error('Failed to mark bill as paid');
    }
  };

  const handleApproveGRN = async (grnId) => {
    try {
      await grnAPI.payablesApprove(grnId, 'Approved for AP posting');
      toast.success('GRN approved for payables');
      loadData();
    } catch (error) {
      toast.error('Failed to approve GRN');
    }
  };

  const handleHoldGRN = async (grnId) => {
    try {
      await grnAPI.payablesHold(grnId, 'On hold for review');
      toast.success('GRN put on hold');
      loadData();
    } catch (error) {
      toast.error('Failed to hold GRN');
    }
  };

  const totalOutstanding = Object.values(aging).reduce((a, b) => a + b, 0);

  // Group bills by supplier for ledger view
  const supplierLedger = bills.reduce((acc, bill) => {
    const supplier = bill.supplier_name || 'Unknown Supplier';
    if (!acc[supplier]) {
      acc[supplier] = {
        supplier,
        bills: [],
        totalAmount: 0,
        paidAmount: 0,
        balance: 0
      };
    }
    acc[supplier].bills.push(bill);
    acc[supplier].totalAmount += bill.amount || 0;
    if (bill.status === 'PAID') {
      acc[supplier].paidAmount += bill.amount || 0;
    } else {
      acc[supplier].balance += bill.amount || 0;
    }
    return acc;
  }, {});

  // Group bills by type
  const billsByType = {
    PO_RFQ: bills.filter(b => b.ref_type === 'PO' || b.ref_type === 'RFQ'),
    TRANSPORT: bills.filter(b => b.ref_type === 'TRANSPORT'),
    SHIPPING: bills.filter(b => b.ref_type === 'SHIPPING'),
    IMPORT: bills.filter(b => b.ref_type === 'IMPORT'),
    OTHER: bills.filter(b => !['PO', 'RFQ', 'TRANSPORT', 'SHIPPING', 'IMPORT'].includes(b.ref_type))
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto" data-testid="payables-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="w-8 h-8 text-red-500" />
          Accounts Payable
        </h1>
        <p className="text-muted-foreground mt-1">Bills, GRN Approvals, Supplier Ledger & Payments</p>
      </div>

      {/* Aging Summary */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Total Outstanding</p>
          <p className="text-2xl font-bold text-red-400">${totalOutstanding.toLocaleString()}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-green-500/30">
          <p className="text-sm text-muted-foreground">Current</p>
          <p className="text-xl font-bold text-green-400">${aging.current?.toLocaleString() || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-yellow-500/30">
          <p className="text-sm text-muted-foreground">30 Days</p>
          <p className="text-xl font-bold text-yellow-400">${aging['30_days']?.toLocaleString() || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-orange-500/30">
          <p className="text-sm text-muted-foreground">60 Days</p>
          <p className="text-xl font-bold text-orange-400">${aging['60_days']?.toLocaleString() || 0}</p>
        </div>
        <div className="glass p-4 rounded-lg border border-red-500/30">
          <p className="text-sm text-muted-foreground">90+ Days</p>
          <p className="text-xl font-bold text-red-400">${aging['90_plus']?.toLocaleString() || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'ledger', label: 'Supplier Ledger', icon: Book },
          { id: 'grn', label: 'GRN Approvals', icon: FileText, count: pendingGRNs.length },
          { id: 'qc_reports', label: 'QC Reports', icon: ClipboardCheck, count: qcReports.length },
          { id: 'po_rfq', label: 'PO/RFQ Bills', icon: DollarSign, count: billsByType.PO_RFQ.filter(b => b.status !== 'PAID').length },
          { id: 'transport', label: 'Transport Bills', icon: TrendingDown, count: billsByType.TRANSPORT.filter(b => b.status !== 'PAID').length },
          { id: 'shipping', label: 'Shipping Bills', icon: Building, count: billsByType.SHIPPING.filter(b => b.status !== 'PAID').length },
          { id: 'import', label: 'Import Bills', icon: AlertTriangle, count: billsByType.IMPORT.filter(b => b.status !== 'PAID').length },
        ].map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
            size="sm"
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">{tab.count}</span>
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
          {/* Supplier Ledger Tab */}
          {activeTab === 'ledger' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Supplier Ledger Balance</h2>
              {Object.keys(supplierLedger).length === 0 ? (
                <div className="glass p-8 rounded-lg border border-border text-center">
                  <Book className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No supplier transactions</p>
                </div>
              ) : (
                <div className="glass rounded-lg border border-border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                        <th className="p-3 text-right text-xs font-medium text-muted-foreground">Total Billed</th>
                        <th className="p-3 text-right text-xs font-medium text-muted-foreground">Paid</th>
                        <th className="p-3 text-right text-xs font-medium text-muted-foreground">Outstanding Balance</th>
                        <th className="p-3 text-right text-xs font-medium text-muted-foreground">Bills</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(supplierLedger).map((ledger, idx) => (
                        <tr key={idx} className="border-t border-border/50 hover:bg-muted/10">
                          <td className="p-3 font-medium">{ledger.supplier}</td>
                          <td className="p-3 text-right font-mono">${ledger.totalAmount.toLocaleString()}</td>
                          <td className="p-3 text-right font-mono text-green-400">${ledger.paidAmount.toLocaleString()}</td>
                          <td className={`p-3 text-right font-mono font-bold ${ledger.balance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            ${ledger.balance.toLocaleString()}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">{ledger.bills.length}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/20 border-t border-border">
                      <tr>
                        <td className="p-3 font-bold">TOTAL</td>
                        <td className="p-3 text-right font-mono font-bold">
                          ${Object.values(supplierLedger).reduce((sum, l) => sum + l.totalAmount, 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-green-400">
                          ${Object.values(supplierLedger).reduce((sum, l) => sum + l.paidAmount, 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-red-400">
                          ${Object.values(supplierLedger).reduce((sum, l) => sum + l.balance, 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-bold">{bills.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* GRN Approvals Tab */}
          {activeTab === 'grn' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">GRN Pending Payables Review</h2>
              {pendingGRNs.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-green-500/30 bg-green-500/5 text-center">
                  <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-green-400">All GRNs reviewed</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingGRNs.map((grn) => (
                    <div key={grn.id} className="glass p-4 rounded-lg border border-amber-500/30" data-testid={`grn-${grn.id}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold">{grn.grn_number}</span>
                            <span className="px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-400">
                              PENDING REVIEW
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">Supplier: {grn.supplier}</p>
                          <p className="text-sm text-muted-foreground">Items: {grn.items?.length || 0}</p>
                          <p className="text-xs text-muted-foreground">
                            Received: {new Date(grn.received_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApproveGRN(grn.id)} className="bg-green-500 hover:bg-green-600">
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleHoldGRN(grn.id)} className="border-amber-500/50 text-amber-400">
                            <Clock className="w-4 h-4 mr-1" /> Hold
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* QC Reports Tab */}
          {activeTab === 'qc_reports' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-emerald-500" />
                QC Inspection Reports
              </h2>
              <p className="text-muted-foreground text-sm">
                Review completed QC inspections for incoming materials before processing payments
              </p>
              {qcReports.length === 0 ? (
                <div className="glass p-8 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-center">
                  <ClipboardCheck className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                  <p className="text-emerald-400">No completed QC reports</p>
                </div>
              ) : (
                <div className="glass rounded-lg border border-border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">QC #</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Items</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Qty</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Result</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qcReports.map((qc) => (
                        <tr key={qc.id} className="border-t border-border/50 hover:bg-muted/10">
                          <td className="p-3 font-mono font-medium">{qc.inspection_number || qc.qc_number}</td>
                          <td className="p-3">{qc.supplier_name || '-'}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {qc.items?.slice(0, 2).map((item, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {item.name || item.product_name}
                                </Badge>
                              ))}
                              {(qc.items?.length || 0) > 2 && (
                                <Badge variant="outline" className="text-xs">+{qc.items.length - 2}</Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-3 font-mono">{qc.total_qty || qc.quantity || '-'}</td>
                          <td className="p-3">
                            <Badge className={
                              qc.result === 'PASS' ? 'bg-green-500/20 text-green-400' :
                              qc.result === 'FAIL' ? 'bg-red-500/20 text-red-400' :
                              'bg-amber-500/20 text-amber-400'
                            }>
                              {qc.result || qc.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">
                            {qc.completed_at ? new Date(qc.completed_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="p-3">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedQCReport(qc)}>
                              <Eye className="w-4 h-4 mr-1" /> View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bills by Type Tabs */}
          {['po_rfq', 'transport', 'shipping', 'import'].includes(activeTab) && (
            <BillsTable 
              bills={
                activeTab === 'po_rfq' ? billsByType.PO_RFQ :
                activeTab === 'transport' ? billsByType.TRANSPORT :
                activeTab === 'shipping' ? billsByType.SHIPPING :
                billsByType.IMPORT
              }
              title={
                activeTab === 'po_rfq' ? 'PO/RFQ Bills' :
                activeTab === 'transport' ? 'Transport Bills' :
                activeTab === 'shipping' ? 'Shipping Bills' :
                'Import Bills'
              }
              onApprove={handleApproveBill}
              onPay={handlePayBill}
            />
          )}
        </>
      )}

      {/* QC Report Details Modal */}
      {selectedQCReport && (
        <QCReportModal
          report={selectedQCReport}
          onClose={() => setSelectedQCReport(null)}
        />
      )}
    </div>
  );
};

// QC Report Modal Component
const QCReportModal = ({ report, onClose }) => {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-500" />
            QC Inspection Report - {report.inspection_number || report.qc_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Supplier</p>
              <p className="font-medium">{report.supplier_name || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">PO/Reference</p>
              <p className="font-medium text-blue-400">{report.po_number || report.ref_number || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inspection Result</p>
              <Badge className={
                report.result === 'PASS' ? 'bg-green-500/20 text-green-400' :
                report.result === 'FAIL' ? 'bg-red-500/20 text-red-400' :
                'bg-amber-500/20 text-amber-400'
              }>
                {report.result || report.status}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed Date</p>
              <p className="font-medium">{report.completed_at ? new Date(report.completed_at).toLocaleString() : '-'}</p>
            </div>
          </div>

          {/* Items Inspected */}
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items/Materials Inspected
            </h3>
            <div className="bg-muted/20 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="p-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                    <th className="p-2 text-left text-xs font-medium text-muted-foreground">Qty</th>
                    <th className="p-2 text-left text-xs font-medium text-muted-foreground">Sampling Size</th>
                    <th className="p-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.items || []).map((item, idx) => (
                    <tr key={idx} className="border-t border-border/30">
                      <td className="p-2">{item.name || item.product_name}</td>
                      <td className="p-2 font-mono">{item.quantity} {item.unit || 'KG'}</td>
                      <td className="p-2 font-mono">{item.sampling_size || '-'}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={
                          item.status === 'PASS' ? 'border-green-500 text-green-400' :
                          item.status === 'FAIL' ? 'border-red-500 text-red-400' :
                          'border-amber-500 text-amber-400'
                        }>
                          {item.status || 'Inspected'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inspection Details */}
          {report.inspection_details && (
            <div>
              <h3 className="font-semibold mb-2">Inspection Details</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(report.inspection_details).map(([key, value]) => (
                  <div key={key} className="flex justify-between p-2 bg-muted/20 rounded">
                    <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                    <span className="font-medium">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {report.notes && (
            <div>
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="p-3 bg-muted/20 rounded text-sm">{report.notes}</p>
            </div>
          )}

          {/* Rejection Reason (if failed) */}
          {report.result === 'FAIL' && report.rejection_reason && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
              <h3 className="font-semibold text-red-400 mb-1">Rejection Reason</h3>
              <p className="text-sm">{report.rejection_reason}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Bills Table Component
const BillsTable = ({ bills, title, onApprove, onPay }) => {
  if (bills.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="glass p-8 rounded-lg border border-border text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No bills in this category</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="glass rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Bill #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Supplier</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Reference</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.map((bill) => (
              <tr key={bill.id} className="border-t border-border/50 hover:bg-muted/10" data-testid={`bill-${bill.id}`}>
                <td className="p-3 font-medium">{bill.bill_number}</td>
                <td className="p-3">{bill.supplier_name || '-'}</td>
                <td className="p-3 text-sm text-muted-foreground">{bill.ref_type} - {bill.ref_number || '-'}</td>
                <td className="p-3 text-right font-mono font-bold text-red-400">
                  {bill.currency} {bill.amount?.toLocaleString()}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    bill.status === 'PAID' ? 'bg-green-500/20 text-green-400' :
                    bill.status === 'APPROVED' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {bill.status}
                  </span>
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {new Date(bill.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    {bill.status === 'PENDING' && (
                      <Button size="sm" onClick={() => onApprove(bill.id)} className="bg-blue-500 hover:bg-blue-600">
                        Approve
                      </Button>
                    )}
                    {bill.status === 'APPROVED' && (
                      <Button size="sm" onClick={() => onPay(bill.id)} className="bg-green-500 hover:bg-green-600">
                        Mark Paid
                      </Button>
                    )}
                    {bill.status === 'PAID' && (
                      <span className="text-xs text-green-400 flex items-center">
                        <Check className="w-3 h-3 mr-1" /> Paid
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PayablesPage;
