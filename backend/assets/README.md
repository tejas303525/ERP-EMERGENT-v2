# Invoice Assets Directory

This directory should contain the following image files for invoice PDF generation:

## Required Files

1. **logo.png** - Company logo (centered at top of invoice)
   - Recommended size: 400x400 pixels
   - Format: PNG with transparent background
   - This is the sunburst logo in a droplet shape

2. **stamp.png** - Company stamp/seal
   - Recommended size: 300x300 pixels  
   - Format: PNG with transparent background
   - Circular blue stamp with company details

3. **signature.png** - MD signature
   - Recommended size: 400x150 pixels
   - Format: PNG with transparent background
   - Blue ink signature

## Usage

- Logo: Always displayed on invoices (centered at top)
- Stamp & Signature: Only displayed after finance approval (when viewing) or when printing (print=true parameter)

## Note

If these files are missing, the PDF generation will continue without them, but placeholders will be shown.

