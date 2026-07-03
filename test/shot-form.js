// One-off: screenshot the defect form with a photo attached (docs/defect-form.png)
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'), { waitUntil: 'networkidle0' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // finish wizard quickly with sample data
  await page.type('#wiz-org', 'Acme Facilities');
  await page.click('#wiz-next'); await page.click('#wiz-next');
  await page.click('#wiz-sample');
  await sleep(400);
  await page.click('.nav-item[data-page="defects"]');
  await sleep(300);
  await page.click('#btn-def-new');
  await page.$eval('#def-unit', el => el.value = 'North Building');
  await page.$eval('#def-category', el => el.value = 'Safety');
  await page.$eval('#def-notes', el => el.value = 'Loose handrail on the east stairwell — needs anchor bolts.');
  // draw a plausible photo in-canvas and attach it via the photo pipeline
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 800, 600);
    grad.addColorStop(0, '#5a6472'); grad.addColorStop(1, '#2c3540');
    g.fillStyle = grad; g.fillRect(0, 0, 800, 600);
    g.fillStyle = '#8a949f'; g.fillRect(80, 120, 640, 40);
    g.strokeStyle = '#c9852a'; g.lineWidth = 14;
    g.beginPath(); g.moveTo(120, 160); g.lineTo(680, 400); g.stroke();
    const id = uid();
    await photoPut({ id, data: c.toDataURL('image/jpeg', 0.7), created: Date.now() });
    photoState.def.ids.push(id); photoState.def.fresh.push(id);
    await renderPhotoStrip('def');
  });
  await sleep(400);
  fs.mkdirSync(path.resolve(__dirname, '..', 'docs'), { recursive: true });
  await page.screenshot({ path: path.resolve(__dirname, '..', 'docs', 'defect-form.png') });
  console.log('done');
  await browser.close();
})();
