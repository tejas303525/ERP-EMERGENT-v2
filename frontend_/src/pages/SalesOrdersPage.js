import React, { useState, useEffect } from 'react';
import { salesOrderAPI, quotationAPI, paymentAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { formatCurrency, formatDate, getStatusColor } from '../lib/utils';
import { Plus, ShoppingCart, Eye, DollarSign } from 'lucide-react';

const PAYMENT_METHODS = ['bank_transfer', 'lc', 'cad', 'cash'];

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [payments, setPayments] = useState([]);

  const [form, setForm] = useState({
    quotation_id: '',
    expected_delivery_date: '',
    notes: '',
  });

  const [paymentForm, setPaymentForm] = useState({
    sales_order_id: '',
    amount: 0,
    currency: 'USD',
    payment_method: 'bank_transfer',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [ordersRes, quotationsRes] = await Promise.all([
        salesOrderAPI.getAll(),
        quotationAPI.getAll('approved'),
      ]);
      setOrders(ordersRes.data);
      setQuotations(quotationsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.quotation_id) {
      toast.error('Please select a quotation');
      return;
    }
    try {
      await salesOrderAPI.create(form);
      toast.success('Sales order created successfully');
      setCreateOpen(false);
      setForm({ quotation_id: '', expected_delivery_date: '', notes: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create order');
    }
  };

  const handlePayment = async () => {
    if (paymentForm.amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    try {
      await paymentAPI.create(paymentForm);
      toast.success('Payment recorded successfully');
      setPaymentOpen(false);
      setPaymentForm({ sales_order_id: '', amount: 0, currency: 'USD', payment_method: 'bank_transfer', reference: '', notes: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to record payment');
    }
  };

  const openPaymentDialog = (order) => {
    setPaymentForm({
      ...paymentForm,
      sales_order_id: order.id,
      currency: order.currency,
    });
    setPaymentOpen(true);
  };

  const viewOrderDetails = async (order) => {
    setSelectedOrder(order);
    try {
      const paymentsRes = await paymentAPI.getAll(order.id);
      setPayments(paymentsRes.data);
    } catch (error) {
      setPayments([]);
    }
    setViewOpen(true);
  };

  return (
    <div className="page-container" data-testid="sales-orders-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Sales Orders / SPA</h1>
          <p className="text-muted-foreground text-sm">Convert quotations and track payments</p>
        </div>
        <div className="module-actions">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-order-btn" className="rounded-sm">
                <Plus className="w-4 h-4 mr-2" /> Create from Quotation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Sales Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="form-field">
                  <Label>Approved Quotation</Label>
                  <Select value={form.quotation_id} onValueChange={(v) => setForm({...form, quotation_id: v})}>
                    <SelectTrigger data-testid="quotation-select">
                      <SelectValue placeholder="Select approved quotation" />
                    </SelectTrigger>
                    <SelectContent>
                      {quotations.map(q => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.pfi_number} - {q.customer_name} ({formatCurrency(q.total, q.currency)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="form-field">
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={form.expected_delivery_date}
                    onChange={(e) => setForm({...form, expected_delivery_date: e.target.value})}
                    data-testid="delivery-date-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({...form, notes: e.target.value})}
                    placeholder="Additional notes"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} data-testid="submit-order-btn">Create Order</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Orders List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Sales Orders ({orders.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <ShoppingCart className="empty-state-icon" />
            <p className="empty-state-title">No sales orders found</p>
            <p className="empty-state-description">Convert an approved quotation to create a sales order</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>SPA Number</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Payment Status</th>
                <th>Order Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} data-testid={`order-row-${order.spa_number}`}>
                  <td className="font-medium">{order.spa_number}</td>
                  <td>{order.customer_name}</td>
                  <td className="font-mono">{formatCurrency(order.total, order.currency)}</td>
                  <td className="font-mono text-emerald-400">{formatCurrency(order.amount_paid, order.currency)}</td>
                  <td className="font-mono text-amber-400">{formatCurrency(order.balance, order.currency)}</td>
                  <td><Badge className={getStatusColor(order.payment_status)}>{order.payment_status}</Badge></td>
                  <td><Badge className={getStatusColor(order.status)}>{order.status}</Badge></td>
                  <td>{formatDate(order.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => viewOrderDetails(order)}
                        data-testid={`view-order-${order.spa_number}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {order.balance > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openPaymentDialog(order)}
                          className="text-emerald-500 hover:text-emerald-400"
                          data-testid={`record-payment-${order.spa_number}`}
                        >
                          <DollarSign className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="form-field">
              <Label>Amount</Label>
              <Input
                type="number"
                value={paymentForm.amount || ''}
                onChange={(e) => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)})}
                placeholder="Enter amount"
                data-testid="payment-amount-input"
              />
            </div>
            <div className="form-field">
              <Label>Payment Method</Label>
              <Select value={paymentForm.payment_method} onValueChange={(v) => setPaymentForm({...paymentForm, payment_method: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, ' ').toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="form-field">
              <Label>Reference Number</Label>
              <Input
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})}
                placeholder="Transaction/Reference number"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
              <Button onClick={handlePayment} data-testid="submit-payment-btn">Record Payment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Sales Order {selectedOrder?.spa_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Customer:</span> {selectedOrder.customer_name}</div>
                <div><span className="text-muted-foreground">Currency:</span> {selectedOrder.currency}</div>
                <div><span className="text-muted-foreground">Total:</span> <span className="font-mono">{formatCurrency(selectedOrder.total, selectedOrder.currency)}</span></div>
                <div><span className="text-muted-foreground">Balance:</span> <span className="font-mono text-amber-400">{formatCurrency(selectedOrder.balance, selectedOrder.currency)}</span></div>
              </div>

              <div className="data-grid">
                <div className="data-grid-header">
                  <h4 className="font-medium">Items</h4>
                </div>
                <table className="erp-table w-full">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items?.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.product_name}</td>
                        <td>{item.sku}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.unit_price, selectedOrder.currency)}</td>
                        <td>{formatCurrency(item.total, selectedOrder.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {payments.length > 0 && (
                <div className="data-grid">
                  <div className="data-grid-header">
                    <h4 className="font-medium">Payment History</h4>
                  </div>
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, idx) => (
                        <tr key={idx}>
                          <td>{formatDate(p.payment_date)}</td>
                          <td className="font-mono text-emerald-400">{formatCurrency(p.amount, p.currency)}</td>
                          <td>{p.payment_method?.replace(/_/g, ' ').toUpperCase()}</td>
                          <td>{p.reference || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
