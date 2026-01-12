import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { dashboardAPI } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { formatCurrency, formatDate, getStatusColor } from '../lib/utils';
import NotificationPanel from '../components/NotificationPanel';
import {
  FileText,
  ShoppingCart,
  Factory,
  Package,
  Ship,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, activitiesRes] = await Promise.all([
        dashboardAPI.getStats(),
        dashboardAPI.getRecentActivities(),
      ]);
      setStats(statsRes.data);
      setActivities(activitiesRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Pending Quotations',
      value: stats?.pending_quotations || 0,
      icon: FileText,
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/10',
      link: '/quotations',
    },
    {
      title: 'Active Sales Orders',
      value: stats?.active_sales_orders || 0,
      icon: ShoppingCart,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      link: '/sales-orders',
    },
    {
      title: 'Pending Jobs',
      value: stats?.pending_jobs || 0,
      icon: Factory,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      link: '/job-orders',
    },
    {
      title: 'In Production',
      value: stats?.in_production || 0,
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      link: '/job-orders',
    },
    {
      title: 'Ready for Dispatch',
      value: stats?.ready_for_dispatch || 0,
      icon: Package,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      link: '/delivery-orders',
    },
    {
      title: 'Pending Shipments',
      value: stats?.pending_shipments || 0,
      icon: Ship,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
      link: '/shipping',
    },
    {
      title: 'Low Stock Items',
      value: stats?.low_stock_items || 0,
      icon: AlertTriangle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      link: '/inventory',
    },
  ];

  if (loading) {
    return (
      <div className="page-container">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" data-testid="dashboard-page">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, <span className="text-foreground">{user?.name}</span>
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} to={stat.link}>
              <Card
                className={`stat-card card-hover animate-fade-in-delay-${Math.min(index, 3)}`}
                data-testid={`stat-card-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="kpi-value">{stat.value}</p>
                      <p className="kpi-label">{stat.title}</p>
                    </div>
                    <div className={`p-2.5 rounded-sm ${stat.bgColor}`}>
                      <Icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Notifications Panel */}
        <div className="lg:col-span-1">
          <NotificationPanel />
        </div>
        
        {/* Recent Quotations */}
        <Card className="card-hover">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              Recent Quotations
              <Link to="/quotations" className="text-sm text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activities?.recent_quotations?.length > 0 ? (
                activities.recent_quotations.map((q) => (
                  <div key={q.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-mono text-sm">{q.pfi_number}</p>
                      <p className="text-xs text-muted-foreground">{q.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(q.status)}>{q.status}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(q.total, q.currency)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No recent quotations</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="card-hover">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              Recent Sales Orders
              <Link to="/sales-orders" className="text-sm text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activities?.recent_orders?.length > 0 ? (
                activities.recent_orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-mono text-sm">{o.spa_number}</p>
                      <p className="text-xs text-muted-foreground">{o.customer_name}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(o.payment_status)}>{o.payment_status}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(o.total, o.currency)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No recent orders</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card className="card-hover">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              Recent Job Orders
              <Link to="/job-orders" className="text-sm text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activities?.recent_jobs?.length > 0 ? (
                activities.recent_jobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-mono text-sm">{j.job_number}</p>
                      <p className="text-xs text-muted-foreground">{j.product_name}</p>
                    </div>
                    <div className="text-right">
                      <Badge className={getStatusColor(j.status)}>{j.status.replace(/_/g, ' ')}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(j.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No recent jobs</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
