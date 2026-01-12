import React, { useState, useEffect } from 'react';
import { blendReportAPI, jobOrderAPI, productAPI, pdfAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { formatDate, getStatusColor } from '../lib/utils';
import { Plus, FileText, Check, Download, Eye, Trash2 } from 'lucide-react';

export default function BlendReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  const [form, setForm] = useState({
    job_order_id: '',
    batch_number: '',
    blend_date: new Date().toISOString().split('T')[0],
    operator_name: '',
    materials_used: [],
    process_parameters: {},
    quality_checks: {},
    output_quantity: 0,
    yield_percentage: 0,
    notes: '',
  });

  const [newMaterial, setNewMaterial] = useState({
    product_id: '',
    product_name: '',
    sku: '',
    batch_lot: '',
    quantity_used: 0,
  });

  const [newParam, setNewParam] = useState({ key: '', value: '' });
  const [newQC, setNewQC] = useState({ key: '', value: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [reportsRes, jobsRes, productsRes] = await Promise.all([
        blendReportAPI.getAll(),
        jobOrderAPI.getAll('in_production'),
        productAPI.getAll('raw_material'),
      ]);
      setReports(reportsRes.data);
      setJobs(jobsRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialSelect = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setNewMaterial({
        ...newMaterial,
        product_id: productId,
        product_name: product.name,
        sku: product.sku,
      });
    }
  };

  const addMaterial = () => {
    if (!newMaterial.product_id || newMaterial.quantity_used <= 0) {
      toast.error('Select material and enter quantity');
      return;
    }
    setForm({
      ...form,
      materials_used: [...form.materials_used, { ...newMaterial }],
    });
    setNewMaterial({ product_id: '', product_name: '', sku: '', batch_lot: '', quantity_used: 0 });
  };

  const removeMaterial = (idx) => {
    setForm({
      ...form,
      materials_used: form.materials_used.filter((_, i) => i !== idx),
    });
  };

  const addParam = () => {
    if (!newParam.key) return;
    setForm({
      ...form,
      process_parameters: { ...form.process_parameters, [newParam.key]: newParam.value },
    });
    setNewParam({ key: '', value: '' });
  };

  const addQC = () => {
    if (!newQC.key) return;
    setForm({
      ...form,
      quality_checks: { ...form.quality_checks, [newQC.key]: newQC.value },
    });
    setNewQC({ key: '', value: '' });
  };

  const handleCreate = async () => {
    if (!form.job_order_id || !form.batch_number || form.materials_used.length === 0) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await blendReportAPI.create(form);
      toast.success('Blend report created');
      setCreateOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create report');
    }
  };

  const handleApprove = async (reportId) => {
    try {
      await blendReportAPI.approve(reportId);
      toast.success('Blend report approved');
      loadData();
    } catch (error) {
      toast.error('Failed to approve');
    }
  };

  const handleDownloadPDF = async (reportId, reportNumber) => {
    try {
      const token = localStorage.getItem('erp_token');
      const url = pdfAPI.getBlendReportUrl(reportId);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `BlendReport_${reportNumber || 'report'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      toast.error('Failed to download PDF');
    }
  };

  const resetForm = () => {
    setForm({
      job_order_id: '',
      batch_number: '',
      blend_date: new Date().toISOString().split('T')[0],
      operator_name: '',
      materials_used: [],
      process_parameters: {},
      quality_checks: {},
      output_quantity: 0,
      yield_percentage: 0,
      notes: '',
    });
  };

  const canCreate = ['admin', 'production', 'qc'].includes(user?.role);
  const canApprove = ['admin', 'qc'].includes(user?.role);

  return (
    <div className="page-container" data-testid="blend-reports-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Blend Reports</h1>
          <p className="text-muted-foreground text-sm">Production batch and blending records</p>
        </div>
        <div className="module-actions">
          {canCreate && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-report-btn" className="rounded-sm">
                  <Plus className="w-4 h-4 mr-2" /> New Blend Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Blend Report</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  {/* Basic Info */}
                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Job Order *</Label>
                      <Select value={form.job_order_id} onValueChange={(v) => setForm({...form, job_order_id: v})}>
                        <SelectTrigger data-testid="job-select">
                          <SelectValue placeholder="Select job in production" />
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
                      <Label>Batch Number *</Label>
                      <Input
                        value={form.batch_number}
                        onChange={(e) => setForm({...form, batch_number: e.target.value})}
                        placeholder="e.g., BATCH-2024-001"
                        data-testid="batch-number-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Blend Date</Label>
                      <Input
                        type="date"
                        value={form.blend_date}
                        onChange={(e) => setForm({...form, blend_date: e.target.value})}
                      />
                    </div>
                    <div className="form-field">
                      <Label>Operator Name</Label>
                      <Input
                        value={form.operator_name}
                        onChange={(e) => setForm({...form, operator_name: e.target.value})}
                        placeholder="Operator name"
                      />
                    </div>
                  </div>

                  {/* Materials Used */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Materials Used *</h3>
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      <div className="col-span-2">
                        <Select value={newMaterial.product_id} onValueChange={handleMaterialSelect}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select material" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        placeholder="Batch/Lot #"
                        value={newMaterial.batch_lot}
                        onChange={(e) => setNewMaterial({...newMaterial, batch_lot: e.target.value})}
                      />
                      <Input
                        type="number"
                        placeholder="Qty Used"
                        value={newMaterial.quantity_used || ''}
                        onChange={(e) => setNewMaterial({...newMaterial, quantity_used: parseFloat(e.target.value)})}
                      />
                      <Button variant="secondary" onClick={addMaterial}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {form.materials_used.length > 0 && (
                      <div className="data-grid">
                        <table className="erp-table w-full">
                          <thead>
                            <tr>
                              <th>Material</th>
                              <th>SKU</th>
                              <th>Batch/Lot</th>
                              <th>Qty Used</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.materials_used.map((m, idx) => (
                              <tr key={idx}>
                                <td>{m.product_name}</td>
                                <td>{m.sku}</td>
                                <td>{m.batch_lot}</td>
                                <td className="font-mono">{m.quantity_used}</td>
                                <td>
                                  <Button variant="ghost" size="icon" onClick={() => removeMaterial(idx)}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Process Parameters */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Process Parameters</h3>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Input
                        placeholder="Parameter (e.g., Temperature)"
                        value={newParam.key}
                        onChange={(e) => setNewParam({...newParam, key: e.target.value})}
                      />
                      <Input
                        placeholder="Value (e.g., 80°C)"
                        value={newParam.value}
                        onChange={(e) => setNewParam({...newParam, value: e.target.value})}
                      />
                      <Button variant="secondary" onClick={addParam}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {Object.keys(form.process_parameters).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(form.process_parameters).map(([k, v]) => (
                          <Badge key={k} variant="outline">{k}: {v}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quality Checks */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Quality Checks</h3>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <Input
                        placeholder="Test (e.g., Viscosity)"
                        value={newQC.key}
                        onChange={(e) => setNewQC({...newQC, key: e.target.value})}
                      />
                      <Input
                        placeholder="Result (e.g., 500 cP)"
                        value={newQC.value}
                        onChange={(e) => setNewQC({...newQC, value: e.target.value})}
                      />
                      <Button variant="secondary" onClick={addQC}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {Object.keys(form.quality_checks).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(form.quality_checks).map(([k, v]) => (
                          <Badge key={k} variant="outline">{k}: {v}</Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Output */}
                  <div className="form-grid">
                    <div className="form-field">
                      <Label>Output Quantity</Label>
                      <Input
                        type="number"
                        value={form.output_quantity || ''}
                        onChange={(e) => setForm({...form, output_quantity: parseFloat(e.target.value)})}
                        placeholder="Total output"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Yield %</Label>
                      <Input
                        type="number"
                        value={form.yield_percentage || ''}
                        onChange={(e) => setForm({...form, yield_percentage: parseFloat(e.target.value)})}
                        placeholder="Yield percentage"
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
                    <Button onClick={handleCreate} data-testid="submit-report-btn">Create Report</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Reports List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Blend Reports ({reports.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <p className="empty-state-title">No blend reports</p>
            <p className="empty-state-description">Create a blend report for production batches</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Report #</th>
                <th>Job #</th>
                <th>Product</th>
                <th>Batch #</th>
                <th>Blend Date</th>
                <th>Output</th>
                <th>Yield</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} data-testid={`report-row-${report.report_number}`}>
                  <td className="font-medium">{report.report_number}</td>
                  <td className="font-mono">{report.job_number}</td>
                  <td>{report.product_name}</td>
                  <td>{report.batch_number}</td>
                  <td>{formatDate(report.blend_date)}</td>
                  <td className="font-mono">{report.output_quantity}</td>
                  <td className="font-mono">{report.yield_percentage}%</td>
                  <td><Badge className={getStatusColor(report.status)}>{report.status}</Badge></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSelectedReport(report); setViewOpen(true); }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadPDF(report.id, report.report_number)}
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      {canApprove && report.status !== 'approved' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleApprove(report.id)}
                          className="text-emerald-500"
                          title="Approve"
                        >
                          <Check className="w-4 h-4" />
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

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Blend Report {selectedReport?.report_number}</DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Job:</span> {selectedReport.job_number}</div>
                <div><span className="text-muted-foreground">Product:</span> {selectedReport.product_name}</div>
                <div><span className="text-muted-foreground">Batch:</span> {selectedReport.batch_number}</div>
                <div><span className="text-muted-foreground">Date:</span> {formatDate(selectedReport.blend_date)}</div>
                <div><span className="text-muted-foreground">Operator:</span> {selectedReport.operator_name}</div>
                <div><span className="text-muted-foreground">Output:</span> {selectedReport.output_quantity}</div>
                <div><span className="text-muted-foreground">Yield:</span> {selectedReport.yield_percentage}%</div>
                <div><Badge className={getStatusColor(selectedReport.status)}>{selectedReport.status}</Badge></div>
              </div>

              {selectedReport.materials_used?.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">Materials Used</h4>
                    <div className="space-y-1 text-sm">
                      {selectedReport.materials_used.map((m, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{m.product_name} ({m.batch_lot})</span>
                          <span className="font-mono">{m.quantity_used}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {Object.keys(selectedReport.process_parameters || {}).length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">Process Parameters</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedReport.process_parameters).map(([k, v]) => (
                        <Badge key={k} variant="outline">{k}: {v}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {Object.keys(selectedReport.quality_checks || {}).length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">Quality Checks</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedReport.quality_checks).map(([k, v]) => (
                        <Badge key={k} variant="outline">{k}: {v}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
