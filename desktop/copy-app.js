// Vendors the web app into desktop/app/ so the packaged binary is self-contained.
const fs = require('fs');
const path = require('path');
const appDir = path.join(__dirname, 'app');
fs.mkdirSync(appDir, { recursive: true });
for (const f of ['index.html', 'chart.min.js']) {
  fs.copyFileSync(path.join(__dirname, '..', f), path.join(appDir, f));
}
console.log('app/ prepared');
