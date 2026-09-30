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

### A. Hardware Requirements
* **Server:** Cloud-hosted scalable infrastructure (e.g., Supabase / AWS).
  * **Processor:** Intel Core i5/i7 equivalent or higher for handling concurrent WebSockets.
  * **Memory (RAM):** Minimum 8 GB (16 GB recommended for high concurrent multi-stream loads).
  * **Storage:** 50 GB Solid-State Drive (SSD) storage (for database, logs, and user data).
* **Client / Mobile Terminal:**
  * **Hardware:** Standard PC/laptop for Admin; modern smartphone (iOS/Android) for Pickers, Drivers, and Customers.
  * **Input Devices:** Touch input (mobile), standard keyboard and mouse (Admin dashboard).
  * **Peripherals:** Integrated smartphone camera (minimum 720p for barcode scanning and proof of delivery) and integrated GPS module (for routing).

### B. Software & Runtime Environment
* **Operating System:** Windows 10/11, macOS, Ubuntu (for Admin); iOS 13+ or Android 8.0+ (for Mobile Clients).
* **Programming Language:** TypeScript, JavaScript, SQL.
* **Web Framework:** React 18+ (Admin Web) and React Native / Expo (Mobile Apps).
* **Database Engine:** PostgreSQL (managed via Supabase).
* **Real-time Core:** Supabase Realtime (WebSockets).
* **Client Web Browser:** Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari supporting HTML5 and WebSockets.

### C. Network Infrastructure
* **Network Standard:** 4G/5G Cellular Network or stable Wi-Fi (802.11 b/g/n/ac) for continuous client-server communication and live GPS telemetry. External internet connectivity is strictly required for real-time operations.

## 3.4 Functional Requirements (FR)
• **FR-01: Multi-Role Authentication & Access Control:** The system must enforce secure, role-based login for Customer, Picker, Warehouse Staff, Driver, and Admin personas, guaranteeing that each role accesses only authorized interfaces and REST/WebSocket endpoints.
• **FR-02: Customer Profile & Order Management:** Authorized customers must be able to register, edit metadata (name, phone, delivery address), browse the product catalog, and seamlessly place delivery orders.
• **FR-03: Real-Time Order Routing & Task Assignment:** The backend engine must automatically process incoming orders and intelligently route them to the nearest warehouse based on geographic proximity, instantly appending the task to the local Picker's queue.
• **FR-04: Digital Picking & Inventory Verification:** Pickers must utilize a mobile-optimized interface to view digital checklists, scan barcodes or manually verify items, and seamlessly toggle order statuses to 'Packed'.
• **FR-05: Real-Time Fleet Geolocation:** The application must capture GPS coordinates from the assigned Driver's mobile device and transmit them to the server-side database via WebSockets, allowing live tracking without page reloads.
• **FR-06: Atomic Order State Transitions:** A strict database constraint and transactional check must ensure that an order transitions linearly through states (Pending -> Packed -> Dispatched -> Delivered) to prevent duplicate processing or overlapping assignments.
• **FR-07: Warehouse Procurement & Restocking:** Warehouse Staff must possess privileges to generate procurement drafts, track low-stock alerts, and manually adjust inventory counts in exceptional scenarios (e.g., damaged goods).
• **FR-08: Analytical Dashboards & Performance Alerts:** The platform must calculate real-time logistical metrics per warehouse and display intuitive status indicators for pending orders, active drivers, and average delivery times.
• **FR-09: One-Click Report Export:** Administrators must have the ability to instantly generate and download consolidated order histories and delivery performance summaries in PDF/CSV format for operational audits.

## 3.5 Performance Requirements (PR)
• **PR-01: Low-Latency Synchronization:** Database state changes (e.g., status updates) must be synchronized across all connected client devices in under 200 milliseconds via Supabase WebSockets, enabling fluid, real-time feedback on web and mobile clients.
• **PR-02: High Concurrency Throughput:** The backend infrastructure must maintain an operational uptime of 99.9% and gracefully handle thousands of concurrent read/write operations during peak ordering hours without degradation in database response times.

## 3.6 Design Constraints (DC)
• **DC-01: Commodity Mobile Hardware Operation:** The Picker and Driver mobile applications must run efficiently on low-cost, commodity smartphones without requiring high-end processors or excessive battery drainage.
• **DC-02: Web Standard API Dependency:** Client-side operations rely strictly on standardized HTML5 and WebSockets, constraining client execution to modern, updated web browsers without external plugins.
• **DC-03: API-Driven E-Commerce Integration:** The platform's scope is strictly constrained to logistics management, operating under the assumption that customer orders are securely ingested via a standardized external API connection.

## 3.7 Other Non-Functional Requirements (OR)
• **OR-01: Usability & Responsiveness:** The graphical user interface must be modern, intuitive, and fully responsive across desktops, laptops, and mobile screens, requiring zero specialized technical training for warehouse staff or drivers.
• **OR-02: Software Portability:** The system must run natively within standard browser environments across Windows, Linux, or macOS for administrative tasks, while mobile apps must cross-compile reliably for both iOS and Android platforms via React Native/Expo.

## 3.8 Safety Requirements (SR)
• **SR-01: Driver Distraction Mitigation:** To promote road safety, the Driver module interface must utilize large, high-contrast UI elements and prompt drivers not to interact with complex application flows while actively operating a vehicle.
• **SR-02: Emergency Communication Protocol:** The system should provide an integrated distress or trouble-reporting mechanism within the Driver module to quickly alert administrators if a driver encounters an accident or unsafe condition on their route.

## 3.9 Security Requirements (SEC)
• **SEC-01: Cryptographic Credential Protection:** User credentials must never be stored in plaintext; passwords must be salted, hashed, and managed securely using robust encryption algorithms via the Supabase Auth provider.
• **SEC-02: Transport Layer Security:** All data transmitted between the client and server must be strictly encrypted using TLS/SSL protocols to prevent man-in-the-middle attacks and data interception.
• **SEC-03: Consumer Data Privacy:** Customer addresses and personal contact information must be obfuscated or hidden from drivers immediately once a delivery is marked as completed, strictly enforcing consumer privacy.
• **SEC-04: Authorization Integrity:** Server-side Row Level Security (RLS) policies and middleware route guards must strictly validate user session permissions to ensure customers or staff cannot access administrative endpoints or manipulate unauthorized records.
