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
import { Plus, FileCheck, Download, FileText, Package, Globe, Ship, FileCheck as COAIcon } from 'lucide-react';

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
  const [jobOrdersWithDocs, setJobOrdersWithDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('job-orders');

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
      const [docsRes, bookingsRes, jobOrdersRes] = await Promise.all([
        documentAPI.getAll(),
        shippingAPI.getAll(),
        documentAPI.getJobOrdersWithDocuments().catch(() => ({ data: [] })),
      ]);
      setDocuments(docsRes.data);
      setBookings(bookingsRes.data);
      setJobOrdersWithDocs(jobOrdersRes.data || []);
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

  const getDocumentIcon = (docType) => {
    const icons = {
      delivery_order: Package,
      invoice: FileText,
      packing_list: Package,
      certificate_of_origin: Globe,
      bl_draft: Ship,
      certificate_of_analysis: COAIcon,
    };
    return icons[docType] || FileText;
  };

  const getDocumentLabel = (docType) => {
    const labels = {
      delivery_order: 'Delivery Order',
      invoice: 'Invoice',
      packing_list: 'Packing List',
      certificate_of_origin: 'Certificate of Origin',
      bl_draft: 'Bill of Lading Draft',
      certificate_of_analysis: 'Certificate of Analysis',
    };
    return labels[docType] || docType;
  };

  const handleDownloadDocument = async (docType, doc) => {
    if (!doc || !doc.id) {
      toast.error('Document not available');
      return;
    }

    try {
      const token = localStorage.getItem('erp_token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
      let url = '';

      // Map document types to their PDF endpoints
      switch (docType) {
        case 'invoice':
          url = `${backendUrl}/api/pdf/invoice/${doc.id}?token=${token}`;
          break;
        case 'delivery_order':
          // TODO: Add DO PDF endpoint when available
          toast.info('Delivery Order PDF download will be available soon');
          return;
        case 'packing_list':
          // TODO: Add Packing List PDF endpoint when available
          toast.info('Packing List PDF download will be available soon');
          return;
        case 'certificate_of_origin':
          // TODO: Add COO PDF endpoint when available
          toast.info('Certificate of Origin PDF download will be available soon');
          return;
        case 'bl_draft':
          // TODO: Add BL Draft PDF endpoint when available
          toast.info('Bill of Lading Draft PDF download will be available soon');
          return;
        case 'certificate_of_analysis':
          // TODO: Add COA PDF endpoint when available
          toast.info('Certificate of Analysis PDF download will be available soon');
          return;
        default:
          toast.error('Download not available for this document type');
          return;
      }

      if (url) {
        // Open in new window for PDF download
        window.open(url, '_blank');
        toast.success('Downloading PDF...');
      }
    } catch (error) {
      toast.error('Failed to download document');
      console.error('Download error:', error);
    }
  };

  return (
    <div className="page-container" data-testid="documentation-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Documentation</h1>
          <p className="text-muted-foreground text-sm">Job orders with generated documents ready for download and print</p>
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

      {/* Tabs */}
      <div className="mb-4 border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('job-orders')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === 'job-orders'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Job Orders & Documents ({jobOrdersWithDocs.length})
          </button>
          <button
            onClick={() => setActiveTab('export-docs')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              activeTab === 'export-docs'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Export Documents ({documents.length})
          </button>
        </div>
      </div>

      {/* Job Orders with Documents Tab */}
      {activeTab === 'job-orders' && (
        <div className="data-grid">
          <div className="data-grid-header">
            <h3 className="font-medium">Job Orders with Generated Documents</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : jobOrdersWithDocs.length === 0 ? (
            <div className="empty-state">
              <FileCheck className="empty-state-icon" />
              <p className="empty-state-title">No job orders with documents found</p>
              <p className="empty-state-description">Documents will appear here after weighment entry and QC pass</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobOrdersWithDocs.map((job) => (
                <div key={job.job_id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-lg">{job.job_number}</h4>
                      <p className="text-sm text-muted-foreground">
                        {job.customer_name} • {job.product_name} • Qty: {job.quantity}
                      </p>
                      <Badge className={`mt-1 ${job.customer_type === 'export' ? 'bg-blue-500' : 'bg-green-500'}`}>
                        {job.customer_type === 'export' ? 'Export' : 'Local'}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      DO: {job.do_number}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {Object.entries(job.documents).map(([docType, doc]) => {
                      if (!doc) return null;
                      const Icon = getDocumentIcon(docType);
                      return (
                        <div
                          key={docType}
                          className="flex items-center gap-2 p-2 border rounded hover:bg-accent cursor-pointer"
                          title={getDocumentLabel(docType)}
                        >
                          <Icon className="w-4 h-4" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{getDocumentLabel(docType)}</p>
                            <p className="text-xs text-muted-foreground truncate">{doc.number}</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadDocument(docType, doc);
                            }}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export Documents Tab */}
      {activeTab === 'export-docs' && (
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
      )}
    </div>
  );
}
