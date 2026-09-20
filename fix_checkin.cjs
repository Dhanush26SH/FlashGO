const fs = require('fs');
let content = fs.readFileSync('mobile-staff/src/screens/Rider/DriverCheckInScreen.tsx', 'utf-8');

// 1. Remove step state transitions
content = content.replace(/useState\<'PERMISSIONS' \| 'SELFIE' \| 'TRANSITION' \| 'QR' \| 'SUBMITTING'\>\('PERMISSIONS'\)/g, "useState<'PERMISSIONS' | 'QR' | 'SUBMITTING'>('PERMISSIONS')");

// 2. Remove selfie path and takeSelfie
content = content.replace(/const \[selfiePath, setSelfiePath\] = useState\<string \| null\>\(null\);\n/g, "");
content = content.replace(/const takeSelfie = async \(\) => \{[\s\S]*?^\s*\}\;\n/m, "");

// 3. Update decode if not used
content = content.replace(/const decode = \(base64: string\) => \{[\s\S]*?^\s*\}\;\n/m, "");

// 4. Update submitCheckIn
content = content.replace(/p_selfie_path: selfiePath/g, "");
content = content.replace(/p_raw_qr_token: qrToken,\n\s*\n/g, "p_raw_qr_token: qrToken\n");
content = content.replace(/p_raw_qr_token: qrToken,\n\s*\}/g, "p_raw_qr_token: qrToken\n      }");

// 5. Update UI
// Replace setStep('SELFIE') with setStep('QR')
content = content.replace(/setStep\('SELFIE'\)/g, "setStep('QR')");

// Remove INVALID_SELFIE_EVIDENCE cases
content = content.replace(/case 'INVALID_SELFIE_EVIDENCE':[\s\S]*?break;\n/m, "");
content = content.replace(/if \(code === 'INVALID_SELFIE_EVIDENCE'\) \{[\s\S]*?\} else \{\n\s*setStep\('QR'\);\n\s*\}/m, "setStep('QR');");

// Update step === 'SELFIE' and TRANSITION blocks
content = content.replace(/\{step === 'SELFIE' && \([\s\S]*?\}\)\n/m, "");
content = content.replace(/\{step === 'TRANSITION' && \([\s\S]*?\}\)\n/m, "");

// Remove the "Live Selfie - Completed" header from QR step
content = content.replace(/<View style=\{styles\.stepHeader\}>\n\s*<Text style=\{styles\.stepTitleCompleted\}>1 Live Selfie — Completed ✓<\/Text>\n\s*<\/View>\n\s*<View style=\{styles\.stepHeaderActive\}>\n\s*<Text style=\{styles\.stepTitle\}>2 Scan Store QR — Current step<\/Text>/m, "<View style={styles.stepHeaderActive}>\n              <Text style={styles.stepTitle}>1 Scan Store QR — Current step</Text>");

fs.writeFileSync('mobile-staff/src/screens/Rider/DriverCheckInScreen.tsx', content);
console.log('done');
