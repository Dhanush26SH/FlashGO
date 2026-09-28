# 6. RESULT AND EVALUATION

## 6.1 Introduction
Result and Evaluation is a systematic investigation conducted to provide stakeholders with detailed information regarding the quality, reliability, and performance of the software product under test. In the context of FlashGO, this phase is paramount. Because FlashGO operates in the quick-commerce space, any systemic failure, latency issue, or bug can directly translate to delayed deliveries, dissatisfied customers, and compromised operational efficiency.

The evaluation process involves the execution of the application under highly controlled conditions, monitoring both normal operations and simulated abnormal conditions (edge cases). The objective is to intentionally introduce extreme scenarios—such as network dropouts during live tracking, simultaneous order placements, and invalid barcode scans—to verify whether the system gracefully handles faults and performs its functions correctly. This phase is fundamentally detection-oriented; it ensures that the architectural design translated into code actually functions as intended in real-world scenarios.

Testing methodologies applied to FlashGO included Unit Testing for individual backend logic functions (e.g., Supabase trigger testing), Integration Testing to ensure that the Customer, Picker, Driver, and Admin modules communicate flawlessly via WebSockets, and System Testing to evaluate the end-to-end user experience. 

## 6.2 Test Scenarios
A test scenario provides a high-level, generalized description of a specific functionality, user flow, or feature that requires validation within the software application. It represents a real-world situation or objective that a user (Customer, Picker, Driver, or Admin) might attempt to accomplish while interacting with the platform. 

The primary purpose of defining comprehensive test scenarios for FlashGO is to guarantee that every critical operational pathway is thoroughly examined. Test scenarios help Quality Assurance (QA) engineers and developers understand *what* needs to be tested without getting bogged down in the exact, step-by-step technical details initially. They provide a broad view of the system's behavior and business logic flow. 

For FlashGO, the test scenarios are divided logically based on the overarching modules:
* **Customer Authentication & Browsing Scenarios:** Ensuring users can securely register, log in, browse the product catalog, and manage their cart.
* **Order Placement & Transaction Scenarios:** Validating that orders can be successfully placed, inventory is dynamically reserved, and the order is accurately written to the database.
* **Warehouse Staff (Picker) Fulfillment Scenarios:** Ensuring that pending orders appear instantly on the Picker's dashboard, barcodes scan correctly, and the order transitions smoothly to the 'Packed' state.
* **Driver Routing & Delivery Scenarios:** Validating that drivers receive dispatches, GPS tracking accurately broadcasts to the database, and proof of delivery can be submitted securely.
* **Administrative Oversight Scenarios:** Ensuring that Admins can view live telemetry, generate reports, and manage user roles without system lag or data corruption.

## 6.3 Test Cases
A test case is a granular, formalized software testing document. Unlike a scenario, a test case consists of a specific event, action, input data, expected output, and the actual result recorded during execution. Clinically defined, a test case is the pairing of an input condition with an expected result. It is often structured as "For condition X, given input Y, the expected outcome is Z." 

Test cases can occasionally represent a series of sequential steps, culminating in an expected outcome. In the following sections, White Box and Black Box testing methodologies were applied to validate the UI, integration layers, and database triggers. The tables below outline the execution of critical test cases across the various FlashGO modules.

### 6.3.1 Customer Registration & Login Form
Testing the initial entry point for end-users to ensure robust security and input validation.

| SI. No. | Test Condition | Expected Result | Result |
|---------|----------------|-----------------|--------|
| 1. | User clicks 'Register' without entering a name. | System prompts: "Please enter your full name." | Successful |
| 2. | User submits a phone number with less than 10 digits. | System displays error: "Phone number must be exactly 10 digits." | Successful |
| 3. | User submits a phone number containing alphabetic characters. | Form validation blocks input; error shown: "Invalid phone format." | Successful |
| 4. | User attempts to register with an email already in the database. | System displays error: "This email is already registered." | Successful |
| 5. | User enters a weak password (e.g., '12345'). | System enforces strict password policy: "Password must be at least 8 characters long." | Successful |
| 6. | Password and Confirm Password fields do not match. | System displays error: "Passwords do not match." | Successful |
| 7. | User attempts login with unregistered credentials. | System displays: "Invalid email or password." | Successful |
| 8. | Valid Registration details are submitted. | Account created; User redirected to the Customer Dashboard. | Successful |

### 6.3.2 Customer Cart & Checkout
Validating the e-commerce functionality and inventory reservation logic.

| SI. No. | Test Condition | Expected Result | Result |
|---------|----------------|-----------------|--------|
| 1. | User attempts to add an 'Out of Stock' item to the cart. | "Add to Cart" button is disabled; item labeled "Out of Stock". | Successful |
| 2. | User adds 5 units of an item when only 3 are in inventory. | System prevents adding more than 3 units; alerts user of max stock. | Successful |
| 3. | User proceeds to checkout without selecting a delivery address. | System blocks progression; prompts: "Please select a delivery address." | Successful |
| 4. | Checkout is submitted while backend simulates a network drop. | Application displays a loading spinner, attempts retry, then shows an offline error message. | Successful |
| 5. | Successful checkout with valid items and address. | Order generated in database; User redirected to Live Tracking screen. | Successful |

### 6.3.3 Picker Module (Warehouse Fulfillment)
Testing the internal warehouse operations and barcode verification systems.

| SI. No. | Test Condition | Expected Result | Result |
|---------|----------------|-----------------|--------|
| 1. | A new order is placed by a customer. | The order instantly appears on the Picker's active task queue via WebSockets. | Successful |
| 2. | Picker attempts to pack an item without scanning its barcode. | System requires manual override confirmation if scanning is bypassed. | Successful |
| 3. | Picker scans an incorrect item barcode for the current order. | System displays red error alert: "Incorrect Item Scanned. Please verify." | Successful |
| 4. | Picker marks an item as 'Out of Stock' during picking. | The item is flagged; order total is recalculated; inventory alert is triggered to Warehouse Manager. | Successful |
| 5. | Picker completes the checklist and clicks 'Mark as Packed'. | Order status changes to 'Packed'; order is removed from the active picking queue. | Successful |

### 6.3.4 Driver Module (Delivery & Navigation)
Ensuring the stability of the delivery tracking and status updating mechanisms.

| SI. No. | Test Condition | Expected Result | Result |
|---------|----------------|-----------------|--------|
| 1. | Driver views available dispatches. | Only orders marked as 'Packed' at their current warehouse are visible. | Successful |
| 2. | Driver accepts an order gig. | Order is assigned to the driver; status updates to 'Dispatched'. | Successful |
| 3. | Driver opens the navigation panel. | The system successfully launches the native device map application with pre-filled customer coordinates. | Successful |
| 4. | Driver's device loses GPS signal during transit. | The system continues to show the last known location and attempts to reconnect gracefully. | Successful |
| 5. | Driver attempts to mark an order 'Delivered' without proof. | System prompts for mandatory Proof of Delivery (Photo or Signature). | Successful |
| 6. | Driver submits valid Proof of Delivery. | Order status updates to 'Delivered'; Delivery completion timestamp is recorded. | Successful |

### 6.3.5 Admin Dashboard (Analytics & Oversight)
Testing the high-level control panel utilized by managers and administrators.

| SI. No. | Test Condition | Expected Result | Result |
|---------|----------------|-----------------|--------|
| 1. | Admin attempts login with insufficient privileges (e.g., standard user credentials). | Access Denied; redirected to login page. | Successful |
| 2. | Admin opens the Fleet Telemetry Map. | Map renders correctly; active drivers are displayed as moving markers based on live GPS polling. | Successful |
| 3. | Admin attempts to view reports for a future date range. | System prevents selection of future dates in the calendar picker. | Successful |
| 4. | Admin generates a performance report for the previous month. | System aggregates data and successfully triggers a PDF/Excel download. | Successful |
| 5. | Admin updates a Warehouse's geofenced service radius. | The new radius is saved to the database and immediately reflects on the visual map. | Successful |
| 6. | Admin suspends a Picker's user account. | The Picker's active session is terminated; subsequent login attempts fail. | Successful |

### 6.3.6 Warehouse Manager Module (Inventory & Vendors)
Validating the procurement and inventory adjustment features.

| SI. No. | Test Condition | Expected Result | Result |
|---------|----------------|-----------------|--------|
| 1. | Item stock falls below the predefined minimum threshold. | A red 'Low Stock' alert badge appears on the Manager's dashboard. | Successful |
| 2. | Manager creates a new procurement draft but leaves vendor field blank. | System prompts: "Please select an assigned vendor." | Successful |
| 3. | Manager manually adjusts stock count (e.g., logging damaged goods). | Inventory table is updated; an audit log entry is automatically created. | Successful |
| 4. | Manager attempts to delete an active vendor with pending procurement drafts. | Deletion blocked; system displays warning about active linked dependencies. | Successful |
| 5. | Manager submits a finalized procurement order. | Status updates to 'Submitted'; an automated email is triggered to the vendor. | Successful |
