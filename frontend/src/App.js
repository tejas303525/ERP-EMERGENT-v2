import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import QuotationsPage from './pages/QuotationsPage';
import ViewQuote from './components/quotations/ViewQuote';
import SalesOrdersPage from './pages/SalesOrdersPage';
import JobOrdersPage from './pages/JobOrdersPage';
import InventoryPage from './pages/InventoryPage';
import GRNPage from './pages/GRNPage';
// PartialDeliveriesPage removed - functionality integrated into GRN page
import OutboundPartialDeliveriesPage from './pages/OutboundPartialDeliveriesPage';
import DeliveryOrdersPage from './pages/DeliveryOrdersPage';
import ShippingPage from './pages/ShippingPage';
import TransportPage from './pages/TransportPage';
import DispatchDashboard from './pages/DispatchDashboard';
import DocumentationPage from './pages/DocumentationPage';
import QCPage from './pages/QCPage';
import CustomersPage from './pages/CustomersPage';
import ProductsPage from './pages/ProductsPage';
import ProductionSchedulePage from './pages/ProductionSchedulePage';
import BlendReportsPage from './pages/BlendReportsPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import DrumSchedulePage from './pages/DrumSchedulePage';
import ProcurementPage from './pages/ProcurementPage';
import FinanceApprovalPage from './pages/FinanceApprovalPage';
import PayablesPage from './pages/PayablesPage';
import ReceivablesPage from './pages/ReceivablesPage';
import LogisticsPage from './pages/LogisticsPage';
import BOMManagementPage from './pages/BOMManagementPage';
import TransportWindowPage from './pages/TransportWindowPage';
import ImportWindowPage from './pages/ImportWindowPage';
import UnifiedProductionSchedulePage from './pages/UnifiedProductionSchedulePage';
import SecurityQCPage from './pages/SecurityQCPage';
import QCInspectionPage from './pages/QCInspectionPage';
import SettingsPage from './pages/SettingsPage';
import TransportOperationPage from './pages/TransportOperationPage';
import TransportPlannerPage from './pages/TransportPlannerPage';
import StockManagementPage from './pages/StockManagementPage';
import LoadingUnloadingWindow from './pages/LoadingUnloadingWindow';

// Layout
import MainLayout from './components/layout/MainLayout';

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <MainLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/quotations" element={<QuotationsPage />} />
                <Route path="/quotations/view/:id" element={<ViewQuote />} />
                <Route path="/sales-orders" element={<SalesOrdersPage />} />
                <Route path="/job-orders" element={<JobOrdersPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/grn" element={<GRNPage />} />
                {/* Partial deliveries route removed - functionality integrated into GRN page */}
                <Route path="/outbound-partial-deliveries" element={<OutboundPartialDeliveriesPage />} />
                <Route path="/delivery-orders" element={<DeliveryOrdersPage />} />
                <Route path="/shipping" element={<ShippingPage />} />
                <Route path="/transport" element={<TransportPage />} />
                <Route path="/transport-window" element={<TransportWindowPage />} />
                <Route path="/import-window" element={<ImportWindowPage />} />
                <Route path="/loading-unloading" element={<LoadingUnloadingWindow />} />
                <Route path="/dispatch-gate" element={<DispatchDashboard />} />
                <Route path="/documentation" element={<DocumentationPage />} />
                <Route path="/qc" element={<QCPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/production-schedule" element={<ProductionSchedulePage />} />
                <Route path="/unified-production-schedule" element={<UnifiedProductionSchedulePage />} />
                <Route path="/material-availability" element={<ProductionSchedulePage />} />
                <Route path="/drum-schedule" element={<UnifiedProductionSchedulePage />} />
                <Route path="/blend-reports" element={<BlendReportsPage />} />
                <Route path="/procurement" element={<ProcurementPage />} />
                <Route path="/finance-approval" element={<FinanceApprovalPage />} />
                <Route path="/payables" element={<PayablesPage />} />
                <Route path="/receivables" element={<ReceivablesPage />} />
                <Route path="/logistics" element={<LogisticsPage />} />
                <Route path="/bom-management" element={<BOMManagementPage />} />
                <Route path="/security" element={<SecurityQCPage />} />
                <Route path="/qc-inspection" element={<QCInspectionPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/stock-management" element={<StockManagementPage />} />
                <Route path="/transport-operation" element={<TransportOperationPage />} />
                <Route path="/transport-planner" element={<TransportPlannerPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/security-qc" element={<SecurityQCPage />} />
              </Routes>
            </MainLayout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
