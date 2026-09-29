import xml.etree.ElementTree as ET

def create_svg():
    svg = ET.Element('svg', xmlns="http://www.w3.org/2000/svg", viewBox="0 0 1000 950", width="1000", height="950")
    
    # Background
    ET.SubElement(svg, 'rect', width="1000", height="950", fill="#ffffff")
    
    # Styles
    box_style = "fill:#ffffff;stroke:#000000;stroke-width:1.5;"
    line_style = "stroke:#000000;stroke-width:1.5;"
    text_style_title = "font-family:Times New Roman, serif;font-size:18px;text-anchor:middle;dominant-baseline:middle;fill:#000000;"
    text_style_attr = "font-family:Times New Roman, serif;font-size:16px;text-anchor:start;dominant-baseline:middle;fill:#000000;"
    text_style_meth = "font-family:Times New Roman, serif;font-size:16px;text-anchor:start;dominant-baseline:middle;fill:#000000;"
    
    def draw_class_box(cx, cy, w, h, title, attributes, methods=None):
        x = cx - w/2
        y = cy - h/2
        # Outer box
        ET.SubElement(svg, 'rect', x=str(x), y=str(y), width=str(w), height=str(h), style=box_style)
        
        # Title section
        ET.SubElement(svg, 'text', x=str(cx), y=str(y + 20), style=text_style_title).text = title
        ET.SubElement(svg, 'line', x1=str(x), y1=str(y + 40), x2=str(x + w), y2=str(y + 40), style=line_style)
        
        # Attributes section
        attr_y = y + 65
        for attr in attributes:
            ET.SubElement(svg, 'text', x=str(x + 15), y=str(attr_y), style=text_style_attr).text = attr
            attr_y += 22
            
        # Methods section
        if methods:
            # Place it lower to match the aesthetic
            meth_start_y = y + 230
            if len(attributes) > 8:
                meth_start_y = y + 250
                
            ET.SubElement(svg, 'line', x1=str(x), y1=str(meth_start_y), x2=str(x + w), y2=str(meth_start_y), style=line_style)
            meth_y = meth_start_y + 25
            for meth in methods:
                ET.SubElement(svg, 'text', x=str(x + 15), y=str(meth_y), style=text_style_meth).text = meth
                meth_y += 22

    # Top Box: Customer (cx=500, cy=200, w=300, h=400)
    draw_class_box(
        500, 200, 300, 400,
        "Customer",
        [
            "id: uuid",
            "name: string",
            "phone: string",
            "email: string",
            "address: string",
            "wallet_balance: float",
            "account_status: string",
            "created_at: date"
        ],
        [
            "login()",
            "updateProfile()",
            "placeOrder()",
            "trackLiveOrder()",
            "addFunds()",
            "viewHistory()"
        ]
    )
    
    # Bottom Left: Orders (cx=200, cy=700, w=280, h=350)
    draw_class_box(
        200, 700, 280, 350,
        "Orders",
        [
            "id: uuid",
            "customer_id: uuid",
            "driver_id: uuid",
            "status: string",
            "total_amount: float",
            "created_at: date",
            "dropoff_lat: float",
            "dropoff_lng: float",
            "payment_status: string"
        ],
        [
            "processOrder()",
            "cancelOrder()",
            "rateDelivery()"
        ]
    )
    
    # Bottom Center: Order Details (cx=500, cy=700, w=280, h=350)
    draw_class_box(
        500, 700, 280, 350,
        "Order Details",
        [
            "id: uuid",
            "order_id: uuid",
            "product_name: string",
            "quantity: int",
            "unit_price: float",
            "subtotal: float",
            "warehouse_id: uuid",
            "picker_id: uuid",
            "packed_at: date"
        ]
    )
    
    # Bottom Right: Order History (cx=800, cy=700, w=280, h=350)
    draw_class_box(
        800, 700, 280, 350,
        "Order History",
        [
            "id: uuid",
            "order_id: uuid",
            "date: date",
            "status: string",
            "remarks: string",
            "latitude: float",
            "longitude: float",
            "updated_by: string",
            "timestamp: timestamp"
        ]
    )
    
    # Lines and labels
    # Top box bottom edge Y = 400
    # Bottom boxes top edge Y = 525
    
    # Left Line: 400,400 to 250,525
    ET.SubElement(svg, 'line', x1="400", y1="400", x2="250", y2="525", style=line_style)
    ET.SubElement(svg, 'text', x="385", y="425", style=text_style_attr).text = "1"
    ET.SubElement(svg, 'text', x="235", y="505", style=text_style_attr).text = "*"
    txt1 = ET.SubElement(svg, 'text', x="310", y="445", style=text_style_attr, transform="rotate(-39.8, 310, 445)")
    txt1.text = "Manages"
    
    # Middle Line: 500,400 to 500,525
    ET.SubElement(svg, 'line', x1="500", y1="400", x2="500", y2="525", style=line_style)
    ET.SubElement(svg, 'text', x="485", y="425", style=text_style_attr).text = "1"
    ET.SubElement(svg, 'text', x="485", y="505", style=text_style_attr).text = "*"
    txt2 = ET.SubElement(svg, 'text', x="485", y="462", style=text_style_attr, transform="rotate(-90, 485, 462)")
    txt2.text = "View"
    
    # Right Line: 600,400 to 750,525
    ET.SubElement(svg, 'line', x1="600", y1="400", x2="750", y2="525", style=line_style)
    ET.SubElement(svg, 'text', x="615", y="425", style=text_style_attr).text = "1"
    ET.SubElement(svg, 'text', x="765", y="505", style=text_style_attr).text = "*"
    txt3 = ET.SubElement(svg, 'text', x="670", y="445", style=text_style_attr, transform="rotate(39.8, 670, 445)")
    txt3.text = "View"

    tree = ET.ElementTree(svg)
    tree.write("docs/FlashGO_UML_Perfect.svg", encoding="utf-8", xml_declaration=True)

if __name__ == "__main__":
    create_svg()
