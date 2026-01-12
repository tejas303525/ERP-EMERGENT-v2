import React, { useState, useEffect } from 'react';
import { deliveryOrderAPI, jobOrderAPI, shippingAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { Plus, ClipboardList } from 'lucide-react';

export default function DeliveryOrdersPage() {
  const { user } = useAuth();
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [form, setForm] = useState({
    job_order_id: '',
    shipping_booking_id: '',
    vehicle_number: '',
    driver_name: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [dosRes, jobsRes, bookingsRes] = await Promise.all([
        deliveryOrderAPI.getAll(),
        jobOrderAPI.getAll('ready_for_dispatch'),
        shippingAPI.getAll(),
      ]);
      setDeliveryOrders(dosRes.data);
      setJobs(jobsRes.data);
      setBookings(bookingsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.job_order_id) {
      toast.error('Please select a job order');
      return;
    }
    try {
      await deliveryOrderAPI.create(form);
      toast.success('Delivery order created. Inventory updated.');
      setCreateOpen(false);
      setForm({ job_order_id: '', shipping_booking_id: '', vehicle_number: '', driver_name: '', notes: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create delivery order');
    }
  };

  const canCreate = ['admin', 'security'].includes(user?.role);

  return (
    <div className="page-container" data-testid="delivery-orders-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Delivery Orders</h1>
          <p className="text-muted-foreground text-sm">Issue delivery orders for outgoing goods</p>
        </div>
        <div className="module-actions">
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-do-btn" className="rounded-sm">
                  <Plus className="w-4 h-4 mr-2" /> New Delivery Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Delivery Order</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="form-field">
                    <Label>Job Order (Ready for Dispatch)</Label>
                    <Select value={form.job_order_id} onValueChange={(v) => setForm({...form, job_order_id: v})}>
                      <SelectTrigger data-testid="job-order-select">
                        <SelectValue placeholder="Select job order" />
                      </SelectTrigger>
                      <SelectContent>
                        {jobs.map(j => (
                          <SelectItem key={j.id} value={j.id}>
                            {j.job_number} - {j.product_name} ({j.quantity})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="form-field">
                    <Label>Shipping Booking (Optional)</Label>
                    <Select value={form.shipping_booking_id || "none"} onValueChange={(v) => setForm({...form, shipping_booking_id: v === "none" ? "" : v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select shipping booking" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {bookings.map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.booking_number} - {b.shipping_line}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Vehicle Number</Label>
                      <Input
                        value={form.vehicle_number}
                        onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
                        placeholder="Vehicle plate number"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Driver Name</Label>
                      <Input
                        value={form.driver_name}
                        onChange={(e) => setForm({...form, driver_name: e.target.value})}
                        placeholder="Driver name"
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <Label>Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm({...form, notes: e.target.value})}
                      placeholder="Additional notes..."
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreate} data-testid="submit-do-btn">Create Delivery Order</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Delivery Orders List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Delivery Orders ({deliveryOrders.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : deliveryOrders.length === 0 ? (
          <div className="empty-state">
            <ClipboardList className="empty-state-icon" />
            <p className="empty-state-title">No delivery orders found</p>
            <p className="empty-state-description">Create a delivery order for ready goods</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>DO Number</th>
                <th>Job Number</th>
                <th>Product</th>
                <th>Quantity</th>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Issued Date</th>
              </tr>
            </thead>
            <tbody>
              {deliveryOrders.map((dorder) => (
                <tr key={dorder.id} data-testid={`do-row-${dorder.do_number}`}>
                  <td className="font-medium">{dorder.do_number}</td>
                  <td>{dorder.job_number}</td>
                  <td>{dorder.product_name}</td>
                  <td className="font-mono">{dorder.quantity}</td>
                  <td>{dorder.vehicle_number || '-'}</td>
                  <td>{dorder.driver_name || '-'}</td>
                  <td>{formatDate(dorder.issued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
