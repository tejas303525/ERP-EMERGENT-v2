import React, { useState, useEffect } from 'react';
import { customerAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { Plus, Users } from 'lucide-react';

const CUSTOMER_TYPES = ['local', 'export'];

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    address: '',
    country: '',
    tax_id: '',
    customer_type: 'local',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await customerAPI.getAll();
      setCustomers(res.data);
    } catch (error) {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name) {
      toast.error('Please enter customer name');
      return;
    }
    try {
      await customerAPI.create(form);
      toast.success('Customer created');
      setCreateOpen(false);
      setForm({ name: '', company: '', email: '', phone: '', address: '', country: '', tax_id: '', customer_type: 'local' });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create customer');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-container" data-testid="customers-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Customers</h1>
          <p className="text-muted-foreground text-sm">Manage customer information</p>
        </div>
        <div className="module-actions">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-customer-btn" className="rounded-sm">
                <Plus className="w-4 h-4 mr-2" /> New Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Customer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="form-grid">
                  <div className="form-field">
                    <Label>Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({...form, name: e.target.value})}
                      placeholder="Customer name"
                      data-testid="customer-name-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Company</Label>
                    <Input
                      value={form.company}
                      onChange={(e) => setForm({...form, company: e.target.value})}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({...form, email: e.target.value})}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({...form, phone: e.target.value})}
                      placeholder="Phone number"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Country</Label>
                    <Input
                      value={form.country}
                      onChange={(e) => setForm({...form, country: e.target.value})}
                      placeholder="Country"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Tax ID / VAT</Label>
                    <Input
                      value={form.tax_id}
                      onChange={(e) => setForm({...form, tax_id: e.target.value})}
                      placeholder="Tax ID"
                    />
                  </div>
                  <div className="form-field col-span-2">
                    <Label>Address</Label>
                    <Input
                      value={form.address}
                      onChange={(e) => setForm({...form, address: e.target.value})}
                      placeholder="Full address"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Customer Type</Label>
                    <Select value={form.customer_type} onValueChange={(v) => setForm({...form, customer_type: v})}>
                      <SelectTrigger data-testid="customer-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CUSTOMER_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} data-testid="submit-customer-btn">Create Customer</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          className="w-64"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          data-testid="search-input"
        />
      </div>

      {/* Customers List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Customers ({filteredCustomers.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">No customers found</p>
            <p className="empty-state-description">Add customers to create quotations</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Country</th>
                <th>Type</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} data-testid={`customer-row-${customer.id}`}>
                  <td className="font-medium">{customer.name}</td>
                  <td>{customer.company || '-'}</td>
                  <td>{customer.email || '-'}</td>
                  <td>{customer.phone || '-'}</td>
                  <td>{customer.country || '-'}</td>
                  <td>
                    <Badge variant="outline" className="uppercase text-xs">{customer.customer_type}</Badge>
                  </td>
                  <td>{formatDate(customer.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
