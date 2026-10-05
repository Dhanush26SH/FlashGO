import os
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Data for all 5 FlashGO modules
modules_data = {
    "Customer": {
        "actor": "Customer",
        "processes": [
            {
                "num": "1",
                "name": "Customer Registration",
                "ds": "Users Table",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Profile Details",
                "right_label": ""
            },
            {
                "num": "2",
                "name": "User Login",
                "ds": "Users Table",
                "actor_to_proc": True,
                "proc_to_ds": False,
                "left_label": "Credentials",
                "right_label": ""
            },
            {
                "num": "3",
                "name": "Browse Catalog",
                "ds": "Products Table",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Product List",
                "right_label": ""
            },
            {
                "num": "4",
                "name": "Place Order",
                "ds": "Orders Table",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Cart & Payment Info",
                "right_label": ""
            },
            {
                "num": "5",
                "name": "Track Delivery",
                "ds": "Orders Table",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Live GPS & Status",
                "right_label": ""
            }
        ]
    },
    "Picker": {
        "actor": "Picker",
        "processes": [
            {
                "num": "1",
                "name": "Staff Authentication",
                "ds": "Users Table",
                "actor_to_proc": True,
                "proc_to_ds": False,
                "left_label": "Credentials",
                "right_label": ""
            },
            {
                "num": "2",
                "name": "Receive Pick List",
                "ds": "Orders Table",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Assigned Checklist",
                "right_label": ""
            },
            {
                "num": "3",
                "name": "Scan Barcodes",
                "ds": "Products Table",
                "actor_to_proc": True,
                "proc_to_ds": False,
                "left_label": "Barcode Stream",
                "right_label": ""
            },
            {
                "num": "4",
                "name": "Log Discrepancies",
                "ds": "Warehouse_Inventory",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Out-of-Stock Flag",
                "right_label": ""
            },
            {
                "num": "5",
                "name": "Complete Packing",
                "ds": "Orders Table",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Tote / Bin Handoff",
                "right_label": ""
            }
        ]
    },
    "WarehouseStaff": {
        "actor": "Warehouse Staff",
        "processes": [
            {
                "num": "1",
                "name": "Stock Level Ingestion",
                "ds": "Warehouse_Inventory",
                "actor_to_proc": True,
                "proc_to_ds": False,
                "left_label": "Stock Query",
                "right_label": ""
            },
            {
                "num": "2",
                "name": "Stock Adjustment",
                "ds": "Warehouse_Inventory",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Physical Count Delta",
                "right_label": ""
            },
            {
                "num": "3",
                "name": "Low-Stock Alerts",
                "ds": "Warehouse_Inventory",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Replenishment Notice",
                "right_label": ""
            },
            {
                "num": "4",
                "name": "Purchase Order Creation",
                "ds": "Procurement Table",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Supplier PO Details",
                "right_label": ""
            },
            {
                "num": "5",
                "name": "Inward GRN Receipt",
                "ds": "Procurement Table",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Received Shipment Data",
                "right_label": ""
            }
        ]
    },
    "Driver": {
        "actor": "Driver",
        "processes": [
            {
                "num": "1",
                "name": "Driver Login & Shift",
                "ds": "Users Table",
                "actor_to_proc": True,
                "proc_to_ds": False,
                "left_label": "Credentials & Shift On",
                "right_label": ""
            },
            {
                "num": "2",
                "name": "Dispatch Acceptance",
                "ds": "Orders Table",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Delivery Assignment",
                "right_label": ""
            },
            {
                "num": "3",
                "name": "Push GPS Telemetry",
                "ds": "Driver_Telemetry",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Live Coordinates",
                "right_label": ""
            },
            {
                "num": "4",
                "name": "Update Delivery Status",
                "ds": "Orders Table",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Arrived / In-Transit",
                "right_label": ""
            },
            {
                "num": "5",
                "name": "Submit PoD Evidence",
                "ds": "Orders Table",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Photo & Signature",
                "right_label": ""
            }
        ]
    },
    "Admin": {
        "actor": "Admin",
        "processes": [
            {
                "num": "1",
                "name": "System Authentication",
                "ds": "Users Table",
                "actor_to_proc": True,
                "proc_to_ds": False,
                "left_label": "Credentials & 2FA",
                "right_label": ""
            },
            {
                "num": "2",
                "name": "Monitor Fleet Telemetry",
                "ds": "Driver_Telemetry",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Live Tracking Feed",
                "right_label": ""
            },
            {
                "num": "3",
                "name": "Warehouse Stock Audit",
                "ds": "Warehouse_Inventory",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Inventory Aggregates",
                "right_label": ""
            },
            {
                "num": "4",
                "name": "Resolve Disputes",
                "ds": "Support_Tickets",
                "actor_to_proc": True,
                "proc_to_ds": True,
                "left_label": "Refund Decisions",
                "right_label": ""
            },
            {
                "num": "5",
                "name": "Generate Analytics",
                "ds": "Orders Table",
                "actor_to_proc": False,
                "proc_to_ds": False,
                "left_label": "Business Reports",
                "right_label": ""
            }
        ]
    }
}

def generate_dfd_png(key, data, output_path):
    fig, ax = plt.subplots(figsize=(12, 7.5), dpi=300)
    ax.set_xlim(0, 1000)
    ax.set_ylim(0, 700)
    ax.axis('off')

    font_family = 'serif'

    # 1. Actor Box (Top-Left)
    actor_x, actor_y, actor_w, actor_h = 40, 525, 160, 110
    rect = patches.Rectangle((actor_x, actor_y), actor_w, actor_h, linewidth=1.5, edgecolor='black', facecolor='white', zorder=3)
    ax.add_patch(rect)
    actor_title = data['actor']
    if actor_title == "Warehouse Staff":
        actor_title = "Warehouse\nStaff"
    ax.text(actor_x + actor_w/2, actor_y + actor_h/2, actor_title, ha='center', va='center', fontsize=14, fontweight='bold', fontfamily=font_family, zorder=4)

    y_positions = [580, 460, 340, 220, 100]
    x_lanes = [None, 180, 140, 100, 60]

    oval_cx = 490
    oval_rx, oval_ry = 110, 30
    ds_x1, ds_x2 = 770, 960

    arrow_style = '-|>,head_width=0.35,head_length=0.7'

    for i, (proc, y, lane) in enumerate(zip(data['processes'], y_positions, x_lanes)):
        proc_title = f"{proc['num']}. {proc['name']}"

        # Draw Process Oval
        ellipse = patches.Ellipse((oval_cx, y), oval_rx*2, oval_ry*2, linewidth=1.5, edgecolor='black', facecolor='white', zorder=3)
        ax.add_patch(ellipse)
        ax.text(oval_cx, y, proc_title, ha='center', va='center', fontsize=12, fontfamily=font_family, zorder=4)

        # Draw Data Store (Open parallel lines)
        ax.plot([ds_x1, ds_x2], [y + 18, y + 18], color='black', lw=1.5, zorder=3)
        ax.plot([ds_x1, ds_x2], [y - 18, y - 18], color='black', lw=1.5, zorder=3)
        ax.text((ds_x1 + ds_x2)/2, y, proc['ds'], ha='center', va='center', fontsize=12, fontfamily=font_family, zorder=4)

        # Left connection (Actor <-> Process)
        oval_left_x = oval_cx - oval_rx
        if i == 0:
            start_x = actor_x + actor_w
            if proc['actor_to_proc']:
                ax.annotate('', xy=(oval_left_x, y), xytext=(start_x, y),
                            arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=15), zorder=2)
            else:
                ax.annotate('', xy=(start_x, y), xytext=(oval_left_x, y),
                            arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=15), zorder=2)
            if proc['left_label']:
                ax.text((start_x + oval_left_x)/2, y + 12, proc['left_label'], ha='center', va='bottom', fontsize=11, fontfamily=font_family)
        else:
            if proc['actor_to_proc']:
                ax.plot([lane, lane], [actor_y, y], color='black', lw=1.2, zorder=2)
                ax.annotate('', xy=(oval_left_x, y), xytext=(lane, y),
                            arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=15), zorder=2)
            else:
                ax.plot([oval_left_x, lane], [y, y], color='black', lw=1.2, zorder=2)
                ax.annotate('', xy=(lane, actor_y), xytext=(lane, y),
                            arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=15), zorder=2)
            if proc['left_label']:
                ax.text((lane + oval_left_x)/2, y + 12, proc['left_label'], ha='center', va='bottom', fontsize=11, fontfamily=font_family)

        # Right connection (Process <-> Data Store)
        oval_right_x = oval_cx + oval_rx
        if proc['proc_to_ds']:
            ax.annotate('', xy=(ds_x1, y), xytext=(oval_right_x, y),
                        arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=15), zorder=2)
        else:
            ax.annotate('', xy=(oval_right_x, y), xytext=(ds_x1, y),
                        arrowprops=dict(arrowstyle=arrow_style, lw=1.2, color='black', mutation_scale=15), zorder=2)
        if proc['right_label']:
            ax.text((oval_right_x + ds_x1)/2, y + 12, proc['right_label'], ha='center', va='bottom', fontsize=11, fontfamily=font_family)

    plt.subplots_adjust(left=0.02, right=0.98, top=0.98, bottom=0.02)
    plt.savefig(output_path, dpi=300, facecolor='white')
    plt.close()
    print(f"Generated PNG: {output_path}")

def generate_dfd_svg(key, data, output_path):
    svg_width = 1000
    svg_height = 700

    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" viewBox="0 0 {svg_width} {svg_height}" font-family="Times New Roman, serif">',
        '  <defs>',
        '    <marker id="arrow_right" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">',
        '      <path d="M0,0 L0,6 L7,3 z" fill="black" />',
        '    </marker>',
        '    <marker id="arrow_left" markerWidth="8" markerHeight="8" refX="1" refY="3" orient="auto" markerUnits="strokeWidth">',
        '      <path d="M7,0 L7,6 L0,3 z" fill="black" />',
        '    </marker>',
        '    <marker id="arrow_up" markerWidth="8" markerHeight="8" refX="3" refY="1" orient="auto" markerUnits="strokeWidth">',
        '      <path d="M0,7 L6,7 L3,0 z" fill="black" />',
        '    </marker>',
        '  </defs>',
        f'  <rect width="{svg_width}" height="{svg_height}" fill="white" />'
    ]

    actor_x, actor_y, actor_w, actor_h = 40, 700 - 635, 160, 110 # y in svg: 65
    svg.append(f'  <rect x="{actor_x}" y="{actor_y}" width="{actor_w}" height="{actor_h}" fill="white" stroke="black" stroke-width="1.5"/>')
    if data["actor"] == "Warehouse Staff":
        svg.append(f'  <text x="{actor_x + actor_w/2}" y="{actor_y + actor_h/2 - 5}" text-anchor="middle" font-size="15" font-weight="bold">Warehouse</text>')
        svg.append(f'  <text x="{actor_x + actor_w/2}" y="{actor_y + actor_h/2 + 15}" text-anchor="middle" font-size="15" font-weight="bold">Staff</text>')
    else:
        svg.append(f'  <text x="{actor_x + actor_w/2}" y="{actor_y + actor_h/2 + 5}" text-anchor="middle" font-size="16" font-weight="bold">{data["actor"]}</text>')

    y_positions = [700 - 580, 700 - 460, 700 - 340, 700 - 220, 700 - 100] # [120, 240, 360, 480, 600]
    x_lanes = [None, 180, 140, 100, 60]

    oval_cx = 490
    oval_rx, oval_ry = 110, 30
    ds_x1, ds_x2 = 770, 960

    actor_bottom = actor_y + actor_h # 175

    for i, (proc, y, lane) in enumerate(zip(data['processes'], y_positions, x_lanes)):
        proc_title = f"{proc['num']}. {proc['name']}"

        # Oval
        svg.append(f'  <ellipse cx="{oval_cx}" cy="{y}" rx="{oval_rx}" ry="{oval_ry}" fill="white" stroke="black" stroke-width="1.5"/>')
        svg.append(f'  <text x="{oval_cx}" y="{y + 4}" text-anchor="middle" font-size="13">{proc_title}</text>')

        # Data store
        svg.append(f'  <line x1="{ds_x1}" y1="{y - 18}" x2="{ds_x2}" y2="{y - 18}" stroke="black" stroke-width="1.5"/>')
        svg.append(f'  <line x1="{ds_x1}" y1="{y + 18}" x2="{ds_x2}" y2="{y + 18}" stroke="black" stroke-width="1.5"/>')
        svg.append(f'  <text x="{(ds_x1 + ds_x2)/2}" y="{y + 4}" text-anchor="middle" font-size="13">{proc["ds"]}</text>')

        # Left connection
        oval_left = oval_cx - oval_rx
        if i == 0:
            start_x = actor_x + actor_w
            if proc['actor_to_proc']:
                svg.append(f'  <line x1="{start_x}" y1="{y}" x2="{oval_left}" y2="{y}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_right)"/>')
            else:
                svg.append(f'  <line x1="{oval_left}" y1="{y}" x2="{start_x}" y2="{y}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_left)"/>')
            if proc['left_label']:
                svg.append(f'  <text x="{(start_x + oval_left)/2}" y="{y - 10}" text-anchor="middle" font-size="11">{proc["left_label"]}</text>')
        else:
            if proc['actor_to_proc']:
                svg.append(f'  <line x1="{lane}" y1="{actor_bottom}" x2="{lane}" y2="{y}" stroke="black" stroke-width="1.2"/>')
                svg.append(f'  <line x1="{lane}" y1="{y}" x2="{oval_left}" y2="{y}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_right)"/>')
            else:
                svg.append(f'  <line x1="{oval_left}" y1="{y}" x2="{lane}" y2="{y}" stroke="black" stroke-width="1.2"/>')
                svg.append(f'  <line x1="{lane}" y1="{y}" x2="{lane}" y2="{actor_bottom}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_up)"/>')
            if proc['left_label']:
                svg.append(f'  <text x="{(lane + oval_left)/2}" y="{y - 10}" text-anchor="middle" font-size="11">{proc["left_label"]}</text>')

        # Right connection
        oval_right = oval_cx + oval_rx
        if proc['proc_to_ds']:
            svg.append(f'  <line x1="{oval_right}" y1="{y}" x2="{ds_x1}" y2="{y}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_right)"/>')
        else:
            svg.append(f'  <line x1="{ds_x1}" y1="{y}" x2="{oval_right}" y2="{y}" stroke="black" stroke-width="1.2" marker-end="url(#arrow_left)"/>')
        if proc['right_label']:
            svg.append(f'  <text x="{(oval_right + ds_x1)/2}" y="{y - 10}" text-anchor="middle" font-size="11">{proc["right_label"]}</text>')

    svg.append('</svg>')

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(svg))
    print(f"Generated SVG: {output_path}")

if __name__ == "__main__":
    for mod_key, mod_data in modules_data.items():
        png_name = f"{mod_key}_DFD.png"
        svg_name = f"{mod_key}_DFD.svg"
        generate_dfd_png(mod_key, mod_data, png_name)
        generate_dfd_svg(mod_key, mod_data, svg_name)
    print("All DFD images and SVGs generated successfully!")
