import React, { useState, useEffect } from 'react';
import { documentAPI, shippingAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatDate, getStatusColor } from '../lib/utils';
import { Plus, FileCheck } from 'lucide-react';

const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Commercial Invoice' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'bill_of_lading', label: 'Bill of Lading' },
  { value: 'certificate_of_origin', label: 'Certificate of Origin' },
];

export default function DocumentationPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const [form, setForm] = useState({
    shipping_booking_id: '',
    document_type: '',
    document_number: '',
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [docsRes, bookingsRes] = await Promise.all([
        documentAPI.getAll(),
        shippingAPI.getAll(),
      ]);
      setDocuments(docsRes.data);
      setBookings(bookingsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.shipping_booking_id || !form.document_type || !form.document_number) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      await documentAPI.create(form);
      toast.success('Document created');
      setCreateOpen(false);
      setForm({ shipping_booking_id: '', document_type: '', document_number: '', notes: '' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create document');
    }
  };

  const getDocumentTypeLabel = (type) => {
    const found = DOCUMENT_TYPES.find(d => d.value === type);
    return found ? found.label : type;
  };

  const canCreate = ['admin', 'documentation'].includes(user?.role);

  return (
    <div className="page-container" data-testid="documentation-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Documentation</h1>
          <p className="text-muted-foreground text-sm">Manage export documentation</p>
        </div>
        <div className="module-actions">
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-doc-btn" className="rounded-sm">
                  <Plus className="w-4 h-4 mr-2" /> New Document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Export Document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="form-field">
                    <Label>Shipping Booking</Label>
                    <Select value={form.shipping_booking_id} onValueChange={(v) => setForm({...form, shipping_booking_id: v})}>
                      <SelectTrigger data-testid="booking-select">
                        <SelectValue placeholder="Select shipping booking" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookings.map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.booking_number} - {b.shipping_line}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="form-field">
                    <Label>Document Type</Label>
                    <Select value={form.document_type} onValueChange={(v) => setForm({...form, document_type: v})}>
                      <SelectTrigger data-testid="doc-type-select">
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="form-field">
                    <Label>Document Number</Label>
                    <Input
                      value={form.document_number}
                      onChange={(e) => setForm({...form, document_number: e.target.value})}
                      placeholder="Enter document number"
                      data-testid="doc-number-input"
                    />
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
                    <Button onClick={handleCreate} data-testid="submit-doc-btn">Create Document</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Documents List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Export Documents ({documents.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <FileCheck className="empty-state-icon" />
            <p className="empty-state-title">No documents found</p>
            <p className="empty-state-description">Create export documents for shipments</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Document #</th>
                <th>Type</th>
                <th>Booking #</th>
                <th>Status</th>
                <th>Created Date</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} data-testid={`doc-row-${doc.document_number}`}>
                  <td className="font-medium">{doc.document_number}</td>
                  <td>{getDocumentTypeLabel(doc.document_type)}</td>
                  <td>{doc.booking_number}</td>
                  <td><Badge className={getStatusColor(doc.status)}>{doc.status}</Badge></td>
                  <td>{formatDate(doc.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
