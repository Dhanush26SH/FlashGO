const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err.toString()));
  
  console.log('Navigating...');
  await page.goto('http://localhost:8081');
  await page.waitForTimeout(5000); // Wait for load

  // Click refresh to simulate the bug
  console.log('Refreshing...');
  await page.reload();
  await page.waitForTimeout(5000); // Wait for load

  await browser.close();
})();
