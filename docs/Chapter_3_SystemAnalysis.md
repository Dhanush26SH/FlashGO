# 3. SYSTEM ANALYSIS

## 3.1 Introduction
The System Analysis phase is a critical component of the software development lifecycle for FlashGO. This phase focuses on dissecting the complexities of modern quick-commerce logistics to define exactly what the system must accomplish. By thoroughly examining the operational workflows of warehouse picking, last-mile delivery, and customer order management, this chapter outlines the precise requirements and constraints that guide the technical architecture of the platform.

### 3.1.1 Purpose
The primary purpose of FlashGO is to engineer a highly efficient, real-time logistics and delivery management system. The platform is designed to eliminate operational friction by providing dedicated, role-specific digital interfaces for customers, warehouse staff (pickers), delivery personnel (drivers), and administrators. The system aims to automate task assignments, optimize physical routing within warehouses, and provide transparent live tracking. The ultimate goal is to significantly reduce order fulfillment times, minimize human error, and enhance overall customer satisfaction through technological innovation.

### 3.1.2 Scope
The scope of this project encompasses the design, development, and deployment of a multi-module Progressive Web Application (PWA) and mobile platform. It covers the entire lifecycle of an order post-purchase, including real-time inventory allocation, digital checklist generation for pickers, automated driver dispatching, and live GPS tracking for customers. The system provides a centralized Admin Dashboard for complete operational oversight. It does not include the primary e-commerce storefront or direct payment gateway processing, as it assumes orders are ingested via an API.

## 3.2 Overall Description
FlashGO is built to support the fast-paced environment of quick commerce by ensuring that all stakeholders have access to real-time, synchronized data. The system acts as a digital bridge between the warehouse floor and the customer's doorstep.

### 3.2.1 Product Perspective
FlashGO is a self-contained, cloud-based platform accessible via web browsers and mobile devices. It utilizes a responsive design to adapt to various screen sizes, ensuring that warehouse staff and drivers can operate the system easily on handheld mobile devices, while administrators can manage operations on desktop monitors. It leverages a backend-as-a-service (BaaS) model via Supabase to provide secure, authenticated access and real-time database synchronization.

### 3.2.2 Product Features
* **Role-Based Authentication:** Secure, isolated access for Customers, Pickers, Warehouse Staff, Drivers, and Admins.
* **Smart Order Routing:** Automated allocation of orders to the nearest warehouse and optimal driver.
* **Digital Picking Lists:** Optimized, physical route-based checklists for warehouse staff.
* **Live Geolocation Tracking:** Real-time map integration showing driver locations.
* **Automated Status Notifications:** Email and push notifications at key fulfillment milestones.
* **Centralized Dashboard:** Real-time analytics, user management, and order monitoring for admins.
* **Proof of Delivery:** Capability for drivers to upload photos or collect digital signatures.

### 3.2.3 User Characteristics
* **Customers:** General public ordering goods. Require an intuitive, simple interface with clear tracking information. Basic smartphone knowledge.
* **Pickers:** Personnel responsible for locating and packing items. Require a fast, highly legible mobile interface optimized for quick scanning and tapping. 
* **Warehouse Staff:** Personnel responsible for inventory restocking, vendor management, and procurement.
* **Drivers:** Delivery personnel navigating urban environments. Require clear routing, easy status toggles, and large interactive buttons for use while on the move.
* **Administrators:** Operations managers requiring a dense, data-rich dashboard. Intermediate to advanced technical and analytical skills.

### 3.2.4 General Constraints
* The system must maintain real-time synchronization, heavily relying on stable internet connectivity for mobile devices.
* The application must comply with data privacy regulations, particularly regarding the tracking and storage of customer addresses and driver GPS locations.
* The system relies on the accuracy of third-party geolocation and mapping APIs.

### 3.2.5 Assumptions and Dependencies
* It is assumed that all Pickers and Drivers possess internet-enabled mobile devices (smartphones or tablets) with functioning cameras and GPS capabilities.
* The effective operation of live tracking depends on the continuous availability and accuracy of the mobile device's GPS signal.
* The system assumes a reliable API connection to external e-commerce storefronts for order ingestion.

## 3.3 Specific Requirements

### 3.3.1 External Interface Requirements
#### 3.3.1.1 User Interface (UI)
* The UI must be developed using a mobile-first approach, ensuring all actionable buttons for Drivers and Pickers are easily accessible.
* The system must provide a clear, color-coded status indicator for orders (e.g., Yellow for Pending, Blue for Packing, Purple for Dispatched, Green for Delivered).
* Error messages must be descriptive and non-technical, guiding the user on how to resolve the issue.

#### 3.3.1.2 Hardware Interface
* **Servers:** Cloud-hosted database and application servers capable of handling high-frequency real-time WebSocket connections.
* **Client Devices:** Standard smartphones (iOS/Android) with GPS and Camera access, and desktop computers for administrative access.

#### 3.3.1.3 Software Interface
* **Frontend:** React Native (for mobile applications) and React/TypeScript (for web dashboards).
* **Backend:** Supabase (PostgreSQL) for database management, authentication, and real-time data broadcasting.
* **Mapping:** Integration with mapping services (e.g., Leaflet or Google Maps API) for routing and live tracking.

#### 3.3.1.4 Communication Interface
* The system communicates primarily via HTTPS for secure API requests and WebSockets (via Supabase Realtime) for live state synchronization.

## 3.4 Functional Requirements

### 3.4.1 Customer Module
* **Registration/Login:** Secure account creation and authentication.
* **Order History:** View past and current orders.
* **Live Tracking:** An interactive map interface displaying the real-time location of the assigned driver.
* **Status Updates:** View timestamped updates (e.g., "Order Received," "Packed," "On the Way").

### 3.4.2 Picker Module
* **Task Queue:** View a prioritized list of orders assigned to their specific warehouse.
* **Digital Checklist:** View the items in an order sorted by aisle/shelf location to optimize the walking route.
* **Item Verification:** Ability to scan item barcodes or manually tick off items to confirm collection.
* **Status Toggling:** Ability to mark an order as "Packed and Ready for Dispatch."

### 3.4.3 Warehouse Staff Module
* **Inventory Management:** View low-stock alerts and restock inventory directly from the warehouse floor.
* **Vendor Management:** Maintain records of vendors and suppliers.
* **Procurement:** Create and manage procurement drafts for stock replenishment.

### 3.4.4 Driver Module
* **Dispatch Queue:** View available or assigned delivery routes.
* **Navigation Integration:** Direct links to turn-by-turn navigation apps based on the customer's address.
* **Status Updates:** One-tap buttons to update status to "Picked Up," "Arriving," and "Delivered."
* **Proof of Delivery:** Interface to capture and upload a photo of the delivered package at the doorstep.

### 3.4.5 Admin Module
* **Dashboard Overview:** A centralized view showing total active orders, active drivers, and system health.
* **User Management:** Create, edit, and suspend accounts for Pickers, Warehouse Staff, and Drivers.
* **Order Oversight:** View detailed logs of any specific order, including timestamps and the personnel involved.
* **Warehouse Management:** Define and manage geographic delivery zones and warehouse inventories.

## 3.5 Performance Requirements
* **Response Time:** The system should reflect status changes (e.g., from "Packed" to "Dispatched") across all connected client devices within 2 seconds using real-time WebSockets.
* **Availability:** The core backend infrastructure should aim for 99.9% uptime to support continuous logistics operations.
* **Capacity:** The database and real-time engine must support thousands of concurrent connections during peak ordering hours without degradation in performance.

## 3.6 Design Constraints
* **Mobile Battery Consumption:** The Driver application must optimize GPS polling to prevent excessive battery drain during long shifts.
* **UI Clutter:** The Picker application must avoid complex menus, keeping the interface strictly focused on the checklist and scanning functions to maximize picking speed.

## 3.7 Other Requirements
* **Reliability:** Form validation must be strictly enforced on the frontend and backend to prevent malformed data (e.g., invalid GPS coordinates) from corrupting the delivery workflow.
* **Portability:** The web applications must render correctly on modern browsers (Chrome, Safari, Edge, Firefox), and the mobile app should support recent versions of iOS and Android.
* **Timeliness:** Data synchronization must happen instantaneously; stale data in a quick-commerce environment directly leads to failed deliveries.

## 3.8 Safety Requirements
* The system should provide an "Emergency / Trouble" button in the Driver module to quickly alert administrators if a driver encounters an accident or unsafe condition on their route.
* Drivers should be prompted not to interact with the application while actively driving, promoting road safety.

## 3.9 Security Requirements
* **Data Encryption:** All data transmitted between the client and server must be encrypted using TLS/SSL protocols.
* **Authentication:** Strong password policies and secure token-based authentication (JWT) managed via Supabase Auth.
* **Authorization:** Strict Role-Based Access Control (RBAC) to ensure that a user can only access data relevant to their role (e.g., Pickers cannot view administrative financial reports).
* **Privacy:** Customer addresses and contact information must be obfuscated or hidden from drivers once a delivery is completed to protect consumer privacy.
