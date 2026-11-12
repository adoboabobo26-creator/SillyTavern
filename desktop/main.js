// CrushChatter desktop shell: starts the local CrushChatter (SillyTavern-based) server and shows it in its own window.
// The exe built from this folder expects to live inside (or beside) the CrushChatter folder it launches.
const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = 8000;
const URL = `http://127.0.0.1:${PORT}/`;
let server = null;
let win = null;

function findRoot() {
    const starts = [process.env.SILLYTAVERN_DIR, __dirname, path.dirname(process.execPath)].filter(Boolean);
    for (const start of starts) {
        let dir = path.resolve(start);
        for (let i = 0; i < 6; i++) {
            if (fs.existsSync(path.join(dir, 'server.js')) && fs.existsSync(path.join(dir, 'public', 'index.html'))) return dir;
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    }
    return null;
}

function ping() {
    return new Promise(resolve => {
        const req = http.get(URL, res => { res.resume(); resolve(res.statusCode < 500); });
        req.on('error', () => resolve(false));
        req.setTimeout(1500, () => { req.destroy(); resolve(false); });
    });
}

async function waitForServer(limitMs = 180000) {
    const end = Date.now() + limitMs;
    while (Date.now() < end) {
        if (await ping()) return true;
        if (server && server.exitCode !== null) return false;
        await new Promise(r => setTimeout(r, 800));
    }
    return false;
}

const loadingPage = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0f0b1a;color:#f4effc;font-family:Segoe UI,sans-serif">
<div style="text-align:center"><div style="font-size:30px;font-weight:800;background:linear-gradient(135deg,#ff4d8d,#8b5cf6);-webkit-background-clip:text;color:transparent">CrushChatter</div>
<p style="color:#a095bd">Starting up… the first launch can take a minute.</p></div></body>`);

async function start() {
    const root = findRoot();
    if (!root) {
        dialog.showErrorBox('CrushChatter not found', 'Keep this app inside your CrushChatter folder (or set SILLYTAVERN_DIR).');
        return app.quit();
    }
    if (!fs.existsSync(path.join(root, 'node_modules'))) {
        dialog.showErrorBox('Setup needed', `Run "npm install" once inside:\n${root}`);
        return app.quit();
    }

    win = new BrowserWindow({
        width: 1400, height: 900, minWidth: 420, minHeight: 600, backgroundColor: '#0f0b1a',
        title: 'CrushChatter', autoHideMenuBar: true,
        icon: path.join(root, 'public', 'st.ico'),
    });
    win.loadURL(loadingPage);
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    win.on('closed', () => { win = null; });

    if (!(await ping())) {
        // Electron's built-in Node lacks crypto features the server needs, so use the Node.js installed on this PC.
        server = spawn('node', ['server.js', '--port', String(PORT), '--listen', 'false'], { cwd: root, windowsHide: true });
        server.on('error', err => {
            dialog.showErrorBox('Node.js not found', `CrushChatter needs Node.js (nodejs.org). ${err.message}`);
            app.quit();
        });
        server.stdout.on('data', d => process.stdout.write(d));
        server.stderr.on('data', d => process.stderr.write(d));
    }

    if (await waitForServer()) win?.loadURL(URL);
    else {
        dialog.showErrorBox('CrushChatter did not start', `The server did not come up on ${URL}.\nTry running "node server.js" in ${root} to see the error.`);
        app.quit();
    }
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
    app.whenReady().then(start);
    app.on('window-all-closed', () => app.quit());
    const stopServer = () => { if (server && server.exitCode === null) server.kill(); };
    app.on('before-quit', stopServer);
    process.on('exit', stopServer);
}
