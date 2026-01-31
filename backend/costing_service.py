"""
Costing Service - Centralized costing calculation and margin validation
"""

from typing import Dict, List, Optional
from datetime import datetime, timezone
import re

class CostingService:
    """Centralized costing calculations and master data lookups"""
    
    def __init__(self, db):
        self.db = db
    
    def determine_costing_type(
        self, 
        order_type: str, 
        packaging: str, 
        incoterm: Optional[str] = None,
        country_of_destination: Optional[str] = None,
        transport_mode: Optional[str] = None,
        local_type: Optional[str] = None,
        container_type: Optional[str] = None,
        is_dg: Optional[bool] = None
    ) -> str:
        """
        Determine costing type based on order characteristics
        Returns: EXPORT_CONTAINERIZED, EXPORT_BULK, EXPORT_GCC_ROAD, EXPORT_ROAD, EXPORT_40FT_DG, EXPORT_40FT_NON_DG, EXPORT_20FT_DG, EXPORT_20FT_NON_DG, LOCAL_DISPATCH, LOCAL_PURCHASE_SALE, LOCAL_BULK_TO_PLANT, or LOCAL_DRUM_TO_PLANT
        """
        order_type_upper = (order_type or "").upper()
        packaging_upper = (packaging or "Bulk").upper()
        
        # Export orders with road transport mode
        is_road = transport_mode and transport_mode.upper() == "ROAD"
        
        if order_type_upper == "EXPORT" and is_road:
            # GCC countries by road = special export type
            gcc_countries = ["SAUDI ARABIA", "BAHRAIN", "KUWAIT", "OMAN", "QATAR"]
            country_upper = (country_of_destination or "").upper()
            is_gcc = country_upper in gcc_countries
            
            if is_gcc:
                return "EXPORT_GCC_ROAD"  # GCC road export
            else:
                return "EXPORT_ROAD"  # General export road
        
        # Local orders: check local_type for different costing types
        if order_type_upper == "LOCAL":
            local_type_lower = (local_type or "").lower()
            if local_type_lower == "direct_to_customer":
                return "LOCAL_PURCHASE_SALE"
            elif local_type_lower == "bulk_to_plant":
                return "LOCAL_BULK_TO_PLANT"
            elif local_type_lower == "packaged_to_plant":
                return "LOCAL_DRUM_TO_PLANT"
            elif local_type_lower in ("gcc_road_bulk", "gcc_road"):
                # GCC by road (bulk or drums) – use same costing sheet as EXPORT_GCC_ROAD
                return "EXPORT_GCC_ROAD"
            return "LOCAL_DISPATCH"
        
        # Export orders: check if bulk or packaged
        if order_type_upper == "EXPORT":
            # Check if packaging is bulk
            if packaging_upper == "BULK" or not packaging or packaging.strip() == "":
                return "EXPORT_BULK"
            else:
                # Packaged (drums, pallets, containers)
                # Check for DG container types (only for sea/ocean transport)
                is_sea = transport_mode and transport_mode.upper() in ["SEA", "OCEAN"]
                if is_sea and container_type:
                    container_type_upper = container_type.upper()
                    if container_type_upper == "40FT" or container_type_upper == "40":
                        if is_dg:
                            return "EXPORT_40FT_DG"
                        else:
                            return "EXPORT_40FT_NON_DG"
                    elif container_type_upper == "20FT" or container_type_upper == "20":
                        if is_dg:
                            return "EXPORT_20FT_DG"
                        else:
                            return "EXPORT_20FT_NON_DG"
                # Default to EXPORT_CONTAINERIZED for other cases
                return "EXPORT_CONTAINERIZED"
        
        # Default to LOCAL_DISPATCH if unclear
        return "LOCAL_DISPATCH"
    
    async def get_raw_material_cost(
        self,
        product_id: str,
        quantity: float,
        source: str = "INVENTORY_AVG"
    ) -> Dict[str, any]:
        """
        Get raw material cost from different sources
        Returns: {cost: float, source: str, details: dict}
        """
        if source == "INVENTORY_AVG":
            # Calculate weighted average from inventory movements
            # This is a simplified version - in production, you'd calculate from GRN history
            product = await self.db.products.find_one({"id": product_id}, {"_id": 0})
            if product:
                # Try to get average cost from recent GRNs
                grn_items = await self.db.grn_items.find({
                    "product_id": product_id
                }).sort("created_at", -1).limit(10).to_list(10)
                
                if grn_items:
                    # Get corresponding GRN to find unit price
                    total_cost = 0.0
                    total_qty = 0.0
                    for grn_item in grn_items:
                        # Try to find GRN by matching grn_number or id
                        grn = None
                        if grn_item.get("grn_id"):
                            grn = await self.db.grns.find_one({"id": grn_item.get("grn_id")}, {"_id": 0})
                        if not grn and grn_item.get("grn_number"):
                            grn = await self.db.grns.find_one({"grn_number": grn_item.get("grn_number")}, {"_id": 0})
                        
                        if grn:
                            # Try to get cost from PO line
                            po_id = grn.get("po_id")
                            if po_id:
                                po_line = await self.db.purchase_order_lines.find_one({
                                    "product_id": product_id,
                                    "po_id": po_id
                                }, {"_id": 0})
                                if po_line and po_line.get("unit_price"):
                                    total_cost += po_line["unit_price"] * grn_item.get("quantity", 0)
                                    total_qty += grn_item.get("quantity", 0)
                    
                    if total_qty > 0:
                        avg_cost = total_cost / total_qty
                        return {
                            "cost": avg_cost * quantity,
                            "unit_cost": avg_cost,
                            "source": "INVENTORY_AVG",
                            "details": {"method": "weighted_average", "samples": len(grn_items)}
                        }
            
            # Fallback: return 0 if no data
            return {"cost": 0.0, "unit_cost": 0.0, "source": "INVENTORY_AVG", "details": {"method": "no_data"}}
        
        elif source == "LATEST_PO":
            # Get latest approved PO price
            po_lines = await self.db.purchase_order_lines.find({
                "product_id": product_id
            }).sort("created_at", -1).limit(1).to_list(1)
            
            if po_lines and po_lines[0].get("unit_price"):
                unit_price = po_lines[0]["unit_price"]
                return {
                    "cost": unit_price * quantity,
                    "unit_cost": unit_price,
                    "source": "LATEST_PO",
                    "details": {"po_id": po_lines[0].get("po_id")}
                }
            
            return {"cost": 0.0, "unit_cost": 0.0, "source": "LATEST_PO", "details": {"method": "no_po_found"}}
        
        else:  # MANUAL
            return {"cost": 0.0, "unit_cost": 0.0, "source": "MANUAL", "details": {"method": "manual_entry"}}
    
    async def get_drum_cost(
        self,
        packaging_name: str,
        packaging_sku: Optional[str] = None
    ) -> Optional[Dict[str, any]]:
        """
        Get drum cost from latest approved PO matching packaging type/SKU
        Returns: {cost: float, unit_cost: float, po_id: str, packaging_name: str} or None
        """
        # Find packaging item by name or SKU
        packaging_query = {}
        if packaging_sku:
            packaging_query["sku"] = packaging_sku
        else:
            # Try to match by name (case insensitive, partial match)
            packaging_query["name"] = {"$regex": re.escape(packaging_name), "$options": "i"}
        
        packaging = await self.db.packaging.find_one(packaging_query, {"_id": 0})
        if not packaging:
            # Also try inventory_items for PACK type
            packaging = await self.db.inventory_items.find_one({
                "$or": [
                    {"sku": packaging_sku} if packaging_sku else {},
                    {"name": {"$regex": re.escape(packaging_name), "$options": "i"}},
                ],
                "item_type": "PACK"
            }, {"_id": 0})
        
        if not packaging:
            return None
        
        item_id = packaging.get("id")
        
        # Find latest approved PO with this packaging item
        po_lines = await self.db.purchase_order_lines.find({
            "item_id": item_id,
            "item_type": "PACKAGING"
        }).sort("created_at", -1).limit(1).to_list(1)
        
        if po_lines:
            po_line = po_lines[0]
            # Verify PO is approved
            po = await self.db.purchase_orders.find_one({
                "id": po_line.get("po_id"),
                "status": "APPROVED"
            }, {"_id": 0})
            
            if po and po_line.get("unit_price"):
                return {
                    "cost": po_line["unit_price"],
                    "unit_cost": po_line["unit_price"],
                    "po_id": po.get("id"),
                    "po_number": po.get("po_number"),
                    "packaging_name": packaging.get("name"),
                    "source": "LATEST_PO"
                }
        
        return None
    
    async def get_transport_cost(
        self,
        origin: str = "RAK",
        destination: str = None,
        vehicle_type: Optional[str] = None
    ) -> Optional[Dict[str, any]]:
        """
        Get transport cost from transport master
        Returns: {cost: float, route_name: str, vehicle_type: str} or None
        """
        if not destination:
            return None
        
        # Build query
        query = {
            "origin": origin.upper(),
            "destination": destination.upper(),
            "is_active": True
        }
        
        if vehicle_type:
            query["vehicle_type"] = vehicle_type
        
        # Get most recent active route
        route = await self.db.transport_routes.find_one(
            query,
            {"_id": 0},
            sort=[("effective_date", -1)]
        )
        
        if route:
            return {
                "cost": route.get("rate", 0.0),
                "route_name": route.get("route_name"),
                "vehicle_type": route.get("vehicle_type"),
                "currency": route.get("currency", "USD"),
                "source": "TRANSPORT_MASTER"
            }
        
        return None
    
    async def get_fixed_charges(
        self,
        charge_types: List[str],
        container_count: int = 1,
        container_type: Optional[str] = None,
        is_dg: bool = False
    ) -> Dict[str, float]:
        """
        Get fixed charges from master (multiply by container_count)
        Now supports container size and DG differentiation
        Returns: {THC: float, ISPS: float, DOCUMENTATION: float, BL_FEES: float}
        """
        charges = {}
        
        for charge_type in charge_types:
            # Build query
            query = {
                "charge_type": charge_type,
                "is_active": True
            }
            
            # For THC, add container type and DG filters
            if charge_type == "THC" and container_type:
                query["container_type"] = container_type
                query["is_dg"] = is_dg
            
            # Get most recent active charge
            charge = await self.db.fixed_charges.find_one(
                query,
                {"_id": 0},
                sort=[("effective_date", -1)]
            )
            
            if charge:
                charges[charge_type] = charge.get("amount", 0.0) * container_count
            else:
                # Fallback: try without container/DG filters
                fallback_charge = await self.db.fixed_charges.find_one(
                    {"charge_type": charge_type, "is_active": True},
                    {"_id": 0},
                    sort=[("effective_date", -1)]
                )
                if fallback_charge:
                    charges[charge_type] = fallback_charge.get("amount", 0.0) * container_count
                else:
                    charges[charge_type] = 0.0
        
        return charges
    
    def calculate_margin(
        self,
        selling_price: float,
        total_cost: float,
        quantity: float,
        unit_price: float
    ) -> Dict[str, float]:
        """
        Calculate margin (total and unit)
        Returns: {margin_amount, margin_percentage, unit_cost, unit_margin}
        """
        margin_amount = selling_price - total_cost
        margin_percentage = (margin_amount / selling_price * 100) if selling_price > 0 else 0.0
        unit_cost = total_cost / quantity if quantity > 0 else 0.0
        unit_margin = unit_price - unit_cost
        
        return {
            "margin_amount": margin_amount,
            "margin_percentage": margin_percentage,
            "unit_cost": unit_cost,
            "unit_margin": unit_margin
        }
    
    async def calculate_export_containerized_cost(
        self,
        quotation_id: str,
        raw_material_cost: Optional[float] = None,
        ocean_freight: Optional[float] = None,
        manual_overrides: Optional[Dict] = None,
        raw_material_source: Optional[str] = "SYSTEM",
        packaging_type: Optional[str] = None,
        incoterm_type: Optional[str] = None,
        is_dg: Optional[bool] = None
    ) -> Dict[str, any]:
        """
        Calculate costs for Export Containerized orders
        """
        quotation = await self.db.quotations.find_one({"id": quotation_id}, {"_id": 0})
        if not quotation:
            raise ValueError(f"Quotation {quotation_id} not found")
        
        manual = manual_overrides or {}
        container_count = quotation.get("container_count", 1)
        container_type = quotation.get("container_type", "20ft")
        # Use parameter if provided, otherwise from quotation
        is_dg_flag = is_dg if is_dg is not None else quotation.get("is_dg", False)
        incoterm = (quotation.get("incoterm") or "").upper()
        items = quotation.get("items", [])
        
        # Calculate raw material cost - only if source is SYSTEM
        if raw_material_cost is None and raw_material_source == "SYSTEM":
            total_rm_cost = 0.0
            for item in items:
                product_id = item.get("product_id")
                quantity = item.get("quantity", 0)
                
                # Get raw material cost (try inventory avg first)
                rm_result = await self.get_raw_material_cost(product_id, quantity, "INVENTORY_AVG")
                total_rm_cost += rm_result.get("cost", 0.0)
            
            raw_material_cost = total_rm_cost
        elif raw_material_cost is None:
            raw_material_cost = 0.0  # Will be entered manually
        
        # Override if manual
        if "raw_material_cost" in manual:
            raw_material_cost = manual["raw_material_cost"]
        
        # Calculate drum cost - respect packaging_type parameter
        packaging_cost = 0.0
        packaging_cost_source = None
        
        # If packaging_type is explicitly set to BULK, skip packaging cost
        if packaging_type and packaging_type.upper() == "BULK":
            packaging_cost = 0.0
        else:
            # Check if any items are drums (if packaging_type not set, infer from items)
            for item in items:
                packaging = item.get("packaging", "Bulk")
                # If packaging_type is DRUM or item packaging is not Bulk
                if (packaging_type and packaging_type.upper() == "DRUM") or \
                   (not packaging_type and packaging and packaging.upper() != "BULK"):
                    quantity = item.get("quantity", 0)
                    drum_result = await self.get_drum_cost(packaging)
                    if drum_result:
                        packaging_cost += drum_result["unit_cost"] * quantity
                        packaging_cost_source = "LATEST_PO"
        
        # Override if manual
        if "packaging_cost" in manual:
            packaging_cost = manual["packaging_cost"]
            packaging_cost_source = "MANUAL"
        
        # Get transport cost
        port_of_loading = quotation.get("port_of_loading") or "Jebel Ali"
        transport_result = await self.get_transport_cost("RAK", port_of_loading)
        inland_transport_cost = transport_result["cost"] if transport_result else 0.0
        
        # Override if manual
        if "inland_transport_cost" in manual:
            inland_transport_cost = manual["inland_transport_cost"]
        
        # Get fixed charges with container type and DG
        fixed_charges = await self.get_fixed_charges(
            ["THC", "ISPS", "DOCUMENTATION", "BL_FEES"],
            container_count,
            container_type=container_type,
            is_dg=is_dg_flag
        )
        
        thc_cost = manual.get("thc_cost", fixed_charges.get("THC", 0.0))
        isps_cost = manual.get("isps_cost", fixed_charges.get("ISPS", 0.0))
        documentation_cost = manual.get("documentation_cost", fixed_charges.get("DOCUMENTATION", 0.0))
        bl_cost = manual.get("bl_cost", fixed_charges.get("BL_FEES", 0.0))
        
        # Ocean freight (only for CFR/CIF, manual entry by finance)
        ocean_freight_cost = 0.0
        if incoterm in ["CFR", "CIF"]:
            ocean_freight_cost = ocean_freight or 0.0
            if "ocean_freight_cost" in manual:
                ocean_freight_cost = manual["ocean_freight_cost"]
        elif incoterm == "FOB":
            ocean_freight_cost = 0.0  # Not applicable for FOB
        
        # Calculate total cost
        total_cost = (
            raw_material_cost +
            packaging_cost +
            inland_transport_cost +
            thc_cost +
            isps_cost +
            documentation_cost +
            bl_cost +
            ocean_freight_cost
        )
        
        # Calculate margin
        selling_price = quotation.get("total", 0.0)
        total_quantity = sum(item.get("quantity", 0) for item in items)
        unit_price = selling_price / total_quantity if total_quantity > 0 else 0.0
        
        margin = self.calculate_margin(selling_price, total_cost, total_quantity, unit_price)
        
        return {
            "raw_material_cost": raw_material_cost,
            "raw_material_source": raw_material_source or "SYSTEM",
            "packaging_cost": packaging_cost,
            "packaging_cost_source": packaging_cost_source,
            "packaging_type": packaging_type,
            "incoterm_type": incoterm_type,
            "inland_transport_cost": inland_transport_cost,
            "thc_cost": thc_cost,
            "isps_cost": isps_cost,
            "documentation_cost": documentation_cost,
            "bl_cost": bl_cost,
            "ocean_freight_cost": ocean_freight_cost,
            "is_dg": is_dg_flag,
            "port_charges": 0.0,  # Not applicable for containerized
            "local_transport_cost": 0.0,  # Not applicable for export
            "total_cost": total_cost,
            "selling_price": selling_price,
            **margin
        }
    
    async def calculate_export_bulk_cost(
        self,
        quotation_id: str,
        raw_material_cost: Optional[float] = None,
        ocean_freight: Optional[float] = None,
        manual_overrides: Optional[Dict] = None,
        raw_material_source: Optional[str] = "SYSTEM",
        incoterm_type: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Calculate costs for Export Bulk orders
        """
        quotation = await self.db.quotations.find_one({"id": quotation_id}, {"_id": 0})
        if not quotation:
            raise ValueError(f"Quotation {quotation_id} not found")
        
        manual = manual_overrides or {}
        incoterm = (quotation.get("incoterm") or "").upper()
        items = quotation.get("items", [])
        
        # Calculate raw material cost - only if source is SYSTEM
        if raw_material_cost is None and raw_material_source == "SYSTEM":
            total_rm_cost = 0.0
            for item in items:
                product_id = item.get("product_id")
                quantity = item.get("quantity", 0)
                
                rm_result = await self.get_raw_material_cost(product_id, quantity, "INVENTORY_AVG")
                total_rm_cost += rm_result.get("cost", 0.0)
            
            raw_material_cost = total_rm_cost
        elif raw_material_cost is None:
            raw_material_cost = 0.0  # Will be entered manually
        
        # Override if manual
        if "raw_material_cost" in manual:
            raw_material_cost = manual["raw_material_cost"]
        
        # Get transport cost
        port_of_loading = quotation.get("port_of_loading") or "Jebel Ali"
        transport_result = await self.get_transport_cost("RAK", port_of_loading)
        inland_transport_cost = transport_result["cost"] if transport_result else 0.0
        
        # Override if manual
        if "inland_transport_cost" in manual:
            inland_transport_cost = manual["inland_transport_cost"]
        
        # Port charges (for bulk export)
        port_charges = manual.get("port_charges", 0.0)
        
        # Ocean freight (depends on incoterm)
        ocean_freight_cost = 0.0
        if incoterm in ["CFR", "CIF"]:
            ocean_freight_cost = ocean_freight or 0.0
            if "ocean_freight_cost" in manual:
                ocean_freight_cost = manual["ocean_freight_cost"]
        elif incoterm == "FOB":
            ocean_freight_cost = 0.0
        
        # Calculate total cost
        total_cost = (
            raw_material_cost +
            inland_transport_cost +
            port_charges +
            ocean_freight_cost
        )
        
        # Calculate margin
        selling_price = quotation.get("total", 0.0)
        total_quantity = sum(item.get("quantity", 0) for item in items)
        unit_price = selling_price / total_quantity if total_quantity > 0 else 0.0
        
        margin = self.calculate_margin(selling_price, total_cost, total_quantity, unit_price)
        
        return {
            "raw_material_cost": raw_material_cost,
            "raw_material_source": raw_material_source or "SYSTEM",
            "packaging_cost": 0.0,  # No packaging for bulk
            "packaging_cost_source": None,
            "packaging_type": "BULK",  # Always bulk for this costing type
            "incoterm_type": incoterm_type,
            "inland_transport_cost": inland_transport_cost,
            "thc_cost": 0.0,  # Not applicable for bulk
            "isps_cost": 0.0,  # Not applicable for bulk
            "documentation_cost": 0.0,  # Not applicable for bulk
            "bl_cost": 0.0,  # Not applicable for bulk
            "ocean_freight_cost": ocean_freight_cost,
            "port_charges": port_charges,
            "local_transport_cost": 0.0,  # Not applicable for export
            "total_cost": total_cost,
            "selling_price": selling_price,
            **margin
        }
    
    async def calculate_local_dispatch_cost(
        self,
        quotation_id: str,
        raw_material_cost: Optional[float] = None,
        manual_overrides: Optional[Dict] = None,
        raw_material_source: Optional[str] = "SYSTEM",
        packaging_type: Optional[str] = None,
        incoterm_type: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Calculate costs for Local Dispatch orders
        """
        quotation = await self.db.quotations.find_one({"id": quotation_id}, {"_id": 0})
        if not quotation:
            raise ValueError(f"Quotation {quotation_id} not found")
        
        manual = manual_overrides or {}
        items = quotation.get("items", [])
        delivery_place = quotation.get("delivery_place") or "Local"
        
        # Calculate raw material cost - only if source is SYSTEM
        if raw_material_cost is None and raw_material_source == "SYSTEM":
            total_rm_cost = 0.0
            for item in items:
                product_id = item.get("product_id")
                quantity = item.get("quantity", 0)
                
                rm_result = await self.get_raw_material_cost(product_id, quantity, "INVENTORY_AVG")
                total_rm_cost += rm_result.get("cost", 0.0)
            
            raw_material_cost = total_rm_cost
        elif raw_material_cost is None:
            raw_material_cost = 0.0  # Will be entered manually
        
        # Override if manual
        if "raw_material_cost" in manual:
            raw_material_cost = manual["raw_material_cost"]
        
        # Calculate packaging cost - respect packaging_type parameter
        packaging_cost = 0.0
        packaging_cost_source = None
        
        # If packaging_type is explicitly set to BULK, skip packaging cost
        if packaging_type and packaging_type.upper() == "BULK":
            packaging_cost = 0.0
        else:
            # Check if any items are drums (if packaging_type not set, infer from items)
            for item in items:
                packaging = item.get("packaging", "Bulk")
                # If packaging_type is DRUM or item packaging is not Bulk
                if (packaging_type and packaging_type.upper() == "DRUM") or \
                   (not packaging_type and packaging and packaging.upper() != "BULK"):
                    quantity = item.get("quantity", 0)
                    drum_result = await self.get_drum_cost(packaging)
                    if drum_result:
                        packaging_cost += drum_result["unit_cost"] * quantity
                        packaging_cost_source = "LATEST_PO"
        
        # Override if manual
        if "packaging_cost" in manual:
            packaging_cost = manual["packaging_cost"]
            packaging_cost_source = "MANUAL"
        
        # Get local transport cost - first check for saved transport charges from transport bookings
        local_transport_cost = 0.0
        
        # Try to get transport charges from transport bookings (for job orders created from this quotation)
        # Find sales order and job order related to this quotation
        sales_order = await self.db.sales_orders.find_one({"quotation_id": quotation_id}, {"_id": 0})
        if sales_order:
            job_order = await self.db.job_orders.find_one({"sales_order_id": sales_order.get("id")}, {"_id": 0})
            if job_order:
                # Get transport outward records for this job order
                transport_bookings = await self.db.transport_outward.find(
                    {"job_order_id": job_order.get("id")},
                    {"_id": 0}
                ).to_list(100)
                
                # Sum up transport charges from all bookings
                if transport_bookings:
                    total_transport_charges = sum(
                        booking.get("transport_charges", 0) or 0 
                        for booking in transport_bookings 
                        if booking.get("transport_charges")
                    )
                    if total_transport_charges > 0:
                        local_transport_cost = total_transport_charges
        
        # If no transport charges found from bookings, fall back to transport master
        if local_transport_cost == 0.0:
            transport_result = await self.get_transport_cost("RAK", delivery_place)
            local_transport_cost = transport_result["cost"] if transport_result else 0.0
        
        # Override if manual
        if "local_transport_cost" in manual:
            local_transport_cost = manual["local_transport_cost"]
        
        # Calculate total cost
        total_cost = (
            raw_material_cost +
            packaging_cost +
            local_transport_cost
        )
        
        # Calculate margin
        selling_price = quotation.get("total", 0.0)
        total_quantity = sum(item.get("quantity", 0) for item in items)
        unit_price = selling_price / total_quantity if total_quantity > 0 else 0.0
        
        margin = self.calculate_margin(selling_price, total_cost, total_quantity, unit_price)
        
        return {
            "raw_material_cost": raw_material_cost,
            "raw_material_source": raw_material_source or "SYSTEM",
            "packaging_cost": packaging_cost,
            "packaging_cost_source": packaging_cost_source,
            "packaging_type": packaging_type,
            "incoterm_type": incoterm_type,
            "inland_transport_cost": 0.0,  # Not applicable for local
            "thc_cost": 0.0,  # Not applicable for local
            "isps_cost": 0.0,  # Not applicable for local
            "documentation_cost": 0.0,  # Not applicable for local
            "bl_cost": 0.0,  # Not applicable for local
            "ocean_freight_cost": 0.0,  # Not applicable for local
            "port_charges": 0.0,  # Not applicable for local
            "local_transport_cost": local_transport_cost,
            "total_cost": total_cost,
            "selling_price": selling_price,
            **margin
        }
    
    async def calculate_export_gcc_road_cost(
        self,
        quotation_id: str,
        raw_material_cost: Optional[float] = None,
        manual_overrides: Optional[Dict] = None
    ) -> Dict[str, any]:
        """
        Calculate costs for Export GCC by Road orders
        Similar to EXPORT_CONTAINERIZED but:
        - No ocean freight
        - Road transport cost (from transport master)
        - Fixed charges still apply
        """
        quotation = await self.db.quotations.find_one({"id": quotation_id}, {"_id": 0})
        if not quotation:
            raise ValueError(f"Quotation {quotation_id} not found")
        
        manual = manual_overrides or {}
        container_count = quotation.get("container_count", 1)
        container_type = quotation.get("container_type", "20ft")
        is_dg = quotation.get("is_dg", False)
        items = quotation.get("items", [])
        country_of_destination = quotation.get("country_of_destination", "")
        
        # Calculate raw material cost
        if raw_material_cost is None:
            total_rm_cost = 0.0
            for item in items:
                product_id = item.get("product_id")
                quantity = item.get("quantity", 0)
                rm_result = await self.get_raw_material_cost(product_id, quantity, "INVENTORY_AVG")
                total_rm_cost += rm_result.get("cost", 0.0)
            raw_material_cost = total_rm_cost
        
        if "raw_material_cost" in manual:
            raw_material_cost = manual["raw_material_cost"]
        
        # Calculate packaging cost
        packaging_cost = 0.0
        packaging_cost_source = None
        for item in items:
            packaging = item.get("packaging", "Bulk")
            if packaging and packaging.upper() != "BULK":
                quantity = item.get("quantity", 0)
                drum_result = await self.get_drum_cost(packaging)
                if drum_result:
                    packaging_cost += drum_result["unit_cost"] * quantity
                    packaging_cost_source = "LATEST_PO"
        
        if "packaging_cost" in manual:
            packaging_cost = manual["packaging_cost"]
            packaging_cost_source = "MANUAL"
        
        # Get road transport cost (to GCC destination)
        transport_result = await self.get_transport_cost("RAK", country_of_destination)
        road_transport_cost = transport_result["cost"] if transport_result else 0.0
        
        if "road_transport_cost" in manual:
            road_transport_cost = manual["road_transport_cost"]
        
        # Get fixed charges (with container type and DG)
        fixed_charges = await self.get_fixed_charges(
            ["THC", "ISPS", "DOCUMENTATION", "BL_FEES"],
            container_count,
            container_type=container_type,
            is_dg=is_dg
        )
        
        thc_cost = manual.get("thc_cost", fixed_charges.get("THC", 0.0))
        isps_cost = manual.get("isps_cost", fixed_charges.get("ISPS", 0.0))
        documentation_cost = manual.get("documentation_cost", fixed_charges.get("DOCUMENTATION", 0.0))
        bl_cost = manual.get("bl_cost", fixed_charges.get("BL_FEES", 0.0))
        
        # NO ocean freight for GCC by road
        
        # Calculate totals
        total_cost = (
            raw_material_cost +
            packaging_cost +
            road_transport_cost +
            thc_cost +
            isps_cost +
            documentation_cost +
            bl_cost
        )
        
        # Calculate margin
        selling_price = quotation.get("total", 0.0)
        total_quantity = sum(item.get("quantity", 0) for item in items)
        unit_price = selling_price / total_quantity if total_quantity > 0 else 0.0
        
        margin = self.calculate_margin(selling_price, total_cost, total_quantity, unit_price)
        
        return {
            "raw_material_cost": raw_material_cost,
            "packaging_cost": packaging_cost,
            "packaging_cost_source": packaging_cost_source,
            "road_transport_cost": road_transport_cost,
            "thc_cost": thc_cost,
            "isps_cost": isps_cost,
            "documentation_cost": documentation_cost,
            "bl_cost": bl_cost,
            "ocean_freight_cost": 0.0,  # Always 0 for GCC road
            "inland_transport_cost": 0.0,  # Not applicable
            "port_charges": 0.0,  # Not applicable
            "local_transport_cost": 0.0,  # Not applicable
            "total_cost": total_cost,
            "selling_price": selling_price,
            "container_type": container_type,
            "container_count": container_count,
            "is_dg": is_dg,
            **margin
        }

