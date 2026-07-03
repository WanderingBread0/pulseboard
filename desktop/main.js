const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const SMOKE = process.argv.includes('--smoke');

function createWindow(){
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: '#0d0d0d',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // external links (e.g. README/GitHub) open in the system browser, never in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-finish-load', () => {
    if (SMOKE) {
      console.log('SMOKE OK: loaded ' + win.webContents.getURL());
      setTimeout(() => app.quit(), 500);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
