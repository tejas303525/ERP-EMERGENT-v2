import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { formatDate, hasPagePermission } from '../lib/utils';
import { 
  AlertTriangle, 
  CheckCircle, 
  Package, 
  FileText, 
  RefreshCw,
  TrendingUp,
  Eye
} from 'lucide-react';

export default function OutboundPartialDeliveriesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [partialDeliveries, setPartialDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    loadPartialDeliveries();
  }, [filterStatus]);

  const loadPartialDeliveries = async () => {
    setLoading(true);
    try {
      const params = filterStatus ? `?status=${filterStatus}` : '';
      const res = await api.get(`/delivery/partial-deliveries${params}`);
      setPartialDeliveries(res.data || []);
    } catch (error) {
      console.error('Failed to load partial deliveries:', error);
      toast.error('Failed to load partial deliveries');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustInventory = async () => {
    if (!selectedDelivery) return;

    setAdjusting(true);
    try {
      const res = await api.post(`/delivery/adjust-inventory/${selectedDelivery.id}`);
      toast.success(`Inventory adjusted: ${res.data.qty_added_mt} MT added back to stock`);
      setShowAdjustDialog(false);
      setSelectedDelivery(null);
      loadPartialDeliveries();
    } catch (error) {
      console.error('Inventory adjustment error:', error);
      toast.error(error.response?.data?.detail || 'Failed to adjust inventory');
    } finally {
      setAdjusting(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedDelivery || !resolutionNotes.trim()) {
      toast.error('Please enter resolution notes');
      return;
    }

    try {
      await api.put(`/delivery/partial-deliveries/${selectedDelivery.id}/resolve`, {
        resolution_notes: resolutionNotes
      });
      toast.success('Partial delivery marked as resolved');
      setShowResolveDialog(false);
      setSelectedDelivery(null);
      setResolutionNotes('');
      loadPartialDeliveries();
    } catch (error) {
      console.error('Resolve error:', error);
      toast.error('Failed to resolve partial delivery');
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      PENDING: { variant: 'destructive', icon: AlertTriangle, label: 'Pending Review' },
      UNDER_REVIEW: { variant: 'warning', icon: FileText, label: 'Under Review' },
      INVENTORY_ADJUSTED: { variant: 'default', icon: TrendingUp, label: 'Inventory Adjusted' },
      RESOLVED: { variant: 'success', icon: CheckCircle, label: 'Resolved' },
      DISPUTED: { variant: 'destructive', icon: AlertTriangle, label: 'Disputed' }
    };
    
    const cfg = config[status] || config.PENDING;
    const Icon = cfg.icon;
    
    return (
      <Badge variant={cfg.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {cfg.label}
      </Badge>
    );
  };

  const getReasonBadge = (reason) => {
    const config = {
      DAMAGED: { variant: 'destructive', label: 'Damaged' },
      LOST: { variant: 'destructive', label: 'Lost' },
      REJECTED: { variant: 'warning', label: 'Rejected' },
      SHORT_LOADED: { variant: 'default', label: 'Short Loaded' },
      OTHER: { variant: 'secondary', label: 'Other' }
    };
    
    const cfg = config[reason] || config.OTHER;
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  const canManage = hasPagePermission(user, '/outbound-partial-deliveries', ['admin', 'warehouse', 'inventory']);

  // Calculate statistics
  const stats = {
    total: partialDeliveries.length,
    pending: partialDeliveries.filter(d => d.status === 'PENDING').length,
    needsAdjustment: partialDeliveries.filter(d => !d.inventory_adjusted).length,
    resolved: partialDeliveries.filter(d => d.status === 'RESOLVED').length
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="module-header">
        <div>
          <h1 className="module-title">Outbound Partial Deliveries</h1>
          <p className="text-muted-foreground">
            Track and manage incomplete customer deliveries with inventory adjustments
          </p>
        </div>
        <div className="module-actions">
          <Button variant="outline" onClick={loadPartialDeliveries}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Partial Deliveries</div>
          <div className="text-2xl font-bold mt-1">{stats.total}</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="text-sm text-yellow-600 dark:text-yellow-400">Pending Review</div>
          <div className="text-2xl font-bold mt-1 text-yellow-600 dark:text-yellow-400">{stats.pending}</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
          <div className="text-sm text-orange-600 dark:text-orange-400">Needs Adjustment</div>
          <div className="text-2xl font-bold mt-1 text-orange-600 dark:text-orange-400">{stats.needsAdjustment}</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="text-sm text-green-600 dark:text-green-400">Resolved</div>
          <div className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{stats.resolved}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          className="input-base w-48"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending Review</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="INVENTORY_ADJUSTED">Inventory Adjusted</option>
          <option value="RESOLVED">Resolved</option>
          <option value="DISPUTED">Disputed</option>
        </select>
      </div>

      {/* Table */}
      {partialDeliveries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card border rounded-lg">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No partial deliveries found</p>
          <p className="text-sm mt-1">All deliveries have been completed successfully</p>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Job #</th>
                <th>DO #</th>
                <th>Product</th>
                <th>Expected</th>
                <th>Delivered</th>
                <th className="text-red-600">Undelivered</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Inventory</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {partialDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="text-xs text-muted-foreground">
                    {formatDate(delivery.created_at)}
                  </td>
                  <td className="font-medium">{delivery.job_number}</td>
                  <td>{delivery.do_number}</td>
                  <td>
                    <div className="font-medium">{delivery.product_name}</div>
                    <div className="text-xs text-muted-foreground">{delivery.packaging}</div>
                  </td>
                  <td className="font-mono">{delivery.expected_qty} {delivery.unit}</td>
                  <td className="font-mono text-green-600">{delivery.delivered_qty} {delivery.unit}</td>
                  <td className="font-mono text-red-600 font-semibold">
                    {delivery.undelivered_qty} {delivery.unit}
                  </td>
                  <td>{getReasonBadge(delivery.reason)}</td>
                  <td>{getStatusBadge(delivery.status)}</td>
                  <td>
                    {delivery.inventory_adjusted ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Adjusted
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Not Adjusted
                      </Badge>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedDelivery(delivery);
                          setShowDetailsDialog(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canManage && !delivery.inventory_adjusted && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => {
                            setSelectedDelivery(delivery);
                            setShowAdjustDialog(true);
                          }}
                        >
                          <TrendingUp className="w-4 h-4 mr-1" />
                          Adjust
                        </Button>
                      )}
                      {canManage && delivery.inventory_adjusted && delivery.status !== 'RESOLVED' && (
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => {
                            setSelectedDelivery(delivery);
                            setShowResolveDialog(true);
                          }}
                        >
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Resolve
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

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Partial Delivery Details</DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Job Order</Label>
                  <div className="font-medium">{selectedDelivery.job_number}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Delivery Order</Label>
                  <div className="font-medium">{selectedDelivery.do_number}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Transport</Label>
                  <div className="font-medium">{selectedDelivery.transport_number}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Product</Label>
                  <div className="font-medium">{selectedDelivery.product_name}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Packaging</Label>
                  <div className="font-medium">{selectedDelivery.packaging}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Reason</Label>
                  <div>{getReasonBadge(selectedDelivery.reason)}</div>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-muted-foreground text-xs">Expected</Label>
                  <div className="text-lg font-bold">{selectedDelivery.expected_qty} {selectedDelivery.unit}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Delivered</Label>
                  <div className="text-lg font-bold text-green-600">{selectedDelivery.delivered_qty} {selectedDelivery.unit}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Undelivered</Label>
                  <div className="text-lg font-bold text-red-600">{selectedDelivery.undelivered_qty} {selectedDelivery.unit}</div>
                </div>
              </div>

              {selectedDelivery.reason_details && (
                <div>
                  <Label>Reason Details</Label>
                  <div className="bg-muted p-3 rounded text-sm">{selectedDelivery.reason_details}</div>
                </div>
              )}

              {selectedDelivery.notes && (
                <div>
                  <Label>Notes</Label>
                  <div className="bg-muted p-3 rounded text-sm">{selectedDelivery.notes}</div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust Inventory Dialog */}
      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Inventory</DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4 py-4">
              <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
                <p className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">
                  Undelivered Goods
                </p>
                <div className="text-2xl font-bold">
                  {selectedDelivery.undelivered_qty} {selectedDelivery.unit}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  of {selectedDelivery.product_name}
                </p>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <p><strong>Job Order:</strong> {selectedDelivery.job_number}</p>
                <p><strong>DO Number:</strong> {selectedDelivery.do_number}</p>
                <p><strong>Packaging:</strong> {selectedDelivery.packaging}</p>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                <p className="text-sm text-blue-600 dark:text-blue-400">
                  <strong>Action:</strong> This will add the undelivered quantity back to inventory 
                  and restore packaging materials.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowAdjustDialog(false)}
                  disabled={adjusting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdjustInventory}
                  disabled={adjusting}
                >
                  {adjusting ? 'Adjusting...' : 'Adjust Inventory'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Partial Delivery</DialogTitle>
          </DialogHeader>
          {selectedDelivery && (
            <div className="space-y-4 py-4">
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <p><strong>Job Order:</strong> {selectedDelivery.job_number}</p>
                <p><strong>Product:</strong> {selectedDelivery.product_name}</p>
                <p><strong>Undelivered:</strong> {selectedDelivery.undelivered_qty} {selectedDelivery.unit}</p>
              </div>

              <div className="form-field">
                <Label htmlFor="resolutionNotes">
                  Resolution Notes <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="resolutionNotes"
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Describe how this was resolved (e.g., replacement shipped, credit issued, customer accepted short delivery)"
                  rows={4}
                  required
                />
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowResolveDialog(false);
                    setResolutionNotes('');
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleResolve} variant="success">
                  Mark as Resolved
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

