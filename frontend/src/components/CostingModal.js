import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import ExportContainerizedCosting from './costing/ExportContainerizedCosting';
import ExportBulkCosting from './costing/ExportBulkCosting';
import ExportGCCRoadCosting from './costing/ExportGCCRoadCosting';
import ExportRoadCosting from './costing/ExportRoadCosting';
import Export40ftDGCosting from './costing/Export40ftDGCosting';
import Export40ftNonDGCosting from './costing/Export40ftNonDGCosting';
import Export20ftDGCosting from './costing/Export20ftDGCosting';
import Export20ftNonDGCosting from './costing/Export20ftNonDGCosting';
import GccByRoadCosting from './costing/GccByRoadCosting';
import LocalDispatchCosting from './costing/LocalDispatchCosting';
import LocalPurchaseSaleCosting from './costing/LocalPurchaseSaleCosting';
import LocalBulkToPlantCosting from './costing/LocalBulkToPlantCosting';
import LocalDrumToPlantCosting from './costing/LocalDrumToPlantCosting';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

// Helper function to format FastAPI validation errors
const formatError = (error) => {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (Array.isArray(detail)) {
      // Pydantic validation errors - format them
      return detail.map(err => {
        const field = err.loc?.join('.') || 'field';
        return `${field}: ${err.msg || 'Invalid value'}`;
      }).join(', ');
    } else if (typeof detail === 'string') {
      return detail;
    } else {
      return JSON.stringify(detail);
    }
  }
  return error.message || 'An error occurred';
};

export default function CostingModal({ quotation, open, onClose, onConfirmed }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [costing, setCosting] = useState(null);
  const [costingType, setCostingType] = useState(null);
  const [costs, setCosts] = useState({});

  const calculateCosting = async () => {
    try {
      setCalculating(true);
      // Determine initial values for new fields
      const items = quotation?.items || [];
      const initialIsBulk = items.every(item => (item.packaging || 'Bulk').toUpperCase() === 'BULK') || false;
      const initialPackagingType = initialIsBulk ? 'BULK' : 'DRUM';
      const initialIncotermType = quotation?.incoterm === 'EXW' ? 'EXW' : 'DELIVERED';
      
      const response = await api.post('/costing/calculate', null, {
        params: {
          reference_type: 'QUOTATION',
          reference_id: quotation.id,
          raw_material_source: 'SYSTEM',
          packaging_type: initialPackagingType,
          incoterm_type: initialIncotermType,
        },
      });
      
      console.log('Calculated costing data:', JSON.stringify(response.data, null, 2));
      setCosting(response.data);
      setCostingType(response.data.costing_type);
      toast.success('Costing calculated successfully');
    } catch (error) {
      toast.error(formatError(error) || 'Failed to calculate costing');
    } finally {
      setCalculating(false);
    }
  };

  const loadCosting = async () => {
    try {
      setLoading(true);
      // Try to get existing costing
      try {
        const response = await api.get(`/costing/QUOTATION/${quotation.id}`);
        console.log('Loaded costing data:', JSON.stringify(response.data, null, 2));
        const existingCosting = response.data;
        
        // Check if costing type needs to be recalculated based on current quotation properties
        // This handles cases where quotation properties changed (e.g., transport_mode)
        const shouldRecalculateType = () => {
          const orderType = (quotation?.order_type || '').toUpperCase();
          const transportMode = (quotation?.transport_mode || '').toUpperCase();
          const currentCostingType = existingCosting.costing_type;
          
          // If export with road transport, should be EXPORT_ROAD or EXPORT_GCC_ROAD
          if (orderType === 'EXPORT' && transportMode === 'ROAD') {
            return !currentCostingType || 
                   (currentCostingType !== 'EXPORT_ROAD' && currentCostingType !== 'EXPORT_GCC_ROAD');
          }
          
          return false;
        };
        
        if (shouldRecalculateType()) {
          // Recalculate to get correct costing type
          console.log('Costing type mismatch detected, recalculating...');
          await calculateCosting();
        } else {
          setCosting(existingCosting);
          setCostingType(existingCosting.costing_type);
        }
      } catch (error) {
        // No existing costing, will calculate
        console.log('No existing costing found, will calculate');
        setCosting(null);
        setCostingType(null);
      }
    } catch (error) {
      console.error('Failed to load costing:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && quotation) {
      loadCosting();
    } else {
      // Reset when modal closes
      setCosting(null);
      setCostingType(null);
      setCosts({});
    }
  }, [open, quotation?.id]);

  const handleUpdateCosts = (updatedCosts) => {
    setCosts(updatedCosts);
  };
  
  // Calculate current margin from costs (includes local updates not yet saved)
  const getCurrentMargin = () => {
    // For custom costing sheets, check net_profit_loss from costs
    if (costs.net_profit_loss !== undefined) {
      return costs.net_profit_loss;
    }
    // Fall back to margin_amount from costing record
    return costing?.margin_amount || 0;
  };

  const handleSave = async () => {
    if (!costing) {
      toast.error('Please calculate costing first');
      return;
    }

    // Validate required fields
    const requiredFields = ['raw_material_cost'];
    const missingFields = requiredFields.filter(field => {
      const value = costs[field] ?? costing[field];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      toast.error(`Please fill in required fields: ${missingFields.join(', ')}`);
      return;
    }

    try {
      setLoading(true);
      // Update costing with manual overrides - include all new fields
      const updateData = {
        ...costing,
        ...costs,
        container_count: quotation.container_count || 1,
        // Persist full UI state for custom costing sheets (e.g. GCC by road)
        custom_breakdown: costs,
        // Ensure core fields are included
        raw_material_source: costs.raw_material_source ?? costing.raw_material_source ?? 'SYSTEM',
        packaging_type: costs.packaging_type ?? costing.packaging_type,
        incoterm_type: costs.incoterm_type ?? costing.incoterm_type,
      };

      await api.put(`/costing/${costing.id}`, updateData);
      toast.success('Costing updated');
      loadCosting();
      // Trigger parent refresh so Finance Approval page shows updated margin
      if (onConfirmed) {
        onConfirmed();
      }
    } catch (error) {
      toast.error(formatError(error) || 'Failed to update costing');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!costing) {
      toast.error('Please calculate costing first');
      return;
    }

    try {
      setLoading(true);
      await api.put(`/costing/${costing.id}/confirm`);
      toast.success('Costing confirmed');
      if (onConfirmed) {
        onConfirmed();
      }
      onClose();
    } catch (error) {
      toast.error(formatError(error) || 'Failed to confirm costing');
    } finally {
      setLoading(false);
    }
  };

  const renderCostingPage = () => {
    if (!costingType) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Click "Calculate Cost" to start</p>
        </div>
      );
    }

    const commonProps = {
      costing: costing,
      quotation: quotation,
      onUpdate: handleUpdateCosts,
      userRole: user?.role,
    };

    switch (costingType) {
      case 'EXPORT_CONTAINERIZED':
        return <ExportContainerizedCosting {...commonProps} />;
      case 'EXPORT_BULK':
        return <ExportBulkCosting {...commonProps} />;
      case 'EXPORT_GCC_ROAD':
        // For local GCC-by-road types, use the custom GCC-by-road sheet
        if (
          quotation.order_type === 'local' &&
          (quotation.local_type === 'gcc_road_bulk' || quotation.local_type === 'gcc_road')
        ) {
          return <GccByRoadCosting {...commonProps} />;
        }
        // Otherwise keep using the existing Export GCC Road sheet
        return <ExportGCCRoadCosting {...commonProps} />;
      case 'EXPORT_ROAD':
        return <ExportRoadCosting {...commonProps} />;
      case 'EXPORT_40FT_DG':
        return <Export40ftDGCosting {...commonProps} />;
      case 'EXPORT_40FT_NON_DG':
        return <Export40ftNonDGCosting {...commonProps} />;
      case 'EXPORT_20FT_DG':
        return <Export20ftDGCosting {...commonProps} />;
      case 'EXPORT_20FT_NON_DG':
        return <Export20ftNonDGCosting {...commonProps} />;
      case 'LOCAL_DISPATCH':
        return <LocalDispatchCosting {...commonProps} />;
      case 'LOCAL_PURCHASE_SALE':
        return <LocalPurchaseSaleCosting {...commonProps} />;
      case 'LOCAL_BULK_TO_PLANT':
        return <LocalBulkToPlantCosting {...commonProps} />;
      case 'LOCAL_DRUM_TO_PLANT':
        return <LocalDrumToPlantCosting {...commonProps} />;
      default:
        return <div>Unknown costing type: {costingType}</div>;
    }
  };

  const margin = getCurrentMargin();
  const isNegativeMargin = margin < 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" aria-describedby="costing-dialog-description">
        <DialogHeader>
          <DialogTitle>Costing & Margin Validation - {quotation?.pfi_number}</DialogTitle>
        </DialogHeader>
        <p id="costing-dialog-description" className="sr-only">
          Costing and margin validation for quotation {quotation?.pfi_number}
        </p>

        {loading && !costing && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {!loading && (
          <>
            {!costing && (
              <div className="text-center py-8 space-y-4">
                <p className="text-muted-foreground">
                  Calculate costing to see cost breakdown and margin analysis
                </p>
                <Button onClick={calculateCosting} disabled={calculating}>
                  {calculating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    'Calculate Cost'
                  )}
                </Button>
              </div>
            )}

            {costing && (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Costing Type</p>
                      <p className="font-semibold">{costingType?.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      {costing.cost_confirmed ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="font-semibold">Confirmed</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-yellow-600">
                          <XCircle className="w-4 h-4" />
                          <span className="font-semibold">Pending</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {renderCostingPage()}
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                  <Button variant="outline" onClick={onClose}>
                    Close
                  </Button>
                  {!costing.cost_confirmed && (
                    <>
                      <Button variant="outline" onClick={handleSave} disabled={loading}>
                        Save Changes
                      </Button>
                      <Button
                        onClick={handleConfirm}
                        disabled={loading || isNegativeMargin}
                        variant={isNegativeMargin ? 'destructive' : 'default'}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Confirming...
                          </>
                        ) : (
                          'Confirm Cost'
                        )}
                      </Button>
                    </>
                  )}
                </div>

                {isNegativeMargin && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200 font-semibold">
                      ⚠️ Negative Margin Detected
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                      This quotation has a negative margin and cannot be confirmed. Please review costs or adjust selling price.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

