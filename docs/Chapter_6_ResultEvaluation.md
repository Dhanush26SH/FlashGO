# 6. RESULT AND EVALUATION

## 6.1 Introduction
Result and Evaluation is an investigation conducted to provide stake holders with information about the quality of the product or service under test. It has been defined as the process of analyzing a software item to detect the differences between existing and required conditions and to evaluate the features of the software item. 

It involves operation of a system or application under controlled conditions and evaluating the results. The controlled conditions should include both normal and abnormal conditions. The objective of this is to intentionally introduce faults into the system to verify whether the functions perform correctly under specific conditions. It is essentially a detection-oriented process.

## 6.2 Test Scenario
A test scenario is a high-level description of a functionality or feature that needs to be tested within a software application. It represents a real-world situation that a user might encounter while using the system. The purpose of creating test scenarios is to ensure that every aspect of the application is covered during testing and that the system behaves as expected under different conditions. Test scenarios help testers understand what to test without focusing on the exact steps, providing a broad view of the system’s behavior and business flow.

## 6.3 Test Cases
A test case is a software testing document, which consists of event, action, input, output, expected result and actual result. Clinically defined a test case is an input and an expected result. This can be pragmatic as ‘for condition x your derived result is y’, whereas other test cases described in more detail the input scenario and what results might be expected. It can occasionally be a series of steps but one with expected results or expected outcome. A test case should also contain a place for the actual result. White box testing is applicable at the unit, integration and system levels of the software testing process.

### 6.3.1 Registration Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If user clicks on register button without entering name. | Enter your username. | Successful |
| 2. | If user clicks on register button without entering phone number. | Enter your phone number. | Successful |
| 3. | If user clicks on register button without entering email id. | Enter your email id. | Successful |
| 4. | If user clicks on register button without entering password. | Enter your password. | Successful |
| 5. | If user clicks on register button without entering confirm password. | Enter your confirm password. | Successful |
| 6. | If password and confirm password mismatched. | Password do not matched. | Successful |
| 7. | If the name field is filled in digits and clicks on "register" button. | Name must contains only letters. | Successful |
| 8. | If the user enters phone number field less than or greater than 10 digits length. | Phone number must be exactly 10 digits. | Successful |
| 9. | If the user enter invalid format of email id. | Invalid email format. | Successful |
| 10. | If the user wants to register again with same phone number. | This phone number is already registered. | Successful |
| 11. | If the user enter invalid format of password. | Invalid password format. | Successful |
| 12. | If the valid register details are entered. | System displays Login page. | Successful |

### 6.3.2 Login Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If the user enters invalid phone number. | Invalid phone no. or password. | Successful |
| 2. | If the user enters invalid password. | Invalid phone no. or password. | Successful |
| 3. | If the user leaves the phone number field blank. | Enter your phone number. | Successful |
| 4. | If the user leaves the password field blank. | Enter your password. | Successful |
| 5. | If the user enters letters in the phone number field. | Phone number must contain only digits. | Successful |
| 6. | If the user attempts login with an unverified account. | Account verification pending. | Successful |
| 7. | If both phone number and password are valid. | Displays dashboard page. | Successful |

### 6.3.3 Forgot Password Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If not internet connection. | Error sending email. | Successful |
| 2. | If user enter invalid OTP. | Invalid OTP. | Successful |
| 3. | If the user enters invalid format of password for reset password. | Invalid password format. | Successful |
| 4. | If password and confirm new password mismatched. | Password do not matched. | Successful |
| 5. | If the user leaves the email field blank. | Enter your email id. | Successful |
| 6. | If the user enters an unregistered email address. | Email does not exist. | Successful |
| 7. | If valid OTP and matching new passwords are provided. | Password successfully reset. | Successful |

### 6.3.4 Place Order Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If not internet connection while fetching latitude and longitude details. | Error fetching location. | Successful |
| 2. | If user clicks on checkout button without selecting delivery address. | Please select delivery address. | Successful |
| 3. | If user attempts to place an order with an empty cart. | Cart cannot be empty. | Successful |
| 4. | If user selects an address outside the delivery zone. | Address is out of serviceable area. | Successful |
| 5. | If an item in the cart becomes out of stock during checkout. | Item is out of stock. | Successful |
| 6. | If user selects wallet payment but has insufficient balance. | Insufficient wallet balance. | Successful |
| 7. | If all details are valid and payment succeeds. | Order placed successfully. | Successful |

### 6.3.5 Check Order Status Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If user enter invalid order id. | Order ID not found. Please enter a valid Order ID. | Successful |
| 2. | If user leaves the order id field blank. | Enter your order id. | Successful |
| 3. | If the order has been cancelled by the admin. | Displays order cancelled status. | Successful |
| 4. | If the order is currently out for delivery. | Displays live tracking map. | Successful |
| 5. | If the driver loses GPS signal during transit. | Shows last known location. | Successful |
| 6. | If the user clicks the refresh status button. | Status updates with latest time. | Successful |
| 7. | If user enter valid order id. | It shows order details and status. | Successful |

### 6.3.6 Analytics Report Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If admin enter invalid warehouse number. | No records found. | Successful |
| 2. | If admin select invalid date range. | No records found. | Successful |
| 3. | If admin selects an end date that is before the start date. | End date must be after start date. | Successful |
| 4. | If admin clicks generate without selecting any date range. | Please select a date range. | Successful |
| 5. | If admin tries to export report when there is no data. | No data available to export. | Successful |
| 6. | If admin filters by a non-existent status. | No matching records. | Successful |
| 7. | If valid parameters and date range are provided. | Report generated successfully. | Successful |

### 6.3.7 Add Warehouse Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If admin clicks on submit button without entering warehouse name. | The Warehouse name is required. | Successful |
| 2. | If admin clicks on submit button without entering latitude. | The latitude field is required. | Successful |
| 3. | If admin clicks on submit button without entering longitude. | The longitude field is required. | Successful |
| 4. | If admin enters an invalid latitude format (e.g., > 90). | Invalid latitude format. | Successful |
| 5. | If admin enters an invalid longitude format (e.g., > 180). | Invalid longitude format. | Successful |
| 6. | If admin clicks on submit without selecting a region. | Region selection is required. | Successful |
| 7. | If all details are entered. | Warehouse added successfully. | Successful |

### 6.3.8 Add Category Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If admin clicks on submit button without entering category name. | The Category name is required. | Successful |
| 2. | If admin clicks on submit button without uploading an image. | The image field is required. | Successful |
| 3. | If admin uploads an unsupported image format (e.g., .gif). | Invalid image format. | Successful |
| 4. | If admin clicks on submit button without entering a description. | The description field is required. | Successful |
| 5. | If admin enters a category name that already exists. | Category name already exists. | Successful |
| 6. | If admin clicks on submit without setting a status. | Status selection is required. | Successful |
| 7. | If all details are entered. | Category added successfully. | Successful |

### 6.3.9 Add Product Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If admin clicks on submit button without entering product name. | The Product name is required. | Successful |
| 2. | If admin clicks on submit button without selecting a category. | The Category selection is required. | Successful |
| 3. | If admin clicks on submit button without entering a price. | The price field is required. | Successful |
| 4. | If admin enters a negative value for the price. | Price cannot be negative. | Successful |
| 5. | If admin enters a negative value for the stock quantity. | Stock quantity cannot be negative. | Successful |
| 6. | If admin clicks on submit without uploading a product image. | The product image is required. | Successful |
| 7. | If all details are entered. | Product added successfully. | Successful |

### 6.3.10 Add Staff Form
| Sl. No. | Test Condition | Expected Result | Result |
|---|---|---|---|
| 1. | If admin clicks on submit button without entering name. | Enter your name. | Successful |
| 2. | If admin clicks on submit button without entering phone number. | Enter your phone number. | Successful |
| 3. | If admin clicks on submit button without entering email id. | Enter your email id. | Successful |
| 4. | If admin clicks on submit button without selecting a warehouse. | Select your warehouse. | Successful |
| 5. | If admin clicks on submit button without selecting a role. | Select your role. | Successful |
| 6. | If admin clicks on submit button without entering password. | Enter password. | Successful |
| 7. | If admin enters a phone number that is less than 10 digits. | Phone number must be exactly 10 digits. | Successful |
| 8. | If all details are correct. | Staff added successfully. | Successful |
