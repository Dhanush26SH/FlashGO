# 4. DESIGN AND METHODOLOGY

## 4.1 System Design
System design is the foundational phase of software development where the overarching architecture, components, modules, interfaces, and data for a system are defined to satisfy specified requirements. System design aims to identify the discrete modules that form the system and how they interact in a cohesive manner. It serves as the blueprint for the implementation phase. 

For the FlashGO platform, system design involves orchestrating a multi-tiered architecture that seamlessly integrates a customer-facing frontend, specialized mobile applications for warehouse staff and drivers, and a robust administrative dashboard. Because FlashGO operates in the quick-commerce space, the design emphasizes real-time data synchronization, low latency, high availability, and geographic routing. The primary goal of this design process is to translate the functional and non-functional requirements established during the system analysis phase into a structured, logical framework that developers can build upon.

### 4.1.1 Functional Decompositions
Functional decomposition is the process of breaking down a complex system into smaller, more manageable, and highly cohesive modules. For FlashGO, the system is decomposed into four primary, interacting modules. Each module is specifically tailored to the unique workflow of a distinct user persona.

**1. Customer Module:**
The Customer Module is designed to provide an intuitive and frictionless shopping experience. It empowers the end-user to browse products, place orders, and track those orders in real-time. The decomposition of this module includes sub-functions such as:
* **Authentication & Profile Management:** Secure login (via OTP or password) and management of delivery addresses.
* **Product Catalog & Cart:** Browsing categorized inventory, searching for items, and managing cart states.
* **Checkout & Payment:** Processing order requests and initiating the fulfillment lifecycle.
* **Live Order Tracking:** Receiving real-time updates and viewing the assigned driver's location on an interactive map using geographic coordinates synchronized via the backend.

**2. Picker Module:**
The Picker Module is an internal application designed strictly for warehouse efficiency. It is built to minimize the cognitive load on warehouse staff and reduce the physical travel time required to pack an order. Sub-functions include:
* **Task Allocation:** Receiving push notifications and a prioritized queue of orders assigned to the picker's specific warehouse.
* **Optimized Routing Checklist:** Displaying order items sorted by their physical shelf or aisle location to prevent unnecessary backtracking.
* **Barcode Verification:** Utilizing the device camera to scan item barcodes, ensuring the correct product is packed and significantly reducing fulfillment errors.
* **Exception Handling:** Allowing pickers to mark items as out-of-stock and automatically triggering inventory alerts to the Warehouse Staff.

**3. Warehouse Staff (Manager) Module:**
Distinct from the picker role, the Warehouse Staff Module is focused on inventory health and procurement. Sub-functions include:
* **Inventory Monitoring:** Real-time visibility into stock levels, with automated alerts for low-stock items.
* **Restocking & Adjustments:** Tools to manually adjust stock counts or log damaged goods.
* **Vendor & Procurement Management:** Creating, submitting, and tracking purchase orders or restocking requests from external suppliers.

**4. Driver Module:**
The Driver Module is an application designed for delivery personnel operating in the field. It focuses on routing, status updates, and proof of delivery. Sub-functions include:
* **Gig/Order Assignment:** Viewing a queue of packed orders ready for dispatch and accepting delivery tasks.
* **Turn-by-Turn Navigation:** Integrating with native mapping applications (like Google Maps or Apple Maps) using the customer's coordinates.
* **Delivery Milestones:** Simple, one-tap buttons to update the system status (e.g., "Picked Up," "Arriving," "Delivered").
* **Verification:** Capturing a photograph of the delivered package or collecting a customer signature to serve as verifiable proof of delivery.

**5. Admin Module:**
The Admin Module acts as the central nervous system of FlashGO. It is a web-based dashboard providing overarching control. Sub-functions include:
* **Fleet & Telemetry Tracking:** A live map displaying the real-time location of all active drivers across the city.
* **Order Oversight:** Deep-dive capabilities into individual orders to resolve disputes or investigate delays.
* **User & Role Management:** The ability to onboard, suspend, or modify permissions for any user in the system.
* **Data Analytics:** Aggregating data to display key performance indicators (KPIs) such as average delivery time, picker efficiency, and high-demand zones.

### 4.1.2 Description of Programs

#### 4.1.2.1 Use Case Diagrams
A Use Case Diagram is a behavioral UML diagram that visually represents the interactions between users (actors) and the system. It defines the system's boundary and outlines what the system should do from the user's perspective without detailing how it does it. 

**Notations used in Use Case Diagrams:**
* **Actor (Stick Figure):** Represents a person, external system, or organization that interacts with the system.
* **Use Case (Oval):** Represents a specific function or action performed by the system.
* **System Boundary (Box):** Defines the scope of the system; use cases inside the box belong to the system, while actors are outside.
* **Association (Solid Line):** Connects an actor to a use case, indicating interaction.
* **Include/Extend (Dashed Arrow):** Represents relationships between use cases (e.g., 'Checkout' *includes* 'Payment Processing').

**FlashGO Use Case Scenarios:**
* **Customer Actor:** Interacts with use cases such as *Register/Login*, *Browse Catalog*, *Add to Cart*, *Checkout*, and *Track Order*. The *Track Order* use case includes retrieving real-time GPS data.
* **Picker Actor:** Interacts with use cases such as *View Pending Orders*, *Scan Item Barcode*, *Mark Out of Stock*, and *Update Status to Packed*.
* **Warehouse Staff Actor:** Interacts with *View Low Stock*, *Manage Vendors*, and *Create Procurement Draft*.
* **Driver Actor:** Interacts with *Accept Delivery*, *Navigate to Customer*, *Update Delivery Status*, and *Upload Proof of Delivery*.
* **Admin Actor:** Interacts with *Monitor Fleet Map*, *Manage Users*, *Generate Analytics Reports*, and *Manage Warehouse Zones*.

#### 4.1.2.2 Context Flow Diagram (CFD)
A Context Flow Diagram represents the entire system as a single, high-level process and illustrates the external entities that interact with it, along with the data flowing between them. It establishes the boundary of the system.

In the FlashGO CFD:
* The **Central Node** is the "FlashGO Real-Time Logistics System."
* **External Entity: Customer** sends data inputs like "Order Details" and "Location Coordinates" to the system and receives "Order Status" and "Live Driver Location" as outputs.
* **External Entity: Picker** receives "Digital Picking Lists" from the system and sends back "Item Verification Scans" and "Packed Confirmations."
* **External Entity: Driver** receives "Delivery Assignments" and "Routing Data" from the system, and continuously sends back "Live GPS Coordinates" and "Delivery Confirmations."
* **External Entity: Admin** receives "Aggregated System Analytics" and "Fleet Telemetry" and sends "Configuration Settings" and "User Management Commands."

## 4.2 Detailed Design
Detailed design is the phase where the internal logic, database structures, and specific data flows of each module are meticulously defined. It expands upon the system design by specifying how the system will achieve its functional goals, serving as a direct reference for software engineers during coding.

### 4.2.1 Data Flow Diagrams (DFD)
Data Flow Diagrams map out the flow of information for any process or system. They use defined symbols like rectangles for external entities, circles or rounded rectangles for processes, and open-ended rectangles for data stores. 

**FlashGO Level 1 DFD Example (Order Processing Lifecycle):**
1. **Process 1.0 (Order Ingestion):** Customer submits cart data. Process validates inventory against the *Products Data Store*. If valid, order is written to the *Orders Data Store* with a status of 'Pending'.
2. **Process 2.0 (Task Allocation):** The system triggers a real-time event. The Picker app reads the 'Pending' order from the *Orders Data Store* and the layout from the *Warehouse Topology Data Store*.
3. **Process 3.0 (Picking Verification):** Picker scans items. Data flows to update the *Order Items Data Store*. Once complete, the order status in the *Orders Data Store* is updated to 'Packed'.
4. **Process 4.0 (Driver Dispatch):** The system reads 'Packed' orders. It cross-references driver locations from the *Active Drivers Data Store* and assigns the optimal driver. 
5. **Process 5.0 (Last-Mile Tracking):** Driver's app continuously pushes GPS coordinates to the *Live Telemetry Store*, which is instantly broadcasted to the Customer's app.
6. **Process 6.0 (Completion):** Driver submits proof of delivery. The *Orders Data Store* is updated to 'Delivered', and a notification flows to the Customer.

### 4.2.2 Structure Chart
A Structure Chart is a top-down modular design tool that illustrates the hierarchical organization of a system's modules and the control flow between them. 

**FlashGO Administrative Structure Chart:**
* **Root Node:** Admin Dashboard Main Controller
  * **Sub-module A:** User Management
    * *Function:* Add/Edit/Delete Staff
    * *Function:* Manage Role Permissions
  * **Sub-module B:** Fleet Management
    * *Function:* Live Map Rendering (WebSocket listener)
    * *Function:* Driver Assignment Override
  * **Sub-module C:** Warehouse Management
    * *Function:* Inventory CRUD operations
    * *Function:* Zone Definition (Geo-fencing)
  * **Sub-module D:** Analytics & Reports
    * *Function:* Query Historical Order Data
    * *Function:* Generate PDF/Excel Exports

### 4.2.3 UML Class Diagram
A UML Class Diagram represents the static structure of the application, defining the classes, their attributes, methods, and the relationships between them (such as inheritance, association, and aggregation). 

**Key Classes in FlashGO:**
* **User Class:** Attributes: `id`, `name`, `phone`, `role`, `created_at`. Methods: `login()`, `updateProfile()`.
* **Order Class:** Attributes: `order_id`, `customer_id`, `status`, `total_amount`, `delivery_address`, `assigned_driver_id`, `warehouse_id`. Methods: `calculateTotal()`, `updateStatus()`.
* **Product Class:** Attributes: `product_id`, `name`, `sku`, `price`, `stock_quantity`, `aisle_location`. Methods: `updateStock()`, `checkAvailability()`.
* **Delivery Class:** Attributes: `delivery_id`, `order_id`, `driver_id`, `pickup_time`, `dropoff_time`, `proof_image_url`. Methods: `completeDelivery()`, `updateCoordinates()`.

*Relationships:* One `User` (Customer) can have many `Orders` (1-to-Many). One `Order` contains many `Products` (Many-to-Many, resolved via an Order_Items table). One `User` (Driver) can have many `Deliveries` assigned to them.

## 4.3 Database Design
Database design is the process of producing a detailed data model of the database schema. FlashGO utilizes PostgreSQL (via Supabase), a highly robust relational database, to ensure data integrity, support complex querying, and facilitate real-time WebSocket broadcasting upon table changes. The tables are normalized to reduce redundancy and enforce referential integrity using primary and foreign keys.

### 4.3.1 Table Descriptions

#### 4.3.1.1 Users Table
The central table managing all identities across the system, implementing role-based access.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Unique identifier generated upon registration |
| name | VARCHAR | Not Null | Full name of the user |
| phone | VARCHAR | Unique, Not Null | Contact number, often used for login or driver-customer contact |
| email | VARCHAR | Unique, Not Null | Email address for receipts and notifications |
| role | ENUM | Not Null | Defines access level (e.g., 'customer', 'picker', 'driver', 'admin') |
| created_at | TIMESTAMP | Not Null | Record creation time |

#### 4.3.1.2 Warehouses Table
Stores physical locations of fulfillment centers.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Unique warehouse identifier |
| name | VARCHAR | Not Null | Human-readable name of the facility |
| latitude | DECIMAL | Not Null | Geographic latitude for proximity routing |
| longitude | DECIMAL | Not Null | Geographic longitude |
| service_radius_km | INTEGER | Not Null | Maximum distance this warehouse serves |

#### 4.3.1.3 Products Table
Maintains the catalog and overarching inventory details.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Product identifier |
| sku | VARCHAR | Unique, Not Null | Stock Keeping Unit for barcode scanning |
| name | VARCHAR | Not Null | Name of the item |
| price | DECIMAL(10,2) | Not Null, > 0 | Current selling price |
| category | VARCHAR | Not Null | Organizational category (e.g., 'Produce', 'Dairy') |
| image_url | VARCHAR | Nullable | Path to the product image for the customer app |

#### 4.3.1.4 Warehouse_Inventory Table
A junction table resolving the many-to-many relationship between Warehouses and Products, enabling location-specific stock tracking.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Record ID |
| warehouse_id | UUID | Foreign Key | The specific fulfillment center |
| product_id | UUID | Foreign Key | The specific product |
| stock_quantity | INTEGER | Not Null, >= 0 | Current units available at this location |
| aisle_location | VARCHAR | Nullable | Physical shelf/aisle code (e.g., 'A12-B') used to optimize picker routes |

#### 4.3.1.5 Orders Table
The core transactional table tracking the lifecycle of a purchase.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Unique order identifier |
| customer_id | UUID | Foreign Key | The user who placed the order |
| warehouse_id | UUID | Foreign Key | The fulfillment center assigned |
| driver_id | UUID | Foreign Key, Nullable | The delivery partner assigned |
| status | ENUM | Not Null | Current state ('placed', 'packed', 'dispatched', 'delivered') |
| total_amount | DECIMAL(10,2) | Not Null | Final cost |
| delivery_lat | DECIMAL | Not Null | Customer's delivery latitude |
| delivery_lng | DECIMAL | Not Null | Customer's delivery longitude |
| created_at | TIMESTAMP | Not Null | When the order was placed |
| delivered_at | TIMESTAMP | Nullable | When the drop-off was confirmed |

#### 4.3.1.6 Order_Items Table
Details the specific products within an order.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Record ID |
| order_id | UUID | Foreign Key | The parent order |
| product_id | UUID | Foreign Key | The purchased item |
| quantity | INTEGER | Not Null, > 0 | Number of units ordered |
| picked | BOOLEAN | Default FALSE | Toggled by the Picker app when the item is physically collected |
| price_at_time | DECIMAL(10,2) | Not Null | Historical price record |

#### 4.3.1.7 Driver_Telemetry Table (Volatile Data)
Used for live tracking; this table experiences high-frequency updates and leverages Supabase's Realtime capabilities.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| driver_id | UUID | Primary Key | The active driver |
| current_lat | DECIMAL | Not Null | Latest reported latitude |
| current_lng | DECIMAL | Not Null | Latest reported longitude |
| heading | DECIMAL | Nullable | Direction of travel for smooth map animation |
| last_updated | TIMESTAMP | Not Null | Time of the last ping |

#### 4.3.1.8 Procurement Table
Used by the Warehouse Staff module for restocking.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Draft identifier |
| warehouse_id | UUID | Foreign Key | Requesting location |
| vendor_id | UUID | Foreign Key | Supplier identifier |
| status | ENUM | Not Null | State of the order ('draft', 'submitted', 'received') |
| expected_delivery| DATE | Nullable | ETA for the stock arrival |

#### 4.3.1.9 Payments Table
Records all financial transactions related to customer orders.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Transaction identifier |
| order_id | UUID | Foreign Key | The associated order |
| customer_id | UUID | Foreign Key | The user paying |
| amount | DECIMAL(10,2) | Not Null | The transaction total |
| payment_method | ENUM | Not Null | 'Credit Card', 'UPI', 'Wallet', 'Cash' |
| status | ENUM | Not Null | 'Pending', 'Completed', 'Failed', 'Refunded' |
| gateway_transaction_id | VARCHAR | Nullable | External reference ID from the payment provider |

#### 4.3.1.10 Wallets Table
Manages the internal digital wallets for customers (for refunds/cashback) and drivers (for payouts/earnings).

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Wallet identifier |
| user_id | UUID | Foreign Key, Unique| The owner of the wallet |
| balance | DECIMAL(10,2) | Not Null | Current available funds |
| currency | VARCHAR | Default 'INR' | Currency identifier (e.g., 'INR', 'USD') |
| last_updated | TIMESTAMP | Not Null | Last time the balance was modified |

#### 4.3.1.11 Shift_Slots Table
Manages the scheduling and availability of Drivers and Pickers in the logistics network.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Slot identifier |
| warehouse_id | UUID | Foreign Key | The facility requiring staff |
| user_id | UUID | Foreign Key | The assigned staff member |
| start_time | TIMESTAMP | Not Null | Beginning of the shift |
| end_time | TIMESTAMP | Not Null | End of the shift |
| role | ENUM | Not Null | 'Driver' or 'Picker' |
| status | ENUM | Not Null | 'Scheduled', 'Checked-In', 'Completed', 'Missed' |

#### 4.3.1.12 Support_Tickets Table
Centralizes customer complaints, driver disputes, and operational issues for the Admin to resolve.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Ticket ID |
| user_id | UUID | Foreign Key | The person who raised the issue |
| order_id | UUID | Foreign Key, Nullable | Relevant order if applicable |
| issue_category | ENUM | Not Null | 'Late Delivery', 'Missing Item', 'Payment Issue', 'App Bug' |
| description | TEXT | Not Null | Detailed explanation of the issue |
| status | ENUM | Not Null | 'Open', 'In-Progress', 'Resolved', 'Closed' |
| assigned_admin_id| UUID | Foreign Key, Nullable | Admin handling the ticket |

#### 4.3.1.13 Delivery_Zones Table
Defines the geospatial boundaries (geofences) mapped to each dark store.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Zone identifier |
| warehouse_id | UUID | Foreign Key | The parent warehouse |
| zone_name | VARCHAR | Not Null | e.g., 'Koramangala Block 3' |
| polygon_coordinates | JSONB | Not Null | Array of lat/lng points defining the precise delivery area boundary |
| is_active | BOOLEAN | Default TRUE | Whether the zone is currently being served |

#### 4.3.1.14 Notifications Table
Stores historical logs of all system alerts, emails, and push notifications sent to users.

| Column Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| id | UUID | Primary Key | Notification ID |
| user_id | UUID | Foreign Key | The recipient |
| title | VARCHAR | Not Null | Summary of the alert |
| body | TEXT | Not Null | Full message content |
| type | ENUM | Not Null | 'Order Update', 'Shift Reminder', 'Promo', 'System Alert' |
| is_read | BOOLEAN | Default FALSE | Read status toggled by the user |
| created_at | TIMESTAMP | Not Null | When the notification was dispatched |
