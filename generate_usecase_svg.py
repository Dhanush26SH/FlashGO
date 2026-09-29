import xml.etree.ElementTree as ET

def create_svg():
    # Make canvas taller to fit all 6 admin branches
    svg = ET.Element('svg', xmlns="http://www.w3.org/2000/svg", viewBox="0 0 1000 1250", width="1000", height="1250")
    
    # Background
    ET.SubElement(svg, 'rect', width="1000", height="1250", fill="#ffffff")
    
    # Styles
    oval_style = "fill:#ffffff;stroke:#000000;stroke-width:1.5;"
    line_style = "stroke:#000000;stroke-width:1.5;"
    text_style = "font-family:Times New Roman, serif;font-size:14px;text-anchor:middle;dominant-baseline:middle;fill:#000000;"
    
    def draw_oval(cx, cy, rx, ry, text):
        ET.SubElement(svg, 'ellipse', cx=str(cx), cy=str(cy), rx=str(rx), ry=str(ry), style=oval_style)
        # Split text if too long
        if len(text) > 22:
            words = text.split()
            mid = len(words) // 2
            line1 = " ".join(words[:mid])
            line2 = " ".join(words[mid:])
            ET.SubElement(svg, 'text', x=str(cx), y=str(cy - 5), style=text_style).text = line1
            ET.SubElement(svg, 'text', x=str(cx), y=str(cy + 15), style=text_style).text = line2
        else:
            ET.SubElement(svg, 'text', x=str(cx), y=str(cy), style=text_style).text = text
        
    def draw_line(x1, y1, x2, y2):
        ET.SubElement(svg, 'line', x1=str(x1), y1=str(y1), x2=str(x2), y2=str(y2), style=line_style)
        
    # Actor Stick Figure (White Face) - Centered at Y=600
    ET.SubElement(svg, 'circle', cx="100", cy="570", r="15", fill="#ffffff", stroke="#000000", **{"stroke-width": "2"})
    draw_line(100, 585, 100, 640)
    draw_line(70, 600, 130, 600)
    draw_line(100, 640, 70, 690)
    draw_line(100, 640, 130, 690)
    ET.SubElement(svg, 'text', x="100", y="710", style="font-family:Times New Roman, serif;font-size:16px;text-anchor:middle;font-weight:bold;fill:#000000;").text = "Admin"
    
    actor_x, actor_y = 130, 600

    main_nodes = [
        (400, 100, "Login & Auth"),
        (400, 300, "User Management"),
        (400, 500, "Fleet Management"),
        (400, 700, "Warehouse & Operations"),
        (400, 900, "Order Oversight"),
        (400, 1100, "System Reports")
    ]
    
    sub_nodes = {
        1: [(750, 230, "Manage Customers"), (750, 300, "Manage Logistics Staff"), (750, 370, "Manage Drivers")],
        2: [(750, 430, "View Live Telemetry Map"), (750, 500, "Monitor Driver Statuses"), (750, 570, "Override Driver Dispatch")],
        3: [(750, 630, "Define Delivery Zones"), (750, 700, "Monitor Global Stock Alerts"), (750, 770, "Approve Procurement Drafts")],
        4: [(750, 860, "Track Live Orders"), (750, 940, "Resolve Customer Disputes")],
        5: [(750, 1030, "View Revenue Dashboard"), (750, 1100, "Generate Sales Analytics"), (750, 1170, "Export System Data CSV")]
    }
    
    # Lines
    for i, (mx, my, mtext) in enumerate(main_nodes):
        draw_line(actor_x, actor_y, mx - 120, my)
        if i in sub_nodes:
            for sx, sy, stext in sub_nodes[i]:
                draw_line(mx + 120, my, sx - 140, sy)
                
    # Ovals
    for i, (mx, my, mtext) in enumerate(main_nodes):
        draw_oval(mx, my, 120, 30, mtext)
        if i in sub_nodes:
            for sx, sy, stext in sub_nodes[i]:
                draw_oval(sx, sy, 140, 30, stext)

    tree = ET.ElementTree(svg)
    tree.write("docs/Admin_UseCase.svg", encoding="utf-8", xml_declaration=True)

if __name__ == "__main__":
    create_svg()
