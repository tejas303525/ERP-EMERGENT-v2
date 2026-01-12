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
  const [bankAccounts, setBankAccounts] = useState([]);
  const [productPackagingConfigs, setProductPackagingConfigs] = useState([]);
  const [products, setProducts] = useState([]);
  const [contactForDispatch, setContactForDispatch] = useState({
    name: "Vidhesh",
    phone: "+971 52 299 7006",
    email: "vidhesh@asia-petrochem.com"
  });
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
      const [vendorsRes, settingsRes, configsRes, productsRes] = await Promise.all([
        api.get('/suppliers'),
        api.get('/settings/all').catch(() => ({ data: {} })),
        api.get('/product-packaging-configs').catch(() => ({ data: [] })),
        api.get('/products').catch(() => ({ data: [] }))
      ]);
      setVendors(vendorsRes.data || []);
      
      const settings = settingsRes.data || {};
      setPaymentTerms(settings.payment_terms || []);
      setDocumentTemplates(settings.document_templates || []);
      setContainerTypes(settings.container_types || []);
      setCompanies(settings.companies || []);
      setPackagingTypes(settings.packaging_types || []);
      setBankAccounts(settings.bank_accounts || []);
      setProductPackagingConfigs(configsRes.data || []);
      setProducts((productsRes.data || []).filter(p => p.category === 'finished_product'));
      if (settings.contact_for_dispatch) {
        setContactForDispatch(settings.contact_for_dispatch);
      }
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
        banks: `/settings/bank-accounts/${id}`,
        product_packaging: `/product-packaging-configs/${id}`,
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
    { id: 'packaging', label: 'Packaging Types', icon: Package },
    { id: 'product_packaging', label: 'Product-Packaging Configs', icon: Package },
    { id: 'banks', label: 'Bank Accounts', icon: CreditCard },
    { id: 'contact_dispatch', label: 'Contact for Dispatch', icon: Users }
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
            {activeTab !== 'contact_dispatch' && (
              <Button onClick={() => openAddModal(activeTab)} data-testid={`add-${activeTab}-btn`}>
                <Plus className="w-4 h-4 mr-2" />
                Add New
              </Button>
            )}
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
                columns={['name', 'type']}
                labels={['Name', 'Type']}
                onEdit={(item) => openEditModal('packaging', item)}
                onDelete={(id) => handleDelete('packaging', id)}
              />
            )}
            {activeTab === 'product_packaging' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Manage product-packaging-container configurations. Import from Excel or add manually.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          
                          const formData = new FormData();
                          formData.append('file', file);
                          
                          try {
                            setLoading(true);
                            // Use axios directly with FormData - don't set Content-Type, axios will handle it
                            const token = localStorage.getItem('erp_token');
                            const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
                            
                            const response = await fetch(`${backendUrl}/api/product-packaging-configs/import-excel`, {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                              },
                              body: formData
                            });
                            
                            if (!response.ok) {
                              const errorData = await response.json().catch(() => ({ detail: 'Failed to import Excel file' }));
                              throw new Error(errorData.detail || 'Failed to import Excel file');
                            }
                            
                            const data = await response.json();
                            toast.success(data.message);
                            if (data.errors?.length > 0) {
                              console.warn('Import errors:', data.errors);
                              toast.warning(`${data.errors.length} errors during import`);
                            }
                            loadData();
                          } catch (error) {
                            console.error('Excel import error:', error);
                            toast.error(error.response?.data?.detail || error.message || 'Failed to import Excel file');
                          } finally {
                            setLoading(false);
                          }
                          e.target.value = ''; // Reset input
                        }}
                      />
                      <Button variant="outline" type="button">
                        <FileText className="w-4 h-4 mr-2" />
                        Import Excel
                      </Button>
                    </label>
                  </div>
                </div>
                <DataTable
                  data={productPackagingConfigs}
                  columns={['product_name', 'packaging_type', 'packaging_name', 'drum_carton_filling_kg', 'ibc_filling_kg', 'flexi_iso_filling_mt', 'hscode', 'origin']}
                  labels={['Product', 'Packaging Type', 'Packaging Name', 'Drum/Carton (KG)', 'IBC (KG)', 'Flexi/ISO (MT)', 'HS Code', 'Origin']}
                  onEdit={(item) => openEditModal('product_packaging', item)}
                  onDelete={(id) => handleDelete('product_packaging', id)}
                />
              </div>
            )}
            {activeTab === 'banks' && (
              <DataTable
                data={bankAccounts}
                columns={['bank_name', 'account_type', 'iban', 'swift']}
                labels={['Bank Name', 'Account Type', 'IBAN', 'SWIFT']}
                onEdit={(item) => openEditModal('banks', item)}
                onDelete={(id) => handleDelete('banks', id)}
              />
            )}
            {activeTab === 'contact_dispatch' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Name *</Label>
                    <Input
                      value={contactForDispatch.name || ''}
                      onChange={(e) => setContactForDispatch({...contactForDispatch, name: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Phone *</Label>
                    <Input
                      value={contactForDispatch.phone || ''}
                      onChange={(e) => setContactForDispatch({...contactForDispatch, phone: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={contactForDispatch.email || ''}
                      onChange={(e) => setContactForDispatch({...contactForDispatch, email: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button 
                  onClick={async () => {
                    try {
                      await api.put('/settings/contact-for-dispatch', contactForDispatch);
                      toast.success('Contact for Dispatch updated successfully');
                      loadData();
                    } catch (error) {
                      toast.error('Failed to update Contact for Dispatch');
                    }
                  }}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Contact for Dispatch
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <AddEditModal
          type={modalType}
          item={editItem}
          products={products}
          packagingTypes={packagingTypes}
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
                {col === 'max_mt' || col === 'net_weight_kg' || col === 'days' || 
                 col === 'filling_kg' || col === 'drum_carton_filling_kg' || col === 'ibc_filling_kg' || 
                 col === 'flexi_iso_filling_mt' || col === 'container_20ft_total_nw_mt' || 
                 col === 'container_40ft_total_nw_mt' || col === 'flexi_iso_total_nw' ? (
                  <span className="font-mono text-emerald-400">
                    {item[col] != null && item[col] !== '' ? (typeof item[col] === 'number' ? item[col].toLocaleString() : item[col]) : '-'}
                  </span>
                ) : col === 'net_weights' ? (
                  <span className="font-mono text-emerald-400">
                    {Array.isArray(item[col]) && item[col].length > 0
                      ? item[col].join(', ')
                      : item.net_weight_kg || '-'}
                  </span>
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
const AddEditModal = ({ type, item, products = [], packagingTypes = [], onClose, onSave }) => {
  const isEdit = !!item;
  const initialForm = item || {};
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [netWeights, setNetWeights] = useState(
    initialForm.net_weights && Array.isArray(initialForm.net_weights) 
      ? initialForm.net_weights 
      : (initialForm.net_weight_kg ? [initialForm.net_weight_kg] : [])
  );

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
          { key: 'type', label: 'Type', type: 'select', options: ['drum', 'ibc', 'jerrycan', 'tank', 'bulk', 'other'] },
          { key: 'net_weights', label: 'Net Weights (KG)', type: 'netweights' },
        ];
      case 'banks':
        return [
          { key: 'bank_name', label: 'Bank Name', required: true },
          { key: 'account_type', label: 'Account Type', required: true },
          { key: 'iban', label: 'IBAN' },
          { key: 'swift', label: 'SWIFT Code' },
          { key: 'branch_address', label: 'Branch Address' },
        ];
      case 'product_packaging':
        return [
          { key: 'product_id', label: 'Product', type: 'select', options: (products || []).map(p => ({ value: p.id, label: p.name })), required: true },
          { key: 'packaging_type', label: 'Packaging Type', type: 'select', options: ['Drum', 'Carton', 'Flexi/ISO', 'Bulk', 'IBC'], required: true },
          { key: 'packaging_name', label: 'Packaging Name', type: 'packaging_select', required: true },
          { key: 'drum_carton_filling_kg', label: 'Drum/Carton Fillings (KG)', type: 'number' },
          { key: 'ibc_filling_kg', label: 'IBC Fillings (KG)', type: 'number' },
          { key: 'flexi_iso_filling_mt', label: 'Flexi/ISO Fillings (MT)', type: 'number' },
          { key: 'container_20ft_palletised', label: '20ft Palletised', type: 'number' },
          { key: 'container_20ft_non_palletised', label: '20ft Non-Palletised', type: 'number' },
          { key: 'container_20ft_ibc', label: '20ft IBC', type: 'number' },
          { key: 'container_20ft_total_nw_mt', label: '20ft Total NW (MT)', type: 'number' },
          { key: 'container_40ft_palletised', label: '40ft Palletised', type: 'number' },
          { key: 'container_40ft_non_palletised', label: '40ft Non-Palletised', type: 'number' },
          { key: 'container_40ft_ibc', label: '40ft IBC', type: 'number' },
          { key: 'container_40ft_total_nw_mt', label: '40ft Total NW (MT)', type: 'number' },
          { key: 'hscode', label: 'HS Code' },
          { key: 'origin', label: 'Origin (Country)' },
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
      banks: '/settings/bank-accounts',
      product_packaging: '/product-packaging-configs',
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
      // For packaging types, ensure net_weights is included
      const dataToSave = { ...form };
      if (type === 'packaging' && netWeights.length > 0) {
        dataToSave.net_weights = netWeights.filter(w => w !== '' && w !== null && !isNaN(w));
      }
      // For product_packaging, ensure product_name is set and clean number fields
      if (type === 'product_packaging') {
        if (dataToSave.product_id) {
          const selectedProduct = products.find(p => p.id === dataToSave.product_id);
          if (selectedProduct) {
            dataToSave.product_name = selectedProduct.name;
          }
        }
        // Convert empty strings to null for optional number fields
        const numberFields = [
          'drum_carton_filling_kg', 'ibc_filling_kg', 'flexi_iso_filling_mt',
          'container_20ft_palletised', 'container_20ft_non_palletised', 'container_20ft_ibc',
          'container_20ft_total_nw_mt', 'container_40ft_palletised', 'container_40ft_non_palletised',
          'container_40ft_ibc', 'container_40ft_total_nw_mt'
        ];
        numberFields.forEach(field => {
          if (dataToSave[field] === '' || dataToSave[field] === undefined) {
            dataToSave[field] = null;
          } else if (typeof dataToSave[field] === 'string' && !isNaN(dataToSave[field])) {
            dataToSave[field] = parseFloat(dataToSave[field]);
          }
        });
      }
      
      if (isEdit) {
        await api.put(endpoints.put, dataToSave);
      } else {
        await api.post(endpoints.post, dataToSave);
      }
      toast.success(isEdit ? 'Updated successfully' : 'Added successfully');
      onSave();
    } catch (error) {
      console.error('Save error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to save';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const fields = getFields();

  const addNetWeight = () => {
    setNetWeights([...netWeights, '']);
  };

  const removeNetWeight = (index) => {
    setNetWeights(netWeights.filter((_, i) => i !== index));
  };

  const updateNetWeight = (index, value) => {
    const updated = [...netWeights];
    updated[index] = parseFloat(value) || '';
    setNetWeights(updated);
    setForm({ ...form, net_weights: updated.filter(w => w !== '' && w !== null) });
  };

  // Update form when item changes (for editing)
  useEffect(() => {
    if (item) {
      const updatedForm = { ...item };
      const weights = item.net_weights && Array.isArray(item.net_weights) 
        ? item.net_weights 
        : (item.net_weight_kg ? [item.net_weight_kg] : []);
      setForm(updatedForm);
      setNetWeights(weights);
    } else {
      setForm({});
      setNetWeights([]);
    }
  }, [item]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" aria-describedby="dialog-description">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit' : 'Add'} {type === 'banks' ? 'bank account' : type.replace('_', ' ')}</DialogTitle>
        </DialogHeader>
        <p id="dialog-description" className="sr-only">
          {isEdit ? 'Edit' : 'Add'} {type === 'banks' ? 'bank account' : type.replace('_', ' ')} form
        </p>
        <div className="space-y-4 py-4">
          {fields.map((field) => (
            <div key={field.key}>
              <Label>{field.label}{field.required && ' *'}</Label>
              {field.type === 'select' ? (
                <select
                  className="w-full mt-1 p-2 rounded border bg-background"
                  value={form[field.key] || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm({ ...form, [field.key]: value });
                    // For product_packaging, also set product_name
                    if (field.key === 'product_id' && type === 'product_packaging') {
                      const selectedProduct = products.find(p => p.id === value);
                      if (selectedProduct) {
                        setForm({ ...form, product_id: value, product_name: selectedProduct.name });
                      }
                    }
                  }}
                >
                  <option value="">Select...</option>
                  {field.options.map(opt => {
                    const value = typeof opt === 'object' ? opt.value : opt;
                    const label = typeof opt === 'object' ? opt.label : opt;
                    return <option key={value} value={value}>{label}</option>;
                  })}
                </select>
              ) : field.type === 'packaging_select' ? (
                <select
                  className="w-full mt-1 p-2 rounded border bg-background"
                  value={form[field.key] || ''}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                >
                  <option value="">Select Packaging...</option>
                  {packagingTypes.map((pkg, index) => (
                    <option key={pkg.id || `${pkg.name}-${index}`} value={pkg.name}>{pkg.name}</option>
                  ))}
                </select>
              ) : field.type === 'netweights' ? (
                <div className="mt-1 space-y-2">
                  {netWeights.map((weight, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Net Weight (KG)"
                        value={weight || ''}
                        onChange={(e) => updateNetWeight(index, e.target.value)}
                        className="flex-1"
                      />
                      {netWeights.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeNetWeight(index)}
                          className="text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addNetWeight}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Net Weight
                  </Button>
                </div>
              ) : (
                <Input
                  type={field.type || 'text'}
                  value={form[field.key] != null ? form[field.key] : ''}
                  onChange={(e) => {
                    const value = field.type === 'number' 
                      ? (e.target.value === '' ? null : (isNaN(parseFloat(e.target.value)) ? null : parseFloat(e.target.value)))
                      : e.target.value;
                    setForm({ ...form, [field.key]: value });
                  }}
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
