# FlashGO - Complete Exhaustive Page-by-Page UI Sketch Prompts for Stitch AI

Here is the absolute complete list of UI sketch prompts, matching **every single view and component** present in the FlashGO source code (`src/views/` and the mobile apps). You can use these to generate every individual page in Stitch AI.

---

## 1. Super Admin Control Center (Web Modules - `src/views/Admin/modules`)

### 1.1. Admin Login & Layout (`AdminView.tsx`)
**Prompt for Stitch AI:**
> Design a desktop web login and layout shell for an enterprise Super Admin Control Center. Clean dark mode aesthetic. Login screen with email, password, and a role dropdown (Super Admin, Support Ops, Warehouse Lead). Once logged in, show a persistent left sidebar with icons for all administrative modules.

### 1.2. Overview Dashboard (`OverviewDashboard.tsx`)
**Prompt for Stitch AI:**
> Design a desktop web overview dashboard. Top section contains four KPI cards: Total Revenue, Active Orders, Fleet Online, and Avg Delivery Time. Below that, a large real-time line chart showing order volume over the last 24 hours. Right side contains a vertical feed of system activity logs.

### 1.3. Order Management (`OrderManagement.tsx`)
**Prompt for Stitch AI:**
> Design a split-screen order management console for a quick-commerce admin. Left pane is a vertical scrolling list of active orders with color-coded status badges (Processing, Picking, Dispatched). Right pane shows full details of the selected order, including customer address, items ordered, and the assigned delivery driver.

### 1.4. Product Catalog (`ProductCatalog.tsx`)
**Prompt for Stitch AI:**
> Design a desktop web product catalog manager. A large data table listing inventory items with columns for Image, Name, Category, Price, and Actions (Edit/Delete). Include a "Add Product" button at the top right, and search/filter bars at the top.

### 1.5. Inventory & Warehouse (`InventoryWarehouse.tsx`)
**Prompt for Stitch AI:**
> Design a warehouse inventory management screen. A data table showing stock levels across different micro-fulfillment centers. Crucially, include a column for "Warehouse Coordinates" (e.g., Aisle-A, Rack-1, Shelf-2) that can be edited inline. Add visual alerts for low-stock items.

### 1.6. Staff Management (`StaffManagement.tsx`)
**Prompt for Stitch AI:**
> Design a fleet and staff management dashboard. A calendar Gantt-chart view showing delivery riders and warehouse pickers on the Y-axis and time slots on the X-axis. Colored blocks represent assigned shifts. Include a side panel to add new staff members or change their current status (Active, Break, Offline).

### 1.7. Marketing & CMS (`MarketingCMS.tsx`)
**Prompt for Stitch AI:**
> Design a marketing and CMS dashboard for an e-commerce app. A section to upload and manage promotional banners for the mobile app home screen. A form to create new discount codes (e.g., "FLASH20") with fields for discount percentage, expiry date, and usage limits.

### 1.8. User Coupon Wallet (`UserCouponWallet.tsx`)
**Prompt for Stitch AI:**
> Design a customer wallet and coupon administration screen. A searchable data table listing customers, their current FlashWallet balance, and VIP Loyalty Stars. Include a button to manually issue refunds or credit loyalty points to a user's account.

### 1.9. Support & Settings (`SupportSettings.tsx`)
**Prompt for Stitch AI:**
> Design a system settings and support ticketing screen. Left side shows a list of active customer support tickets (refund requests, missing items). Right side shows a chat interface to reply to the customer. Top navigation tabs for General Settings, API Keys, and Notification preferences.

---

## 2. Web Portals (`src/views/`)

### 2.1. Customer Web Portal (`CustomerView.tsx`)
**Prompt for Stitch AI:**
> Design a responsive web version of a quick-commerce storefront. A top navigation bar with a search field and cart icon. The main area displays a grid of grocery products with "Add to Cart" buttons. A floating cart sidebar on the right side showing the order summary and checkout button.

### 2.2. Delivery Web Portal (`DeliveryView.tsx`)
**Prompt for Stitch AI:**
> Design a responsive web dashboard for delivery dispatchers. A large interactive city map showing moving markers for all active delivery riders. A side panel listing unassigned orders waiting for a driver, with a drag-and-drop interface to manually assign orders to specific riders.

### 2.3. Picker Web Portal (`PickerView.tsx`)
**Prompt for Stitch AI:**
> Design a responsive web dashboard for warehouse pickers. A large checklist view showing the current order being packed. Items are sorted by warehouse coordinates (Aisle, Rack, Shelf). Each item has a large checkbox to mark it as picked, and a barcode scanner input field.

### 2.4. Warehouse Web Portal (`WarehouseView.tsx`)
**Prompt for Stitch AI:**
> Design a high-level warehouse overview dashboard for a specific micro-fulfillment center. Shows real-time metrics: current picking speed (items per minute), active picker staff, and backlog of pending orders. Visual layout of the warehouse aisles with heatmaps indicating busy sections.

---

## 3. Customer Mobile App (`mobile-customer`)

### 3.1. Customer Auth Screen
**Prompt for Stitch AI:**
> Create a mobile app login screen. Clean white background with "Welcome to FlashGO". A glassmorphism input field for "Mobile Number" with country code. A bright orange "Send OTP" button, and a numeric keypad for OTP verification.

### 3.2. Main Storefront & Categories
**Prompt for Stitch AI:**
> Design a mobile grocery app home screen. Sticky header with delivery address and search bar. Horizontal promo banners. Grid of category cards (Fresh Produce, Snacks) with 3D icons. Bottom navigation bar (Home, Wallet, Profile).

### 3.3. Product Details & Shopping Cart Modal
**Prompt for Stitch AI:**
> Design a mobile app product page with a high-quality product image, price, and description. Include a fixed bottom bar with a quantity selector and "Add to Basket". Also design a slide-up Shopping Cart modal showing itemized list, promo code input, and a "Pay with FlashWallet" checkout button.

### 3.4. Live Order Tracking (Telemetry Map)
**Prompt for Stitch AI:**
> Design a mobile app live order tracking screen. Top half is a dark-themed vector map with a route line and moving motorcycle icon, showing speed and ETA. Bottom half is a sliding panel with a status timeline (Packed, Dispatched) and a large, bold "Secure Drop-off OTP" for the customer to give the driver.

### 3.5. Review Modal & Loyalty Profile
**Prompt for Stitch AI:**
> Design a mobile app user profile and order review flow. The profile shows a VIP Gold Loyalty card with a progress bar and Star balance. The review modal pops up asking to rate the delivery driver (1-5 stars) and rate individual products, with a "Submit" button.

---

## 4. Staff Mobile App (`mobile-staff`)

### 4.1. Staff Login & Role Selection
**Prompt for Stitch AI:**
> Create a staff mobile app login screen. Utilitarian dark theme. Login fields for Employee ID. After login, show two large cards to select a profile: "Smart Picker Mode" (warehouse icon) and "Driver Mode" (motorcycle icon).

### 4.2. Smart Picker Dashboard & Active Pick Checklist
**Prompt for Stitch AI:**
> Design a mobile app for warehouse pickers. Shows an "Active Picking Queue" of orders. Once an order is started, it displays a checklist of items sorted by warehouse coordinates (e.g., A-R1-S2). Includes a "Scan Barcode" button and checkboxes for each item.

### 4.3. Bag Tagging & Driver Dispatch
**Prompt for Stitch AI:**
> Design a mobile app screen for completing a warehouse pick. An input field to enter a "Sealed Bag Tag Number" to link the physical bag to the digital order, and an "Assign to Dispatcher" button. Also design the Driver dashboard showing incoming job alerts (distance, order number) with Accept/Reject buttons.

### 4.4. Driver Navigation & OTP Handoff
**Prompt for Stitch AI:**
> Create a driver delivery screen. Top half shows a navigation map with turn-by-turn directions to the customer. Bottom half has a numeric keypad prompting the driver to "Enter Customer Handoff OTP to Complete Delivery". A green "Verify & Complete" button lights up upon entry.
