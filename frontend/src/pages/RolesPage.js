import React, { useState, useEffect } from 'react';
import { roleAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { formatDate, cn } from '../lib/utils';
import { Plus, Shield, Pencil, Trash2, Lock } from 'lucide-react';

export default function RolesPage() {
  const { user: currentUser } = useAuth();
  const [roles, setRoles] = useState([]);
  const [availablePages, setAvailablePages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    allowed_pages: [],
  });

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    allowed_pages: [],
  });

  useEffect(() => {
    loadRoles();
    loadAvailablePages();
  }, []);

  const loadRoles = async () => {
    try {
      const res = await roleAPI.getAll();
      setRoles(res.data);
    } catch (error) {
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailablePages = async () => {
    try {
      const res = await roleAPI.getAvailablePages();
      setAvailablePages(res.data);
    } catch (error) {
      toast.error('Failed to load available pages');
    }
  };

  const handleCreate = async () => {
    if (!form.name) {
      toast.error('Please enter role name');
      return;
    }
    try {
      await roleAPI.create(form);
      toast.success('Role created successfully');
      setCreateOpen(false);
      resetForm();
      loadRoles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create role');
    }
  };

  const handleEdit = async () => {
    try {
      await roleAPI.update(selectedRole.id, editForm);
      toast.success('Role updated successfully');
      setEditOpen(false);
      loadRoles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleDelete = async (roleId) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      await roleAPI.delete(roleId);
      toast.success('Role deleted successfully');
      loadRoles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete role');
    }
  };

  const openEdit = (role) => {
    setSelectedRole(role);
    setEditForm({
      name: role.name,
      description: role.description || '',
      allowed_pages: role.allowed_pages || [],
    });
    setEditOpen(true);
  };

  const resetForm = () => {
    setForm({ name: '', description: '', allowed_pages: [] });
  };

  const togglePage = (pagePath, isEdit = false) => {
    if (isEdit) {
      setEditForm(prev => ({
        ...prev,
        allowed_pages: prev.allowed_pages.includes(pagePath)
          ? prev.allowed_pages.filter(p => p !== pagePath)
          : [...prev.allowed_pages, pagePath]
      }));
    } else {
      setForm(prev => ({
        ...prev,
        allowed_pages: prev.allowed_pages.includes(pagePath)
          ? prev.allowed_pages.filter(p => p !== pagePath)
          : [...prev.allowed_pages, pagePath]
      }));
    }
  };

  // Group pages by category
  const groupedPages = availablePages.reduce((acc, page) => {
    if (!acc[page.category]) acc[page.category] = [];
    acc[page.category].push(page);
    return acc;
  }, {});

  if (currentUser?.role !== 'admin') {
    return (
      <div className="page-container">
        <div className="empty-state">
          <Shield className="empty-state-icon text-destructive" />
          <p className="empty-state-title">Access Denied</p>
          <p className="empty-state-description">Only administrators can access role management</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="module-header">
        <div>
          <h1 className="module-title">Role Management</h1>
          <p className="text-muted-foreground text-sm">Define roles and their permissions</p>
        </div>
        <div className="module-actions">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-sm">
                <Plus className="w-4 h-4 mr-2" /> Create Role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Role</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="form-field">
                  <Label>Role Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    placeholder="e.g., Operations Manager"
                  />
                </div>
                <div className="form-field">
                  <Label>Description</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({...form, description: e.target.value})}
                    placeholder="Optional description"
                  />
                </div>
                <div className="form-field">
                  <Label className="text-base mb-3 block">Allowed Pages</Label>
                  <div className="space-y-4 border rounded-lg p-4 max-h-96 overflow-y-auto">
                    {Object.entries(groupedPages).map(([category, pages]) => (
                      <div key={category} className="space-y-2">
                        <h4 className="font-semibold text-sm text-primary">{category}</h4>
                        <div className="space-y-2 pl-4">
                          {pages.map(page => (
                            <div key={page.path} className="flex items-center space-x-2">
                              <Checkbox
                                id={`create-${page.path}`}
                                checked={form.allowed_pages.includes(page.path)}
                                onCheckedChange={() => togglePage(page.path, false)}
                              />
                              <label
                                htmlFor={`create-${page.path}`}
                                className="text-sm cursor-pointer"
                              >
                                {page.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate}>Create Role</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Roles List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Roles ({roles.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : roles.length === 0 ? (
          <div className="empty-state">
            <Shield className="empty-state-icon" />
            <p className="empty-state-title">No roles found</p>
            <p className="empty-state-description">Create roles to organize permissions</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Role Name</th>
                <th>Description</th>
                <th>Allowed Pages</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className="font-medium">
                    {role.name}
                    {role.is_system_role && (
                      <Lock className="inline-block w-3 h-3 ml-2 text-muted-foreground" />
                    )}
                  </td>
                  <td>{role.description || '-'}</td>
                  <td>
                    <Badge variant="outline">
                      {role.allowed_pages?.length || 0} pages
                    </Badge>
                  </td>
                  <td>{formatDate(role.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(role)}
                        title="Edit Role"
                        disabled={role.is_system_role}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {!role.is_system_role && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(role.id)}
                          className="text-destructive hover:text-destructive/80"
                          title="Delete Role"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Role - {selectedRole?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="form-field">
              <Label>Role Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
              />
            </div>
            <div className="form-field">
              <Label>Description</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm({...editForm, description: e.target.value})}
              />
            </div>
            <div className="form-field">
              <Label className="text-base mb-3 block">Allowed Pages</Label>
              <div className="space-y-4 border rounded-lg p-4 max-h-96 overflow-y-auto">
                {Object.entries(groupedPages).map(([category, pages]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="font-semibold text-sm text-primary">{category}</h4>
                    <div className="space-y-2 pl-4">
                      {pages.map(page => (
                        <div key={page.path} className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-${page.path}`}
                            checked={editForm.allowed_pages.includes(page.path)}
                            onCheckedChange={() => togglePage(page.path, true)}
                          />
                          <label
                            htmlFor={`edit-${page.path}`}
                            className="text-sm cursor-pointer"
                          >
                            {page.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEdit}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

