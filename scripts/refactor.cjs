const fs = require('fs');
let code = fs.readFileSync('src/views/Customer/CustomerView.tsx', 'utf8');

// 1. Imports
code = code.replace(
  "import { PremiumMap } from '../../components/PremiumMap';",
  "import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';\nimport { HomeView } from './modules/HomeView';\nimport { ProductDetailsView } from './modules/ProductDetailsView';\nimport { TrackingView } from './modules/TrackingView';\nimport { WalletLoyaltyView } from './modules/WalletLoyaltyView';\nimport { PassView } from './modules/PassView';\nimport { ProfileView } from './modules/ProfileView';"
);

// 2. Remove unused state
code = code.replace(/const \[searchQuery.*?\n/g, '');
code = code.replace(/const \[selectedCategory.*?\n/g, '');
code = code.replace(/const \[sortBy.*?\n/g, '');
code = code.replace(/const \[showWalletAdd.*?\n/g, '');
code = code.replace(/const \[walletAddAmount.*?\n/g, '');

// 3. Replace activeTab
code = code.replace(
  /const \[activeTab.*?\n/,
  "const navigate = useNavigate();\n  const location = useLocation();\n"
);

// 4. Update checkout navigation
code = code.replace(/setActiveTab\('wallet'\);/g, "navigate('/customer/wallet');");
code = code.replace(/setActiveTab\('tracking'\);/g, "navigate('/customer/tracking');");

// 5. Update Nav buttons
code = code.replace(
  /onClick=\{\(\) => setActiveTab\('shop'\)\}/,
  "onClick={() => navigate('/customer/home')}"
);
code = code.replace(
  /style=\{tabButtonStyle\(activeTab === 'shop'\)\}/,
  "style={tabButtonStyle(location.pathname.includes('/home') || location.pathname.includes('/product'))}"
);

code = code.replace(
  /onClick=\{\(\) => setActiveTab\('tracking'\)\}/,
  "onClick={() => navigate('/customer/tracking')}"
);
code = code.replace(
  /style=\{tabButtonStyle\(activeTab === 'tracking'\)\}/,
  "style={tabButtonStyle(location.pathname.includes('/tracking'))}"
);

code = code.replace(
  /onClick=\{\(\) => setActiveTab\('wallet'\)\}/,
  "onClick={() => navigate('/customer/wallet')}"
);
code = code.replace(
  /style=\{tabButtonStyle\(activeTab === 'wallet'\)\}/,
  "style={tabButtonStyle(location.pathname.includes('/wallet'))}"
);

code = code.replace(
  /onClick=\{\(\) => setActiveTab\('pass'\)\}/,
  "onClick={() => navigate('/customer/pass')}"
);
code = code.replace(
  /style=\{tabButtonStyle\(activeTab === 'pass'\)\}/,
  "style={tabButtonStyle(location.pathname.includes('/pass'))}"
);

code = code.replace(
  /onClick=\{\(\) => setActiveTab\('profile'\)\}/,
  "onClick={() => navigate('/customer/profile')}"
);
code = code.replace(
  /style=\{tabButtonStyle\(activeTab === 'profile'\)\}/,
  "style={tabButtonStyle(location.pathname.includes('/profile'))}"
);

// 6. Replace Main
const mainStart = code.indexOf('<main style={mainContentStyle}>');
const mainEnd = code.indexOf('</main>', mainStart) + 7;

const newMain = `<main style={mainContentStyle}>
        <Routes>
          <Route path="/" element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomeView />} />
          <Route path="product/:id" element={<ProductDetailsView />} />
          <Route path="tracking" element={<TrackingView />} />
          <Route path="wallet" element={<WalletLoyaltyView />} />
          <Route path="pass" element={<PassView />} />
          <Route path="profile" element={<ProfileView onLogout={() => setIsLoggedIn(false)} />} />
        </Routes>
      </main>`;

code = code.slice(0, mainStart) + newMain + code.slice(mainEnd);

fs.writeFileSync('src/views/Customer/CustomerView.tsx', code);
