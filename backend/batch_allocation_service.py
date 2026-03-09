"""
FIFO Batch Allocation Service
Handles strict First-In-First-Out batch selection for dispatch
"""
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone
from pymongo import ASCENDING
import uuid
import logging

class BatchAllocationService:
    """Service for FIFO batch allocation logic"""
    
    def __init__(self, db):
        self.db = db
    
    async def get_fifo_batches(
        self, 
        product_id: str, 
        required_quantity: float
    ) -> List[Dict]:
        """
        Get batches sorted by FIFO (oldest first) for a product
        
        Returns batches where:
        - qc_status = "APPROVED"
        - available_quantity > 0
        - Sorted by production_date ASC
        """
        batches = await self.db.finished_goods_batches.find({
            "product_id": product_id,
            "qc_status": "APPROVED",
            "available_quantity": {"$gt": 0}
        }, {"_id": 0}).sort("production_date", ASCENDING).to_list(1000)
        
        return batches
    
    async def allocate_batches_fifo(
        self,
        product_id: str,
        required_quantity: float,
        dispatch_id: str,
        current_user: dict,
        override_batch_id: Optional[str] = None,
        override_reason: Optional[str] = None
    ) -> Dict:
        """
        Allocate batches using FIFO logic
        
        Returns:
        {
            "success": bool,
            "allocations": List[Dict],  # [{batch_id, batch_number, allocated_qty}]
            "total_allocated": float,
            "shortage": float,  # If required > available
            "override_applied": bool
        }
        """
        # Get FIFO batches
        batches = await self.get_fifo_batches(product_id, required_quantity)
        
        if not batches:
            return {
                "success": False,
                "error": "No APPROVED batches available for this product",
                "allocations": [],
                "total_allocated": 0,
                "shortage": required_quantity
            }
        
        # Check if override is requested
        override_applied = False
        if override_batch_id:
            # Validate override
            override_batch = await self.db.finished_goods_batches.find_one(
                {"id": override_batch_id, "product_id": product_id}
            )
            
            if not override_batch:
                return {
                    "success": False,
                    "error": "Override batch not found"
                }
            
            # Check if older batches have stock
            older_batches = [
                b for b in batches 
                if b["production_date"] < override_batch["production_date"]
                and b["available_quantity"] > 0
            ]
            
            if older_batches and not override_reason:
                return {
                    "success": False,
                    "error": "Older batches have stock. Override reason required.",
                    "older_batches": [
                        {
                            "batch_number": b["batch_number"],
                            "production_date": b["production_date"],
                            "available_quantity": b["available_quantity"]
                        }
                        for b in older_batches
                    ]
                }
            
            # Move override batch to front
            batches = [b for b in batches if b["id"] != override_batch_id]
            batches.insert(0, override_batch)
            override_applied = True
        
        # Allocate from batches
        allocations = []
        remaining_qty = required_quantity
        total_allocated = 0
        
        for batch in batches:
            if remaining_qty <= 0:
                break
            
            available = batch["available_quantity"]
            allocate_qty = min(remaining_qty, available)
            
            if allocate_qty > 0:
                allocations.append({
                    "batch_id": batch["id"],
                    "batch_number": batch["batch_number"],
                    "allocated_quantity": allocate_qty,
                    "production_date": batch["production_date"],
                    "is_override": override_applied and batch["id"] == override_batch_id if override_batch_id else False
                })
                total_allocated += allocate_qty
                remaining_qty -= allocate_qty
        
        shortage = max(0, required_quantity - total_allocated)
        
        return {
            "success": total_allocated > 0,
            "allocations": allocations,
            "total_allocated": total_allocated,
            "shortage": shortage,
            "override_applied": override_applied
        }
    
    async def commit_allocations(
        self,
        allocations: List[Dict],
        dispatch_id: str,
        product_id: str,
        override_reason: Optional[str] = None,
        overridden_by: Optional[str] = None
    ) -> bool:
        """
        Commit batch allocations and deduct from batch available_quantity
        
        This should be called when dispatch is confirmed
        """
        try:
            for allocation in allocations:
                batch_id = allocation["batch_id"]
                allocated_qty = allocation["allocated_quantity"]
                is_override = allocation.get("is_override", False)
                
                # Deduct from batch
                await self.db.finished_goods_batches.update_one(
                    {"id": batch_id},
                    {
                        "$inc": {"available_quantity": -allocated_qty},
                        "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
                    }
                )
                
                # Create allocation record
                allocation_record = {
                    "id": str(uuid.uuid4()),
                    "dispatch_id": dispatch_id,
                    "batch_id": batch_id,
                    "batch_number": allocation["batch_number"],
                    "allocated_quantity": allocated_qty,
                    "product_id": product_id,
                    "override_reason": override_reason if is_override else None,
                    "overridden_by": overridden_by if is_override else None,
                    "override_timestamp": datetime.now(timezone.utc).isoformat() if is_override else None,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await self.db.batch_allocations.insert_one(allocation_record)
            
            return True
        except Exception as e:
            logging.error(f"Failed to commit batch allocations: {str(e)}")
            return False
    
    async def create_batch_from_production_log(
        self,
        production_log: dict,
        qc_status: str = "APPROVED"
    ) -> str:
        """
        Create finished_goods_batch record from production log
        
        Called when production log is created
        Batches are created as APPROVED since QC happens for incoming materials only
        """
        batch = {
            "id": str(uuid.uuid4()),
            "batch_number": production_log["batch_number"],
            "product_id": production_log["product_id"],
            "product_name": production_log["product_name"],
            "production_date": production_log["production_date"],
            "production_log_id": production_log["id"],
            "job_order_id": production_log["job_order_id"],
            "job_number": production_log["job_number"],
            "initial_quantity": production_log["quantity_produced"],
            "available_quantity": production_log["quantity_produced"],
            "qc_status": qc_status,
            "qc_inspection_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await self.db.finished_goods_batches.insert_one(batch)
        return batch["id"]
    
    async def update_batch_qc_status(
        self,
        batch_number: str,
        qc_status: str,
        qc_inspection_id: Optional[str] = None
    ):
        """
        Update batch QC status (only for REJECTED if needed)
        
        Note: Batches are created as APPROVED, so this is mainly for rejection cases
        """
        await self.db.finished_goods_batches.update_one(
            {"batch_number": batch_number},
            {
                "$set": {
                    "qc_status": qc_status,
                    "qc_inspection_id": qc_inspection_id,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )















