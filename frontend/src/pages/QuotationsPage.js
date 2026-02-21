import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { quotationAPI, customerAPI, productAPI, pdfAPI } from '../lib/api';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import { formatCurrency, formatDate, getStatusColor, cn, hasPagePermission } from '../lib/utils';
import { Plus, FileText, Check, X, Eye, Trash2, Download, Globe, MapPin, Ship, AlertTriangle, Edit, RefreshCw, DollarSign } from 'lucide-react';

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

const CURRENCIES = ['USD', 'AED', 'EUR', 'INR'];
const ORDER_TYPES = ['local', 'export'];
const PAYMENT_TERMS = ['100% CASH /TT/CDC IN ADVANCE',
  '100% cash In Advance Before Shipment/Loading',
  '100% CASH/TT/CDC AGAINST DELIVERY',
  '20% Advance Balance 80% against scan copy docs',
  '25% Advance and Balance 75% CAD at sight thru bank',
  '30 DAYS FROM INVOICE/DELIVERY DATE',
  '30 DAYS PDC AGAINST DELIVERY',
  '30 DAYS PDC IN ADVANCE',
  '30% Advance Balance 70% against scan copy docs',
  '50% Advance and Balance 50% CAD at sight thru bank',
  '50% Advance Balance 50% against scan copy docs',
  '60 DAYS FROM INVOICE /DELIVERY DATE',
  '60 DAYS PDC AGAINST DELIVERY',
  '60 DAYS PDC IN ADVANCE',
  '90 DAYS FROM INVOICE/ DELIVERY DATE',
  '90 DAYS PDC AGAINST DELIVERY',
  '90 DAYS PDC IN ADVANCE',
  'Avalised Draft 30 Days from Bill of Lading date',
  'Avalised Draft 60 Days from Bill of Lading date',
  'Avalised Draft 90 Days from Bill of Lading date',
  'Cash against Documents (CAD)',
  'Cash against Documents (CAD) Payable at sight through Bank',
  'Confirm Letter of credit payable at 30 days from Bill of Lading date',
  'Confirm Letter of credit payable at 60 days from Bill of Lading date',
  'Confirm Letter of credit payable at 90 days from Bill of Lading date',
  'Irrevocable Letter of Credit payable at sight',
  'Payable at 30 days from Bill of Lading Date thru Bank',
  'Payable at 30 days from Shipped on Board Date',
  'Payable at 60 days from Bill of Lading Date thru Bank',
  'Payable at 60 days from Shipped on Board Date',
  'Payable at 90 days from Bill of Lading Date thru Bank',
  'Payable at 90 days from Shipped on Board Date'];
const INCOTERMS = ['FOB', 'CFR', 'CIF', 'EXW', 'DDP', 'CIP', 'DAP'];
// Default packaging - will be replaced by settings data
const DEFAULT_PACKAGING = [
  'Bulk', 
  '200L Drum', 
  '210L Drum',
  'Steel Drum 210L',
  'Steel Drum 210L Reconditioned',
  'HDPE Drum 210L',
  'HDPE Drum 210L Reconditioned',
  'HDPE Drum 250L',
  'Open Top Drum 210L',
  'Open Top Drum 210L Reconditioned',
  'IBC 1000L', 
  'Flexitank', 
  'ISO Tank',
  'Pallets'
];

// Container types with max capacity
const CONTAINER_TYPES = [
  { value: '20ft', label: '20ft Container', max_mt: 28 },
  { value: '40ft', label: '40ft Container', max_mt: 28 },
  { value: 'iso_tank', label: 'ISO Tank', max_mt: 25 },
  { value: 'bulk_tanker_45', label: 'Bulk Tanker 45T', max_mt: 45 },
  { value: 'bulk_tanker_25', label: 'Bulk Tanker 25T', max_mt: 25 },
  { value: 'road_trailer', label: 'Road Trailer', max_mt: 25 },
  { value: 'road_box_trailer', label: 'Road Box Trailer', max_mt: 25 },
];

// Document types that can be required
const DOCUMENT_TYPES = [
  { id: 'commercial_invoice', label: 'Commercial Invoice', defaultChecked: true },
  { id: 'packing_list', label: 'Packing List', defaultChecked: true },
  { id: 'certificate_of_origin', label: 'Certificate of Origin (COO)', defaultChecked: false },
  { id: 'certificate_of_analysis', label: 'Certificate of Analysis (COA)', defaultChecked: true },
  { id: 'bill_of_lading', label: 'Bill of Lading (B/L)', defaultChecked: false },
  { id: 'msds', label: 'Material Safety Data Sheet (MSDS)', defaultChecked: false },
  { id: 'phytosanitary', label: 'Phytosanitary Certificate', defaultChecked: false },
  { id: 'insurance', label: 'Insurance Certificate', defaultChecked: false },
  { id: 'weight_slip', label: 'Weight Slip', defaultChecked: false },
  { id: 'delivery_note', label: 'Delivery Note', defaultChecked: true },
];

// Countries list (common ones)
const COUNTRIES = [
  'UAE', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'India', 'Pakistan',
  'China', 'USA', 'UK', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands',
  'Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines',
  'South Africa', 'Nigeria', 'Egypt', 'Kenya', 'Australia', 'New Zealand',
  'Brazil', 'Mexico', 'Canada', 'Japan', 'South Korea', 'Turkey', 'Russia'
].sort();

const VAT_RATE = 0.05; // 5% VAT for local orders

const VALIDITY_OPTIONS = [
  { value: 7, label: '7 Days' },
  { value: 14, label: '14 Days' },
  { value: 30, label: '30 Days' },
  { value: 45, label: '45 Days' },
  { value: 60, label: '60 Days' },
  { value: 90, label: '90 Days' },
];

export default function QuotationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [packagingTypes, setPackagingTypes] = useState(DEFAULT_PACKAGING);
  const [packagingObjects, setPackagingObjects] = useState([]); // Store full packaging objects
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS); // Payment terms from settings + defaults
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [approving, setApproving] = useState(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingQuotation, setRejectingQuotation] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [form, setForm] = useState({
    customer_id: '',
    customer_name: '',
    currency: 'USD',
    order_type: 'local',
    incoterm: '',
    container_type: '',
    container_count: 1,
    port_of_loading: '',
    port_of_discharge: '',
    delivery_place: '',
    country_of_origin: 'UAE',
    country_of_destination: '',
    payment_terms: 'Cash',
    validity_days: 30,
    expected_delivery_date: '',
    notes: '',
    items: [],
    required_documents: DOCUMENT_TYPES.filter(d => d.defaultChecked).map(d => d.id),
    include_vat: true,
    bank_id: '',
    transport_mode: 'ocean',  // 'ocean', 'road', 'air'
    local_type: null,  // 'direct_to_customer', 'bulk_to_plant', 'packaged_to_plant'
    is_dg: false,  // Dangerous goods flag
    // Additional freight fields
    additional_freight_rate_per_fcl: 0,
    additional_freight_currency: 'USD',
    cfr_amount: 0,
    additional_freight_amount: 0,
    total_receivable: 0,
  });

  const [newItem, setNewItem] = useState({
    product_id: '',
    product_name: '',
    sku: '',
    quantity: 0,
    unit_price: 0,
    basePricePerMT: 0, // Store the original price per MT for conversions
    uom: 'per_mt', // Unit of Measure: 'per_unit', 'per_liter', 'per_mt'
    packaging: 'Bulk',
    net_weight_kg: null,
    availableNetWeights: [], // Store available netweights for current packaging
    palletized: false, // Palletized or non-palletized
    // Container and export detail fields
    container_number: 1,
    container_count_per_item: 0, // Number of containers allocated to this item
    brand: '',
    color: '',
    detailed_packing: '',
    fcl_breakdown: '',
    quantity_in_units: 0,
    unit_type: 'CRTN', // CRTN, PAILS, DRUMS, etc.
    item_country_of_origin: 'UAE',
    packing_display: '',
  });
  
  const [currentContainer, setCurrentContainer] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  // Auto-set transport_mode based on incoterm and country
  useEffect(() => {
    const gccCountries = ['Saudi Arabia', 'Bahrain', 'Kuwait', 'Oman', 'Qatar'];
    const countryLower = form.country_of_destination?.trim().toLowerCase() || '';
    const isGCC = gccCountries.some(gcc => gcc.toLowerCase() === countryLower);
    
    if (form.order_type === 'export') {
      const incoterm = form.incoterm?.toUpperCase() || '';
      
      // FOB, CFR, CIF with containers = SEA transport (even for GCC)
      if (['FOB', 'CFR', 'CIF'].includes(incoterm) && form.container_type) {
        setForm(prev => ({...prev, transport_mode: 'ocean'}));
      }
      // DDP or EXW to GCC countries (no containers) = typically ROAD
      else if (isGCC && ['DDP', 'EXW'].includes(incoterm) && !form.container_type) {
        setForm(prev => ({...prev, transport_mode: 'road'}));
      }
      // Non-GCC exports default to ocean
      else if (!isGCC && countryLower) {
        setForm(prev => ({...prev, transport_mode: 'ocean'}));
      }
    }
  }, [form.country_of_destination, form.order_type, form.incoterm, form.container_type]);

  const loadData = async () => {
    try {
      const [quotationsRes, customersRes, productsRes, settingsRes, banksRes, packagingRes, paymentTermsRes] = await Promise.all([
        quotationAPI.getAll(),
        customerAPI.getAll(),
        productAPI.getAll(),
        api.get('/settings/all').catch(() => ({ data: {} })),
        api.get('/settings/bank-accounts').catch(() => ({ data: [] })), // Fetch bank accounts separately for non-admin users
        api.get('/inventory-items/packaging/for-quotation').catch(() => ({ data: [] })), // Fetch packaging from inventory_items (item_type=PACK)
        api.get('/settings/payment-terms').catch(() => ({ data: [] })) // Fetch payment terms from dedicated endpoint
      ]);
      setQuotations(quotationsRes.data);
      setCustomers(customersRes.data);
      setProducts(productsRes.data.filter(p => p.category === 'finished_product'));
      
      // Load packaging from inventory_items (item_type=PACK) - single source of truth
      const packagingFromInventory = packagingRes.data || [];
      // Store full packaging objects
      setPackagingObjects(packagingFromInventory);
      // Extract names for dropdown (Bulk is already included from backend)
      const allPackaging = packagingFromInventory.map(p => p.name);
      setPackagingTypes(allPackaging.length > 0 ? allPackaging : DEFAULT_PACKAGING);
      
      // Load bank accounts from dedicated endpoint (works for non-admin users)
      setBankAccounts(banksRes.data || []);
      
      // Load payment terms from dedicated endpoint (works for non-admin users)
      const paymentTermsFromSettings = paymentTermsRes.data || [];
      const termsFromSettings = paymentTermsFromSettings.map(t => t.name || t).filter(Boolean);
      
      // Merge defaults with settings terms, checking for duplicates
      const merged = [...PAYMENT_TERMS];
      const duplicates = [];
      
      termsFromSettings.forEach(term => {
        const existsIndex = merged.findIndex(t => t.toLowerCase() === term.toLowerCase());
        if (existsIndex >= 0) {
          duplicates.push(term);
        } else {
          merged.push(term);
        }
      });
      
      if (duplicates.length > 0) {
        console.warn('Duplicate payment terms found:', duplicates);
        toast.warning(`Duplicate payment terms ignored: ${duplicates.join(', ')}`);
      }
      
      setPaymentTerms(merged);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerChange = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    setForm({
      ...form,
      customer_id: customerId,
      customer_name: customer?.name || '',
      country_of_destination: customer?.country || '',
    });
  };

  const handleProductSelect = (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setNewItem({
        ...newItem,
        product_id: productId,
        product_name: product.name,
        sku: product.sku,
        unit_price: product.price_usd || 0,
        basePricePerMT: product.price_usd || 0, // Store base price for conversions
      });
    }
  };

  // Helper function to infer U.O.M from packaging
  const inferUOMFromPackaging = (packaging) => {
    if (!packaging) return 'per_mt';
    
    const packagingLower = packaging.toLowerCase();
    
    if (['drum', 'carton', 'pail', 'ibc', 'bag', 'box'].some(keyword => packagingLower.includes(keyword))) {
      return 'per_unit';
    } else if (['flexi', 'iso', 'tank'].some(keyword => packagingLower.includes(keyword))) {
      return 'per_liter';
    } else if (packagingLower === 'bulk') {
      return 'per_mt';
    }
    return 'per_mt'; // Default
  };

  const handlePackagingChange = async (packagingName) => {
    // Infer U.O.M from packaging
    const inferredUom = inferUOMFromPackaging(packagingName);
    
    // Store the base price (per MT) if not already stored
    const basePricePerMT = newItem.basePricePerMT || newItem.unit_price;
    
    if (packagingName === 'Bulk') {
      setNewItem({ 
        ...newItem, 
        packaging: 'Bulk', 
        uom: 'per_mt', 
        net_weight_kg: null, 
        quantity: 0,
        unit_price: basePricePerMT, // Reset to base price per MT
        basePricePerMT: basePricePerMT
      });
      return;
    }
    
    // First, try to lookup product-packaging configuration
    if (newItem.product_id) {
      try {
        const containerType = form.container_type || '20ft'; // Default to 20ft
        const configRes = await api.get('/product-packaging-configs/lookup', {
          params: {
            product_id: newItem.product_id,
            packaging_name: packagingName,
            container_type: containerType
          }
        });
        
        if (configRes.data) {
          const config = configRes.data;
          // Determine which filling field to use based on packaging_type from config
          let netWeight = config.net_weight_kg;
          const packagingType = config.packaging_type?.toLowerCase() || '';
          
          if (packagingType === 'drum' || packagingType === 'carton') {
            netWeight = config.drum_carton_filling_kg || netWeight;
          } else if (packagingType === 'ibc') {
            netWeight = config.ibc_filling_kg || netWeight;
          } else if (packagingType === 'flexi/iso' || packagingType === 'flexi' || packagingType === 'iso') {
            // For Flexi/ISO, convert MT to KG if needed
            netWeight = config.flexi_iso_filling_mt ? config.flexi_iso_filling_mt * 1000 : netWeight;
          }
          
          // Auto-fill quantity based on container capacity if available
          let autoQuantity = newItem.quantity || 0;
          if (containerType === '20ft') {
            // Prefer palletised, then non-palletised, then IBC
            if (config.total_units_palletised) {
              autoQuantity = config.total_units_palletised;
            } else if (config.total_units_non_palletised) {
              autoQuantity = config.total_units_non_palletised;
            } else if (config.total_ibc) {
              autoQuantity = config.total_ibc;
            }
          } else if (containerType === '40ft') {
            // Prefer palletised, then non-palletised, then IBC
            if (config.total_units_palletised) {
              autoQuantity = config.total_units_palletised;
            } else if (config.total_units_non_palletised) {
              autoQuantity = config.total_units_non_palletised;
            } else if (config.total_ibc) {
              autoQuantity = config.total_ibc;
            }
          }
          
          // Auto-set U.O.M based on packaging type
          let defaultUom = 'per_mt'; // Default for bulk
          if (packagingType === 'carton' || packagingType === 'drum' || packagingType === 'ibc') {
            defaultUom = 'per_unit'; // For cartons, drums, IBC - price per unit
          } else if (packagingType === 'flexi/iso' || packagingType === 'flexi' || packagingType === 'iso') {
            defaultUom = 'per_liter'; // For Flexi/ISO - price per liter
          }
          
          // Calculate converted unit price based on UOM
          let convertedUnitPrice = basePricePerMT;
          
          if (defaultUom === 'per_unit' && netWeight) {
            // Price per unit = Price per MT × (net_weight_kg / 1000)
            convertedUnitPrice = basePricePerMT * (netWeight / 1000);
          } else if (defaultUom === 'per_liter') {
            // For liters, need density (if available)
            const product = products.find(p => p.id === newItem.product_id);
            if (product && product.density_kg_per_l) {
              // Price per liter = Price per MT × (density_kg_per_l / 1000)
              convertedUnitPrice = basePricePerMT * (product.density_kg_per_l / 1000);
            }
          }
          // For per_mt, keep the base price (no conversion needed)
          
          setNewItem({
            ...newItem,
            packaging: packagingName,
            uom: defaultUom,
            net_weight_kg: netWeight,
            quantity: autoQuantity,
            unit_price: convertedUnitPrice, // Use converted price
            basePricePerMT: basePricePerMT,
            hscode: config.hscode,
            country_of_origin: config.origin || form.country_of_origin || 'UAE'
          });
          return;
        }
      } catch (error) {
        // If lookup fails, fall back to packaging object
        console.log('Config lookup failed, using packaging object:', error);
      }
    }
    
    // Fallback: Find the packaging object
    const packagingObj = packagingObjects.find(p => p.name === packagingName);
    
    // Auto-set U.O.M based on packaging name (heuristic)
    let defaultUom = 'per_mt';
    const packagingNameLower = packagingName.toLowerCase();
    if (packagingNameLower.includes('carton') || packagingNameLower.includes('drum') || packagingNameLower.includes('pail') || packagingNameLower.includes('ibc')) {
      defaultUom = 'per_unit';
    } else if (packagingNameLower.includes('flexi') || packagingNameLower.includes('iso') || packagingNameLower.includes('tank')) {
      defaultUom = 'per_liter';
    }
    
    if (packagingObj) {
      // Get netweights array or fallback to net_weight_kg
      const netWeights = packagingObj.net_weights || (packagingObj.net_weight_kg ? [packagingObj.net_weight_kg] : []);
      
      // Auto-set the first netweight if available
      const autoNetWeight = netWeights.length > 0 ? netWeights[0] : null;
      
      // Calculate converted unit price based on UOM
      let convertedUnitPrice = basePricePerMT;
      
      if (defaultUom === 'per_unit' && autoNetWeight) {
        // Price per unit = Price per MT × (net_weight_kg / 1000)
        convertedUnitPrice = basePricePerMT * (autoNetWeight / 1000);
      } else if (defaultUom === 'per_liter') {
        // For liters, need density (if available)
        const product = products.find(p => p.id === newItem.product_id);
        if (product && product.density_kg_per_l) {
          // Price per liter = Price per MT × (density_kg_per_l / 1000)
          convertedUnitPrice = basePricePerMT * (product.density_kg_per_l / 1000);
        }
      }
      // For per_mt, keep the base price (no conversion needed)
      
      setNewItem({ 
        ...newItem, 
        packaging: packagingName,
        uom: defaultUom,
        net_weight_kg: autoNetWeight,
        unit_price: convertedUnitPrice, // Use converted price
        basePricePerMT: basePricePerMT,
        availableNetWeights: netWeights // Store available netweights for dropdown
      });
    } else {
      // Infer U.O.M from packaging if not set by config
      const inferredUom = inferUOMFromPackaging(packagingName);
      
      // Calculate converted unit price based on UOM (no netWeight available)
      let convertedUnitPrice = basePricePerMT;
      
      if (inferredUom === 'per_liter') {
        // For liters, need density (if available)
        const product = products.find(p => p.id === newItem.product_id);
        if (product && product.density_kg_per_l) {
          convertedUnitPrice = basePricePerMT * (product.density_kg_per_l / 1000);
        }
      }
      // For per_unit without netWeight or per_mt, keep the base price
      
      setNewItem({ 
        ...newItem, 
        packaging: packagingName, 
        uom: inferredUom, 
        net_weight_kg: null, 
        unit_price: convertedUnitPrice,
        basePricePerMT: basePricePerMT,
        availableNetWeights: [] 
      });
    }
  };

  const addItem = () => {
    if (!newItem.product_id || newItem.quantity <= 0) {
      toast.error('Please select a product and enter quantity');
      return;
    }
    if (newItem.packaging !== 'Bulk' && !newItem.net_weight_kg && newItem.uom !== 'per_unit') {
      toast.error('Please enter net weight (kg) for packaged items');
      return;
    }
    
    // Validate container allocation for export orders - MIXED LOADING SUPPORT
    if (form.order_type === 'export' && form.container_count > 0 && form.container_type) {
      // Calculate weight of new item first
      let newItemWeightMT = 0;
      const uom = newItem.uom || inferUOMFromPackaging(newItem.packaging);
      
      if (uom === 'per_unit') {
        if (newItem.net_weight_kg) {
          newItemWeightMT = (newItem.net_weight_kg * newItem.quantity) / 1000;
        }
      } else if (uom === 'per_liter') {
        if (newItem.net_weight_kg) {
          newItemWeightMT = (newItem.net_weight_kg * newItem.quantity) / 1000;
        } else {
          newItemWeightMT = newItem.quantity / 1000; // Approximate for liquids
        }
      } else { // per_mt
        if (newItem.net_weight_kg) {
          newItemWeightMT = (newItem.net_weight_kg * newItem.quantity) / 1000;
        } else {
          newItemWeightMT = newItem.quantity; // Bulk - quantity is in MT
        }
      }
      
      // Calculate current container's used capacity
      const containerItems = form.items.filter(item => item.container_number === currentContainer);
      const currentContainerMT = containerItems.reduce((sum, item) => sum + (item.weight_mt || 0), 0);
      
      // Get max capacity for this container type
      const containerType = CONTAINER_TYPES.find(c => c.value === form.container_type);
      const maxCapacityMT = containerType ? containerType.max_mt : 28;
      
      // Check if adding this item would exceed container capacity
      if (currentContainerMT + newItemWeightMT > maxCapacityMT) {
        toast.error(
          `Container ${currentContainer} capacity exceeded! ` +
          `Current: ${currentContainerMT.toFixed(2)} MT, ` +
          `Adding: ${newItemWeightMT.toFixed(2)} MT, ` +
          `Max: ${maxCapacityMT} MT. ` +
          `Please select a different container or add more containers.`
        );
        return;
      }
    }
    
    // Calculate total based on U.O.M (Unit of Measure)
    // Infer U.O.M from packaging only if not explicitly set
    let uom = newItem.uom;
    if (!uom) {
      uom = inferUOMFromPackaging(newItem.packaging);
    }
    
    let total = 0;
    let weight_mt = 0;
    
    if (uom === 'per_unit') {
      // For cartons, pails, drums, IBC: quantity × unit_price
      total = newItem.quantity * newItem.unit_price;
      // Calculate weight for container capacity checking
      if (newItem.net_weight_kg) {
        weight_mt = (newItem.net_weight_kg * newItem.quantity) / 1000;
      } else {
        weight_mt = 0;
      }
    } else if (uom === 'per_liter') {
      // For liquid products: quantity (liters) × unit_price
      total = newItem.quantity * newItem.unit_price;
      // Approximate weight (1 liter ≈ 1 kg for most liquids)
      weight_mt = newItem.quantity / 1000;
    } else { // per_mt (for pricing per metric ton)
      // Calculate weight from quantity of units and net weight
      if (newItem.net_weight_kg) {
        // For packaged products: calculate weight from quantity × net_weight_kg
        weight_mt = (newItem.net_weight_kg * newItem.quantity) / 1000;
      } else {
        // For bulk (no net weight): assume quantity is in MT
        weight_mt = newItem.quantity;
      }
      // IMPORTANT: Total is always weight_mt × unit_price when UOM is per_mt
      total = weight_mt * newItem.unit_price;
    }
    
    setForm({
      ...form,
      items: [...form.items, { 
        ...newItem, 
        weight_mt, 
        total,
        container_number: currentContainer 
      }],
    });
    setNewItem({ 
      product_id: '', 
      product_name: '', 
      sku: '', 
      quantity: 0, 
      unit_price: 0,
      basePricePerMT: 0, // Reset base price
      uom: 'per_mt',
      packaging: 'Bulk', 
      net_weight_kg: null, 
      availableNetWeights: [], 
      palletized: false,
      container_number: currentContainer,
      container_count_per_item: 0,
      brand: '',
      color: '',
      detailed_packing: '',
      fcl_breakdown: '',
      quantity_in_units: 0,
      unit_type: 'CRTN',
      item_country_of_origin: 'UAE',
      packing_display: '',
    });
  };

  // Calculate container allocation
  const calculateContainerAllocation = () => {
    const totalContainersUsed = form.items.reduce((sum, item) => {
      return sum + (item.container_count_per_item || 0);
    }, 0);
    
    const remainingContainers = (form.container_count || 0) - totalContainersUsed;
    
    return {
      totalUsed: totalContainersUsed,
      remaining: Math.max(0, remainingContainers),
      total: form.container_count || 0
    };
  };

  const containerAllocation = calculateContainerAllocation();

  // Calculate weight capacity per container for mixed loading
  const calculateContainerCapacity = () => {
    if (form.order_type !== 'export' || !form.container_type || form.container_count === 0) {
      return [];
    }
    
    const containerType = CONTAINER_TYPES.find(c => c.value === form.container_type);
    const maxCapacityMT = containerType ? containerType.max_mt : 28;
    
    const containers = [];
    for (let i = 1; i <= form.container_count; i++) {
      const containerItems = form.items.filter(item => item.container_number === i);
      const usedMT = containerItems.reduce((sum, item) => sum + (item.weight_mt || 0), 0);
      const remainingMT = Math.max(0, maxCapacityMT - usedMT);
      const percentUsed = (usedMT / maxCapacityMT) * 100;
      
      containers.push({
        number: i,
        usedMT: usedMT,
        remainingMT: remainingMT,
        maxCapacityMT: maxCapacityMT,
        percentUsed: percentUsed,
        items: containerItems
      });
    }
    
    return containers;
  };

  // Handle container count change and auto-generate packing_display
  const handleContainerCountChange = (count) => {
    const containerType = form.container_type || '20ft';
    let containerTypeDisplay = '20 FCL';
    
    if (containerType === '40ft') {
      containerTypeDisplay = '40 FCL';
    } else if (containerType === '20ft') {
      containerTypeDisplay = '20 FCL';
    } else {
      // For other types, use the container type name
      containerTypeDisplay = containerType.toUpperCase().replace('_', ' ');
    }
    
    const packingDisplay = count > 0 ? `${count}X ${containerTypeDisplay}` : '';
    
    setNewItem({
      ...newItem,
      container_count_per_item: count,
      packing_display: packingDisplay
    });
  };

  const removeItem = (index) => {
    setForm({
      ...form,
      items: form.items.filter((_, i) => i !== index),
    });
  };

  const toggleDocument = (docId) => {
    setForm(prev => ({
      ...prev,
      required_documents: prev.required_documents.includes(docId)
        ? prev.required_documents.filter(d => d !== docId)
        : [...prev.required_documents, docId]
    }));
  };

  // Calculate totals
  const subtotal = form.items.reduce((sum, i) => sum + i.total, 0);
  const vatAmount = form.order_type === 'local' && form.include_vat ? subtotal * VAT_RATE : 0;
  const grandTotal = subtotal + vatAmount;
  
  // Calculate total weight in MT - only use weight_mt, never fallback to quantity
  const totalWeightMT = form.items.reduce((sum, i) => {
    // If weight_mt is already calculated, use it
    if (i.weight_mt !== undefined && i.weight_mt !== null) {
      return sum + i.weight_mt;
    }
    
    // Calculate weight_mt if missing based on U.O.M
    const uom = i.uom || inferUOMFromPackaging(i.packaging);
    let calculatedWeight = 0;
    
    if (uom === 'per_unit' && i.net_weight_kg) {
      calculatedWeight = (i.net_weight_kg * i.quantity) / 1000;
    } else if (uom === 'per_liter') {
      calculatedWeight = i.quantity / 1000;
    } else { // per_mt
      calculatedWeight = i.quantity;
    }
    
    return sum + calculatedWeight;
  }, 0);
  
  // Calculate additional freight (for CFR quotations)
  const additionalFreight = (form.additional_freight_rate_per_fcl || 0) * (form.container_count || 1);
  const cfrAmount = subtotal;
  const totalReceivable = cfrAmount + additionalFreight;

  // Get max cargo capacity based on container type
  const getMaxContainerCapacity = () => {
    const container = CONTAINER_TYPES.find(c => c.value === form.container_type);
    return container ? container.max_mt * form.container_count : Infinity;
  };

  const maxCargoCapacity = getMaxContainerCapacity();
  const isOverweight = form.order_type === 'export' && form.container_type && totalWeightMT > maxCargoCapacity;

  const handleCreate = async () => {
    if (!form.customer_id || form.items.length === 0) {
      toast.error('Please select customer and add items');
      return;
    }
    if (form.order_type === 'export' && !form.container_type) {
      toast.error('Please select container type for export orders');
      return;
    }
    if (form.order_type === 'export' && !form.container_count) {
      toast.error('Please enter number of containers');
      return;
    }
    // Check max cargo exceeded
    if (isOverweight) {
      toast.error(`Max cargo exceeded! Total weight (${totalWeightMT.toFixed(2)} MT) exceeds container capacity (${maxCargoCapacity} MT). Please increase container count.`);
      return;
    }

    try {
      const quotationData = {
        ...form,
        subtotal,
        vat_amount: vatAmount,
        vat_rate: form.order_type === 'local' && form.include_vat ? VAT_RATE : 0,
        total: grandTotal,
        total_weight_mt: totalWeightMT,
        cfr_amount: cfrAmount,
        additional_freight_amount: additionalFreight,
        total_receivable: totalReceivable,
      };
      
      if (isEditMode && editingQuotation) {
        await quotationAPI.update(editingQuotation.id, quotationData);
        toast.success('Quotation updated successfully');
      } else {
        await quotationAPI.create(quotationData);
        toast.success('Quotation created successfully');
      }
      setCreateOpen(false);
      resetForm();
      setIsEditMode(false);
      setEditingQuotation(null);
      loadData();
    } catch (error) {
      toast.error(formatError(error) || 'Failed to save quotation');
    }
  };

  const handleEditClick = async (quotation) => {
    try {
      // Load full quotation details
      const response = await quotationAPI.getOne(quotation.id);
      const fullQuotation = response.data;
      
      // Populate form with quotation data
      setForm({
        customer_id: fullQuotation.customer_id || '',
        customer_name: fullQuotation.customer_name || '',
        currency: fullQuotation.currency || 'USD',
        order_type: fullQuotation.order_type || 'local',
        incoterm: fullQuotation.incoterm || '',
        container_type: fullQuotation.container_type || '',
        container_count: fullQuotation.container_count || 1,
        port_of_loading: fullQuotation.port_of_loading || '',
        port_of_discharge: fullQuotation.port_of_discharge || '',
        delivery_place: fullQuotation.delivery_place || '',
        country_of_origin: fullQuotation.country_of_origin || 'UAE',
        country_of_destination: fullQuotation.country_of_destination || '',
        payment_terms: fullQuotation.payment_terms || 'Cash',
        validity_days: fullQuotation.validity_days || 30,
        expected_delivery_date: fullQuotation.expected_delivery_date || '',
        transport_mode: fullQuotation.transport_mode || 'ocean',
        local_type: fullQuotation.local_type || null,
        is_dg: fullQuotation.is_dg || false,
        notes: fullQuotation.notes || '',
        items: fullQuotation.items || [],
        required_documents: fullQuotation.required_documents || [],
        include_vat: fullQuotation.include_vat !== false,
        bank_id: fullQuotation.bank_id || '',
        additional_freight_rate_per_fcl: fullQuotation.additional_freight_rate_per_fcl || 0,
        additional_freight_currency: fullQuotation.additional_freight_currency || 'USD',
        cfr_amount: fullQuotation.cfr_amount || 0,
        additional_freight_amount: fullQuotation.additional_freight_amount || 0,
        total_receivable: fullQuotation.total_receivable || 0,
      });
      
      setEditingQuotation(fullQuotation);
      setIsEditMode(true);
      setCreateOpen(true);
    } catch (error) {
      toast.error('Failed to load quotation for editing');
    }
  };

  const handleApprove = async (id) => {
    setApproving(id);
    try {
      const response = await quotationAPI.approve(id);
      toast.success('Quotation approved');
      // Immediately update local state to reflect approval
      setQuotations(prev => prev.map(q => 
        q.id === id ? { ...q, status: 'approved' } : q
      ));
      // Also reload to get any material check results
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve');
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (id) => {
    setRejectingQuotation(id);
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async (shouldRevise = false, shouldEdit = false) => {
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason');
      return;
    }

    try {
      await quotationAPI.reject(rejectingQuotation, rejectionReason);
      toast.success('Quotation rejected');
      setRejectDialogOpen(false);
      setRejectionReason('');
      
      if (shouldRevise) {
        // Revise the quotation
        setTimeout(async () => {
          try {
            const response = await quotationAPI.revise(rejectingQuotation);
            toast.success(`New quotation ${response.data.pfi_number} created from rejected quotation`);
            loadData();
          } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to revise quotation');
          }
        }, 500);
      } else if (shouldEdit) {
        // Edit the quotation
        setTimeout(async () => {
          try {
            const response = await quotationAPI.edit(rejectingQuotation);
            toast.success(`Quotation updated to ${response.data.pfi_number}. You can now edit it.`);
            loadData();
            // Open edit dialog
            const updatedQuotation = await quotationAPI.getOne(rejectingQuotation);
            handleEditClick(updatedQuotation.data);
          } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to edit quotation');
          }
        }, 500);
      } else {
        setRejectingQuotation(null);
        loadData();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reject');
    }
  };

  const handleRevise = async (id) => {
    try {
      const response = await quotationAPI.revise(id);
      toast.success(`New quotation ${response.data.pfi_number} created from rejected quotation`);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to revise quotation');
    }
  };

  const handleEdit = async (id) => {
    try {
      await quotationAPI.edit(id);
      toast.success('Quotation status changed to pending. You can now edit it.');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to edit quotation');
    }
  };

  const handleDownloadPDF = async (quotationId, pfiNumber) => {
    try {
      const token = localStorage.getItem('erp_token');
      const url = pdfAPI.getQuotationUrl(quotationId);
      
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
      link.download = `PFI_${pfiNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('PDF downloaded');
    } catch (error) {
      toast.error('Failed to download PDF');
    }
  };

  const resetForm = () => {
    setForm({
      customer_id: '',
      customer_name: '',
      currency: 'USD',
      order_type: 'local',
      incoterm: '',
      container_type: '',
      container_count: 1,
      port_of_loading: '',
      port_of_discharge: '',
      delivery_place: '',
      country_of_origin: 'UAE',
      country_of_destination: '',
      payment_terms: 'Cash',
      validity_days: 30,
      expected_delivery_date: '',
      notes: '',
      items: [],
      required_documents: DOCUMENT_TYPES.filter(d => d.defaultChecked).map(d => d.id),
      include_vat: true,
      bank_id: '',
      transport_mode: 'ocean',
      local_type: null,
      is_dg: false,
      additional_freight_rate_per_fcl: 0,
      additional_freight_currency: 'USD',
      cfr_amount: 0,
      additional_freight_amount: 0,
      total_receivable: 0,
    });
    setCurrentContainer(1);
  };

  const filteredQuotations = quotations.filter(q => 
    statusFilter === 'all' || q.status === statusFilter
  );

  return (
    <div className="page-container" data-testid="quotations-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">Quotations / PFI</h1>
          <p className="text-muted-foreground text-sm">Manage proforma invoices and quotations</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="new-quotation-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit Quotation / PFI' : 'Create Quotation / PFI'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Order Type Selection */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Order Type</Label>
                  <Select value={form.order_type} onValueChange={(v) => setForm({...form, order_type: v, incoterm: v === 'local' ? '' : form.incoterm})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Customer</Label>
                  <Select value={form.customer_id} onValueChange={handleCustomerChange}>
                    <SelectTrigger data-testid="customer-select">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({...form, currency: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Terms</Label>
                  <Select value={form.payment_terms} onValueChange={(v) => setForm({...form, payment_terms: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentTerms.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quotation Validity</Label>
                  <Select value={String(form.validity_days)} onValueChange={(v) => setForm({...form, validity_days: parseInt(v)})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VALIDITY_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Expected Delivery Date</Label>
                  <Input
                    type="date"
                    value={form.expected_delivery_date}
                    onChange={(e) => setForm({...form, expected_delivery_date: e.target.value})}
                    data-testid="expected-delivery-date-input"
                  />
                </div>
                <div>
                  <Label>Bank Account</Label>
                  <Select value={form.bank_id || undefined} onValueChange={(v) => setForm({...form, bank_id: v})} disabled={bankAccounts.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={bankAccounts.length === 0 ? "No banks configured" : "-- Select Bank --"} />
                    </SelectTrigger>
                    {bankAccounts.length > 0 && (
                      <SelectContent>
                        {bankAccounts.map(bank => (
                          <SelectItem key={bank.id} value={bank.id}>
                            {bank.bank_name} ({bank.account_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    )}
                  </Select>
                  {bankAccounts.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Configure banks in Settings</p>
                  )}
                </div>
              </div>

              {/* Export-specific fields */}
              {form.order_type === 'export' && (
                <div className="p-4 border border-cyan-500/30 rounded-lg bg-cyan-500/5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    Export Details
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Container Type</Label>
                      <Select value={form.container_type} onValueChange={(v) => {
                        setForm({...form, container_type: v});
                        // Regenerate packing_display if container_count_per_item is set
                        if (newItem.container_count_per_item > 0) {
                          const containerTypeDisplay = v === '40ft' ? '40 FCL' : 
                                                      v === '20ft' ? '20 FCL' : 
                                                      v.toUpperCase().replace('_', ' ');
                          setNewItem({
                            ...newItem,
                            packing_display: `${newItem.container_count_per_item}X ${containerTypeDisplay}`
                          });
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select container" />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTAINER_TYPES.map(c => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label} (Max {c.max_mt} MT)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Number of Containers</Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.container_count}
                        onChange={(e) => {
                          const newCount = parseInt(e.target.value) || 1;
                          setForm({...form, container_count: newCount});
                          // Reset current container if it exceeds new count
                          if (currentContainer > newCount) {
                            setCurrentContainer(newCount);
                          }
                        }}
                        placeholder="1"
                      />
                      {form.container_type && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Total Capacity: {(CONTAINER_TYPES.find(c => c.value === form.container_type)?.max_mt || 0) * form.container_count} MT
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Incoterm</Label>
                      <Select value={form.incoterm} onValueChange={(v) => setForm({...form, incoterm: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select incoterm" />
                        </SelectTrigger>
                        <SelectContent>
                          {INCOTERMS.map(i => (
                            <SelectItem key={i} value={i}>{i}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Country of Origin</Label>
                      <Select value={form.country_of_origin} onValueChange={(v) => setForm({...form, country_of_origin: v})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRIES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Country of Destination</Label>
                      <Input 
                        value={form.country_of_destination} 
                        onChange={(e) => setForm({...form, country_of_destination: e.target.value})}
                        placeholder="Enter country name"
                      />
                    </div>
                    <div>
                      <Label>Transport Mode</Label>
                      <Select value={form.transport_mode} onValueChange={(v) => setForm({...form, transport_mode: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Transport Mode" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ocean">Ocean</SelectItem>
                          <SelectItem value="road">Road</SelectItem>
                          <SelectItem value="air">Air</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.country_of_destination && (() => {
                        const countryLower = form.country_of_destination.trim().toLowerCase();
                        const gccCountries = ['Saudi Arabia', 'Bahrain', 'Kuwait', 'Oman', 'Qatar'];
                        const isGCC = gccCountries.some(gcc => gcc.toLowerCase() === countryLower);
                        return isGCC ? (
                          <p className="text-xs text-muted-foreground mt-1">GCC country - Road transport recommended</p>
                        ) : null;
                      })()}
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox 
                          checked={form.is_dg || false} 
                          onCheckedChange={(checked) => setForm({...form, is_dg: checked === true})}
                        />
                        <span className="text-sm">Dangerous Goods (DG)</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* Additional Freight Section (for CFR) */}
                  {form.incoterm === 'CFR' && (
                    <div className="mt-4 pt-4 border-t border-cyan-500/30">
                      <h4 className="font-medium text-sm mb-3 text-cyan-400 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        Additional Freight Charges (CFR)
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Freight Rate per FCL</Label>
                          <Input
                            type="number"
                            placeholder="e.g., 2175"
                            value={form.additional_freight_rate_per_fcl || ''}
                            onChange={(e) => setForm({...form, additional_freight_rate_per_fcl: parseFloat(e.target.value) || 0})}
                          />
                        </div>
                        <div>
                          <Label>Freight Currency</Label>
                          <Select value={form.additional_freight_currency} onValueChange={(v) => setForm({...form, additional_freight_currency: v})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CURRENCIES.map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Total Additional Freight</Label>
                          <div className="flex items-center h-10 px-3 border border-border rounded-md bg-muted/30">
                            <span className="font-mono text-sm">
                              {formatCurrency((form.additional_freight_rate_per_fcl || 0) * (form.container_count || 1), form.additional_freight_currency)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {form.container_count} FCL × {formatCurrency(form.additional_freight_rate_per_fcl || 0, form.additional_freight_currency)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Local-specific fields */}
              {form.order_type === 'local' && (
                <div className="p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    Local Delivery Details
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Incoterm</Label>
                      <Select value={form.incoterm} onValueChange={(v) => setForm({...form, incoterm: v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select incoterm" />
                        </SelectTrigger>
                        <SelectContent>
                          {INCOTERMS.map(i => (
                            <SelectItem key={i} value={i}>{i}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Point of Loading</Label>
                      <Input
                        value={form.port_of_loading}
                        onChange={(e) => setForm({...form, port_of_loading: e.target.value})}
                        placeholder="Loading location"
                      />
                    </div>
                    <div>
                      <Label>Local Type</Label>
                      <Select value={form.local_type || 'none'} onValueChange={(v) => setForm({...form, local_type: v === 'none' ? null : v})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="direct_to_customer">Direct to Customer</SelectItem>
                          <SelectItem value="bulk_to_plant">Bulk to Plant</SelectItem>
                          <SelectItem value="packaged_to_plant">Drum to Plant</SelectItem>
                          <SelectItem value="gcc_road_bulk">GCC by Road - Bulk</SelectItem>
                          <SelectItem value="gcc_road">GCC by Road</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Point of Discharge</Label>
                      <Input
                        value={form.port_of_discharge}
                        onChange={(e) => setForm({...form, port_of_discharge: e.target.value})}
                        placeholder="Discharge location"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox 
                          checked={form.include_vat} 
                          onCheckedChange={(checked) => setForm({...form, include_vat: checked})}
                        />
                        <span className="text-sm">Include 5% VAT</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Port/Loading for Export */}
              {form.order_type === 'export' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Port of Loading</Label>
                    <Input
                      value={form.port_of_loading}
                      onChange={(e) => setForm({...form, port_of_loading: e.target.value})}
                      placeholder="e.g., Jebel Ali Port"
                    />
                  </div>
                  <div>
                    <Label>Port of Discharge</Label>
                    <Input
                      value={form.port_of_discharge}
                      onChange={(e) => setForm({...form, port_of_discharge: e.target.value})}
                      placeholder="Destination port"
                    />
                  </div>
                </div>
              )}

              {/* Items Section */}
              <div className="border-t border-border pt-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Items by Container</h3>
                  {form.order_type === 'export' && form.container_count > 1 && (
                    <div className="flex gap-2 items-center">
                      <Label className="text-sm">Current Container:</Label>
                      <Select value={String(currentContainer)} onValueChange={(v) => setCurrentContainer(parseInt(v))}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({length: form.container_count}, (_, i) => i + 1).map(num => (
                            <SelectItem key={num} value={String(num)}>Container {num}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                
                {form.order_type === 'export' && (
                  <>
                    <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-4">
                      <p className="text-sm text-cyan-400">
                        Adding items to <strong>Container {currentContainer}</strong> of {form.container_count}
                      </p>
                    </div>
                    
                    {/* Container Capacity Status - Mixed Loading Support */}
                    {form.container_count > 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                        <p className="text-sm font-medium text-amber-400 mb-2">Container Capacity Status (Mixed Loading)</p>
                        <div className="space-y-2">
                          {calculateContainerCapacity().map(container => (
                            <div key={container.number} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant={container.number === currentContainer ? "default" : "outline"} 
                                  className={container.number === currentContainer ? "bg-cyan-500 hover:bg-cyan-600" : ""}
                                >
                                  Container {container.number}
                                </Badge>
                                <span className="text-muted-foreground">
                                  {container.usedMT.toFixed(2)} / {container.maxCapacityMT} MT
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${container.percentUsed > 90 ? 'bg-red-500' : container.percentUsed > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                                    style={{width: `${Math.min(container.percentUsed, 100)}%`}}
                                  ></div>
                                </div>
                                <span className={container.remainingMT > 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                                  {container.remainingMT.toFixed(2)} MT left
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {/* Column Headers */}
                <div className="grid grid-cols-9 gap-2 mb-2 text-xs text-muted-foreground font-medium">
                  <div className="col-span-2">Product</div>
                  <div>Quantity</div>
                  <div>U.O.M</div>
                  <div>Unit Price</div>
                  <div>Packaging</div>
                  <div>Net Wt (kg)</div>
                  <div>Palletized</div>
                  <div>Action</div>
                </div>
                
                {/* Input Row */}
                <div className="grid grid-cols-9 gap-2 mb-3">
                  <div className="col-span-2">
                    <Select value={newItem.product_id} onValueChange={handleProductSelect}>
                      <SelectTrigger data-testid="product-select">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={newItem.quantity || ''}
                    onChange={(e) => setNewItem({...newItem, quantity: parseFloat(e.target.value)})}
                  />
                  <Select 
                    value={newItem.uom || 'per_mt'} 
                    onValueChange={(v) => setNewItem({...newItem, uom: v})}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_unit">Per Unit</SelectItem>
                      <SelectItem value="per_liter">Per Liter</SelectItem>
                      <SelectItem value="per_mt">Per MT</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder={newItem.uom === 'per_unit' ? 'Price/Unit' : newItem.uom === 'per_liter' ? 'Price/Liter' : 'Price/MT'}
                    value={newItem.unit_price || ''}
                    onChange={(e) => setNewItem({...newItem, unit_price: parseFloat(e.target.value)})}
                  />
                  <Select value={newItem.packaging} onValueChange={handlePackagingChange}>
                    <SelectTrigger data-testid="packaging-select">
                      <SelectValue placeholder="Packaging" />
                    </SelectTrigger>
                    <SelectContent>
                      {packagingTypes.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newItem.packaging !== 'Bulk' ? (
                    newItem.availableNetWeights && newItem.availableNetWeights.length > 1 ? (
                      <Select 
                        value={newItem.net_weight_kg?.toString() || ''} 
                        onValueChange={(v) => setNewItem({...newItem, net_weight_kg: parseFloat(v)})}
                      >
                        <SelectTrigger className="placeholder:text-xs">
                          <SelectValue placeholder="Select Net Weight" />
                        </SelectTrigger>
                        <SelectContent>
                          {newItem.availableNetWeights.map((weight, idx) => (
                            <SelectItem key={idx} value={weight.toString()}>{weight} kg</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="number"
                        placeholder="Net Wt (kg)"
                        value={newItem.net_weight_kg || ''}
                        onChange={(e) => setNewItem({...newItem, net_weight_kg: parseFloat(e.target.value)})}
                        className="placeholder:text-xs"
                      />
                    )
                  ) : (
                    <div className="text-xs text-muted-foreground flex items-center">-</div>
                  )}
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="palletized"
                      checked={newItem.palletized || false}
                      onCheckedChange={(checked) => setNewItem({...newItem, palletized: checked === true})}
                    />
                    <Label htmlFor="palletized" className="text-xs cursor-pointer">
                      Palletized
                    </Label>
                  </div>
                  <Button type="button" variant="secondary" onClick={addItem} data-testid="add-item-btn">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {newItem.packaging !== 'Bulk' && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Net weight per unit (e.g., 200 kg per drum)
                  </p>
                )}
                
                {/* Export Details Section (shown for export orders) */}
                {form.order_type === 'export' && (
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-sm mb-3 text-amber-400">Export Details for Current Item</h4>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Number of Containers (Optional)</Label>
                        <Input
                          type="number"
                          placeholder="0 for mixed loading"
                          value={newItem.container_count_per_item || ''}
                          onChange={(e) => {
                            const count = parseInt(e.target.value) || 0;
                            handleContainerCountChange(count);
                          }}
                          className="text-sm"
                          min="0"
                          max={containerAllocation.remaining + (newItem.container_count_per_item || 0)}
                        />
                        {newItem.container_count_per_item > 0 ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            FCL: {newItem.container_count_per_item} × {form.container_type || '20ft'}
                          </p>
                        ) : (
                          <p className="text-xs text-green-400 mt-1">
                            Mixed loading to Container {currentContainer}
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Brand</Label>
                        <Input
                          placeholder="e.g., MOTRIX"
                          value={newItem.brand}
                          onChange={(e) => setNewItem({...newItem, brand: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Color</Label>
                        <Input
                          placeholder="e.g., BLUE"
                          value={newItem.color}
                          onChange={(e) => setNewItem({...newItem, color: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Quantity in Units</Label>
                        <Input
                          type="number"
                          placeholder="e.g., 8000"
                          value={newItem.quantity_in_units || ''}
                          onChange={(e) => setNewItem({...newItem, quantity_in_units: parseFloat(e.target.value)})}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Unit Type</Label>
                        <Select value={newItem.unit_type} onValueChange={(v) => setNewItem({...newItem, unit_type: v})}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CRTN">CARTONS (CRTN)</SelectItem>
                            <SelectItem value="PAILS">PAILS</SelectItem>
                            <SelectItem value="DRUMS">DRUMS</SelectItem>
                            <SelectItem value="BAGS">BAGS</SelectItem>
                            <SelectItem value="BOXES">BOXES</SelectItem>
                            <SelectItem value="IBC">IBC</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Detailed Packing</Label>
                        <Input
                          placeholder="e.g., PACKED IN 12X1 LTR CARTON"
                          value={newItem.detailed_packing}
                          onChange={(e) => setNewItem({...newItem, detailed_packing: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">FCL Breakdown</Label>
                        <Input
                          placeholder="e.g., TOTAL 1600 CARTONS/ 1X20 FCL"
                          value={newItem.fcl_breakdown}
                          onChange={(e) => setNewItem({...newItem, fcl_breakdown: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Packing Display</Label>
                        <Input
                          placeholder="e.g., 5X 20 FCL"
                          value={newItem.packing_display}
                          onChange={(e) => setNewItem({...newItem, packing_display: e.target.value})}
                          className="text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Country of Origin</Label>
                        <Select value={newItem.item_country_of_origin} onValueChange={(v) => setNewItem({...newItem, item_country_of_origin: v})}>
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRIES.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                  {form.items.length > 0 && (
                    <div className="data-grid">
                      <table className="erp-table w-full">
                        <thead>
                          <tr>
                            {form.order_type === 'export' && <th>Container</th>}
                            <th>Product</th>
                            {form.order_type === 'export' && <th>Brand</th>}
                            {form.order_type === 'export' && <th>Color</th>}
                            <th>Qty</th>
                            {form.order_type === 'export' && <th>Qty (Units)</th>}
                            {form.order_type === 'export' && <th>Containers</th>}
                            <th>Packaging</th>
                            {form.order_type === 'export' && <th>Packing</th>}
                            <th>Weight (MT)</th>
                            <th>Price/MT</th>
                            <th>Total</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.sort((a, b) => (a.container_number || 1) - (b.container_number || 1)).map((item, idx) => (
                            <tr key={idx}>
                              {form.order_type === 'export' && (
                                <td className="text-center">
                                  <Badge variant="outline" className="bg-cyan-500/20 text-cyan-400">
                                    #{item.container_number || 1}
                                  </Badge>
                                </td>
                              )}
                              <td>
                                <div>{item.product_name}</div>
                                {form.order_type === 'export' && item.detailed_packing && (
                                  <div className="text-xs text-muted-foreground mt-1">{item.detailed_packing}</div>
                                )}
                              </td>
                              {form.order_type === 'export' && <td>{item.brand || '-'}</td>}
                              {form.order_type === 'export' && <td>{item.color || '-'}</td>}
                              <td>{item.quantity}</td>
                              {form.order_type === 'export' && (
                                <td>
                                  {item.quantity_in_units ? `${item.quantity_in_units} ${item.unit_type}` : '-'}
                                </td>
                              )}
                              {form.order_type === 'export' && (
                                <td>
                                  {item.container_count_per_item > 0 ? (
                                    <Badge variant="outline" className="bg-cyan-500/20 text-cyan-400">
                                      {item.container_count_per_item} × {form.container_type || '20ft'}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </td>
                              )}
                              <td>
                                <div>{item.packaging}</div>
                                {form.order_type === 'export' && item.packing_display && (
                                  <div className="text-xs text-amber-400 mt-1">{item.packing_display}</div>
                                )}
                              </td>
                              {form.order_type === 'export' && (
                                <td className="text-xs">{item.fcl_breakdown || '-'}</td>
                              )}
                              <td className="font-mono">{item.weight_mt?.toFixed(3) || item.quantity}</td>
                              <td>{formatCurrency(item.unit_price, form.currency)}</td>
                              <td className="font-bold">{formatCurrency(item.total, form.currency)}</td>
                              <td>
                                <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="p-4 border-t border-border">
                        <div className="flex justify-between items-end">
                          <div className="text-sm text-muted-foreground">
                            Total Weight: <span className="font-mono font-medium">{totalWeightMT.toFixed(3)} MT</span>
                            {form.container_type && (
                              <span className="ml-2">
                                | Container Capacity: {CONTAINER_TYPES.find(c => c.value === form.container_type)?.max_mt || 0} MT
                              </span>
                            )}
                          </div>
                          <div className="text-right space-y-1">
                            <div className="flex justify-between gap-8">
                              <span className="text-sm text-muted-foreground">{form.order_type === 'export' && form.incoterm === 'CFR' ? 'CFR Amount (Product):' : 'Subtotal:'}</span>
                              <span className="font-mono">{formatCurrency(subtotal, form.currency)}</span>
                            </div>
                            {form.order_type === 'local' && form.include_vat && (
                              <div className="flex justify-between gap-8">
                                <span className="text-sm text-muted-foreground">VAT (5%):</span>
                                <span className="font-mono">{formatCurrency(vatAmount, form.currency)}</span>
                              </div>
                            )}
                            {form.order_type === 'export' && form.incoterm === 'CFR' && form.additional_freight_rate_per_fcl > 0 && (
                              <>
                                <div className="flex justify-between gap-8">
                                  <span className="text-sm text-muted-foreground">Additional Freight ({form.container_count} FCL × {formatCurrency(form.additional_freight_rate_per_fcl, form.additional_freight_currency)}):</span>
                                  <span className="font-mono">{formatCurrency(additionalFreight, form.additional_freight_currency)}</span>
                                </div>
                                <div className="flex justify-between gap-8 border-t pt-1">
                                  <span className="font-medium">Total Receivable (CFR + Freight):</span>
                                  <span className="text-xl font-bold font-mono">{formatCurrency(totalReceivable, form.currency)}</span>
                                </div>
                              </>
                            )}
                            {!(form.order_type === 'export' && form.incoterm === 'CFR' && form.additional_freight_rate_per_fcl > 0) && (
                              <div className="flex justify-between gap-8 border-t pt-1">
                                <span className="font-medium">Grand Total:</span>
                                <span className="text-xl font-bold font-mono">{formatCurrency(grandTotal, form.currency)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              {/* Required Documents */}
              <div className="border-t border-border pt-4">
                <h3 className="font-semibold mb-3">Documents that need to be submitted</h3>
                <div className="grid grid-cols-3 gap-2">
                  {DOCUMENT_TYPES.map(doc => (
                    <label key={doc.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/20 cursor-pointer">
                      <Checkbox 
                        checked={form.required_documents.includes(doc.id)} 
                        onCheckedChange={() => toggleDocument(doc.id)}
                      />
                      <span className="text-sm">{doc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Overweight Warning */}
              {isOverweight && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="text-red-400 font-medium">Max Cargo Exceeded!</p>
                    <p className="text-sm text-red-400/80">
                      Total weight ({totalWeightMT.toFixed(2)} MT) exceeds container capacity ({maxCargoCapacity} MT). 
                      Please increase the number of containers.
                    </p>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({...form, notes: e.target.value})}
                  placeholder="Additional notes..."
                  rows={2}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => {
                  setCreateOpen(false);
                  resetForm();
                  setIsEditMode(false);
                  setEditingQuotation(null);
                }}>Cancel</Button>
                <Button onClick={handleCreate} className="btn-primary" data-testid="create-quotation-submit">
                  {isEditMode ? 'Update Quotation' : 'Create Quotation'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quotations List */}
      <div className="data-grid">
        <div className="data-grid-header">
          <h3 className="font-medium">Quotations ({filteredQuotations.length})</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : filteredQuotations.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <p className="empty-state-title">No quotations found</p>
            <p className="empty-state-description">Create a new quotation to get started</p>
          </div>
        ) : (
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>PFI Number</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Country of Destination</th>
                <th>Total</th>
                <th>Cost Status</th>
                <th>Net Profit</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.map((q) => (
                <tr key={q.id} data-testid={`quotation-row-${q.pfi_number}`}>
                  <td className="font-medium">{q.pfi_number}</td>
                  <td>{q.customer_name}</td>
                  <td>
                    <Badge variant="outline" className={cn(
                      'text-xs',
                      q.order_type === 'export' ? 'border-cyan-500 text-cyan-400' : 'border-amber-500 text-amber-400'
                    )}>
                      {q.order_type?.toUpperCase()}
                    </Badge>
                  </td>
                  <td>
                    {q.country_of_destination ? (
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-400">
                        {q.country_of_destination}
                      </Badge>
                    ) : '-'}
                  </td>
                  <td className="font-mono">{formatCurrency(q.total, q.currency)}</td>
                  <td>
                    {q.cost_confirmed ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <Check className="w-3 h-3 mr-1 inline" />
                        Confirmed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        Pending
                      </Badge>
                    )}
                  </td>
                  <td>
                    {q.margin_amount !== undefined && q.margin_amount !== null ? (
                      <Badge variant={q.margin_amount >= 0 ? 'default' : 'destructive'} className="font-mono text-xs">
                        {q.margin_amount >= 0 ? '+' : ''}{formatCurrency(q.margin_amount, q.currency)}
                        {q.margin_percentage !== undefined && q.margin_percentage !== null && (
                          <span className="ml-1">({q.margin_percentage.toFixed(1)}%)</span>
                        )}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  <td>
                    <Badge className={getStatusColor(q.status)}>
                      {q.status?.toUpperCase()}
                    </Badge>
                    {q.costing_rejection_reason && (
                      <p className="text-xs text-red-400 mt-1">{q.costing_rejection_reason}</p>
                    )}
                  </td>
                  <td>{formatDate(q.created_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => navigate(`/quotations/view/${q.id}`)}
                        title="View Full Page"
                      >
                        <FileText className="w-4 h-4 text-blue-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedQuotation(q); setViewOpen(true); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadPDF(q.id, q.pfi_number)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      {q.status === 'pending' && hasPagePermission(user, '/quotations', ['admin', 'finance']) && (
                        <>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleApprove(q.id)}
                            disabled={approving === q.id || !q.cost_confirmed}
                            title={!q.cost_confirmed ? "Costing must be confirmed before approval" : "Approve"}
                            data-testid={`approve-btn-${q.pfi_number}`}
                          >
                            <Check className={cn("w-4 h-4 text-green-500", approving === q.id && "animate-spin", !q.cost_confirmed && "opacity-50")} />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleReject(q.id)}>
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </>
                      )}
                      {(q.status === 'pending' || q.status === 'rejected') && hasPagePermission(user, '/quotations', ['admin', 'finance', 'sales']) && (
                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(q)} title="Edit quotation">
                          <Edit className="w-4 h-4 text-blue-500" />
                        </Button>
                      )}
                      {q.status === 'rejected' && hasPagePermission(user, '/quotations', ['admin', 'finance', 'sales']) && (
                        <Button variant="ghost" size="icon" onClick={() => handleRevise(q.id)} title="Create new revision">
                          <RefreshCw className="w-4 h-4 text-purple-500" />
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
            <div className="flex justify-between items-center">
              <DialogTitle>Quotation Details - {selectedQuotation?.pfi_number}</DialogTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const token = localStorage.getItem('erp_token');
                    const baseUrl = pdfAPI.getQuotationUrl(selectedQuotation.id, false);
                    const url = token ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : baseUrl;
                    window.open(url, '_blank');
                  }}
                >
                  <Download className="w-4 h-4 mr-1" /> View PDF
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    const token = localStorage.getItem('erp_token');
                    const baseUrl = pdfAPI.getQuotationUrl(selectedQuotation.id, true);
                    const url = token ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : baseUrl;
                    window.open(url, '_blank');
                  }}
                >
                  <Download className="w-4 h-4 mr-1" /> Print PDF
                </Button>
              </div>
            </div>
          </DialogHeader>
          {selectedQuotation && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-medium">{selectedQuotation.customer_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Order Type:</span>
                  <p className="font-medium">{selectedQuotation.order_type?.toUpperCase()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={getStatusColor(selectedQuotation.status)}>
                    {selectedQuotation.status?.toUpperCase()}
                  </Badge>
                </div>
                {selectedQuotation.container_type && (
                  <div>
                    <span className="text-muted-foreground">Container:</span>
                    <p className="font-medium">{selectedQuotation.container_type}</p>
                  </div>
                )}
                {selectedQuotation.incoterm && (
                  <div>
                    <span className="text-muted-foreground">Incoterm:</span>
                    <p className="font-medium">{selectedQuotation.incoterm}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Payment Terms:</span>
                  <p className="font-medium">{selectedQuotation.payment_terms}</p>
                </div>
              </div>

              {/* Items by Container for Export Orders */}
              {selectedQuotation.order_type === 'export' && selectedQuotation.container_count > 1 ? (
                <>
                  {Array.from({length: selectedQuotation.container_count}, (_, i) => i + 1).map(containerNum => {
                    const containerItems = selectedQuotation.items?.filter(item => (item.container_number || 1) === containerNum) || [];
                    if (containerItems.length === 0) return null;
                    
                    return (
                      <div key={containerNum} className="mb-4">
                        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-t-lg px-4 py-2">
                          <h4 className="font-medium text-cyan-400">Container {containerNum}</h4>
                        </div>
                        <div className="data-grid rounded-t-none">
                          <table className="erp-table w-full">
                            <thead>
                              <tr>
                                <th>S.No</th>
                                <th>Description of Goods</th>
                                <th>Container/Tank</th>
                                <th>Qty</th>
                                <th>{(() => {
                                  const firstItem = containerItems[0];
                                  let uom = firstItem?.uom || 'per_mt';
                                  
                                  // If U.O.M is not set, try to infer from packaging (only if not explicitly set)
                                  if (!firstItem?.uom) {
                                    const packaging = (firstItem?.packaging || '').toLowerCase();
                                    const packagingType = (firstItem?.packaging_type || '').toLowerCase();
                                    
                                    if (['drum', 'carton', 'pail', 'ibc', 'bag', 'box'].some(keyword => packaging.includes(keyword))) {
                                      uom = 'per_unit';
                                    } else if (['drum', 'carton', 'pail', 'ibc'].some(keyword => packagingType.includes(keyword))) {
                                      uom = 'per_unit';
                                    } else if (['flexi', 'iso', 'tank'].some(keyword => packaging.includes(keyword))) {
                                      uom = 'per_liter';
                                    } else if (packaging === 'bulk' || packagingType === 'bulk') {
                                      uom = 'per_mt';
                                    }
                                  }
                                  
                                  if (uom === 'per_unit') return 'Unit Price Per Unit';
                                  if (uom === 'per_liter') return 'Unit Price Per Liter';
                                  return 'Unit Price Per MT';
                                })()}</th>
                                <th>Grand Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {containerItems.map((item, idx) => {
                                // Get U.O.M from item, or infer from packaging type
                                let uom = item.uom || 'per_mt';
                                
                                // If U.O.M is not set, try to infer from packaging (only if not explicitly set)
                                if (!item.uom) {
                                  const packaging = (item.packaging || '').toLowerCase();
                                  const packagingType = (item.packaging_type || '').toLowerCase();
                                  
                                  // Infer U.O.M from packaging
                                  if (['drum', 'carton', 'pail', 'ibc', 'bag', 'box'].some(keyword => packaging.includes(keyword))) {
                                    uom = 'per_unit';
                                  } else if (['drum', 'carton', 'pail', 'ibc'].some(keyword => packagingType.includes(keyword))) {
                                    uom = 'per_unit';
                                  } else if (['flexi', 'iso', 'tank'].some(keyword => packaging.includes(keyword))) {
                                    uom = 'per_liter';
                                  } else if (packaging === 'bulk' || packagingType === 'bulk') {
                                    uom = 'per_mt';
                                  }
                                }
                                
                                // Format quantity based on U.O.M
                                let qtyDisplay = '';
                                if (uom === 'per_unit') {
                                  qtyDisplay = `${parseInt(item.quantity || 0).toLocaleString()} ${item.unit_type || ''}`;
                                } else if (uom === 'per_liter') {
                                  qtyDisplay = `${(item.quantity || 0).toLocaleString()} L`;
                                } else {
                                  qtyDisplay = `${item.weight_mt?.toFixed(3) || item.quantity} MT`;
                                }
                                
                                // Get container display
                                const containerCount = item.container_count_per_item || 0;
                                const containerType = selectedQuotation.container_type || '20ft';
                                const containerDisplay = containerCount > 0 
                                  ? `${containerCount} x ${containerType}` 
                                  : (item.packing_display || '—');
                                
                                return (
                                  <tr key={idx}>
                                    <td className="text-center">{idx + 1}</td>
                                    <td>
                                      <div className="font-medium">{item.product_name}</div>
                                      {item.packaging && (
                                        <div className="text-xs text-muted-foreground mt-1"><b>Packing:</b> {item.packaging}</div>
                                      )}
                                      {item.net_weight_kg && (
                                        <div className="text-xs text-muted-foreground"><b>Net weight:</b> {item.net_weight_kg} kg</div>
                                      )}
                                      {item.item_country_of_origin && (
                                        <div className="text-xs text-muted-foreground"><b>Country of origin:</b> {item.item_country_of_origin}</div>
                                      )}
                                      {item.detailed_packing && (
                                        <div className="text-xs text-muted-foreground mt-1">{item.detailed_packing}</div>
                                      )}
                                      {item.fcl_breakdown && (
                                        <div className="text-xs text-muted-foreground mt-1">{item.fcl_breakdown}</div>
                                      )}
                                      {item.brand && (
                                        <div className="text-xs mt-1">BRAND: {item.brand}</div>
                                      )}
                                      {item.color && (
                                        <div className="text-xs">COLOR: {item.color}</div>
                                      )}
                                    </td>
                                    <td>{containerDisplay}</td>
                                    <td>{qtyDisplay}</td>
                                    <td>{formatCurrency(item.unit_price, selectedQuotation.currency)}</td>
                                    <td className="font-bold">{formatCurrency(item.total, selectedQuotation.currency)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="data-grid">
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <th>Description of Goods</th>
                        {selectedQuotation.order_type === 'export' && <th>Container/Tank</th>}
                        <th>Qty</th>
                        <th>{(() => {
                          const firstItem = selectedQuotation.items?.[0];
                          let uom = firstItem?.uom || 'per_mt';
                          
                          // If U.O.M is not set, try to infer from packaging (only if not explicitly set)
                          if (!firstItem?.uom) {
                            const packaging = (firstItem?.packaging || '').toLowerCase();
                            const packagingType = (firstItem?.packaging_type || '').toLowerCase();
                            
                            if (['drum', 'carton', 'pail', 'ibc', 'bag', 'box'].some(keyword => packaging.includes(keyword))) {
                              uom = 'per_unit';
                            } else if (['drum', 'carton', 'pail', 'ibc'].some(keyword => packagingType.includes(keyword))) {
                              uom = 'per_unit';
                            } else if (['flexi', 'iso', 'tank'].some(keyword => packaging.includes(keyword))) {
                              uom = 'per_liter';
                            } else if (packaging === 'bulk' || packagingType === 'bulk') {
                              uom = 'per_mt';
                            }
                          }
                          
                          if (uom === 'per_unit') return 'Unit Price Per Unit';
                          if (uom === 'per_liter') return 'Unit Price Per Liter';
                          return 'Unit Price';
                        })()}</th>
                        <th>Grand Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedQuotation.items?.map((item, idx) => {
                        // Get U.O.M from item, or infer from packaging type
                        let uom = item.uom || 'per_mt';
                        
                        // If U.O.M is not set, try to infer from packaging (only if not explicitly set)
                        if (!item.uom) {
                          const packaging = (item.packaging || '').toLowerCase();
                          const packagingType = (item.packaging_type || '').toLowerCase();
                          
                          // Infer U.O.M from packaging
                          if (['drum', 'carton', 'pail', 'ibc', 'bag', 'box'].some(keyword => packaging.includes(keyword))) {
                            uom = 'per_unit';
                          } else if (['drum', 'carton', 'pail', 'ibc'].some(keyword => packagingType.includes(keyword))) {
                            uom = 'per_unit';
                          } else if (['flexi', 'iso', 'tank'].some(keyword => packaging.includes(keyword))) {
                            uom = 'per_liter';
                          } else if (packaging === 'bulk' || packagingType === 'bulk') {
                            uom = 'per_mt';
                          }
                        }
                        
                        // Format quantity based on U.O.M
                        let qtyDisplay = '';
                        if (uom === 'per_unit') {
                          qtyDisplay = parseInt(item.quantity || 0).toLocaleString();
                        } else if (uom === 'per_liter') {
                          qtyDisplay = (item.quantity || 0).toLocaleString();
                        } else {
                          qtyDisplay = `${item.weight_mt?.toFixed(3) || item.quantity} MT`;
                        }
                        
                        // Get container display for export orders
                        let containerDisplay = '—';
                        if (selectedQuotation.order_type === 'export') {
                          const containerCount = item.container_count_per_item || 0;
                          const containerType = selectedQuotation.container_type || '20ft';
                          if (containerCount > 0) {
                            containerDisplay = `${containerCount} x ${containerType}`;
                          } else {
                            containerDisplay = item.packing_display || '—';
                          }
                        }
                        
                        return (
                          <tr key={idx}>
                            <td>
                              <div className="font-medium">{item.product_name}</div>
                              {item.packaging && (
                                <div className="text-xs text-muted-foreground mt-1"><b>Packing:</b> {item.packaging}</div>
                              )}
                              {item.net_weight_kg && (
                                <div className="text-xs text-muted-foreground"><b>Net weight:</b> {item.net_weight_kg} kg</div>
                              )}
                              {item.item_country_of_origin && (
                                <div className="text-xs text-muted-foreground"><b>Country of origin:</b> {item.item_country_of_origin}</div>
                              )}
                            </td>
                            {selectedQuotation.order_type === 'export' && <td>{containerDisplay}</td>}
                            <td>{qtyDisplay}</td>
                            <td>{formatCurrency(item.unit_price, selectedQuotation.currency)}</td>
                            <td className="font-bold">{formatCurrency(item.total, selectedQuotation.currency)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="text-right space-y-1 p-4 bg-muted/20 rounded">
                <div>{selectedQuotation.order_type === 'export' && selectedQuotation.incoterm === 'CFR' ? 'CFR Amount:' : 'Subtotal:'} <span className="font-mono">{formatCurrency(selectedQuotation.cfr_amount || selectedQuotation.subtotal, selectedQuotation.currency)}</span></div>
                {selectedQuotation.vat_amount > 0 && (
                  <div>VAT (5%): <span className="font-mono">{formatCurrency(selectedQuotation.vat_amount, selectedQuotation.currency)}</span></div>
                )}
                {selectedQuotation.order_type === 'export' && selectedQuotation.incoterm === 'CFR' && selectedQuotation.additional_freight_amount > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground border-t pt-1">
                      Additional Freight: {selectedQuotation.container_count} FCL × {formatCurrency(selectedQuotation.additional_freight_rate_per_fcl || 0, selectedQuotation.additional_freight_currency)} = <span className="font-mono">{formatCurrency(selectedQuotation.additional_freight_amount, selectedQuotation.additional_freight_currency)}</span>
                    </div>
                    <div className="text-lg font-bold border-t pt-1">Total Receivable: <span className="font-mono">{formatCurrency(selectedQuotation.total_receivable || selectedQuotation.total, selectedQuotation.currency)}</span></div>
                  </>
                )}
                {!(selectedQuotation.order_type === 'export' && selectedQuotation.incoterm === 'CFR' && selectedQuotation.additional_freight_amount > 0) && (
                  <div className="text-lg font-bold">Total: <span className="font-mono">{formatCurrency(selectedQuotation.total, selectedQuotation.currency)}</span></div>
                )}
              </div>

              {selectedQuotation.required_documents?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Required Documents:</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedQuotation.required_documents.map(docId => {
                      const doc = DOCUMENT_TYPES.find(d => d.id === docId);
                      return doc ? (
                        <Badge key={docId} variant="outline">{doc.label}</Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              {/* Rejection Reason */}
              {selectedQuotation.status === 'rejected' && selectedQuotation.rejection_reason && (
                <div className="border-t border-border pt-4">
                  <h4 className="font-medium mb-2 text-red-400">Rejection Reason:</h4>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <p className="text-sm">{selectedQuotation.rejection_reason}</p>
                    {selectedQuotation.rejected_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Rejected on: {formatDate(selectedQuotation.rejected_at)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Bank Details */}
              {selectedQuotation.bank_id && (() => {
                const selectedBank = bankAccounts.find(b => b.id === selectedQuotation.bank_id);
                return selectedBank ? (
                  <div className="border-t border-border pt-4">
                    <h4 className="font-medium mb-3">Bank Details:</h4>
                    <div className="bg-muted/20 rounded-lg p-4 space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Beneficiary Name:</span>
                        <p className="font-medium">Asia Petrochemicals LLC</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bank Name:</span>
                        <p className="font-medium">{selectedBank.bank_name}</p>
                      </div>
                      {selectedBank.branch_address && (
                        <div>
                          <span className="text-muted-foreground">Branch Address:</span>
                          <p className="font-medium">{selectedBank.branch_address}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Account Type:</span>
                        <p className="font-medium">{selectedBank.account_type}</p>
                      </div>
                      {selectedBank.iban && (
                        <div>
                          <span className="text-muted-foreground">IBAN:</span>
                          <p className="font-mono font-medium">{selectedBank.iban}</p>
                        </div>
                      )}
                      {selectedBank.swift && (
                        <div>
                          <span className="text-muted-foreground">SWIFT:</span>
                          <p className="font-mono font-medium">{selectedBank.swift}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Quotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter the reason for rejecting this quotation..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                After rejecting, you can choose to revise or edit this quotation.
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setRejectDialogOpen(false);
                    setRejectionReason('');
                    setRejectingQuotation(null);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => handleConfirmReject(false, false)}
                  disabled={!rejectionReason.trim()}
                >
                  Reject Only
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleConfirmReject(true, false)}
                  disabled={!rejectionReason.trim()}
                >
                  Reject & Revise
                </Button>
                <Button 
                  variant="default" 
                  onClick={() => handleConfirmReject(false, true)}
                  disabled={!rejectionReason.trim()}
                >
                  Reject & Edit
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
