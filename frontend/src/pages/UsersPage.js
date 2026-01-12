import React, { useState, useEffect } from 'react';
import { userAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { formatDate, cn } from '../lib/utils';
import { Plus, Users, Pencil, Trash2, Key, Shield } from 'lucide-react';

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'sales', label: 'Sales', color: 'bg-sky-500/20 text-sky-400' },
  { value: 'finance', label: 'Finance', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'production', label: 'Production', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'procurement', label: 'Procurement', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'inventory', label: 'Inventory', color: 'bg-cyan-500/20 text-cyan-400' },
  { value: 'security', label: 'Security', color: 'bg-red-500/20 text-red-400' },
  { value: 'qc', label: 'Quality Control', color: 'bg-indigo-500/20 text-indigo-400' },
  { value: 'shipping', label: 'Shipping', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'transport', label: 'Transport', color: 'bg-teal-500/20 text-teal-400' },
  { value: 'documentation', label: 'Documentation', color: 'bg-pink-500/20 text-pink-400' },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');

  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'sales',
    department: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    role: '',
    department: '',
    is_active: true,
  });

  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await userAPI.getAll();
      setUsers(res.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.email || !form.password || !form.name) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await userAPI.create(form);
      toast.success('User created successfully');
      setCreateOpen(false);
      resetForm();
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleEdit = async () => {
    try {
      await userAPI.update(selectedUser.id, editForm);
      toast.success('User updated successfully');
      setEditOpen(false);
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      await userAPI.changePassword(selectedUser.id, newPassword);
      toast.success('Password changed successfully');
      setPasswordOpen(false);
      setNewPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await userAPI.delete(userId);
      toast.success('User deleted successfully');
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete user');
    }
  };

  const openEdit = (user) => {
    setSelectedUser(user);
    setEditForm({
      name: user.name,
      role: user.role,
      department: user.department || '',
      is_active: user.is_active,
    });
    setEditOpen(true);
  };

  const openPasswordChange = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setPasswordOpen(true);
  };

  const resetForm = () => {
    setForm({ email: '', password: '', name: '', role: 'sales', department: '' });
  };

  const getRoleColor = (role) => {
    const found = ROLES.find(r => r.value === role);
    return found?.color || 'bg-zinc-500/20 text-zinc-400';
  };

  const filteredUsers = roleFilter === 'all' ? users : users.filter(u => u.role === roleFilter);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="page-container">
        <div className="empty-state">
          <Shield className="empty-state-icon text-destructive" />
          <p className="empty-state-title">Access Denied</p>
          <p className="empty-state-description">Only administrators can access user management</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" data-testid="users-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">User Management</h1>
          <p className="text-muted-foreground text-sm">Manage system users and their roles</p>
        </div>
        <div className="module-actions">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {ROLES.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-user-btn" className="rounded-sm">
                <Plus className="w-4 h-4 mr-2" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="form-field">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({...form, email: e.target.value})}
                    placeholder="user@example.com"
                    data-testid="email-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({...form, password: e.target.value})}
                    placeholder="Min 6 characters"
                    data-testid="password-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Full Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                    placeholder="John Doe"
                    data-testid="name-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Role *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({...form, role: v})}>
                    <SelectTrigger data-testid="role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="form-field">
                  <Label>Department</Label>
                  <Input
                    value={form.department}
                    onChange={(e) => setForm({...form, department: e.target.value})}
                    placeholder="Optional"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} data-testid="submit-user-btn">Create User</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Users List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Users ({filteredUsers.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">No users found</p>
            <p className="empty-state-description">Add users to manage system access</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} data-testid={`user-row-${user.email}`}>
                  <td className="font-medium">{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <Badge className={cn('uppercase text-xs', getRoleColor(user.role))}>
                      {user.role}
                    </Badge>
                  </td>
                  <td>{user.department || '-'}</td>
                  <td>
                    <Badge className={user.is_active ? 'status-approved' : 'status-rejected'}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td>{formatDate(user.created_at)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(user)}
                        title="Edit User"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openPasswordChange(user)}
                        title="Change Password"
                      >
                        <Key className="w-4 h-4" />
                      </Button>
                      {user.id !== currentUser?.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(user.id)}
                          className="text-destructive hover:text-destructive/80"
                          title="Delete User"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User - {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="form-field">
              <Label>Full Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({...editForm, name: e.target.value})}
              />
            </div>
            <div className="form-field">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({...editForm, role: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="form-field">
              <Label>Department</Label>
              <Input
                value={editForm.department}
                onChange={(e) => setEditForm({...editForm, department: e.target.value})}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active Status</Label>
              <Switch
                checked={editForm.is_active}
                onCheckedChange={(checked) => setEditForm({...editForm, is_active: checked})}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleEdit}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password - {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="form-field">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setPasswordOpen(false)}>Cancel</Button>
              <Button onClick={handleChangePassword}>Change Password</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
