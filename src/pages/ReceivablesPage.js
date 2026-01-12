import React, { useState, useEffect } from 'react';
import { receivablesAPI, salesOrderAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Receipt, Check, Clock, AlertTriangle, FileText, Plus, Building, Ship, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const ReceivablesPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [aging, setAging] = useState({ current: 0, '30_days': 0, '60_days': 0, '90_plus': 0 });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('spa');
  const [showPaymentModal, setShowPaymentModal] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invoicesRes, salesRes] = await Promise.all([
        receivablesAPI.getInvoices(),
        salesOrderAPI.getAll()
      ]);
      setInvoices(invoicesRes.data.invoices || []);
      setAging(invoicesRes.data.aging || {});
      setSalesOrders(salesRes.data || []);
    } catch (error) {
      toast.error('Failed to load receivables data');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    try {
      await receivablesAPI.recordPayment(showPaymentModal.id, parseFloat(paymentAmount));
      toast.success('Payment recorded');
      setShowPaymentModal(null);
      setPaymentAmount('');
      loadData();
    } catch (error) {
      toast.error('Failed to record payment');
    }
  };

  const totalOutstanding = Object.values(aging).reduce((a, b) => a + b, 0);

  // Categorize invoices
  const localInvoices = invoices.filter(i => i.invoice_type === 'LOCAL');
  const exportInvoices = invoices.filter(i => i.invoice_type === 'EXPORT');
  
  // Active SPA (Sales Orders)
  const activeSPA = salesOrders.filter(so => so.status === 'active' && so.balance > 0);

  // Calculate aging by type
  const getAgingCategory = (dateStr) => {
    if (!dateStr) return 'current';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays <= 30) return 'current';
    if (diffDays <= 60) return '30_days';
    if (diffDays <= 90) return '60_days';
    return '90_plus';
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto" data-testid="receivables-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="w-8 h-8 text-green-500" />
          Accounts Receivable
        </h1>
        <p className="text-muted-foreground mt-1">Sales Contracts, Local & Export Invoices, Collections</p>
      </div>

      {/* Aging Summary */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="glass p-4 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">Total Outstanding</p>
          <p className="text-2xl font-bold text-green-400">${totalOutstanding.toLocaleString()}</p>
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
          { id: 'spa', label: 'Sales Contracts (SPA)', icon: FileText, count: activeSPA.length },
          { id: 'local', label: 'Local Invoices', icon: Building, count: localInvoices.filter(i => i.status !== 'PAID').length },
          { id: 'export', label: 'Export Invoices', icon: Ship, count: exportInvoices.filter(i => i.status !== 'PAID').length },
          { id: 'aging', label: 'Aging Report', icon: Clock },
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
              <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-green-500/20 text-green-400">{tab.count}</span>
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
          {/* Sales Contracts (SPA) Tab */}
          {activeTab === 'spa' && (
            <SPATable 
              salesOrders={activeSPA}
              onRecordPayment={(so) => {
                setShowPaymentModal({ id: so.id, type: 'spa', ...so });
              }}
            />
          )}

          {/* Local Invoices Tab */}
          {activeTab === 'local' && (
            <InvoicesTable 
              invoices={localInvoices}
              title="Local Invoices"
              icon={<Building className="w-5 h-5 text-blue-400" />}
              onRecordPayment={setShowPaymentModal}
            />
          )}

          {/* Export Invoices Tab */}
          {activeTab === 'export' && (
            <InvoicesTable 
              invoices={exportInvoices}
              title="Export Invoices"
              icon={<Ship className="w-5 h-5 text-cyan-400" />}
              onRecordPayment={setShowPaymentModal}
            />
          )}

          {/* Aging Report Tab */}
          {activeTab === 'aging' && (
            <AgingReport 
              invoices={invoices}
              salesOrders={activeSPA}
            />
          )}
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">
              Record Payment - {showPaymentModal.invoice_number || showPaymentModal.spa_number}
            </h3>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Outstanding: {showPaymentModal.currency} {((showPaymentModal.amount || showPaymentModal.total || 0) - (showPaymentModal.amount_paid || 0)).toLocaleString()}
              </p>
              <Input
                type="number"
                placeholder="Payment amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPaymentModal(null)}>Cancel</Button>
              <Button onClick={handleRecordPayment} className="bg-green-500 hover:bg-green-600">
                Record Payment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// SPA Table Component
const SPATable = ({ salesOrders, onRecordPayment }) => {
  if (salesOrders.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Sales Contracts (SPA) - Outstanding</h2>
        <div className="glass p-8 rounded-lg border border-green-500/30 bg-green-500/5 text-center">
          <Check className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-green-400">All sales contracts fully paid</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Sales Contracts (SPA) - Outstanding</h2>
      <div className="glass rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">SPA #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground">Contract Value</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground">Received</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground">Balance</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Payment Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {salesOrders.map((so) => (
              <tr key={so.id} className="border-t border-border/50 hover:bg-muted/10" data-testid={`spa-${so.id}`}>
                <td className="p-3 font-medium">{so.spa_number}</td>
                <td className="p-3">{so.customer_name}</td>
                <td className="p-3 text-right font-mono">{so.currency} {so.total?.toLocaleString()}</td>
                <td className="p-3 text-right font-mono text-green-400">{so.currency} {so.amount_paid?.toLocaleString() || 0}</td>
                <td className="p-3 text-right font-mono font-bold text-amber-400">{so.currency} {so.balance?.toLocaleString()}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    so.payment_status === 'paid' ? 'bg-green-500/20 text-green-400' :
                    so.payment_status === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {so.payment_status?.toUpperCase()}
                  </span>
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {new Date(so.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <Button size="sm" onClick={() => onRecordPayment(so)} className="bg-green-500 hover:bg-green-600">
                    <Plus className="w-4 h-4 mr-1" /> Payment
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/20 border-t border-border">
            <tr>
              <td className="p-3 font-bold" colSpan={2}>TOTAL</td>
              <td className="p-3 text-right font-mono font-bold">
                ${salesOrders.reduce((sum, so) => sum + (so.total || 0), 0).toLocaleString()}
              </td>
              <td className="p-3 text-right font-mono font-bold text-green-400">
                ${salesOrders.reduce((sum, so) => sum + (so.amount_paid || 0), 0).toLocaleString()}
              </td>
              <td className="p-3 text-right font-mono font-bold text-amber-400">
                ${salesOrders.reduce((sum, so) => sum + (so.balance || 0), 0).toLocaleString()}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// Invoices Table Component
const InvoicesTable = ({ invoices, title, icon, onRecordPayment }) => {
  if (invoices.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">{icon} {title}</h2>
        <div className="glass p-8 rounded-lg border border-border text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No invoices</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">{icon} {title}</h2>
      <div className="glass rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30">
            <tr>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Invoice #</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Customer</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground">Amount</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground">Paid</th>
              <th className="p-3 text-right text-xs font-medium text-muted-foreground">Balance</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Due Date</th>
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const balance = (inv.amount || 0) - (inv.amount_paid || 0);
              const isOverdue = inv.due_date && new Date(inv.due_date) < new Date() && balance > 0;
              
              return (
                <tr key={inv.id} className="border-t border-border/50 hover:bg-muted/10" data-testid={`invoice-${inv.id}`}>
                  <td className="p-3 font-medium">{inv.invoice_number}</td>
                  <td className="p-3">{inv.customer_name || inv.customer_id}</td>
                  <td className="p-3 text-right font-mono">{inv.currency} {inv.amount?.toLocaleString()}</td>
                  <td className="p-3 text-right font-mono text-green-400">{inv.currency} {inv.amount_paid?.toLocaleString() || 0}</td>
                  <td className={`p-3 text-right font-mono font-bold ${balance > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                    {inv.currency} {balance.toLocaleString()}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      inv.status === 'PAID' ? 'bg-green-500/20 text-green-400' :
                      inv.status === 'PARTIAL' ? 'bg-amber-500/20 text-amber-400' :
                      isOverdue ? 'bg-red-500/20 text-red-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {isOverdue ? 'OVERDUE' : inv.status}
                    </span>
                  </td>
                  <td className={`p-3 text-sm ${isOverdue ? 'text-red-400' : 'text-muted-foreground'}`}>
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    {inv.status !== 'PAID' && (
                      <Button size="sm" onClick={() => onRecordPayment(inv)} className="bg-green-500 hover:bg-green-600">
                        <Plus className="w-4 h-4 mr-1" /> Payment
                      </Button>
                    )}
                    {inv.status === 'PAID' && (
                      <span className="text-xs text-green-400 flex items-center">
                        <Check className="w-3 h-3 mr-1" /> Paid
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/20 border-t border-border">
            <tr>
              <td className="p-3 font-bold" colSpan={2}>TOTAL</td>
              <td className="p-3 text-right font-mono font-bold">
                ${invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0).toLocaleString()}
              </td>
              <td className="p-3 text-right font-mono font-bold text-green-400">
                ${invoices.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0).toLocaleString()}
              </td>
              <td className="p-3 text-right font-mono font-bold text-amber-400">
                ${invoices.reduce((sum, inv) => sum + ((inv.amount || 0) - (inv.amount_paid || 0)), 0).toLocaleString()}
              </td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// Aging Report Component
const AgingReport = ({ invoices, salesOrders }) => {
  const getAgingDays = (dateStr) => {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now - date) / (1000 * 60 * 60 * 24));
  };

  // Combine all receivables
  const allReceivables = [
    ...salesOrders.map(so => ({
      type: 'SPA',
      number: so.spa_number,
      customer: so.customer_name,
      amount: so.balance || 0,
      currency: so.currency,
      date: so.created_at,
      days: getAgingDays(so.created_at)
    })),
    ...invoices.filter(inv => inv.status !== 'PAID').map(inv => ({
      type: inv.invoice_type,
      number: inv.invoice_number,
      customer: inv.customer_name || inv.customer_id,
      amount: (inv.amount || 0) - (inv.amount_paid || 0),
      currency: inv.currency,
      date: inv.due_date || inv.created_at,
      days: getAgingDays(inv.due_date || inv.created_at)
    }))
  ];

  // Group by aging bucket
  const agingBuckets = {
    current: allReceivables.filter(r => r.days <= 30),
    '30_days': allReceivables.filter(r => r.days > 30 && r.days <= 60),
    '60_days': allReceivables.filter(r => r.days > 60 && r.days <= 90),
    '90_plus': allReceivables.filter(r => r.days > 90)
  };

  const bucketLabels = {
    current: { label: 'Current (0-30 days)', color: 'border-green-500/30' },
    '30_days': { label: '30-60 Days', color: 'border-yellow-500/30' },
    '60_days': { label: '60-90 Days', color: 'border-orange-500/30' },
    '90_plus': { label: '90+ Days', color: 'border-red-500/30' }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Aging Report</h2>
      
      {Object.entries(agingBuckets).map(([key, items]) => (
        <div key={key} className={`glass rounded-lg border ${bucketLabels[key].color}`}>
          <div className="p-4 border-b border-border/50 flex justify-between items-center">
            <h3 className="font-semibold">{bucketLabels[key].label}</h3>
            <span className="text-lg font-bold">
              ${items.reduce((sum, r) => sum + r.amount, 0).toLocaleString()}
            </span>
          </div>
          {items.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">No outstanding items</div>
          ) : (
            <div className="p-4">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Type</th>
                    <th className="text-left py-2">Number</th>
                    <th className="text-left py-2">Customer</th>
                    <th className="text-right py-2">Amount</th>
                    <th className="text-right py-2">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t border-border/30">
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          item.type === 'SPA' ? 'bg-purple-500/20 text-purple-400' :
                          item.type === 'LOCAL' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-cyan-500/20 text-cyan-400'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="py-2 font-medium">{item.number}</td>
                      <td className="py-2">{item.customer}</td>
                      <td className="py-2 text-right font-mono">{item.currency} {item.amount.toLocaleString()}</td>
                      <td className={`py-2 text-right font-mono ${item.days > 60 ? 'text-red-400' : ''}`}>
                        {item.days}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ReceivablesPage;
