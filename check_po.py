import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.erp_db
    po = await db.purchase_orders.find_one({'po_number': 'PO-000043'}, {'_id': 0})
    print('PO data:', po)
    if po:
        print(f'\nPO Status: {po.get("status")}')
        print(f'PO Incoterm: {po.get("incoterm")}')
        print(f'PO ID: {po.get("id")}')
        
        # Check for existing bookings
        bookings = await db.shipping_bookings.find({
            '$or': [
                {'po_id': po.get('id')},
                {'po_ids': po.get('id')},
                {'po_number': 'PO-000043'}
            ]
        }, {'_id': 0, 'booking_number': 1, 'po_id': 1, 'po_ids': 1, 'po_number': 1}).to_list(10)
        print(f'\nExisting bookings: {bookings}')
    client.close()

asyncio.run(check())

























