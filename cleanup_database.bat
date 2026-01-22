@echo off
echo ========================================
echo Database Cleanup Script
echo ========================================
echo.
echo This will delete ALL records from:
echo   - Shipping Bookings
echo   - Purchase Orders
echo   - Transport Inward
echo   - Transport Outward
echo   - Transport Schedules
echo   - Imports
echo   - Import Checklists
echo.
echo WARNING: This action cannot be undone!
echo.
pause

cd backend
python cleanup_shipping_transport.py

pause

