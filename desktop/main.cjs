const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('node:path');
const { WORKBENCH_URL, isTrustedNavigation } = require('./policy.cjs');

app.setName('Huihui Support');
app.setAppUserModelId('xyz.ryh6666.huihui');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window;
  const showError = () => {
    if (window && !window.isDestroyed()) {
      window.loadFile(path.join(__dirname, 'offline.html')).catch(console.error);
    }
  };
  const loadWorkbench = () => window.loadURL(WORKBENCH_URL).catch(showError);

  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    window = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 980,
      minHeight: 680,
      title: '辉辉客服工作台',
      backgroundColor: '#f3f6f7',
      show: !process.argv.includes('--huihui-smoke-test'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        navigateOnDragDrop: false
      }
    });
    window.webContents.on('will-navigate', event => {
      if (!isTrustedNavigation(event.url)) event.preventDefault();
    });
    window.webContents.on('will-redirect', event => {
      if (!isTrustedNavigation(event.url)) event.preventDefault();
    });
    window.webContents.on('will-frame-navigate', event => {
      if (!isTrustedNavigation(event.url)) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isTrustedNavigation(url)) window.loadURL(url).catch(showError);
      return { action: 'deny' };
    });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && isTrustedNavigation(url)) showError();
    });
    window.webContents.on('render-process-gone', showError);
    window.on('page-title-updated', event => event.preventDefault());
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '工作台', submenu: [
        { label: '重新连接', accelerator: 'Ctrl+R', click: loadWorkbench },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ] },
      { label: '编辑', submenu: [
        { label: '撤销', role: 'undo' }, { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }
      ] },
      { label: '视图', submenu: [
        { label: '放大', role: 'zoomIn' }, { label: '缩小', role: 'zoomOut' },
        { label: '实际大小', role: 'resetZoom' }, { label: '全屏', role: 'togglefullscreen' }
      ] }
    ]));
    loadWorkbench();
  });
  app.on('window-all-closed', () => app.quit());
}
