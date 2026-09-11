import re

with open(r'c:\Users\dhanu\FlashGO\src\views\Admin\modules\UserCouponWallet.tsx', 'r', encoding='utf8') as f:
    content = f.read()

# Remove import type BlinkPass
content = re.sub(r'import type { Profile, Coupon, BlinkPass } from \'../../../services/db\';', r"import type { Profile, Coupon } from '../../../services/db';", content)

# Remove passes state
content = re.sub(r'const \[passes, setPasses\] = useState<BlinkPass\[\]>\(\(\) => FlashGoDB\.getBlinkPasses\(\)\);\n', '', content)

# Remove activePasses
content = re.sub(r'const activePasses = passes\.filter\(p => p\.status === \'active\'\);\n', '', content)

# Remove handleExtendPass
content = re.sub(r'// Extend Pass\s*const handleExtendPass = \(passId: string\) => \{.*?\};\n', '', content, flags=re.DOTALL)

# Remove VIP passes tab
content = re.sub(r'\{\s*id:\s*\'passes\',\s*label:\s*\'VIP Passes \(Prototype\)\'\s*\}\s*', '', content)
# Fix trailing comma after coupons tab
content = re.sub(r'\{\s*id:\s*\'coupons\',\s*label:\s*\'Coupons\'\s*\},', r"{ id: 'coupons', label: 'Coupons' }", content)

# Remove BlinkPass VIP Subscriptions panel
content = re.sub(r'\{/\* BlinkPass VIP Subscriptions \*/\}.*?\</div\>\s*\</div\>', '', content, flags=re.DOTALL)

# Remove hasPass from customers
content = re.sub(r'const hasPass = passes\.find\(p => p\.user_id === c\.id && p\.status === \'active\'\);\n', '', content)

# Remove VIP badge
content = re.sub(r'\{hasPass && <span className="vip-badge" style=\{\{ opacity: 0\.5 \}\}\>BlinkPass \(Prototype\)\</span\>\}', '', content)

# Remove subtitle reference to BlinkPass
content = re.sub(r'schedule BOGO coupons, and provision BlinkPass VIP access', 'and schedule BOGO coupons', content)

# Remove passStatusLabel
content = re.sub(r'const passStatusLabel = \(status: string\): React\.CSSProperties => \(\{.*?\}\);\n', '', content, flags=re.DOTALL)

with open(r'c:\Users\dhanu\FlashGO\src\views\Admin\modules\UserCouponWallet.tsx', 'w', encoding='utf8') as f:
    f.write(content)
