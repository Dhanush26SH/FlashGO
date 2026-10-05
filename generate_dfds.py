import os

def create_svg(filename, actor_name, processes):
    svg_width = 900
    svg_height = 500
    
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" font-family="Times New Roman, serif" font-size="12">',
        '  <defs>',
        '    <marker id="arrow_right" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">',
        '      <path d="M0,0 L0,6 L9,3 z" fill="black" />',
        '    </marker>',
        '    <marker id="arrow_left" markerWidth="10" markerHeight="10" refX="1" refY="3" orient="auto" markerUnits="strokeWidth">',
        '      <path d="M9,0 L9,6 L0,3 z" fill="black" />',
        '    </marker>',
        '  </defs>'
    ]
    
    # Actor Box
    actor_x, actor_y = 20, 50
    actor_w, actor_h = 140, 400
    svg.append(f'  <rect x="{actor_x}" y="{actor_y}" width="{actor_w}" height="{actor_h}" fill="white" stroke="black" stroke-width="1.5"/>')
    svg.append(f'  <text x="{actor_x + actor_w/2}" y="{actor_y + actor_h/2}" text-anchor="middle" font-size="16" font-weight="bold">{actor_name}</text>')
    
    y_start = 90
    y_spacing = 80
    
    for i, proc in enumerate(processes):
        y_center = y_start + i * y_spacing
        
        # Process Ellipse
        proc_cx = 450
        proc_rx = 110
        proc_ry = 30
        svg.append(f'  <ellipse cx="{proc_cx}" cy="{y_center}" rx="{proc_rx}" ry="{proc_ry}" fill="white" stroke="black" stroke-width="1.5"/>')
        svg.append(f'  <text x="{proc_cx}" y="{y_center + 4}" text-anchor="middle" font-size="13">{i+1}. {proc["name"]}</text>')
        
        # Data Store
        ds_x = 700
        ds_w = 160
        svg.append(f'  <line x1="{ds_x}" y1="{y_center - 15}" x2="{ds_x + ds_w}" y2="{y_center - 15}" stroke="black" stroke-width="1.5"/>')
        svg.append(f'  <line x1="{ds_x}" y1="{y_center + 15}" x2="{ds_x + ds_w}" y2="{y_center + 15}" stroke="black" stroke-width="1.5"/>')
        svg.append(f'  <text x="{ds_x + ds_w/2}" y="{y_center + 4}" text-anchor="middle" font-size="13">{proc["data_store"]}</text>')
        
        # Left Line (Actor <-> Process)
        left_x1 = actor_x + actor_w
        left_x2 = proc_cx - proc_rx
        
        if proc["actor_to_proc"]:
            svg.append(f'  <line x1="{left_x1}" y1="{y_center}" x2="{left_x2}" y2="{y_center}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_right)"/>')
        else:
            svg.append(f'  <line x1="{left_x1}" y1="{y_center}" x2="{left_x2}" y2="{y_center}" stroke="black" stroke-width="1.2" marker-start="url(#arrow_left)"/>')
            
        if proc.get("left_label"):
            svg.append(f'  <text x="{(left_x1 + left_x2)/2}" y="{y_center - 8}" text-anchor="middle" font-size="11">{proc["left_label"]}</text>')
            
        # Right Line (Process <-> Data Store)
        right_x1 = proc_cx + proc_rx
        right_x2 = ds_x
        
        if proc["proc_to_ds"]:
            svg.append(f'  <line x1="{right_x1}" y1="{y_center}" x2="{right_x2}" y2="{y_center}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_right)"/>')
        else:
            svg.append(f'  <line x1="{right_x1}" y1="{y_center}" x2="{right_x2}" y2="{y_center}" stroke="black" stroke-width="1.2" marker-start="url(#arrow_left)"/>')
            
        if proc.get("right_label"):
            svg.append(f'  <text x="{(right_x1 + right_x2)/2}" y="{y_center - 8}" text-anchor="middle" font-size="11">{proc["right_label"]}</text>')

    svg.append('</svg>')
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg))
    print(f"Created {filename}")

modules = {
    "Customer": [
        {"name": "Customer Registration", "data_store": "Users Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Profile Details", "right_label": ""},
        {"name": "User Login", "data_store": "Users Table", "actor_to_proc": True, "proc_to_ds": False, "left_label": "Credentials", "right_label": ""},
        {"name": "Browse Catalog", "data_store": "Products Table", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Product List", "right_label": ""},
        {"name": "Place Order", "data_store": "Orders Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Cart & Payment Info", "right_label": ""},
        {"name": "Track Delivery", "data_store": "Orders Table", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Live GPS & Status", "right_label": ""}
    ],
    "Picker": [
        {"name": "Picker Login", "data_store": "Users Table", "actor_to_proc": True, "proc_to_ds": False, "left_label": "Credentials", "right_label": ""},
        {"name": "Receive Assignment", "data_store": "Orders Table", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Checklist & Route", "right_label": ""},
        {"name": "Scan Barcodes", "data_store": "Products Table", "actor_to_proc": True, "proc_to_ds": False, "left_label": "Barcode Data", "right_label": "Validation"},
        {"name": "Handle Exceptions", "data_store": "Warehouse_Inventory", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Out-of-Stock Flag", "right_label": ""},
        {"name": "Mark Order Packed", "data_store": "Orders Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Confirmation", "right_label": "Status Update"}
    ],
    "WarehouseStaff": [
        {"name": "Monitor Inventory", "data_store": "Warehouse_Inventory", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Stock Levels", "right_label": ""},
        {"name": "Adjust Stock", "data_store": "Warehouse_Inventory", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Manual Count", "right_label": "Update"},
        {"name": "Low Stock Alerts", "data_store": "Warehouse_Inventory", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Alerts", "right_label": ""},
        {"name": "Draft Procurement", "data_store": "Procurement Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Vendor Details", "right_label": ""},
        {"name": "Receive Shipment", "data_store": "Procurement Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Arrival Info", "right_label": "Status Update"}
    ],
    "Driver": [
        {"name": "Update Availability", "data_store": "Shift_Slots Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Shift/Status", "right_label": ""},
        {"name": "Receive Dispatch", "data_store": "Orders Table", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Route/Order Info", "right_label": ""},
        {"name": "Live Navigation", "data_store": "Driver_Telemetry", "actor_to_proc": True, "proc_to_ds": True, "left_label": "GPS Ping", "right_label": ""},
        {"name": "Update Order Status", "data_store": "Orders Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Status (e.g. Arrived)", "right_label": ""},
        {"name": "Submit PoD", "data_store": "Orders Table", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Photo/Signature", "right_label": "Proof Update"}
    ],
    "Admin": [
        {"name": "Monitor Fleet", "data_store": "Driver_Telemetry", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Live Map", "right_label": ""},
        {"name": "Manage Inventory", "data_store": "Warehouse_Inventory", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Reports", "right_label": ""},
        {"name": "Review Disputes", "data_store": "Support_Tickets", "actor_to_proc": False, "proc_to_ds": False, "left_label": "Ticket Details", "right_label": ""},
        {"name": "Resolve Ticket", "data_store": "Support_Tickets", "actor_to_proc": True, "proc_to_ds": True, "left_label": "Resolution", "right_label": "Status Update"},
        {"name": "Generate Analytics", "data_store": "Orders Table", "actor_to_proc": False, "proc_to_ds": False, "left_label": "CSV/PDF Data", "right_label": ""}
    ]
}

for mod, procs in modules.items():
    create_svg(f"Customer_DFD.svg" if mod == "Customer" else f"{mod}_DFD.svg", mod if mod != "WarehouseStaff" else "Warehouse Staff", procs)

