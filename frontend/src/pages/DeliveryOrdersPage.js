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
import { formatDate, hasPagePermission } from '../lib/utils';
import { Plus, ClipboardList, Download, Eye } from 'lucide-react';

export default function DeliveryOrdersPage() {
  const { user } = useAuth();
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedDO, setSelectedDO] = useState(null);

  const [form, setForm] = useState({
    job_order_id: '',
    shipping_booking_id: '',
    vehicle_type: '',
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
        // Request ready_for_dispatch jobs - using max page_size of 100 (backend limit)
        jobOrderAPI.getAll('ready_for_dispatch', 1, 100),
        shippingAPI.getAll(),
      ]);
      // Ensure data is always an array to prevent .map() errors
      setDeliveryOrders(Array.isArray(dosRes?.data) ? dosRes.data : []);
      // Show all ready_for_dispatch job orders (incoterm routing handled by other pages)
      // EXW -> Transport Window, FOB -> Shipping, DDP -> Security/QC, CFR -> Import Window
      // Handle paginated response structure - jobsRes.data is {data: [...], pagination: {...}}
      const jobsResponse = jobsRes?.data || {};
      const jobsData = Array.isArray(jobsResponse.data) ? jobsResponse.data : (Array.isArray(jobsResponse) ? jobsResponse : []);
      setJobs(jobsData);
      setBookings(Array.isArray(bookingsRes?.data) ? bookingsRes.data : []);
    } catch (error) {
      toast.error('Failed to load data');
      // Set empty arrays on error to prevent rendering issues
      setDeliveryOrders([]);
      setJobs([]);
      setBookings([]);
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
      setForm({ job_order_id: '', shipping_booking_id: '', vehicle_type: '', vehicle_number: '', driver_name: '', notes: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create delivery order');
    }
  };

  const canCreate = hasPagePermission(user, '/delivery-orders', ['admin', 'security']);

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
                  <div className="form-field">
                    <Label>Vehicle Type *</Label>
                    <Select value={form.vehicle_type} onValueChange={(v) => setForm({...form, vehicle_type: v})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vehicle type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tanker">Tanker</SelectItem>
                        <SelectItem value="container">Container</SelectItem>
                        <SelectItem value="trailer">Trailer</SelectItem>
                        <SelectItem value="truck">Truck</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Vehicle Number *</Label>
                      <Input
                        value={form.vehicle_number}
                        onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
                        placeholder="Vehicle plate number"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Driver Name *</Label>
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
                <th>Vehicle Type</th>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Issued Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveryOrders.map((dorder) => {
                const isBulk = dorder.is_bulk === true;
                const lineItems = dorder.line_items || [];
                
                return (
                  <tr key={dorder.id} data-testid={`do-row-${dorder.do_number}`}>
                    <td className="font-medium">{dorder.do_number}</td>
                    <td>
                      {isBulk ? (
                        <span className="text-xs text-muted-foreground">
                          {dorder.job_count || lineItems.length} {dorder.job_count === 1 ? 'Job' : 'Jobs'}
                        </span>
                      ) : (
                        dorder.job_number || '-'
                      )}
                    </td>
                    <td>
                      {isBulk && lineItems.length > 0 ? (
                        <div className="space-y-1">
                          {lineItems.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="text-sm">
                              {item.product_name || 'N/A'}
                              {item.packaging && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({item.packaging})
                                </span>
                              )}
                            </div>
                          ))}
                          {lineItems.length > 2 && (
                            <div className="text-xs text-muted-foreground">
                              +{lineItems.length - 2} more
                            </div>
                          )}
                        </div>
                      ) : (
                        dorder.product_name || '-'
                      )}
                    </td>
                    <td className="font-mono">
                      {isBulk && lineItems.length > 0 ? (
                        <div className="space-y-1">
                          {lineItems.slice(0, 2).map((item, idx) => {
                            // Display format: "80 EA (14.8 MT)" for drums, "14.8 MT" for bulk
                            let displayText;
                            if (item.unit && item.unit !== 'MT') {
                              // Drums: show "80 EA (14.8 MT)"
                              // Calculate quantity_mt if missing (for old DOs)
                              let qtyMt = item.quantity_mt;
                              if (!qtyMt && item.quantity && item.net_weight_kg) {
                                qtyMt = (item.quantity * item.net_weight_kg) / 1000;
                              } else if (!qtyMt && item.quantity) {
                                // Fallback: assume 185 kg per drum
                                qtyMt = (item.quantity * 185) / 1000;
                              }
                              if (qtyMt) {
                                displayText = `${item.quantity} ${item.unit} (${qtyMt.toFixed(2)} MT)`;
                              } else {
                                displayText = `${item.quantity} ${item.unit}`;
                              }
                            } else {
                              // Bulk: show "14.8 MT"
                              const qty = item.quantity_mt || item.quantity || 0;
                              displayText = `${qty.toFixed(2)} MT`;
                            }
                            return (
                              <div key={idx} className="text-sm">
                                {displayText}
                              </div>
                            );
                          })}
                          {lineItems.length > 2 && (
                            <div className="text-xs text-muted-foreground">
                              ...
                            </div>
                          )}
                        </div>
                      ) : (
                        (() => {
                          // Single DO: show "80 EA (14.8 MT)" for drums, "14.8 MT" for bulk
                          if (dorder.unit && dorder.unit !== 'MT') {
                            // Calculate quantity_mt if missing (for old DOs)
                            let qtyMt = dorder.quantity_mt;
                            if (!qtyMt && dorder.quantity && dorder.net_weight_kg) {
                              qtyMt = (dorder.quantity * dorder.net_weight_kg) / 1000;
                            } else if (!qtyMt && dorder.quantity) {
                              // Fallback: assume 185 kg per drum
                              qtyMt = (dorder.quantity * 185) / 1000;
                            }
                            if (qtyMt) {
                              return `${dorder.quantity} ${dorder.unit} (${qtyMt.toFixed(2)} MT)`;
                            } else {
                              return `${dorder.quantity} ${dorder.unit}`;
                            }
                          } else {
                            const qty = dorder.quantity_mt || dorder.quantity || 0;
                            return `${qty.toFixed(2)} MT`;
                          }
                        })()
                      )}
                    </td>
                    <td>{dorder.vehicle_type || '-'}</td>
                    <td>{dorder.vehicle_number || '-'}</td>
                    <td>{dorder.driver_name || '-'}</td>
                    <td>{formatDate(dorder.issued_at)}</td>
                    <td>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedDO(dorder);
                            setViewOpen(true);
                          }}
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const token = localStorage.getItem('erp_token');
                            const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                            window.open(`${backendUrl}/api/pdf/delivery-note/${dorder.id}?token=${token}`, '_blank');
                          }}
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Delivery Order Details - {selectedDO?.do_number}</DialogTitle>
          </DialogHeader>
          {selectedDO && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">DO Number:</span>
                  <p className="font-medium">{selectedDO.do_number}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {selectedDO.is_bulk ? 'Job Count:' : 'Job Number:'}
                  </span>
                  <p className="font-medium">
                    {selectedDO.is_bulk 
                      ? `${selectedDO.job_count || (selectedDO.line_items?.length || 0)} Jobs`
                      : (selectedDO.job_number || '-')}
                  </p>
                </div>
                {!selectedDO.is_bulk && (
                  <>
                    <div>
                      <span className="text-muted-foreground">Product:</span>
                      <p className="font-medium">{selectedDO.product_name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Quantity:</span>
                      <p className="font-medium">{selectedDO.quantity || '-'} {selectedDO.unit || ''}</p>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-muted-foreground">Vehicle Type:</span>
                  <p className="font-medium">{selectedDO.vehicle_type || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Vehicle Number:</span>
                  <p className="font-medium">{selectedDO.vehicle_number || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Driver Name:</span>
                  <p className="font-medium">{selectedDO.driver_name || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Issued Date:</span>
                  <p className="font-medium">{formatDate(selectedDO.issued_at)}</p>
                </div>
                {selectedDO.shipping_booking_id && (
                  <div>
                    <span className="text-muted-foreground">Shipping Booking:</span>
                    <p className="font-medium">{selectedDO.shipping_booking_id}</p>
                  </div>
                )}
                {selectedDO.notes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Notes:</span>
                    <p className="font-medium">{selectedDO.notes}</p>
                  </div>
                )}
              </div>

              {/* Bulk DO Products Table */}
              {selectedDO.is_bulk && selectedDO.line_items && selectedDO.line_items.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <h4 className="font-medium text-sm">Products ({selectedDO.line_items.length})</h4>
                  <div className="overflow-x-auto">
                    <table className="erp-table w-full text-sm">
                      <thead>
                        <tr>
                          <th>Job Number</th>
                          <th>Product</th>
                          <th>Packaging</th>
                          <th>Quantity</th>
                          <th>Net Weight (MT)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDO.line_items.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.job_number || '-'}</td>
                            <td className="font-medium">{item.product_name || '-'}</td>
                            <td>{item.packaging || '-'}</td>
                            <td className="font-mono">
                              {item.quantity} {item.unit || ''}
                            </td>
                            <td className="font-mono">
                              {item.net_weight_mt ? item.net_weight_mt.toFixed(3) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Weight Information for Bulk DOs */}
              {selectedDO.is_bulk && (
                <div className="grid grid-cols-3 gap-4 text-sm pt-2 border-t">
                  {selectedDO.exit_empty_weight && (
                    <div>
                      <span className="text-muted-foreground">Empty Weight:</span>
                      <p className="font-medium">{selectedDO.exit_empty_weight} kg</p>
                    </div>
                  )}
                  {selectedDO.exit_gross_weight && (
                    <div>
                      <span className="text-muted-foreground">Gross Weight:</span>
                      <p className="font-medium">{selectedDO.exit_gross_weight} kg</p>
                    </div>
                  )}
                  {selectedDO.exit_net_weight && (
                    <div>
                      <span className="text-muted-foreground">Net Weight:</span>
                      <p className="font-medium">{selectedDO.exit_net_weight} kg</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setViewOpen(false)}>
                  Close
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    const token = localStorage.getItem('erp_token');
                    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                    window.open(`${backendUrl}/api/pdf/delivery-note/${selectedDO.id}?token=${token}`, '_blank');
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
