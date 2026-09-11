const fs = require('fs');
const path = require('path');

function camelToDash(str) {
  return str.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract all `const xyzStyle: React.CSSProperties = { ... }` blocks
  const styleRegex = /const\s+([a-zA-Z0-9_]+Style)\s*(?::\s*React\.CSSProperties)?\s*=\s*({[\s\S]*?});/g;
  
  let cssContent = '';
  let match;
  const classMap = {};

  while ((match = styleRegex.exec(content)) !== null) {
    const styleName = match[1];
    const styleBody = match[2];
    
    // We only process static objects, not functions
    if (styleBody.includes('=>')) continue;

    const className = camelToDash(styleName).replace('-style', '');
    classMap[styleName] = className;

    try {
      // Very hacky JSON parse by replacing JS syntax
      let jsonStr = styleBody
        .replace(/([a-zA-Z0-9_]+):/g, '"$1":') // quote keys
        .replace(/'/g, '"') // single to double quotes
        .replace(/,(\s*})/g, '$1') // remove trailing commas
        .replace(/\/\/.*/g, ''); // remove single line comments
      
      const obj = JSON.parse(jsonStr);
      cssContent += `.${className} {\n`;
      for (const [key, val] of Object.entries(obj)) {
        cssContent += `  ${camelToDash(key)}: ${val};\n`;
      }
      cssContent += `}\n\n`;
    } catch (e) {
      console.log(`Could not parse style ${styleName} in ${filePath}`);
    }
  }

  if (Object.keys(classMap).length === 0) return;

  // Now replace style={xyzStyle} with className="xyz"
  for (const [styleName, className] of Object.entries(classMap)) {
    // Replace style={xyzStyle}
    const regex1 = new RegExp(`style={${styleName}}`, 'g');
    content = content.replace(regex1, `className="${className}"`);
    
    // Replace style={{ ...xyzStyle, somethingElse: 'x' }}
    // This is harder, let's just do basic `style={xyzStyle}` for now
    
    // Remove the declaration
    const regex2 = new RegExp(`const\\s+${styleName}\\s*(?::\\s*React\\.CSSProperties)?\\s*=\\s*{[\\s\\S]*?};`, 'g');
    content = content.replace(regex2, '');
  }

  // Inject CSS import
  const baseName = path.basename(filePath, '.tsx');
  const cssFileName = `${baseName}.css`;
  
  if (!content.includes(`import './${cssFileName}'`)) {
    content = content.replace(/(import.*?;[\r\n]+)/, `$1import './${cssFileName}';\n`);
  }

  // Save CSS file
  const cssPath = path.join(path.dirname(filePath), cssFileName);
  let existingCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf-8') : '';
  fs.writeFileSync(cssPath, existingCss + '\n' + cssContent);

  // Save updated TSX
  fs.writeFileSync(filePath, content);
  console.log(`Processed ${filePath}`);
}

const dir = 'c:/Users/dhanu/FlashGO/src/views/Admin/modules/';
fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.tsx')) {
    processFile(path.join(dir, file));
  }
});
