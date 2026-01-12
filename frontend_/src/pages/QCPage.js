import React, { useState, useEffect } from 'react';
import { qcAPI, jobOrderAPI } from '../lib/api';
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
import { Plus, ClipboardCheck, Check, X, Pause } from 'lucide-react';

const STATUSES = ['pending', 'passed', 'failed', 'hold'];

export default function QCPage() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const [form, setForm] = useState({
    job_order_id: '',
    batch_number: '',
    specifications: {},
    test_results: {},
    notes: '',
  });

  const [specFields, setSpecFields] = useState([{ key: '', value: '' }]);
  const [resultFields, setResultFields] = useState([{ key: '', value: '' }]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [batchesRes, jobsRes] = await Promise.all([
        qcAPI.getAll(),
        jobOrderAPI.getAll('in_production'),
      ]);
      setBatches(batchesRes.data);
      setJobs(jobsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.job_order_id || !form.batch_number) {
      toast.error('Please fill in all required fields');
      return;
    }

    const specs = {};
    specFields.forEach(f => { if (f.key) specs[f.key] = f.value; });
    const results = {};
    resultFields.forEach(f => { if (f.key) results[f.key] = f.value; });

    try {
      await qcAPI.create({
        ...form,
        specifications: specs,
        test_results: results,
      });
      toast.success('QC batch created');
      setCreateOpen(false);
      setForm({ job_order_id: '', batch_number: '', specifications: {}, test_results: {}, notes: '' });
      setSpecFields([{ key: '', value: '' }]);
      setResultFields([{ key: '', value: '' }]);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create batch');
    }
  };

  const handleStatusUpdate = async (batchId, newStatus) => {
    try {
      await qcAPI.updateStatus(batchId, newStatus);
      toast.success(`Status updated to ${newStatus}`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update status');
    }
  };

  const addSpecField = () => setSpecFields([...specFields, { key: '', value: '' }]);
  const addResultField = () => setResultFields([...resultFields, { key: '', value: '' }]);

  const updateSpecField = (index, field, value) => {
    const updated = [...specFields];
    updated[index][field] = value;
    setSpecFields(updated);
  };

  const updateResultField = (index, field, value) => {
    const updated = [...resultFields];
    updated[index][field] = value;
    setResultFields(updated);
  };

  const filteredBatches = statusFilter === 'all' ? batches : batches.filter(b => b.status === statusFilter);
  const canCreate = ['admin', 'qc'].includes(user?.role);

  return (
    <div className="page-container" data-testid="qc-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Quality Control</h1>
          <p className="text-muted-foreground text-sm">Manage QC batches and specifications</p>
        </div>
        <div className="module-actions">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map(s => (
                <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-batch-btn" className="rounded-sm">
                  <Plus className="w-4 h-4 mr-2" /> New QC Batch
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create QC Batch</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Job Order</Label>
                      <Select value={form.job_order_id} onValueChange={(v) => setForm({...form, job_order_id: v})}>
                        <SelectTrigger data-testid="job-order-select">
                          <SelectValue placeholder="Select job order" />
                        </SelectTrigger>
                        <SelectContent>
                          {jobs.map(j => (
                            <SelectItem key={j.id} value={j.id}>
                              {j.job_number} - {j.product_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="form-field">
                      <Label>Batch Number</Label>
                      <Input
                        value={form.batch_number}
                        onChange={(e) => setForm({...form, batch_number: e.target.value})}
                        placeholder="e.g., BATCH-2024-001"
                        data-testid="batch-number-input"
                      />
                    </div>
                  </div>

                  {/* Specifications */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Specifications</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={addSpecField}>+ Add</Button>
                    </div>
                    <div className="space-y-2">
                      {specFields.map((field, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Parameter (e.g., Viscosity)"
                            value={field.key}
                            onChange={(e) => updateSpecField(idx, 'key', e.target.value)}
                          />
                          <Input
                            placeholder="Value (e.g., 500 cP)"
                            value={field.value}
                            onChange={(e) => updateSpecField(idx, 'value', e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Test Results */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Test Results</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={addResultField}>+ Add</Button>
                    </div>
                    <div className="space-y-2">
                      {resultFields.map((field, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Test (e.g., pH Test)"
                            value={field.key}
                            onChange={(e) => updateResultField(idx, 'key', e.target.value)}
                          />
                          <Input
                            placeholder="Result (e.g., 7.2)"
                            value={field.value}
                            onChange={(e) => updateResultField(idx, 'value', e.target.value)}
                          />
                        </div>
                      ))}
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
                    <Button onClick={handleCreate} data-testid="submit-batch-btn">Create Batch</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Batches List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">QC Batches ({filteredBatches.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredBatches.length === 0 ? (
          <div className="empty-state">
            <ClipboardCheck className="empty-state-icon" />
            <p className="empty-state-title">No QC batches found</p>
            <p className="empty-state-description">Create a QC batch for production jobs</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Job #</th>
                <th>Product</th>
                <th>Specs</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((batch) => (
                <tr key={batch.id} data-testid={`batch-row-${batch.batch_number}`}>
                  <td className="font-medium">{batch.batch_number}</td>
                  <td>{batch.job_number}</td>
                  <td>{batch.product_name}</td>
                  <td>{Object.keys(batch.specifications || {}).length} params</td>
                  <td><Badge className={getStatusColor(batch.status)}>{batch.status}</Badge></td>
                  <td>{formatDate(batch.inspected_at)}</td>
                  <td>
                    {canCreate && batch.status === 'pending' && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusUpdate(batch.id, 'passed')}
                          className="text-emerald-500 hover:text-emerald-400"
                          title="Pass"
                          data-testid={`pass-batch-${batch.batch_number}`}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusUpdate(batch.id, 'failed')}
                          className="text-destructive hover:text-destructive/80"
                          title="Fail"
                          data-testid={`fail-batch-${batch.batch_number}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusUpdate(batch.id, 'hold')}
                          className="text-amber-500 hover:text-amber-400"
                          title="Hold"
                          data-testid={`hold-batch-${batch.batch_number}`}
                        >
                          <Pause className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
