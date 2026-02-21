import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import api from '../lib/api';
import { Package, AlertTriangle, CheckCircle, User } from 'lucide-react';

export default function DeliveryConfirmationDialog({ 
  open, 
  onOpenChange, 
  transport, 
  deliveryOrder,
  jobOrder,
  onSuccess 
}) {
  const [deliveredQty, setDeliveredQty] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && jobOrder) {
      // Pre-fill with expected quantity
      setDeliveredQty(jobOrder.quantity || deliveryOrder?.quantity || '');
      setCustomerName(jobOrder.customer_name || '');
      setReceiverName('');
      setDeliveryNotes('');
    }
  }, [open, jobOrder, deliveryOrder]);

  const expectedQty = jobOrder?.quantity || deliveryOrder?.quantity || 0;
  const unit = jobOrder?.unit || deliveryOrder?.unit || 'MT';
  const isPartial = parseFloat(deliveredQty) < parseFloat(expectedQty);
  const undeliveredQty = parseFloat(expectedQty) - parseFloat(deliveredQty);

  const handleConfirm = async () => {
    if (!deliveredQty || parseFloat(deliveredQty) <= 0) {
      toast.error('Please enter delivered quantity');
      return;
    }

    if (parseFloat(deliveredQty) > parseFloat(expectedQty)) {
      toast.error('Delivered quantity cannot exceed expected quantity');
      return;
    }

    if (!receiverName) {
      toast.error('Please enter receiver name');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/delivery/confirm', {
        transport_id: transport.id,
        delivery_order_id: deliveryOrder?.id,
        job_order_id: jobOrder.id,
        delivered_qty: parseFloat(deliveredQty),
        unit: unit,
        delivery_date: new Date().toISOString().split('T')[0],
        customer_name: customerName,
        receiver_name: receiverName,
        delivery_notes: deliveryNotes
      });

      if (response.data.is_partial) {
        toast.warning(
          `Partial delivery recorded. ${response.data.undelivered_qty} ${unit} undelivered.`,
          { duration: 5000 }
        );
      } else {
        toast.success('Full delivery confirmed successfully!');
      }

      onOpenChange(false);
      if (onSuccess) onSuccess(response.data);
    } catch (error) {
      console.error('Delivery confirmation error:', error);
      toast.error(error.response?.data?.detail || 'Failed to confirm delivery');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Confirm Delivery
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Order Details */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Job Order:</span>
                <span className="font-medium ml-2">{jobOrder?.job_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">DO Number:</span>
                <span className="font-medium ml-2">{deliveryOrder?.do_number || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Product:</span>
                <span className="font-medium ml-2">{jobOrder?.product_name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Packaging:</span>
                <span className="font-medium ml-2">{jobOrder?.packaging || 'Bulk'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Transport:</span>
                <span className="font-medium ml-2">{transport?.transport_number}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Vehicle:</span>
                <span className="font-medium ml-2">{transport?.vehicle_number || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Expected Quantity */}
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
            <Label className="text-blue-600 dark:text-blue-400 font-semibold">Expected Quantity</Label>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {expectedQty} {unit}
            </div>
          </div>

          {/* Delivered Quantity Input */}
          <div className="form-field">
            <Label htmlFor="deliveredQty">
              Actual Delivered Quantity <span className="text-red-500">*</span>
            </Label>
            <Input
              id="deliveredQty"
              type="number"
              value={deliveredQty}
              onChange={(e) => setDeliveredQty(e.target.value)}
              placeholder={`Enter delivered quantity (max: ${expectedQty})`}
              step="0.01"
              max={expectedQty}
              className="text-lg font-semibold"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Enter the actual quantity delivered to the customer
            </p>
          </div>

          {/* Partial Delivery Warning */}
          {isPartial && deliveredQty && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-yellow-600 dark:text-yellow-400">Partial Delivery Detected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                    {undeliveredQty.toFixed(2)} {unit}
                  </span> will be marked as undelivered. 
                  Inventory adjustment will be required.
                </p>
              </div>
            </div>
          )}

          {/* Full Delivery Success */}
          {!isPartial && deliveredQty && parseFloat(deliveredQty) === parseFloat(expectedQty) && (
            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-green-600 dark:text-green-400">Full Delivery</p>
                <p className="text-sm text-muted-foreground mt-1">
                  All goods delivered successfully
                </p>
              </div>
            </div>
          )}

          {/* Customer & Receiver Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-field">
              <Label htmlFor="customerName">Customer Name</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer company name"
              />
            </div>
            <div className="form-field">
              <Label htmlFor="receiverName">
                Receiver Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="receiverName"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Person who received the goods"
                required
              />
            </div>
          </div>

          {/* Delivery Notes */}
          <div className="form-field">
            <Label htmlFor="deliveryNotes">
              Delivery Notes {isPartial && <span className="text-yellow-500">(Required for partial delivery)</span>}
            </Label>
            <Textarea
              id="deliveryNotes"
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder={isPartial 
                ? "Explain reason for partial delivery (e.g., damaged goods, customer rejection, etc.)" 
                : "Optional notes about the delivery"}
              rows={3}
              required={isPartial}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={submitting}
              className={isPartial ? 'bg-yellow-600 hover:bg-yellow-700' : ''}
            >
              {submitting ? 'Confirming...' : (isPartial ? 'Confirm Partial Delivery' : 'Confirm Full Delivery')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

