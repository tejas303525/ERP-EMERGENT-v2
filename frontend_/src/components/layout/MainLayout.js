import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from './NotificationBell';
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Factory,
  Package,
  Truck,
  Ship,
  FileCheck,
  ClipboardCheck,
  Users,
  Boxes,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  Receipt,
  ClipboardList,
  DoorOpen,
  Calendar,
  FlaskConical,
  UserCog,
  DollarSign,
  FileStack,
  Container,
  Globe,
  Shield,
  Microscope,
  Settings,
  Route,
} from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: ['all'] },
  { icon: FileText, label: 'Quotations', path: '/quotations', roles: ['admin', 'sales', 'finance'] },
  { icon: ShoppingCart, label: 'Sales Orders', path: '/sales-orders', roles: ['admin', 'sales', 'finance'] },
  { icon: Factory, label: 'Job Orders', path: '/job-orders', roles: ['admin', 'production', 'procurement'] },
  { icon: Calendar, label: 'Production Schedule', path: '/production-schedule', roles: ['admin', 'production', 'procurement'] },
  { icon: FlaskConical, label: 'Blend Reports', path: '/blend-reports', roles: ['admin', 'production', 'qc'] },
  { icon: FileStack, label: 'BOM Management', path: '/bom-management', roles: ['admin', 'production', 'inventory'] },
  { icon: Boxes, label: 'Inventory', path: '/inventory', roles: ['admin', 'inventory', 'production', 'procurement'] },
  { icon: Receipt, label: 'GRN', path: '/grn', roles: ['admin', 'security', 'inventory', 'finance'] },
  { icon: ClipboardList, label: 'Delivery Orders', path: '/delivery-orders', roles: ['admin', 'security', 'shipping'] },
  { icon: Ship, label: 'Shipping', path: '/shipping', roles: ['admin', 'shipping'] },
  { icon: Route, label: 'Transport Operations', path: '/transport', roles: ['admin', 'transport'] },
  { icon: Truck, label: 'Transport Window', path: '/transport-window', roles: ['admin', 'transport', 'procurement'] },
  { icon: Globe, label: 'Import Window', path: '/import-window', roles: ['admin', 'procurement', 'finance'] },
  { icon: DoorOpen, label: 'Dispatch Gate', path: '/dispatch-gate', roles: ['admin', 'security', 'shipping', 'transport'] },
  { icon: Shield, label: 'Security Gate', path: '/security', roles: ['admin', 'security'] },
  { icon: Microscope, label: 'QC Inspection', path: '/qc-inspection', roles: ['admin', 'qc'] },
  { icon: FileCheck, label: 'Documentation', path: '/documentation', roles: ['admin', 'documentation'] },
  { icon: ClipboardCheck, label: 'Quality Control', path: '/qc', roles: ['admin', 'qc'] },
  { icon: ShoppingCart, label: 'Procurement', path: '/procurement', roles: ['admin', 'procurement'] },
  { icon: DollarSign, label: 'Finance Approval', path: '/finance-approval', roles: ['admin', 'finance'] },
  { icon: DollarSign, label: 'Payables (AP)', path: '/payables', roles: ['admin', 'finance'] },
  { icon: Receipt, label: 'Receivables (AR)', path: '/receivables', roles: ['admin', 'finance', 'sales'] },
  { icon: Users, label: 'Customers', path: '/customers', roles: ['admin', 'sales'] },
  { icon: Package, label: 'Products', path: '/products', roles: ['admin', 'inventory', 'sales'] },
  { icon: UserCog, label: 'User Management', path: '/users', roles: ['admin'] },
  { icon: Settings, label: 'Settings', path: '/settings', roles: ['admin'] },
];

export const MainLayout = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  const filteredMenu = menuItems.filter(
    (item) => item.roles.includes('all') || item.roles.includes(user?.role)
  );

  const getRoleBadgeColor = (role) => {
    const colors = {
      admin: 'bg-purple-500/20 text-purple-400',
      sales: 'bg-sky-500/20 text-sky-400',
      finance: 'bg-emerald-500/20 text-emerald-400',
      production: 'bg-amber-500/20 text-amber-400',
      procurement: 'bg-orange-500/20 text-orange-400',
      inventory: 'bg-cyan-500/20 text-cyan-400',
      security: 'bg-red-500/20 text-red-400',
      qc: 'bg-indigo-500/20 text-indigo-400',
      shipping: 'bg-blue-500/20 text-blue-400',
      transport: 'bg-teal-500/20 text-teal-400',
      documentation: 'bg-pink-500/20 text-pink-400',
    };
    return colors[role] || 'bg-zinc-500/20 text-zinc-400';
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'sidebar fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-border transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-sm bg-primary flex items-center justify-center">
                <Factory className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg tracking-tight">ERP</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {filteredMenu.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={cn('sidebar-item', isActive && 'active')}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-border">
          {!collapsed && (
            <div className="mb-3">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <span className={cn('inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium uppercase', getRoleBadgeColor(user?.role))}>
                {user?.role}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'default'}
            className={cn('w-full', !collapsed && 'justify-start')}
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 glass border-b border-border flex items-center justify-between px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden md:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
