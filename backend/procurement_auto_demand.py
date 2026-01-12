"""
Procurement Auto-Demand Service
Phase 4: Auto-generate procurement requisitions from shortages
"""

from datetime import datetime, timezone
from typing import List, Dict
import uuid

class ProcurementAutoDemand:
    """Auto-generate procurement requisitions from production shortages"""
    
    def __init__(self, db):
        self.db = db
    
    async def generate_from_production_shortages(self) -> Dict:
        """
        Scan production_day_requirements for shortages
        Auto-create or update procurement_requisition_lines
        """
        # Find all requirements with shortages
        requirements = await self.db.production_day_requirements.find({
            "shortage_qty": {"$gt": 0}
        }).to_list(None)
        
        if not requirements:
            return {"requisitions_created": 0, "lines_created": 0}
        
        # Group by schedule_day_id to get required_by date
        pr_lines_created = 0
        
        # Find or create a draft PR
        pr = await self.db.procurement_requisitions.find_one({"status": "DRAFT"})
        if not pr:
            pr = {
                "id": str(uuid.uuid4()),
                "status": "DRAFT",
                "notes": "Auto-generated from production shortages",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await self.db.procurement_requisitions.insert_one(pr)
        
        for req in requirements:
            # Get schedule day for required_by date
            schedule_day = await self.db.production_schedule_days.find_one(
                {"id": req['schedule_day_id']}
            )
            
            if not schedule_day:
                continue
            
            # Check if line already exists
            existing_line = await self.db.procurement_requisition_lines.find_one({
                "pr_id": pr['id'],
                "item_id": req['item_id'],
                "linked_schedule_day_id": req['schedule_day_id']
            })
            
            if existing_line:
                # Update quantity if needed
                if existing_line['qty'] < req['shortage_qty']:
                    await self.db.procurement_requisition_lines.update_one(
                        {"id": existing_line['id']},
                        {"$set": {"qty": req['shortage_qty']}}
                    )
            else:
                # Create new line
                item = await self.db.inventory_items.find_one({"id": req['item_id']})
                if not item:
                    continue
                
                line = {
                    "id": str(uuid.uuid4()),
                    "pr_id": pr['id'],
                    "item_id": req['item_id'],
                    "item_type": req['item_type'],
                    "qty": req['shortage_qty'],
                    "uom": item['uom'],
                    "required_by": schedule_day['schedule_date'],
                    "linked_campaign_id": schedule_day.get('campaign_id'),
                    "linked_schedule_day_id": req['schedule_day_id'],
                    "reason": f"{req['item_type']} shortage for production"
                }
                
                await self.db.procurement_requisition_lines.insert_one(line)
                pr_lines_created += 1
        
        return {
            "pr_id": pr['id'],
            "lines_created": pr_lines_created,
            "shortages_found": len(requirements)
        }
    
    async def generate_from_inventory_shortages(self, job_order_id: str = None) -> Dict:
        """
        Check inventory_balances for items with on_hand - reserved <= 0
        that are required for pending jobs
        """
        # Get pending job orders
        query = {"status": {"$in": ["pending", "in_production"]}}
        if job_order_id:
            query["id"] = job_order_id
        
        jobs = await self.db.job_orders.find(query).to_list(None)
        
        pr_lines_created = 0
        pr = None
        
        for job in jobs:
            # Get BOM requirements
            product_bom = await self.db.product_boms.find_one({
                "product_id": job['product_id'],
                "is_active": True
            })
            
            if not product_bom:
                continue
            
            bom_items = await self.db.product_bom_items.find(
                {"bom_id": product_bom['id']}
            ).to_list(None)
            
            for bom_item in bom_items:
                # Get inventory availability
                balance = await self.db.inventory_balances.find_one(
                    {"item_id": bom_item['material_item_id']}
                )
                on_hand = balance['on_hand'] if balance else 0
                
                # Get reservations
                reservations = await self.db.inventory_reservations.find(
                    {"item_id": bom_item['material_item_id']}
                ).to_list(None)
                reserved = sum(r['qty'] for r in reservations)
                
                available = on_hand - reserved
                
                if available <= 0:
                    # Create PR line
                    if not pr:
                        pr = await self.db.procurement_requisitions.find_one({"status": "DRAFT"})
                        if not pr:
                            pr = {
                                "id": str(uuid.uuid4()),
                                "status": "DRAFT",
                                "notes": "Auto-generated from inventory shortages",
                                "created_at": datetime.now(timezone.utc).isoformat()
                            }
                            await self.db.procurement_requisitions.insert_one(pr)
                    
                    item = await self.db.inventory_items.find_one(
                        {"id": bom_item['material_item_id']}
                    )
                    
                    if item:
                        # Calculate shortage
                        required = bom_item['qty_kg_per_kg_finished'] * job['quantity']
                        shortage = max(0, required - available)
                        
                        line = {
                            "id": str(uuid.uuid4()),
                            "pr_id": pr['id'],
                            "item_id": item['id'],
                            "item_type": item['item_type'],
                            "qty": shortage,
                            "uom": item['uom'],
                            "required_by": job.get('delivery_date', datetime.now(timezone.utc).isoformat()),
                            "linked_job_order_id": job['id'],
                            "reason": f"Shortage for {job['job_number']}"
                        }
                        
                        await self.db.procurement_requisition_lines.insert_one(line)
                        pr_lines_created += 1
        
        return {
            "pr_id": pr['id'] if pr else None,
            "lines_created": pr_lines_created
        }
