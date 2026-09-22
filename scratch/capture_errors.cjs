const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR LOG:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE EXCEPTION:', error.message);
  });

  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
  });

  try {
    await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle0', timeout: 10000 });
  } catch (e) {
    console.log('Navigation error:', e.message);
  }

  await browser.close();
})();
