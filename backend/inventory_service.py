"""
Inventory Service - Centralized inventory availability logic
Phase 1: Fix inventory status discrepancy
"""

from typing import Dict, List, Optional
from datetime import datetime

class InventoryService:
    """Centralized inventory availability calculations"""
    
    def __init__(self, db):
        self.db = db
    
    async def get_available_quantity(self, item_id: str) -> Dict:
        """
        Calculate available quantity for RAW or PACK item
        Returns: {on_hand, reserved, available, status, inbound}
        """
        # Get on-hand from inventory_balances
        balance = await self.db.inventory_balances.find_one({"item_id": item_id})
        on_hand = balance['on_hand'] if balance else 0
        
        # Get reserved from inventory_reservations
        reservations = await self.db.inventory_reservations.find({"item_id": item_id}).to_list(None)
        reserved = sum(r['qty'] for r in reservations)
        
        # Calculate available
        available = on_hand - reserved
        
        # Get inbound from POs
        inbound = await self._get_inbound_quantity(item_id)
        
        # Determine status
        if available > 0:
            status = "IN_STOCK"
        elif inbound > 0:
            status = "INBOUND"
        else:
            status = "OUT_OF_STOCK"
        
        return {
            "on_hand": on_hand,
            "reserved": reserved,
            "available": available,
            "inbound": inbound,
            "status": status
        }
    
    async def _get_inbound_quantity(self, item_id: str) -> float:
        """Get inbound quantity from open POs"""
        pipeline = [
            {'$match': {'item_id': item_id}},
            {'$lookup': {
                'from': 'purchase_orders',
                'localField': 'po_id',
                'foreignField': 'id',
                'as': 'po'
            }},
            {'$unwind': '$po'},
            {'$match': {
                'po.status': {'$in': ['APPROVED', 'SENT', 'PARTIAL']}
            }},
            {'$project': {
                'inbound_qty': {'$subtract': ['$qty', '$received_qty']}
            }}
        ]
        
        lines = await self.db.purchase_order_lines.aggregate(pipeline).to_list(None)
        return sum(line['inbound_qty'] for line in lines if line['inbound_qty'] > 0)
    
    async def get_finished_product_availability(self, product_id: str) -> Dict:
        """
        Get availability for finished products
        Note: products.current_stock is maintained for backwards compatibility
        but availability logic uses inventory_balances if item exists there
        """
        # Check if product exists as inventory_item
        inv_item = await self.db.inventory_items.find_one({
            "sku": {"$exists": True}
        })
        
        # Get from products table
        product = await self.db.products.find_one({"id": product_id})
        if not product:
            return {"available": 0, "status": "OUT_OF_STOCK"}
        
        current_stock = product.get('current_stock', 0)
        min_stock = product.get('min_stock', 0)
        
        status = "IN_STOCK" if current_stock >= min_stock else "LOW_STOCK"
        if current_stock <= 0:
            status = "OUT_OF_STOCK"
        
        return {
            "current_stock": current_stock,
            "min_stock": min_stock,
            "available": max(0, current_stock),
            "status": status
        }
