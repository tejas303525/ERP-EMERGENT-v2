import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient('mongodb://localhost:27017')
    db = client.erp_db
    booking = await db.shipping_bookings.find_one({'booking_number': 'SHP-000079'}, {'_id': 0})
    print('Booking data:', booking)
    if booking:
        print('\nKey fields:')
        print(f'  po_id: {booking.get("po_id")}')
        print(f'  po_ids: {booking.get("po_ids")}')
        print(f'  job_order_ids: {booking.get("job_order_ids")}')
        print(f'  ref_type: {booking.get("ref_type")}')
        print(f'  status: {booking.get("status")}')
    client.close()

asyncio.run(check())

























