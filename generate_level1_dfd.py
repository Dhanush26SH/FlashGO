import os
import math
import matplotlib.pyplot as plt
import matplotlib.patches as patches

def create_level_1_dfd(output_png="Level_1_DFD.png", output_svg="Level_1_DFD.svg"):
    # High-resolution canvas: 17 x 13 inches at 300 DPI -> 5100 x 3900 pixels
    fig_w, fig_h = 17, 13
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=300)
    
    # Coordinate system: 0 to 1300 x 0 to 950
    ax.set_xlim(0, 1300)
    ax.set_ylim(0, 950)
    ax.axis('off')
    
    font_family = 'serif'
    
    # --- 1. TITLE HEADER ---
    ax.text(650, 915, "FlashGO System — Level 1 Data Flow Diagram (All Modules)", 
            ha='center', va='center', fontsize=19, fontweight='bold', fontfamily=font_family)
    ax.plot([120, 1180], [898, 898], color='black', lw=1.4)
    
    # --- 2. MODULE SPECIFICATIONS ---
    modules = [
        {
            "num": "1.0",
            "name": "Customer Module",
            "actor": "Customer",
            "y": 800,
            "flows_in": "Order & Payment Info",
            "flows_out": "Catalog Items & Live Order Status",
            "stores": [
                {"id": "D1", "name": "Users Table", "dir": "both", "label": "Profile & Auth"},
                {"id": "D2", "name": "Products Table", "dir": "read", "label": "Browse Catalog"},
                {"id": "D4", "name": "Orders Table", "dir": "write", "label": "Store Order Record"}
            ]
        },
        {
            "num": "2.0",
            "name": "Warehouse Staff Module",
            "actor": "Warehouse\nStaff",
            "y": 635,
            "flows_in": "Stock Counts & PO Receipts",
            "flows_out": "Low-Stock Alerts & Inventory Reports",
            "stores": [
                {"id": "D3", "name": "Warehouse Inventory", "dir": "both", "label": "Stock Adjustments"},
                {"id": "D2", "name": "Products Table", "dir": "write", "label": "Catalog Stock Sync"}
            ]
        },
        {
            "num": "3.0",
            "name": "Picker Module",
            "actor": "Picker",
            "y": 470,
            "flows_in": "Scanned Barcodes & OOS Flags",
            "flows_out": "Assigned Pick-List Queue",
            "stores": [
                {"id": "D4", "name": "Orders Table", "dir": "read", "label": "Fetch Placed Orders"},
                {"id": "D3", "name": "Warehouse Inventory", "dir": "both", "label": "Verify & Decrement Stock"},
                {"id": "D4", "name": "Orders Table", "dir": "write", "label": "Update Status: Packed"}
            ]
        },
        {
            "num": "4.0",
            "name": "Driver Module",
            "actor": "Driver",
            "y": 305,
            "flows_in": "GPS Telemetry & Delivery OTP",
            "flows_out": "Dispatch Trips & Navigation Route",
            "stores": [
                {"id": "D4", "name": "Orders Table", "dir": "read", "label": "Fetch Packed Orders"},
                {"id": "D5", "name": "Driver Telemetry", "dir": "write", "label": "Stream Live Coordinates"},
                {"id": "D4", "name": "Orders Table", "dir": "write", "label": "Update Status: Delivered"}
            ]
        },
        {
            "num": "5.0",
            "name": "Admin Module",
            "actor": "Super Admin",
            "y": 140,
            "flows_in": "Platform Controls & Dispute Actions",
            "flows_out": "Analytics, Fleet Map & Audit Logs",
            "stores": [
                {"id": "D1", "name": "Users Table", "dir": "both", "label": "User Roles & Suspensions"},
                {"id": "D4", "name": "Orders Table", "dir": "read", "label": "Audit Revenue & Orders"},
                {"id": "D5", "name": "Driver Telemetry", "dir": "read", "label": "Live Fleet Monitoring"}
            ]
        }
    ]
    
    actor_x = 45
    actor_w = 145
    actor_h = 76
    
    proc_cx = 530
    proc_rx = 135
    proc_ry = 38
    
    ds_x1 = 960
    ds_w = 260
    ds_x2 = ds_x1 + ds_w
    
    arrow_style = '-|>,head_width=0.32,head_length=0.65'
    arrow_both = '<|-|>,head_width=0.32,head_length=0.65'
    
    for mod in modules:
        my = mod["y"]
        
        # 1. External Entity Box (Left)
        ay = my - actor_h / 2
        rect = patches.Rectangle((actor_x, ay), actor_w, actor_h, linewidth=1.5, edgecolor='black', facecolor='white', zorder=3)
        ax.add_patch(rect)
        ax.text(actor_x + actor_w / 2, my, mod["actor"], ha='center', va='center', fontsize=13, fontweight='bold', fontfamily=font_family, zorder=4)
        
        # 2. Process Oval (Center)
        ellipse = patches.Ellipse((proc_cx, my), proc_rx * 2, proc_ry * 2, linewidth=1.5, edgecolor='black', facecolor='white', zorder=3)
        ax.add_patch(ellipse)
        title = f"{mod['num']} {mod['name']}"
        ax.text(proc_cx, my, title, ha='center', va='center', fontsize=12, fontweight='bold', fontfamily=font_family, zorder=4)
        
        # 3. Connections between Actor and Process (Dual Straight Lines)
        in_y = my + 14
        out_y = my - 14
        actor_right = actor_x + actor_w
        
        # Calculate exact boundary intersection on left of ellipse
        dx_in = proc_rx * math.sqrt(max(0.01, 1 - ((in_y - my) / proc_ry) ** 2))
        proc_left_in = proc_cx - dx_in
        
        dx_out = proc_rx * math.sqrt(max(0.01, 1 - ((out_y - my) / proc_ry) ** 2))
        proc_left_out = proc_cx - dx_out
        
        # Actor -> Process (Input Data Flow)
        ax.annotate('', xy=(proc_left_in, in_y), xytext=(actor_right, in_y),
                    arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=13), zorder=2)
        ax.text((actor_right + proc_left_in) / 2, in_y + 4, mod["flows_in"], ha='center', va='bottom', fontsize=10, fontfamily=font_family)
        
        # Process -> Actor (Output Data Flow)
        ax.annotate('', xy=(actor_right, out_y), xytext=(proc_left_out, out_y),
                    arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=13), zorder=2)
        ax.text((actor_right + proc_left_out) / 2, out_y - 13, mod["flows_out"], ha='center', va='bottom', fontsize=10, fontfamily=font_family)
        
        # 4. Connections between Process and Data Stores (Right)
        num_stores = len(mod["stores"])
        if num_stores == 2:
            store_offsets = [20, -20]
        elif num_stores == 3:
            store_offsets = [34, 0, -34]
        else:
            store_offsets = [0]
            
        for st, dy in zip(mod["stores"], store_offsets):
            sy = my + dy
            
            # Exact boundary intersection on right of ellipse
            dx_st = proc_rx * math.sqrt(max(0.01, 1 - (dy / proc_ry) ** 2))
            proc_right_st = proc_cx + dx_st
            
            # Data Store Symbol (Open parallel lines with D# prefix)
            ds_half_h = 11
            ax.plot([ds_x1, ds_x2], [sy + ds_half_h, sy + ds_half_h], color='black', lw=1.3, zorder=3)
            ax.plot([ds_x1, ds_x2], [sy - ds_half_h, sy - ds_half_h], color='black', lw=1.3, zorder=3)
            
            # Left boundary bar of data store (Standard Gane-Sarson ID partition)
            id_bar_x = ds_x1 + 38
            ax.plot([id_bar_x, id_bar_x], [sy - ds_half_h, sy + ds_half_h], color='black', lw=1.1, zorder=3)
            
            # Text inside store: ID on left, Name on right
            ax.text(ds_x1 + 19, sy, st["id"], ha='center', va='center', fontsize=10, fontweight='bold', fontfamily=font_family, zorder=4)
            ax.text((id_bar_x + ds_x2) / 2, sy, st["name"], ha='center', va='center', fontsize=10.5, fontfamily=font_family, zorder=4)
            
            # Draw Flow Line (Process <-> Store)
            if st["dir"] == "write":
                ax.annotate('', xy=(ds_x1, sy), xytext=(proc_right_st, sy),
                            arrowprops=dict(arrowstyle=arrow_style, lw=1.1, color='black', mutation_scale=12), zorder=2)
            elif st["dir"] == "read":
                ax.annotate('', xy=(proc_right_st, sy), xytext=(ds_x1, sy),
                            arrowprops=dict(arrowstyle=arrow_style, lw=1.1, color='black', mutation_scale=12), zorder=2)
            elif st["dir"] == "both":
                ax.annotate('', xy=(ds_x1, sy), xytext=(proc_right_st, sy),
                            arrowprops=dict(arrowstyle=arrow_both, lw=1.1, color='black', mutation_scale=12), zorder=2)
                
            # Flow label
            ax.text((proc_right_st + ds_x1) / 2, sy + 3.5, st["label"], ha='center', va='bottom', fontsize=9.5, fontfamily=font_family)
            
    # Section separator subtle guidelines
    for sep_y in [715, 550, 385, 220]:
        ax.plot([35, 1265], [sep_y, sep_y], color='#cccccc', lw=0.6, linestyle='--', zorder=1)
        
    plt.subplots_adjust(left=0.01, right=0.99, top=0.99, bottom=0.01)
    plt.savefig(output_png, dpi=300, facecolor='white')
    plt.close()
    print(f"Level 1 DFD PNG created: {output_png}")

def create_level_1_dfd_svg(output_svg="Level_1_DFD.svg"):
    # Generate standalone SVG with exact vectors
    svg_w = 1300
    svg_h = 950
    
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_w}" height="{svg_h}" viewBox="0 0 {svg_w} {svg_h}" font-family="Times New Roman, serif">',
        '  <defs>',
        '    <marker id="arr_right" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">',
        '      <path d="M0,0 L0,6 L8,3 z" fill="black" />',
        '    </marker>',
        '    <marker id="arr_left" markerWidth="9" markerHeight="9" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">',
        '      <path d="M8,0 L8,6 L0,3 z" fill="black" />',
        '    </marker>',
        '  </defs>',
        f'  <rect width="{svg_w}" height="{svg_h}" fill="white" />',
        '  <text x="650" y="45" text-anchor="middle" font-size="22" font-weight="bold">FlashGO System — Level 1 Data Flow Diagram (All Modules)</text>',
        '  <line x1="120" y1="65" x2="1180" y2="65" stroke="black" stroke-width="1.4" />'
    ]
    
    modules = [
        {
            "num": "1.0", "name": "Customer Module", "actor": "Customer", "y": 150,
            "flows_in": "Order & Payment Info", "flows_out": "Catalog Items & Live Order Status",
            "stores": [
                {"id": "D1", "name": "Users Table", "dir": "both", "label": "Profile & Auth"},
                {"id": "D2", "name": "Products Table", "dir": "read", "label": "Browse Catalog"},
                {"id": "D4", "name": "Orders Table", "dir": "write", "label": "Store Order Record"}
            ]
        },
        {
            "num": "2.0", "name": "Warehouse Staff Module", "actor": ["Warehouse", "Staff"], "y": 315,
            "flows_in": "Stock Counts & PO Receipts", "flows_out": "Low-Stock Alerts & Inventory Reports",
            "stores": [
                {"id": "D3", "name": "Warehouse Inventory", "dir": "both", "label": "Stock Adjustments"},
                {"id": "D2", "name": "Products Table", "dir": "write", "label": "Catalog Stock Sync"}
            ]
        },
        {
            "num": "3.0", "name": "Picker Module", "actor": "Picker", "y": 480,
            "flows_in": "Scanned Barcodes & OOS Flags", "flows_out": "Assigned Pick-List Queue",
            "stores": [
                {"id": "D4", "name": "Orders Table", "dir": "read", "label": "Fetch Placed Orders"},
                {"id": "D3", "name": "Warehouse Inventory", "dir": "both", "label": "Verify & Decrement Stock"},
                {"id": "D4", "name": "Orders Table", "dir": "write", "label": "Update Status: Packed"}
            ]
        },
        {
            "num": "4.0", "name": "Driver Module", "actor": "Driver", "y": 645,
            "flows_in": "GPS Telemetry & Delivery OTP", "flows_out": "Dispatch Trips & Navigation Route",
            "stores": [
                {"id": "D4", "name": "Orders Table", "dir": "read", "label": "Fetch Packed Orders"},
                {"id": "D5", "name": "Driver Telemetry", "dir": "write", "label": "Stream Live Coordinates"},
                {"id": "D4", "name": "Orders Table", "dir": "write", "label": "Update Status: Delivered"}
            ]
        },
        {
            "num": "5.0", "name": "Admin Module", "actor": "Super Admin", "y": 810,
            "flows_in": "Platform Controls & Dispute Actions", "flows_out": "Analytics, Fleet Map & Audit Logs",
            "stores": [
                {"id": "D1", "name": "Users Table", "dir": "both", "label": "User Roles & Suspensions"},
                {"id": "D4", "name": "Orders Table", "dir": "read", "label": "Audit Revenue & Orders"},
                {"id": "D5", "name": "Driver Telemetry", "dir": "read", "label": "Live Fleet Monitoring"}
            ]
        }
    ]
    
    actor_x = 45
    actor_w = 145
    actor_h = 76
    
    proc_cx = 530
    proc_rx = 135
    proc_ry = 38
    
    ds_x1 = 960
    ds_w = 260
    ds_x2 = ds_x1 + ds_w
    
    for mod in modules:
        my = mod["y"]
        ay = my - actor_h / 2
        
        # Actor
        svg.append(f'  <rect x="{actor_x}" y="{ay}" width="{actor_w}" height="{actor_h}" fill="white" stroke="black" stroke-width="1.5" />')
        if isinstance(mod["actor"], list):
            svg.append(f'  <text x="{actor_x + actor_w/2}" y="{my - 7}" text-anchor="middle" font-size="14" font-weight="bold">{mod["actor"][0]}</text>')
            svg.append(f'  <text x="{actor_x + actor_w/2}" y="{my + 13}" text-anchor="middle" font-size="14" font-weight="bold">{mod["actor"][1]}</text>')
        else:
            svg.append(f'  <text x="{actor_x + actor_w/2}" y="{my + 5}" text-anchor="middle" font-size="15" font-weight="bold">{mod["actor"]}</text>')
            
        # Process
        svg.append(f'  <ellipse cx="{proc_cx}" cy="{my}" rx="{proc_rx}" ry="{proc_ry}" fill="white" stroke="black" stroke-width="1.5" />')
        svg.append(f'  <text x="{proc_cx}" y="{my + 5}" text-anchor="middle" font-size="14" font-weight="bold">{mod["num"]} {mod["name"]}</text>')
        
        # Actor <-> Process Lines
        in_y = my - 14
        out_y = my + 14
        actor_right = actor_x + actor_w
        
        dx_in = proc_rx * math.sqrt(max(0.01, 1 - ((-14) / proc_ry) ** 2))
        proc_left_in = proc_cx - dx_in
        dx_out = proc_rx * math.sqrt(max(0.01, 1 - (14 / proc_ry) ** 2))
        proc_left_out = proc_cx - dx_out
        
        # Inward
        svg.append(f'  <line x1="{actor_right}" y1="{in_y}" x2="{proc_left_in}" y2="{in_y}" stroke="black" stroke-width="1.2" marker-end="url(#arr_right)" />')
        svg.append(f'  <text x="{(actor_right + proc_left_in)/2}" y="{in_y - 6}" text-anchor="middle" font-size="11">{mod["flows_in"]}</text>')
        
        # Outward
        svg.append(f'  <line x1="{proc_left_out}" y1="{out_y}" x2="{actor_right}" y2="{out_y}" stroke="black" stroke-width="1.2" marker-end="url(#arr_right)" />')
        svg.append(f'  <text x="{(actor_right + proc_left_out)/2}" y="{out_y + 16}" text-anchor="middle" font-size="11">{mod["flows_out"]}</text>')
        
        # Process <-> Stores
        num_stores = len(mod["stores"])
        if num_stores == 2:
            store_offsets = [-20, 20]
        elif num_stores == 3:
            store_offsets = [-34, 0, 34]
        else:
            store_offsets = [0]
            
        for st, dy in zip(mod["stores"], store_offsets):
            sy = my + dy
            dx_st = proc_rx * math.sqrt(max(0.01, 1 - (dy / proc_ry) ** 2))
            proc_right_st = proc_cx + dx_st
            
            # Store lines
            ds_half_h = 11
            svg.append(f'  <line x1="{ds_x1}" y1="{sy - ds_half_h}" x2="{ds_x2}" y2="{sy - ds_half_h}" stroke="black" stroke-width="1.3" />')
            svg.append(f'  <line x1="{ds_x1}" y1="{sy + ds_half_h}" x2="{ds_x2}" y2="{sy + ds_half_h}" stroke="black" stroke-width="1.3" />')
            
            id_bar_x = ds_x1 + 38
            svg.append(f'  <line x1="{id_bar_x}" y1="{sy - ds_half_h}" x2="{id_bar_x}" y2="{sy + ds_half_h}" stroke="black" stroke-width="1.1" />')
            svg.append(f'  <text x="{ds_x1 + 19}" y="{sy + 4}" text-anchor="middle" font-size="11" font-weight="bold">{st["id"]}</text>')
            svg.append(f'  <text x="{(id_bar_x + ds_x2)/2}" y="{sy + 4}" text-anchor="middle" font-size="12">{st["name"]}</text>')
            
            # Flow arrow
            if st["dir"] == "write":
                svg.append(f'  <line x1="{proc_right_st}" y1="{sy}" x2="{ds_x1}" y2="{sy}" stroke="black" stroke-width="1.1" marker-end="url(#arr_right)" />')
            elif st["dir"] == "read":
                svg.append(f'  <line x1="{ds_x1}" y1="{sy}" x2="{proc_right_st}" y2="{sy}" stroke="black" stroke-width="1.1" marker-end="url(#arr_right)" />')
            elif st["dir"] == "both":
                svg.append(f'  <line x1="{proc_right_st}" y1="{sy}" x2="{ds_x1}" y2="{sy}" stroke="black" stroke-width="1.1" marker-start="url(#arr_left)" marker-end="url(#arr_right)" />')
                
            svg.append(f'  <text x="{(proc_right_st + ds_x1)/2}" y="{sy - 5}" text-anchor="middle" font-size="10.5">{st["label"]}</text>')
            
    # Separator dashed lines
    for sep_y in [232, 397, 562, 727]:
        svg.append(f'  <line x1="35" y1="{sep_y}" x2="1265" y2="{sep_y}" stroke="#cccccc" stroke-width="0.7" stroke-dasharray="4,4" />')
        
    svg.append('</svg>')
    
    with open(output_svg, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg))
    print(f"Level 1 DFD SVG created: {output_svg}")

if __name__ == "__main__":
    create_level_1_dfd()
    create_level_1_dfd_svg()
