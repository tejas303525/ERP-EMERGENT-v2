# Container-Based Quotations - User Guide

## Quick Start Guide for Creating Multi-Container Export Quotations

---

## Step 1: Create New Quotation

1. Click **"New Quotation"** button
2. Select **Order Type**: Export
3. Select **Customer** from dropdown
4. Choose **Currency** (USD, AED, EUR, INR)

---

## Step 2: Configure Export Details

### Basic Export Information

1. **Container Type**: Select from:
   - 20ft Container (Max 28 MT)
   - 40ft Container (Max 28 MT)
   - ISO Tank (Max 25 MT)
   - Bulk Tanker 45T (Max 45 MT)
   - etc.

2. **Number of Containers**: Enter total (e.g., 17)

3. **Incoterm**: Select:
   - **CFR** (Cost and Freight) - enables additional freight section
   - FOB, CIF, EXW, DDP, CIP, DAP

4. **Country of Origin**: Default "UAE"

5. **Country of Destination**: Select destination

6. **Transport Mode**: 
   - Ocean (default for international)
   - Road (auto-selected for GCC countries)
   - Air

### Additional Freight (CFR only)

If you selected CFR incoterm, you'll see:

1. **Freight Rate per FCL**: Enter rate (e.g., 2175)
2. **Freight Currency**: USD, AED, EUR
3. **Total Additional Freight**: Auto-calculated (rate × container count)

Example:
```
Freight Rate: $2,175
Container Count: 17 FCL
Total Additional Freight = $2,175 × 17 = $36,975
```

---

## Step 3: Add Items Per Container

### Container Selection

For multi-container quotations:
1. Use **"Current Container"** dropdown
2. Select container number (1, 2, 3, etc.)
3. Add items to that container

Visual indicator shows: "Adding items to Container 1 of 17"

### Basic Product Information

1. **Product**: Select from dropdown
2. **Quantity**: Enter quantity (auto-filled from packaging config)
3. **Price/MT**: Enter unit price
4. **Packaging**: Select (Bulk, 200L Drum, IBC 1000L, etc.)
5. **Net Wt (kg)**: Net weight per unit
6. **Palletized**: Check if palletized

### Export Details Section (Export Orders Only)

This section appears below basic product info for export orders:

#### Brand & Color
- **Brand**: e.g., "MOTRIX", "WILL BE ANNOUNCED LATER"
- **Color**: e.g., "BLUE", "RED WITH BLACK CAP"

#### Quantity Specification
- **Quantity in Units**: e.g., 8000, 15960
- **Unit Type**: Select from:
  - CARTONS (CRTN)
  - PAILS
  - DRUMS
  - BAGS
  - BOXES
  - IBC

#### Packing Details
- **Detailed Packing**: Full description
  - Example: "PACKED IN 12X1 LTR CARTON"
  - Example: "PACKED IN 20 LTR PAIL"

- **FCL Breakdown**: Container breakdown
  - Example: "TOTAL 1600 CARTONS/ 1X20 FCL"
  - Example: "TOTAL 1330 PAILS IN 1X20 FCL"

- **Packing Display**: Short format
  - Example: "5X 20 FCL"
  - Example: "12X 20 FCL"

- **Country of Origin**: Item-specific origin (default: UAE)

### Example: Adding Container 1 Item

```
Basic Info:
- Product: ENGINE OIL 20W50 (VIRGIN)
- Quantity: 8000
- Price/MT: $13.00
- Packaging: 200L Drum
- Net Weight: 200 kg

Export Details:
- Brand: WILL BE ANNOUNCED LATER
- Color: RED WITH BLACK CAP
- Quantity in Units: 8000
- Unit Type: CARTONS (CRTN)
- Detailed Packing: PACKED IN 12X1 LTR CARTON, TOTAL 1600 CARTONS/ 1X20 FCL
- FCL Breakdown: TOTAL 1600 CARTONS/ 1X20 FCL
- Packing Display: 5X 20 FCL
- Country of Origin: UAE
```

Click **Add Item** (+ button)

---

## Step 4: Add More Containers

1. **Switch Container**: Change "Current Container" dropdown to 2
2. **Add Items**: Follow same process for Container 2
3. **Repeat**: Continue for all containers

Visual indicator updates: "Adding items to Container 2 of 17"

---

## Step 5: Review Items

### Items Table Shows:

For **Export Orders**:
- Container # (badge showing container number)
- Product (with detailed packing below)
- Brand
- Color
- Qty
- Qty (Units) - e.g., "8000 CRTN"
- Packaging (with packing display below)
- Packing (FCL breakdown)
- Weight (MT)
- Price/MT
- Total

Items are automatically sorted by container number.

### Example Display:

```
Container | Product                      | Brand              | Color    | Qty  | Qty (Units) | Packing
#1        | ENGINE OIL 20W50 (VIRGIN)    | WILL BE ANNOUNCED | RED WITH | 8000 | 8000 CRTN   | 5X 20 FCL
          | PACKED IN 12X1 LTR CARTON    | LATER             | BLACK CAP|      |             |
          
#2        | ENGINE OIL SAE 50 (RECYCLED) | MOTRIX            | BLUE     | 15960| 15960 PAILS | 12X 20 FCL
          | PACKED IN 20 LTR PAIL        |                   |          |      |             |
```

---

## Step 6: Review Totals

### For CFR Export Orders:

```
CFR Amount (Product):              $359,360.00
Additional Freight (17 FCL × $2,175): $36,975.00
────────────────────────────────────────────────
Total Receivable (CFR + Freight):  $396,335.00
```

### For Other Orders:

```
Subtotal:      $359,360.00
VAT (5%):      $17,968.00  (if local order)
────────────────────────────
Grand Total:   $377,328.00
```

---

## Step 7: Configure Other Settings

### Required Documents

Check documents needed:
- ✅ Commercial Invoice (default)
- ✅ Packing List (default)
- ☐ Certificate of Origin (COO)
- ✅ Certificate of Analysis (COA) (default)
- ☐ Bill of Lading (B/L)
- ☐ MSDS
- ☐ Phytosanitary Certificate
- ☐ Insurance Certificate
- ☐ Weight Slip
- ✅ Delivery Note (default)

### Other Fields

- **Payment Terms**: Select from dropdown
- **Quotation Validity**: 7, 14, 30, 45, 60, or 90 days
- **Expected Delivery Date**: Select date
- **Bank Account**: Select bank for payment details
- **Notes**: Any additional notes

---

## Step 8: Create Quotation

Click **"Create Quotation"** button

System will:
1. Validate all required fields
2. Calculate totals (CFR + freight)
3. Generate PFI number
4. Save quotation
5. Display success message

---

## Viewing Quotation Details

### In List View

Shows:
- PFI Number
- Customer
- Type (EXPORT/LOCAL badge)
- Country of Destination
- Total
- Cost Status
- Margin
- Status (PENDING/APPROVED/REJECTED)
- Created Date

### In Detail View (Click Eye Icon)

For multi-container export orders, items are grouped by container:

```
┌─ Container 1 ──────────────────────────────────┐
│ S.No | Description of Goods          | Packing  │
│ 1    | ENGINE OIL 20W50 (VIRGIN)     | 5X 20FCL │
│      | PACKED IN 12X1 LTR CARTON     |          │
│      | TOTAL 1600 CARTONS/ 1X20 FCL  |          │
│      | BRAND: WILL BE ANNOUNCED LATER|          │
│      | COLOR: RED WITH BLACK CAP     |          │
│      | COUNTRY OF ORIGIN: UAE        |          │
└────────────────────────────────────────────────┘

┌─ Container 2 ──────────────────────────────────┐
│ S.No | Description of Goods          | Packing  │
│ 1    | ENGINE OIL SAE 50 (RECYCLED)  | 12X20FCL │
│      | PACKED IN 20 LTR PAIL         |          │
│      | TOTAL 1330 PAILS IN 1X20 FCL  |          │
│      | BRAND: MOTRIX                 |          │
│      | COLOR: BLUE                   |          │
│      | COUNTRY OF ORIGIN: UAE        |          │
└────────────────────────────────────────────────┘

Totals:
CFR Amount:              $359,360.00
Additional Freight:      $36,975.00
(17 FCL × $2,175.00)
────────────────────────────────────
Total Receivable:        $396,335.00
```

---

## Editing Quotations

1. Click **Edit** icon (pencil) on pending or rejected quotations
2. All fields will be pre-filled including:
   - Container count
   - Items with container numbers
   - Export details (brand, color, packing)
   - Additional freight rate
3. Modify as needed
4. Click **"Update Quotation"**

---

## Tips & Best Practices

### ✅ Do's

1. **Fill export details completely** for professional quotations
2. **Use descriptive packing details** (e.g., "PACKED IN 12X1 LTR CARTON")
3. **Specify brand early** if known, or use "TO BE ANNOUNCED"
4. **Group similar items** in same container
5. **Add freight rate** for CFR quotations
6. **Review container grouping** before creating

### ❌ Don'ts

1. **Don't leave brand/color empty** for export orders (use "TBA" if unknown)
2. **Don't mix container types** in multi-container quotations
3. **Don't forget FCL breakdown** - helps with shipping planning
4. **Don't skip quantity in units** - needed for accurate packing lists

---

## Common Scenarios

### Scenario 1: Single Container Export
- Set container count: 1
- No need to switch containers
- Add all items normally
- Export details optional but recommended

### Scenario 2: Multi-Container Same Product
- Set container count based on total quantity
- Add same product to each container
- Vary packing display per container (1X 20 FCL, 2X 20 FCL, etc.)

### Scenario 3: Multi-Container Different Products
- Set total container count
- Switch between containers using dropdown
- Add different products to each container
- Ensure all containers have items

### Scenario 4: CFR with Additional Freight
- Select CFR incoterm
- Enter freight rate per FCL
- System auto-calculates total freight
- Review CFR amount + freight = total receivable

---

## Troubleshooting

### Issue: Can't see Export Details section
**Solution**: Ensure Order Type is set to "Export"

### Issue: Additional Freight section not showing
**Solution**: Select "CFR" as the incoterm

### Issue: Container dropdown not visible
**Solution**: Set container count > 1

### Issue: Items not grouping by container
**Solution**: Ensure container_number is set when adding items (automatic)

### Issue: Totals don't match expected
**Solution**: 
- Check all item prices
- Verify freight rate
- Confirm container count
- Review VAT inclusion (local orders)

---

## Keyboard Shortcuts

- **Tab**: Navigate between fields
- **Enter**: Submit current form field
- **Escape**: Close dialogs
- **Ctrl/Cmd + S**: (Not implemented) Save quotation

---

## Support

For additional help:
1. Check sample quotation in documentation
2. Review this guide
3. Contact system administrator
4. Refer to CONTAINER_BASED_QUOTATIONS_IMPLEMENTATION.md for technical details

---

**Last Updated**: January 19, 2026
**Version**: 1.0

