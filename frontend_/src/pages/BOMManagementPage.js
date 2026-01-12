import React, { useState, useEffect } from 'react';
import { productAPI, inventoryItemAPI, packagingAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { 
  FileStack, Plus, Trash2, Save, Package, Layers, 
  ChevronDown, ChevronRight, Edit2, Check, X 
} from 'lucide-react';
import api from '../lib/api';

// BOM Management Page - Predefine BOMs for Products and Packaging
const BOMManagementPage = () => {
  const [products, setProducts] = useState([]);
  const [packagingList, setPackagingList] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('product');
  
  // Product BOM state
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productBOMs, setProductBOMs] = useState([]);
  const [showAddBOM, setShowAddBOM] = useState(false);
  
  // Packaging BOM state
  const [selectedPackaging, setSelectedPackaging] = useState(null);
  const [packagingBOMs, setPackagingBOMs] = useState([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [productsRes, packagingRes, rawItemsRes, packItemsRes, rawProductsRes] = await Promise.all([
        productAPI.getAll('finished_product'),
        packagingAPI.getAll(),
        inventoryItemAPI.getAll('RAW'),
        inventoryItemAPI.getAll('PACK'),
        productAPI.getAll('raw_material')
      ]);
      // Filter out trading products - only show manufacturing products
      const allProducts = productsRes.data || [];
      const manufacturingProducts = allProducts.filter(p => p.type !== 'TRADED' && (!p.type || p.type === 'MANUFACTURED'));
      setProducts(manufacturingProducts);
      setPackagingList(packagingRes.data || []);
      
      // Combine inventory items and raw material products
      const rawProducts = (rawProductsRes.data || []).map(p => ({
        ...p,
        item_type: 'RAW',
        // Use product fields mapped to inventory item fields
        name: p.name,
        sku: p.sku
      }));
      
      setInventoryItems([
        ...(rawItemsRes.data || []),
        ...rawProducts,
        ...(packItemsRes.data || [])
      ]);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadProductBOMs = async (productId) => {
    try {
      const res = await api.get(`/product-boms/${productId}`);
      setProductBOMs(res.data || []);
    } catch (error) {
      setProductBOMs([]);
    }
  };

  const loadPackagingBOMs = async (packagingId) => {
    try {
      const res = await api.get(`/packaging-boms/${packagingId}`);
      setPackagingBOMs(res.data || []);
    } catch (error) {
      setPackagingBOMs([]);
    }
  };

  const selectProduct = async (product) => {
    setSelectedProduct(product);
    await loadProductBOMs(product.id);
  };

  const selectPackaging = async (pkg) => {
    setSelectedPackaging(pkg);
    await loadPackagingBOMs(pkg.id);
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto" data-testid="bom-management-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileStack className="w-8 h-8 text-indigo-500" />
          BOM Management
        </h1>
        <p className="text-muted-foreground mt-1">Define Bill of Materials for Products and Packaging</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Button
          variant={activeTab === 'product' ? 'default' : 'outline'}
          onClick={() => setActiveTab('product')}
          data-testid="tab-product-bom"
        >
          <Layers className="w-4 h-4 mr-2" />
          Product BOMs
        </Button>
        <Button
          variant={activeTab === 'packaging' ? 'default' : 'outline'}
          onClick={() => setActiveTab('packaging')}
          data-testid="tab-packaging-bom"
        >
          <Package className="w-4 h-4 mr-2" />
          Packaging BOMs
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Left Panel - Selection List */}
          <div className="col-span-1">
            {activeTab === 'product' ? (
              <ProductSelectionList 
                products={products} 
                selectedProduct={selectedProduct}
                onSelect={selectProduct}
              />
            ) : (
              <PackagingSelectionList 
                packagingList={packagingList}
                selectedPackaging={selectedPackaging}
                onSelect={selectPackaging}
              />
            )}
          </div>

          {/* Right Panel - BOM Details */}
          <div className="col-span-2">
            {activeTab === 'product' ? (
              selectedProduct ? (
                <ProductBOMPanel 
                  product={selectedProduct}
                  boms={productBOMs}
                  inventoryItems={inventoryItems.filter(i => i.item_type === 'RAW')}
                  onRefresh={() => loadProductBOMs(selectedProduct.id)}
                />
              ) : (
                <EmptySelection message="Select a product to manage its BOM" />
              )
            ) : (
              selectedPackaging ? (
                <PackagingBOMPanel 
                  packaging={selectedPackaging}
                  boms={packagingBOMs}
                  inventoryItems={inventoryItems.filter(i => i.item_type === 'PACK')}
                  onRefresh={() => loadPackagingBOMs(selectedPackaging.id)}
                />
              ) : (
                <EmptySelection message="Select a packaging type to manage its BOM" />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Product Selection List Component
const ProductSelectionList = ({ products, selectedProduct, onSelect }) => {
  const [search, setSearch] = useState('');
  
  const filtered = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold mb-2">Products</h3>
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm"
        />
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">No products found</div>
        ) : (
          filtered.map(product => (
            <div
              key={product.id}
              onClick={() => onSelect(product)}
              className={`p-3 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${
                selectedProduct?.id === product.id ? 'bg-indigo-500/10 border-l-4 border-l-indigo-500' : ''
              }`}
              data-testid={`product-item-${product.sku}`}
            >
              <div className="font-medium text-sm">{product.name}</div>
              <div className="text-xs text-muted-foreground">{product.sku}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Packaging Selection List Component
const PackagingSelectionList = ({ packagingList, selectedPackaging, onSelect }) => {
  const [search, setSearch] = useState('');
  
  const filtered = packagingList.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold mb-2">Packaging Types</h3>
        <Input
          placeholder="Search packaging..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm"
        />
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">No packaging found</div>
        ) : (
          filtered.map(pkg => (
            <div
              key={pkg.id}
              onClick={() => onSelect(pkg)}
              className={`p-3 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${
                selectedPackaging?.id === pkg.id ? 'bg-cyan-500/10 border-l-4 border-l-cyan-500' : ''
              }`}
              data-testid={`packaging-item-${pkg.id}`}
            >
              <div className="font-medium text-sm">{pkg.name}</div>
              <div className="text-xs text-muted-foreground">
                {pkg.category} • {pkg.capacity_liters}L
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Empty Selection Component
const EmptySelection = ({ message }) => (
  <div className="glass rounded-lg border border-border p-8 text-center">
    <FileStack className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
    <p className="text-muted-foreground">{message}</p>
  </div>
);

// Product BOM Panel Component
const ProductBOMPanel = ({ product, boms, inventoryItems, onRefresh }) => {
  const [showCreateBOM, setShowCreateBOM] = useState(false);
  const [expandedBOM, setExpandedBOM] = useState(null);

  const handleCreateBOM = async (bomData) => {
    try {
      // Create BOM header
      const bomRes = await api.post('/product-boms', {
        product_id: product.id,
        version: (boms.length || 0) + 1,
        is_active: bomData.is_active,
        notes: bomData.notes
      });
      
      // Create BOM items
      for (const item of bomData.items) {
        await api.post('/product-bom-items', {
          bom_id: bomRes.data.id,
          material_item_id: item.material_item_id,
          qty_kg_per_kg_finished: item.qty_kg_per_kg_finished
        });
      }
      
      toast.success('Product BOM created');
      setShowCreateBOM(false);
      onRefresh();
    } catch (error) {
      toast.error('Failed to create BOM: ' + (error.response?.data?.detail || error.message));
    }
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h3 className="font-semibold">{product.name}</h3>
          <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
        </div>
        <Button onClick={() => setShowCreateBOM(true)} className="bg-indigo-500 hover:bg-indigo-600">
          <Plus className="w-4 h-4 mr-2" />
          New BOM Version
        </Button>
      </div>

      <div className="p-4">
        {boms.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No BOMs defined for this product</p>
            <p className="text-sm">Create a BOM to define raw materials needed for production</p>
          </div>
        ) : (
          <div className="space-y-4">
            {boms.map(bom => (
              <BOMCard 
                key={bom.id} 
                bom={bom} 
                type="product"
                expanded={expandedBOM === bom.id}
                onToggle={() => setExpandedBOM(expandedBOM === bom.id ? null : bom.id)}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create BOM Modal */}
      {showCreateBOM && (
        <CreateProductBOMModal
          inventoryItems={inventoryItems}
          onClose={() => setShowCreateBOM(false)}
          onSave={handleCreateBOM}
        />
      )}
    </div>
  );
};

// Packaging BOM Panel Component
const PackagingBOMPanel = ({ packaging, boms, inventoryItems, onRefresh }) => {
  const [showCreateBOM, setShowCreateBOM] = useState(false);
  const [expandedBOM, setExpandedBOM] = useState(null);

  const handleCreateBOM = async (bomData) => {
    try {
      // Create BOM header
      const bomRes = await api.post('/packaging-boms', {
        packaging_id: packaging.id,
        is_active: bomData.is_active
      });
      
      // Create BOM items
      for (const item of bomData.items) {
        await api.post('/packaging-bom-items', {
          packaging_bom_id: bomRes.data.id,
          pack_item_id: item.pack_item_id,
          qty_per_drum: item.qty_per_drum,
          uom: item.uom
        });
      }
      
      toast.success('Packaging BOM created');
      setShowCreateBOM(false);
      onRefresh();
    } catch (error) {
      toast.error('Failed to create BOM: ' + (error.response?.data?.detail || error.message));
    }
  };

  return (
    <div className="glass rounded-lg border border-border">
      <div className="p-4 border-b border-border flex justify-between items-center">
        <div>
          <h3 className="font-semibold">{packaging.name}</h3>
          <p className="text-sm text-muted-foreground">
            {packaging.category} • {packaging.capacity_liters}L • {packaging.material_type}
          </p>
        </div>
        <Button onClick={() => setShowCreateBOM(true)} className="bg-cyan-500 hover:bg-cyan-600">
          <Plus className="w-4 h-4 mr-2" />
          New Packaging BOM
        </Button>
      </div>

      <div className="p-4">
        {boms.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No BOMs defined for this packaging</p>
            <p className="text-sm">Create a BOM to define packaging materials per drum</p>
          </div>
        ) : (
          <div className="space-y-4">
            {boms.map(bom => (
              <BOMCard 
                key={bom.id} 
                bom={bom} 
                type="packaging"
                expanded={expandedBOM === bom.id}
                onToggle={() => setExpandedBOM(expandedBOM === bom.id ? null : bom.id)}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create BOM Modal */}
      {showCreateBOM && (
        <CreatePackagingBOMModal
          inventoryItems={inventoryItems}
          onClose={() => setShowCreateBOM(false)}
          onSave={handleCreateBOM}
        />
      )}
    </div>
  );
};

// BOM Card Component
const BOMCard = ({ bom, type, expanded, onToggle, onRefresh }) => {
  const handleSetActive = async () => {
    try {
      if (type === 'product') {
        await api.put(`/product-boms/${bom.id}/activate`);
      } else {
        await api.put(`/packaging-boms/${bom.id}/activate`);
      }
      toast.success('BOM activated');
      onRefresh();
    } catch (error) {
      toast.error('Failed to activate BOM');
    }
  };

  return (
    <div className={`border rounded-lg ${bom.is_active ? 'border-green-500/50 bg-green-500/5' : 'border-border'}`}>
      <div 
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/10"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {type === 'product' ? `Version ${bom.version}` : 'Active BOM'}
              </span>
              {bom.is_active && (
                <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">ACTIVE</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {bom.items?.length || 0} items • Created: {new Date(bom.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        {!bom.is_active && (
          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleSetActive(); }}>
            Set Active
          </Button>
        )}
      </div>

      {expanded && bom.items && (
        <div className="border-t border-border/50 p-3">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left py-1">Material</th>
                <th className="text-left py-1">SKU</th>
                <th className="text-right py-1">
                  {type === 'product' ? 'Qty/KG Finished' : 'Qty/Drum'}
                </th>
                <th className="text-right py-1">UOM</th>
              </tr>
            </thead>
            <tbody>
              {bom.items.map((item, idx) => (
                <tr key={idx} className="border-t border-border/30">
                  <td className="py-2">{item.material_name || item.pack_item_name || 'Unknown'}</td>
                  <td className="py-2 text-muted-foreground">{item.material_sku || item.pack_item_sku || '-'}</td>
                  <td className="py-2 text-right font-mono">
                    {type === 'product' 
                      ? item.qty_kg_per_kg_finished?.toFixed(4)
                      : item.qty_per_drum?.toFixed(2)
                    }
                  </td>
                  <td className="py-2 text-right">{item.uom || 'KG'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Create Product BOM Modal
const CreateProductBOMModal = ({ inventoryItems, onClose, onSave }) => {
  const [items, setItems] = useState([{ material_item_id: '', qty_kg_per_kg_finished: '' }]);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const addItem = () => {
    setItems([...items, { material_item_id: '', qty_kg_per_kg_finished: '' }]);
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    const newItems = [...items];
    newItems[idx][field] = value;
    setItems(newItems);
  };

  const handleSubmit = () => {
    const validItems = items.filter(i => i.material_item_id && i.qty_kg_per_kg_finished);
    if (validItems.length === 0) {
      toast.error('Add at least one material');
      return;
    }
    setSubmitting(true);
    onSave({
      is_active: isActive,
      notes,
      items: validItems.map(i => ({
        material_item_id: i.material_item_id,
        qty_kg_per_kg_finished: parseFloat(i.qty_kg_per_kg_finished)
      }))
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Create Product BOM</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Set as Active BOM</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this BOM version"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Raw Materials</label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3 h-3 mr-1" /> Add Material
              </Button>
            </div>
            
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={item.material_item_id}
                    onChange={(e) => updateItem(idx, 'material_item_id', e.target.value)}
                    className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select Material</option>
                    {inventoryItems.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="0.0001"
                    placeholder="Qty/KG"
                    value={item.qty_kg_per_kg_finished}
                    onChange={(e) => updateItem(idx, 'qty_kg_per_kg_finished', e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground w-20">KG/KG</span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Enter quantity of raw material (in KG) needed per 1 KG of finished product
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-indigo-500 hover:bg-indigo-600">
            <Save className="w-4 h-4 mr-2" />
            {submitting ? 'Saving...' : 'Save BOM'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Create Packaging BOM Modal
const CreatePackagingBOMModal = ({ inventoryItems, onClose, onSave }) => {
  const [items, setItems] = useState([{ pack_item_id: '', qty_per_drum: '', uom: 'EA' }]);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const addItem = () => {
    setItems([...items, { pack_item_id: '', qty_per_drum: '', uom: 'EA' }]);
  };

  const removeItem = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    const newItems = [...items];
    newItems[idx][field] = value;
    setItems(newItems);
  };

  const handleSubmit = () => {
    const validItems = items.filter(i => i.pack_item_id && i.qty_per_drum);
    if (validItems.length === 0) {
      toast.error('Add at least one packaging item');
      return;
    }
    setSubmitting(true);
    onSave({
      is_active: isActive,
      items: validItems.map(i => ({
        pack_item_id: i.pack_item_id,
        qty_per_drum: parseFloat(i.qty_per_drum),
        uom: i.uom
      }))
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Create Packaging BOM</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Set as Active BOM</span>
            </label>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium">Packaging Materials</label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </Button>
            </div>
            
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={item.pack_item_id}
                    onChange={(e) => updateItem(idx, 'pack_item_id', e.target.value)}
                    className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select Packaging Item</option>
                    {inventoryItems.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Qty"
                    value={item.qty_per_drum}
                    onChange={(e) => updateItem(idx, 'qty_per_drum', e.target.value)}
                    className="w-24"
                  />
                  <select
                    value={item.uom}
                    onChange={(e) => updateItem(idx, 'uom', e.target.value)}
                    className="w-20 bg-background border border-border rounded px-2 py-2 text-sm"
                  >
                    <option value="EA">EA</option>
                    <option value="KG">KG</option>
                  </select>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Enter quantity of packaging material needed per drum/unit
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-cyan-500 hover:bg-cyan-600">
            <Save className="w-4 h-4 mr-2" />
            {submitting ? 'Saving...' : 'Save BOM'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BOMManagementPage;
