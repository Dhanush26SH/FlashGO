# 2. LITERATURE REVIEW

## 2.1 Introduction
A literature review serves as a critical foundation for any large-scale technical implementation. It involves a systematic examination of existing research, academic papers, whitepapers, and industry case studies related to the domain of the project. For FlashGO, the focus of this review is on modern supply chain logistics, quick-commerce (q-commerce) frameworks, warehouse management systems (WMS), and last-mile delivery optimization. By analyzing the current state of technology and existing solutions, we can better understand the historical context of these challenges, identify what methodologies have proven effective, and pinpoint the persistent gaps that still plague the industry. This analytical process not only justifies the need for the FlashGO system but also informs the architectural and design decisions required to build a robust, scalable solution.

## 2.2 Result Analysis
The rapid expansion of the e-commerce sector, particularly accelerated by global shifts towards online purchasing, has catalyzed extensive research into logistics optimization. Recent literature predominantly focuses on two major areas: automated warehouse operations and intelligent last-mile delivery routing. 

Several studies have explored the integration of Internet of Things (IoT) devices and advanced algorithms to improve warehouse picking efficiency. Research by Wang et al. (2021) demonstrated that digital, route-optimized picking lists can reduce warehouse traversal time by up to 35% compared to traditional paper-based methods. These systems rely on continuous telemetry and automated operational decision-making to guide staff through the most efficient paths.

In the realm of last-mile delivery, literature emphasizes the critical role of real-time data synchronization. Systems that leverage cloud-based architectures to push live updates to delivery drivers have shown a marked decrease in idle wait times and delivery failures. Furthermore, the incorporation of crowdsourced delivery models and gig-economy tracking has been extensively analyzed. Studies indicate that while these models provide scalability, they suffer from a lack of centralized control and poor data cohesion when integrating with traditional warehouse systems. 

Compared to heavy IoT or fully autonomous robotic approaches discussed in some literature, the FlashGO system adopts a software-first, human-in-the-loop methodology. It relies on the ubiquitous nature of smartphones, turning the mobile devices of pickers and drivers into intelligent nodes within a centralized network. This approach is significantly more cost-effective and scalable for mid-to-large enterprises, maximizing operational coverage without the exorbitant capital expenditure required for full automation.

## 2.3 Identified gaps in the Literature
Despite the abundance of research in supply chain optimization, several distinct gaps and practical challenges persist in the existing literature and commercially available systems:

* **High Cost of Entry for Automation:** Much of the cutting-edge research focuses on robotics and IoT sensors (e.g., smart shelves, automated guided vehicles). These technologies are often prohibitively expensive for regional logistics companies, leaving a gap for affordable, software-driven solutions.
* **Fragmented Ecosystems:** There is a noticeable lack of literature on unified systems that seamlessly connect the customer, the warehouse picker, and the delivery driver. Most studies focus on either WMS (Warehouse Management Systems) or TMS (Transportation Management Systems) in isolation, ignoring the friction that occurs during the handoff between these phases.
* **Insufficient Real-Time Synchronization:** While theoretical models propose real-time tracking, practical implementations often rely on polling architectures that introduce latency. The literature indicates a need for systems utilizing modern, push-based real-time databases (like Supabase or Firebase) to ensure immediate data consistency across hundreds of active nodes.
* **Overlooking the Picker-Driver Handoff:** Many delivery optimization models assume the package is already ready for dispatch. There is limited research on optimizing the synchronization of a picker finishing their task at the exact moment a driver arrives, which is critical for minimizing wait times in quick commerce.
* **Lack of Offline Capabilities:** Existing literature frequently assumes ubiquitous, high-speed internet connectivity. However, drivers and warehouse staff often operate in dead zones (e.g., inside large metal warehouses, elevators, or rural routes). There is a gap in addressing robust offline-first capabilities in logistics applications.

## 2.4 Existing System
In the existing operational landscape, many delivery and logistics companies rely on a patchwork of software solutions and manual processes. Typically, a customer order is received via an e-commerce storefront and pushed to a legacy Warehouse Management System. Warehouse managers must then print physical picking lists or assign tasks verbally. Pickers navigate the warehouse based on their own memory or inefficient alphanumeric sorting, locating items manually.

Once the items are packed, the order is moved to a staging area. A separate Transportation Management System or a manual dispatcher then assigns the delivery to a driver. Drivers often rely on third-party navigation apps and communicate their status via phone calls or SMS messages. 

This existing system is plagued by several critical issues:
* **Delayed Response Times:** Manual assignment and physical paperwork introduce significant delays, making it impossible to achieve the sub-hour delivery times expected in modern q-commerce.
* **Poor Coordination:** Without a unified platform, pickers don't know when drivers will arrive, and drivers don't know if their assigned orders are actually packed and ready.
* **Limited Automation and High Error Rates:** Manual data entry and lack of barcode/QR scanning at every step lead to high rates of incorrect item dispatching and lost packages.
* **No Centralized Data Analytics:** Management cannot view the entire lifecycle of an order in one place, making it exceedingly difficult to analyze performance, identify bottlenecks, or make data-driven strategic decisions.

## 2.5 Proposed System
The proposed FlashGO system is designed to fundamentally disrupt and improve upon the existing manual and fragmented systems by introducing a unified, Progressive Web Application (PWA) and mobile ecosystem. Instead of relying on disparate tools, FlashGO provides a single, scalable platform that orchestrates the entire fulfillment process in real-time.

When a customer places an order, the system instantly evaluates inventory and assigns the task directly to the mobile device of the nearest available warehouse picker. The picker receives a digitally optimized route through the warehouse, scanning items via their device camera to ensure 100% accuracy. The moment the order is marked as 'Packed', the system's automated dispatch engine instantly alerts an available driver, providing them with the exact staging location and an optimized navigation route to the customer.

By integrating all stakeholders into one centralized database utilizing modern web technologies (React, React Native, Supabase), FlashGO bridges the gaps identified in current literature. It offers the high efficiency of an automated system without the massive infrastructure costs of robotics. The proposed system ensures total transparency, allowing customers to track their delivery on a live map, while providing administrators with a powerful dashboard to monitor operations, manage resources, and resolve issues instantly. Overall, FlashGO represents a cost-effective, highly scalable, and participatory solution that aligns with the global shift towards smart, sustainable, and rapid urban logistics.
