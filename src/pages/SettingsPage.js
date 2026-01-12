import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { 
  Settings, Building, FileText, CreditCard, Container, Users,
  Plus, Trash2, Save, RefreshCw, Edit, Check, X, MapPin, Package
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('vendors');
  const [vendors, setVendors] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState([]);
  const [documentTemplates, setDocumentTemplates] = useState([]);
  const [containerTypes, setContainerTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [packagingTypes, setPackagingTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [modalType, setModalType] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vendorsRes, settingsRes] = await Promise.all([
        api.get('/suppliers'),
        api.get('/settings/all').catch(() => ({ data: {} }))
      ]);
      setVendors(vendorsRes.data || []);
      
      const settings = settingsRes.data || {};
      setPaymentTerms(settings.payment_terms || []);
      setDocumentTemplates(settings.document_templates || []);
      setContainerTypes(settings.container_types || []);
      setCompanies(settings.companies || []);
      setPackagingTypes(settings.packaging_types || []);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = (type) => {
    setEditItem(null);
    setModalType(type);
    setShowModal(true);
  };

  const openEditModal = (type, item) => {
    setEditItem(item);
    setModalType(type);
    setShowModal(true);
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm('Delete this item?')) return;
    try {
      const endpoints = {
        vendors: `/suppliers/${id}`,
        companies: `/settings/companies/${id}`,
        payment_terms: `/settings/payment-terms/${id}`,
        documents: `/settings/document-templates/${id}`,
        containers: `/settings/container-types/${id}`,
        packaging: `/settings/packaging-types/${id}`,
      };
      await api.delete(endpoints[type]);
      toast.success('Deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const tabs = [
    { id: 'vendors', label: 'Vendors/Suppliers', icon: Users },
    { id: 'companies', label: 'Companies', icon: Building },
    { id: 'payment_terms', label: 'Payment Terms', icon: CreditCard },
    { id: 'documents', label: 'Document Templates', icon: FileText },
    { id: 'containers', label: 'Container Types', icon: Container },
    { id: 'packaging', label: 'Packaging Types', icon: Package }
  ];

  return (
    <div className="p-6 max-w-[1800px] mx-auto" data-testid="settings-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-8 h-8 text-purple-500" />
          Settings & Configuration
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage vendors, payment terms, document templates, containers, and packaging
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(tab => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="w-4 h-4 mr-2" />
            {tab.label}
          </Button>
        ))}
        <Button variant="outline" onClick={loadData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="glass rounded-lg border border-border">
          {/* Header with Add Button */}
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h2 className="text-lg font-semibold">{tabs.find(t => t.id === activeTab)?.label}</h2>
            <Button onClick={() => openAddModal(activeTab)} data-testid={`add-${activeTab}-btn`}>
              <Plus className="w-4 h-4 mr-2" />
              Add New
            </Button>
          </div>

          {/* Content based on active tab */}
          <div className="p-4">
            {activeTab === 'vendors' && (
              <DataTable
                data={vendors}
                columns={['name', 'email', 'phone', 'address']}
                labels={['Name', 'Email', 'Phone', 'Address']}
                onEdit={(item) => openEditModal('vendors', item)}
                onDelete={(id) => handleDelete('vendors', id)}
              />
            )}
            {activeTab === 'companies' && (
              <DataTable
                data={companies}
                columns={['name', 'address', 'type']}
                labels={['Company Name', 'Address', 'Type']}
                onEdit={(item) => openEditModal('companies', item)}
                onDelete={(id) => handleDelete('companies', id)}
              />
            )}
            {activeTab === 'payment_terms' && (
              <DataTable
                data={paymentTerms}
                columns={['name', 'days', 'description']}
                labels={['Term Name', 'Days', 'Description']}
                onEdit={(item) => openEditModal('payment_terms', item)}
                onDelete={(id) => handleDelete('payment_terms', id)}
              />
            )}
            {activeTab === 'documents' && (
              <DataTable
                data={documentTemplates}
                columns={['name', 'required_for']}
                labels={['Document Name', 'Required For']}
                onEdit={(item) => openEditModal('documents', item)}
                onDelete={(id) => handleDelete('documents', id)}
              />
            )}
            {activeTab === 'containers' && (
              <DataTable
                data={containerTypes}
                columns={['label', 'value', 'max_mt']}
                labels={['Label', 'Value', 'Max MT']}
                onEdit={(item) => openEditModal('containers', item)}
                onDelete={(id) => handleDelete('containers', id)}
              />
            )}
            {activeTab === 'packaging' && (
              <DataTable
                data={packagingTypes}
                columns={['name', 'net_weight_kg', 'type']}
                labels={['Name', 'Net Weight (KG)', 'Type']}
                onEdit={(item) => openEditModal('packaging', item)}
                onDelete={(id) => handleDelete('packaging', id)}
              />
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <AddEditModal
          type={modalType}
          item={editItem}
          onClose={() => { setShowModal(false); setEditItem(null); }}
          onSave={() => { setShowModal(false); setEditItem(null); loadData(); }}
        />
      )}
    </div>
  );
};

// Generic Data Table Component
const DataTable = ({ data, columns, labels, onEdit, onDelete }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No items found. Click "Add New" to create one.
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead className="bg-muted/30">
        <tr>
          {labels.map((label, idx) => (
            <th key={idx} className="p-3 text-left text-xs font-medium text-muted-foreground">{label}</th>
          ))}
          <th className="p-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10">
            {columns.map((col, idx) => (
              <td key={idx} className="p-3">
                {col === 'max_mt' || col === 'net_weight_kg' || col === 'days' ? (
                  <span className="font-mono text-emerald-400">{item[col]}</span>
                ) : col === 'type' || col === 'required_for' ? (
                  <Badge className="bg-purple-500/20 text-purple-400">{item[col]?.toUpperCase()}</Badge>
                ) : (
                  item[col] || '-'
                )}
              </td>
            ))}
            <td className="p-3">
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => onEdit(item)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" className="text-red-400" onClick={() => onDelete(item.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Add/Edit Modal Component
const AddEditModal = ({ type, item, onClose, onSave }) => {
  const isEdit = !!item;
  const [form, setForm] = useState(item || {});
  const [saving, setSaving] = useState(false);

  const getFields = () => {
    switch (type) {
      case 'vendors':
        return [
          { key: 'name', label: 'Vendor Name', required: true },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'address', label: 'Address' },
        ];
      case 'companies':
        return [
          { key: 'name', label: 'Company Name', required: true },
          { key: 'address', label: 'Address' },
          { key: 'type', label: 'Type', type: 'select', options: ['billing', 'shipping', 'both'] },
        ];
      case 'payment_terms':
        return [
          { key: 'name', label: 'Term Name', required: true },
          { key: 'days', label: 'Days', type: 'number' },
          { key: 'description', label: 'Description' },
        ];
      case 'documents':
        return [
          { key: 'name', label: 'Document Name', required: true },
          { key: 'required_for', label: 'Required For', type: 'select', options: ['all', 'local', 'export'] },
        ];
      case 'containers':
        return [
          { key: 'label', label: 'Label', required: true },
          { key: 'value', label: 'Value (ID)', required: true },
          { key: 'max_mt', label: 'Max Capacity (MT)', type: 'number' },
        ];
      case 'packaging':
        return [
          { key: 'name', label: 'Name', required: true },
          { key: 'net_weight_kg', label: 'Net Weight (KG)', type: 'number' },
          { key: 'type', label: 'Type', type: 'select', options: ['drum', 'ibc', 'jerrycan', 'tank', 'bulk', 'other'] },
        ];
      default:
        return [];
    }
  };

  const getEndpoints = () => {
    const base = {
      vendors: '/suppliers',
      companies: '/settings/companies',
      payment_terms: '/settings/payment-terms',
      documents: '/settings/document-templates',
      containers: '/settings/container-types',
      packaging: '/settings/packaging-types',
    };
    return {
      post: base[type],
      put: `${base[type]}/${item?.id}`,
    };
  };

  const handleSave = async () => {
    const fields = getFields();
    const requiredFields = fields.filter(f => f.required);
    for (const field of requiredFields) {
      if (!form[field.key]) {
        toast.error(`${field.label} is required`);
        return;
      }
    }

    setSaving(true);
    try {
      const endpoints = getEndpoints();
      if (isEdit) {
        await api.put(endpoints.put, form);
      } else {
        await api.post(endpoints.post, form);
      }
      toast.success(isEdit ? 'Updated successfully' : 'Added successfully');
      onSave();
    } catch (error) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const fields = getFields();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} {type.replace('_', ' ')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {fields.map((field) => (
            <div key={field.key}>
              <Label>{field.label}{field.required && ' *'}</Label>
              {field.type === 'select' ? (
                <select
                  className="w-full mt-1 p-2 rounded border bg-background"
                  value={form[field.key] || ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                >
                  <option value="">Select...</option>
                  {field.options.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.type || 'text'}
                  value={form[field.key] || ''}
                  onChange={(e) => setForm({ ...form, [field.key]: field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="mt-1"
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsPage;
