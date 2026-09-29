import xml.etree.ElementTree as ET

def create_svg():
    svg = ET.Element('svg', xmlns="http://www.w3.org/2000/svg", viewBox="0 0 1200 800", width="1200", height="800")
    
    # Defs for arrowheads
    defs = ET.SubElement(svg, 'defs')
    marker_end = ET.SubElement(defs, 'marker', id="arrow", markerWidth="10", markerHeight="10", refX="9", refY="3", orient="auto", markerUnits="strokeWidth")
    ET.SubElement(marker_end, 'path', d="M0,0 L0,6 L9,3 z", fill="#000")
    
    # Background
    ET.SubElement(svg, 'rect', width="1200", height="800", fill="#ffffff")
    
    # Styles
    box_style = "fill:none;stroke:#000000;stroke-width:2;"
    text_style = "font-family:Times New Roman, serif;font-size:16px;text-anchor:middle;dominant-baseline:middle;fill:#000000;"
    small_text = "font-family:Times New Roman, serif;font-size:14px;text-anchor:middle;dominant-baseline:middle;fill:#000000;"
    
    # Center Ellipse (cx=600, cy=400)
    ET.SubElement(svg, 'ellipse', cx="600", cy="400", rx="130", ry="100", style=box_style)
    ET.SubElement(svg, 'text', x="600", y="390", style=text_style).text = "FlashGO Real-Time Logistics"
    ET.SubElement(svg, 'text', x="600", y="415", style=text_style).text = "System"
    
    # Top: Warehouse Staff & Pickers
    ET.SubElement(svg, 'rect', x="480", y="50", width="240", height="100", style=box_style)
    ET.SubElement(svg, 'text', x="600", y="100", style=text_style).text = "Warehouse Staff & Pickers"
    
    # Bottom: Admin
    ET.SubElement(svg, 'rect', x="500", y="650", width="200", height="100", style=box_style)
    ET.SubElement(svg, 'text', x="600", y="700", style=text_style).text = "Admin"
    
    # Left: Customer (Wider gap: 250 to 470)
    ET.SubElement(svg, 'rect', x="50", y="350", width="200", height="100", style=box_style)
    ET.SubElement(svg, 'text', x="150", y="400", style=text_style).text = "Customer"
    
    # Right: Driver (Wider gap: 730 to 950)
    ET.SubElement(svg, 'rect', x="950", y="350", width="200", height="100", style=box_style)
    ET.SubElement(svg, 'text', x="1050", y="400", style=text_style).text = "Driver"
    
    # Lines and Arrows
    # Left Box <-> Center
    ET.SubElement(svg, 'line', x1="250", y1="375", x2="470", y2="375", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="360", y="365", style=small_text).text = "Order Details & Payment"
    
    ET.SubElement(svg, 'line', x1="470", y1="425", x2="250", y2="425", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="360", y="415", style=small_text).text = "Live Tracking & Status Alerts"
    
    # Right Box <-> Center
    ET.SubElement(svg, 'line', x1="950", y1="375", x2="730", y2="375", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="840", y="365", style=small_text).text = "Live GPS Telemetry & Proof"
    
    ET.SubElement(svg, 'line', x1="730", y1="425", x2="950", y2="425", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="840", y="415", style=small_text).text = "Optimized Routes & Dispatch"
    
    # Top Box <-> Center
    ET.SubElement(svg, 'line', x1="570", y1="150", x2="570", y2="300", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="490", y="225", style=small_text).text = "Scanned Barcodes"
    
    ET.SubElement(svg, 'line', x1="630", y1="300", x2="630", y2="150", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="720", y="225", style=small_text).text = "Digital Picking Lists"
    
    # Bottom Box <-> Center
    ET.SubElement(svg, 'line', x1="570", y1="650", x2="570", y2="500", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="490", y="575", style=small_text).text = "System Configurations"
    
    ET.SubElement(svg, 'line', x1="630", y1="500", x2="630", y2="650", stroke="#000", **{"stroke-width": "1.5", "marker-end": "url(#arrow)"})
    ET.SubElement(svg, 'text', x="710", y="575", style=small_text).text = "Fleet Analytics"
    
    tree = ET.ElementTree(svg)
    tree.write("docs/FlashGO_CFD_Perfect.svg", encoding="utf-8", xml_declaration=True)

if __name__ == "__main__":
    create_svg()
