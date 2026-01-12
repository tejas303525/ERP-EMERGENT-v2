# Stock Management System - User Guide

## Overview
The Stock Management system provides a unified interface to manage inventory across all item types in your ERP system:
- **Finished Products** - Final goods ready for sale
- **Raw Materials** - Materials used in production
- **Packaging** - Packaging materials and containers

## Features Implemented

### 1. **Unified Stock View**
- View all stock items from different sources in one place
- Real-time stock levels, reserved quantities, and available stock
- Color-coded status indicators:
  - 🟢 Green: Good stock levels
  - 🟡 Amber: Low stock warning (< 100 units)
  - 🔴 Red: Critical/Out of stock

### 2. **Stock Dashboard**
- **Statistics Cards:**
  - Total Finished Products count
  - Total Raw Materials count
  - Total Packaging items count
  - Low Stock Items alert
  - Total Items in system

### 3. **Search & Filter**
- Search by item name or SKU
- Filter by type (All, Finished Products, Raw Materials, Packaging)
- Sort by any column (name, stock level, category, etc.)

### 4. **Add New Stock Items**
- Add items of any type through a single interface
- Auto-generate SKU codes if not provided
- Set initial quantities
- Define unit of measure (KG, L, units, MT)
- Categorize items

### 5. **Stock Adjustments**
- Manual stock adjustments (increase/decrease)
- Quick adjustment buttons (+/- 10, +/- 100)
- Mandatory reason tracking for adjustments
- Real-time validation (prevents negative stock)
- Visual preview of new stock level before saving

### 6. **Stock Details View**
- Detailed information modal for each item
- Visual stock level indicator
- Current, reserved, and available quantities
- Category and unit information
- Min/max stock levels (when set)
- Low stock warnings with visual alerts

### 7. **Adjustment History**
- Complete audit trail of all stock changes
- Track who made adjustments and when
- View adjustment reasons
- Filter by item or date range

### 8. **Export Functionality**
- Export stock data to CSV format
- Includes all visible columns
- Filename includes current date
- Useful for reporting and analysis

## Backend API Endpoints

### GET `/api/stock/all`
Returns all stock items from products, packaging, and inventory_items with:
- Item ID, SKU, name, type, category
- Current stock, reserved, and available quantities
- Unit of measure
- Min/max stock levels (when applicable)

### POST `/api/stock/add-item`
Add a new stock item:
```json
{
  "name": "Item Name",
  "sku": "Optional-SKU",
  "type": "FINISHED_PRODUCT|RAW_MATERIAL|PACKAGING",
  "category": "Category Name",
  "quantity": 0,
  "unit": "KG",
  "price": 0
}
```

### PUT `/api/stock/{item_id}/adjust`
Adjust stock for any item:
- Query params: `adjustment` (float), `reason` (optional string)
- Supports positive (add) or negative (remove) adjustments
- Creates audit record automatically
- Validates against negative stock

### GET `/api/stock/adjustments`
Returns adjustment history with:
- Item details
- Adjustment amount and new stock level
- Timestamp and user who made the change
- Reason for adjustment

## User Interface

### Main Page Layout

1. **Header Section**
   - Title and description
   - Quick access to key metrics

2. **Statistics Dashboard**
   - Five cards showing key counts
   - Color-coded by category

3. **Tab Navigation**
   - Stock Items (main view)
   - Adjustment History (audit log)

4. **Action Bar**
   - Search box
   - Type filter dropdown
   - Add Item button
   - Export CSV button
   - Refresh button

5. **Stock Table**
   - Sortable columns
   - Visual indicators for stock status
   - Quick action buttons:
     - 👁️ View Details
     - ✏️ Adjust Stock

### Modal Dialogs

#### Add Item Modal
- Simple form for new items
- Type selection
- Auto-SKU generation
- Unit selection dropdown

#### Adjust Stock Modal
- Current stock display
- Quick adjustment buttons
- Manual input field
- New stock preview
- Reason field
- Validation feedback

#### Stock Details Modal
- Large display of item info
- Visual stock level bar
- Status indicators
- Complete metrics
- Low stock warnings

## Access Control

**Roles with Access:**
- **Admin**: Full access (view, add, adjust)
- **Inventory**: Full access (view, add, adjust)

Other users can view but cannot modify stock.

## Navigation

Access the Stock Management page from:
- Sidebar: **"Stock Management"** (between Inventory and GRN)
- Direct URL: `/stock-management`

## Usage Examples

### Example 1: Adding a New Raw Material
1. Click "Add Item" button
2. Enter name: "Titanium Dioxide"
3. Leave SKU blank (auto-generated)
4. Select type: "Raw Material"
5. Category: "Pigments"
6. Initial quantity: 500
7. Unit: KG
8. Click "Add Item"

### Example 2: Adjusting Stock for Received Goods
1. Search for the item by name or SKU
2. Click the "✏️" (Edit) button
3. Enter adjustment: +1000 (for 1000 units received)
4. Reason: "GRN-2024-001 - Supplier XYZ"
5. Review new stock level
6. Click "Save Adjustment"

### Example 3: Handling Production Consumption
1. Find the consumed material
2. Click "Adjust"
3. Enter negative adjustment: -250
4. Reason: "Job Order JO-2024-123"
5. Confirm adjustment

### Example 4: Exporting Stock Report
1. Apply any filters you want
2. Click "Export CSV"
3. File downloads automatically with current date
4. Open in Excel/Google Sheets for analysis

## Data Sources

The system aggregates data from three MongoDB collections:

1. **products** - Finished goods
   - Tracks `current_stock` field
   - Direct stock management

2. **packaging** - Packaging materials
   - Tracks `current_stock` field
   - Direct stock management

3. **inventory_items + inventory_balances** - Raw materials
   - Uses `on_hand` from inventory_balances
   - Calculates `reserved` from inventory_reservations
   - Available = on_hand - reserved

## Audit Trail

Every stock adjustment creates a record in `stock_adjustments` collection with:
- Item ID and name
- Item type
- Adjustment amount (+/-)
- New stock level
- Reason provided
- User who made the change
- Timestamp (UTC)

This ensures complete traceability of all stock movements.

## Best Practices

1. **Always provide reasons** for adjustments
   - Reference GRN numbers for receipts
   - Reference Job Order numbers for consumption
   - Note physical count discrepancies

2. **Regular stock audits**
   - Export CSV reports monthly
   - Compare with physical counts
   - Adjust discrepancies with clear reasons

3. **Monitor low stock alerts**
   - Check the "Low Stock Items" counter daily
   - Plan procurement for items below threshold

4. **Use the details view**
   - Review stock levels before major adjustments
   - Check reserved quantities before committing stock

5. **Categorize properly**
   - Use consistent category names
   - Makes filtering and reporting easier

## Integration Points

The Stock Management system integrates with:
- **GRN System**: Receiving goods increases stock
- **Job Orders**: Production consumes raw materials
- **Sales Orders**: Reserves finished product stock
- **Procurement**: Tracks inbound quantities
- **Production**: Updates finished goods stock

## Technical Notes

- Stock quantities support decimal values (e.g., 123.45 KG)
- All timestamps in UTC
- SKU format: `TYPE-YYYYMMDDHHMMSS` (auto-generated)
- CSV export uses double quotes for Excel compatibility
- Real-time validation prevents negative stock
- Responsive design works on all screen sizes

## Troubleshooting

**Stock not updating?**
- Check your role (must be admin or inventory)
- Refresh the page to see latest data
- Verify backend is running

**Can't find an item?**
- Clear search filter
- Set type filter to "All Types"
- Check if item is in system (may be inactive)

**Export not working?**
- Check browser allows downloads
- Ensure items are visible (not all filtered out)
- Try using a different browser

## Future Enhancements (Potential)

- Batch import from CSV/Excel
- Barcode scanning support
- Stock transfer between locations
- Automated reorder points
- Stock valuation reports
- Mobile app support
- Real-time notifications for low stock
- Stock forecasting based on usage patterns
- Multi-location stock tracking
- Lot/batch number tracking

## Support

For issues or questions:
1. Check this guide
2. Review audit history for tracking
3. Export data for analysis
4. Contact system administrator

---

**Version**: 1.0  
**Last Updated**: January 2, 2026  
**Module**: Stock Management  
**Integration**: Manufacturing ERP System

