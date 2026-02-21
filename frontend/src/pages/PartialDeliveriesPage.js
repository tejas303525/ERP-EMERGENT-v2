import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { formatDate, hasPagePermission } from '../lib/utils';
import { AlertTriangle, CheckCircle, XCircle, FileText } from 'lucide-react';

export default function PartialDeliveriesPage() {
  const { user } = useAuth();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [actionOpen, setActionOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [actionNotes, setActionNotes] = useState('');

  useEffect(() => {
    loadClaims();
  }, [filterStatus]);

  const loadClaims = async () => {
    try {
      const params = filterStatus ? `?status=${filterStatus}` : '';
      const res = await api.get(`/partial-delivery-claims${params}`);
      setClaims(res.data.data || []);
    } catch (error) {
      toast.error('Failed to load claims');
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (claim) => {
    setSelectedClaim(claim);
    setActionOpen(true);
  };

  const submitClaim = async () => {
    try {
      await api.put(`/partial-delivery-claims/${selectedClaim.id}/claim`, { claim_notes: actionNotes });
      toast.success('Shortage claimed successfully');
      setActionOpen(false);
      setActionNotes('');
      setSelectedClaim(null);
      loadClaims();
    } catch (error) {
      toast.error('Failed to claim shortage');
    }
  };

  const handleResolve = async (claim) => {
    setSelectedClaim(claim);
    setActionOpen(true);
  };

  const submitResolve = async () => {
    try {
      await api.put(`/partial-delivery-claims/${selectedClaim.id}/resolve`, { resolution_notes: actionNotes });
      toast.success('Shortage resolved successfully');
      setActionOpen(false);
      setActionNotes('');
      setSelectedClaim(null);
      loadClaims();
    } catch (error) {
      toast.error('Failed to resolve shortage');
    }
  };

  const handleCancel = async (claimId) => {
    if (!window.confirm('Are you sure you want to cancel this claim?')) return;
    
    try {
      await api.put(`/partial-delivery-claims/${claimId}/cancel`);
      toast.success('Claim cancelled');
      loadClaims();
    } catch (error) {
      toast.error('Failed to cancel claim');
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      PENDING: { variant: 'destructive', icon: AlertTriangle, label: 'Pending' },
      CLAIMED: { variant: 'warning', icon: FileText, label: 'Claimed' },
      SUPPLIER_NOTIFIED: { variant: 'default', icon: FileText, label: 'Supplier Notified' },
      RESOLVED: { variant: 'success', icon: CheckCircle, label: 'Resolved' },
      CANCELLED: { variant: 'secondary', icon: XCircle, label: 'Cancelled' }
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

  const canManage = hasPagePermission(user, '/partial-deliveries', ['admin', 'procurement']);

  if (loading) {
    return <div className="page-container">Loading...</div>;
  }

  return (
    <div className="page-container">
      <div className="module-header">
        <div>
          <h1 className="module-title">Partial Delivery Claims</h1>
          <p className="text-muted-foreground">Track and manage procurement shortages from incomplete deliveries</p>
        </div>
        <div className="module-actions">
          <div className="flex gap-2">
            <select
              className="input-base"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CLAIMED">Claimed</option>
              <option value="SUPPLIER_NOTIFIED">Supplier Notified</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {claims.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No partial delivery claims found</p>
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>GRN #</th>
                <th>PO #</th>
                <th>Item</th>
                <th>Ordered</th>
                <th>Received</th>
                <th className="text-red-600">Shortage</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(claim => (
                <tr key={claim.id}>
                  <td className="text-xs text-muted-foreground">
                    {formatDate(claim.created_at)}
                  </td>
                  <td className="font-medium">{claim.grn_number}</td>
                  <td>{claim.po_number}</td>
                  <td>{claim.item_name}</td>
                  <td className="font-mono">{claim.ordered_qty} {claim.unit}</td>
                  <td className="font-mono">{claim.received_qty} {claim.unit}</td>
                  <td className="font-mono text-red-600 font-semibold">
                    {claim.shortage_qty} {claim.unit}
                  </td>
                  <td>{getStatusBadge(claim.claim_status)}</td>
                  <td>
                    <div className="flex gap-2">
                      {canManage && claim.claim_status === 'PENDING' && (
                        <Button 
                          size="sm" 
                          variant="default"
                          onClick={() => {
                            setSelectedClaim(claim);
                            setActionOpen(true);
                          }}
                        >
                          Claim
                        </Button>
                      )}
                      {canManage && claim.claim_status === 'CLAIMED' && (
                        <Button 
                          size="sm" 
                          variant="success"
                          onClick={() => {
                            setSelectedClaim(claim);
                            setActionOpen(true);
                          }}
                        >
                          Resolve
                        </Button>
                      )}
                      {canManage && ['PENDING', 'CLAIMED'].includes(claim.claim_status) && (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => handleCancel(claim.id)}
                        >
                          Cancel
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

      {/* Action Dialog */}
      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedClaim?.claim_status === 'PENDING' ? 'Claim Shortage' : 'Resolve Shortage'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedClaim && (
            <div className="space-y-4 py-4">
              <div className="bg-muted p-4 rounded-md space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">GRN:</span>
                    <span className="font-medium ml-2">{selectedClaim.grn_number}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">PO:</span>
                    <span className="font-medium ml-2">{selectedClaim.po_number}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Item:</span>
                    <span className="font-medium ml-2">{selectedClaim.item_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Shortage:</span>
                    <span className="font-semibold text-red-600 ml-2">
                      {selectedClaim.shortage_qty} {selectedClaim.unit}
                    </span>
                  </div>
                </div>
              </div>

              <div className="form-field">
                <Label>Notes</Label>
                <Textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder={selectedClaim.claim_status === 'PENDING' 
                    ? 'Add notes about this claim (e.g., contacted supplier, expected delivery date)' 
                    : 'Add resolution notes (e.g., goods received, credit issued, etc.)'}
                  rows={4}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setActionOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={selectedClaim.claim_status === 'PENDING' ? submitClaim : submitResolve}
                >
                  {selectedClaim.claim_status === 'PENDING' ? 'Claim Shortage' : 'Mark as Resolved'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

