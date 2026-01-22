# Database Cleanup Script (PowerShell)
# This will delete ALL records from shipping, PO, and transportation collections

Write-Host "========================================" -ForegroundColor Yellow
Write-Host "Database Cleanup Script" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "This will delete ALL records from:" -ForegroundColor Red
Write-Host "  - Shipping Bookings" -ForegroundColor Red
Write-Host "  - Purchase Orders" -ForegroundColor Red
Write-Host "  - Transport Inward" -ForegroundColor Red
Write-Host "  - Transport Outward" -ForegroundColor Red
Write-Host "  - Transport Schedules" -ForegroundColor Red
Write-Host "  - Imports" -ForegroundColor Red
Write-Host "  - Import Checklists" -ForegroundColor Red
Write-Host ""
Write-Host "WARNING: This action cannot be undone!" -ForegroundColor Red
Write-Host ""

$confirmation = Read-Host "Press Enter to continue (or Ctrl+C to cancel)"

Set-Location backend
python cleanup_shipping_transport.py

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

