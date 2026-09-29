import xml.etree.ElementTree as ET

def create_svg():
    svg = ET.Element('svg', xmlns="http://www.w3.org/2000/svg", viewBox="0 0 1000 600", width="1000", height="600")
    
    # Background
    ET.SubElement(svg, 'rect', width="1000", height="600", fill="#ffffff")
    
    # Styles
    box_style = "fill:#ffffff;stroke:#000000;stroke-width:2;"
    line_style = "stroke:#000000;stroke-width:2;fill:none;"
    text_style_main = "font-family:Times New Roman, serif;font-size:16px;font-weight:bold;text-anchor:middle;dominant-baseline:middle;fill:#000000;"
    text_style_sub = "font-family:Times New Roman, serif;font-size:14px;text-anchor:middle;dominant-baseline:middle;fill:#000000;"
    
    def draw_box(cx, cy, w, h, text, is_main=False):
        # Draw rect centered at cx, cy
        x = cx - w/2
        y = cy - h/2
        ET.SubElement(svg, 'rect', x=str(x), y=str(y), width=str(w), height=str(h), style=box_style)
        
        style = text_style_main if is_main else text_style_sub
        
        # Text wrapping if too long
        if len(text) > 20:
            words = text.split()
            mid = len(words) // 2
            line1 = " ".join(words[:mid])
            line2 = " ".join(words[mid:])
            ET.SubElement(svg, 'text', x=str(cx), y=str(cy - 6), style=style).text = line1
            ET.SubElement(svg, 'text', x=str(cx), y=str(cy + 14), style=style).text = line2
        else:
            ET.SubElement(svg, 'text', x=str(cx), y=str(cy + 2), style=style).text = text
        
    def draw_path(d):
        ET.SubElement(svg, 'path', d=d, style=line_style)
        
    # Admin Root
    draw_box(500, 50, 160, 50, "Admin", is_main=True)
    
    # Main trunk
    draw_path("M 500 75 L 500 110 L 100 110 L 100 150") # To Col 1
    draw_path("M 500 110 L 300 110 L 300 150") # To Col 2
    draw_path("M 500 110 L 500 150") # To Col 3
    draw_path("M 500 110 L 700 110 L 700 150") # To Col 4
    draw_path("M 500 110 L 900 110 L 900 150") # To Col 5
    
    columns = [
        {"x": 100, "title": "User Management", "subs": ["Customers", "Pickers & Staff", "Drivers"]},
        {"x": 300, "title": "Fleet Management", "subs": ["Live Telemetry Map", "Driver Status", "Dispatch Override"]},
        {"x": 500, "title": "Warehouse Ops", "subs": ["Delivery Zones", "Procurement", "Stock Alerts"]},
        {"x": 700, "title": "Order Oversight", "subs": ["Track Live Orders", "Resolve Disputes"]},
        {"x": 900, "title": "Analytics & Reports", "subs": ["Revenue Dashboard", "Sales Data", "Export CSV Data"]}
    ]
    
    # Draw Lines first
    for col in columns:
        cx = col["x"]
        if col["subs"]:
            bottom_y = 250 + (len(col["subs"]) - 1) * 70
            draw_path(f"M {cx} 175 L {cx} {bottom_y}")
            
    # Draw Boxes over lines
    for col in columns:
        cx = col["x"]
        draw_box(cx, 150, 160, 50, col["title"], is_main=True)
        
        if col["subs"]:
            for i, sub in enumerate(col["subs"]):
                cy = 250 + i * 70
                draw_box(cx, cy, 150, 40, sub, is_main=False)

    tree = ET.ElementTree(svg)
    tree.write("docs/Admin_Hierarchy.svg", encoding="utf-8", xml_declaration=True)

if __name__ == "__main__":
    create_svg()
