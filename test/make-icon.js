// Renders build/icon.png (512x512) for the desktop packages.
const path = require('path');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  await page.setContent(`
    <style>
      body{margin:0;background:transparent}
      .tile{width:512px;height:512px;border-radius:104px;background:#1a1a19;
        display:flex;align-items:flex-end;justify-content:center;gap:26px;
        padding-bottom:104px;box-sizing:border-box;position:relative;
        border:6px solid rgba(255,255,255,0.08)}
      .bar{width:74px;border-radius:18px 18px 8px 8px;background:#3987e5}
      .b1{height:130px}.b2{height:210px}.b3{height:290px;background:#4d94ea}
      .dot{position:absolute;top:96px;right:104px;width:64px;height:64px;
        border-radius:50%;background:#c98500;border:10px solid #1a1a19}
    </style>
    <div class="tile"><div class="bar b1"></div><div class="bar b2"></div><div class="bar b3"></div><div class="dot"></div></div>
  `);
  const out = path.join(__dirname, '..', 'desktop', 'build', 'icon.png');
  require('fs').mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true });
  console.log('icon written:', out);
  await browser.close();
})();
