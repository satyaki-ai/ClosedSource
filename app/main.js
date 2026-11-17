const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const candidates = [
    path.join(process.resourcesPath || '', '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '.env'),
  ];
  for (const f of candidates) {
    try {
      for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
      }
      return;
    } catch {}
  }
}

const LOG=(m)=>{try{fs.appendFileSync(path.join(app.getPath("userData"),"debug.log"),new Date().toISOString()+" "+m+"\n")}catch{}};
process.on("uncaughtException",(e)=>LOG("uncaught "+e.stack));
let pg;
async function startPostgres() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const { PG_PORT } = require('./server');
  const dir = path.join(app.getPath('userData'), 'pgdata');
  pg = new EmbeddedPostgres({
    databaseDir: dir, user: 'postgres', password: 'postgres', port: PG_PORT, persistent: true,
    onLog: () => {}, onError: () => {},
  });
  try { fs.unlinkSync(path.join(dir, 'postmaster.pid')); } catch {} // stale lock from a crash
  if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase('claudeclone'); } catch {} // already exists
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1180, height: 760, center: true, minWidth: 720, minHeight: 500,
    backgroundColor: '#1a1a1a', title: 'Claude Clone',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1a1a1a', symbolColor: '#cfcdc6', height: 44 },
    webPreferences: { contextIsolation: true },
  });
  Menu.setApplicationMenu(null);
  win.loadURL('data:text/html,<body style="font-family:sans-serif;background:#1a1a1a;color:#ccc;padding:40px">Starting local database…</body>');
  try {
    LOG("start"); loadEnv(); LOG("env "+!!process.env.GROQ_API_KEY);
    await startPostgres(); LOG("pg up");
    const url = await require('./server').startServer();
    LOG("server "+url); win.loadURL(url);
  } catch (e) {
    try { fs.writeFileSync(path.join(app.getPath("userData"),"error.log"), String(e.stack)); } catch {}
    win.loadURL('data:text/html,' + encodeURIComponent(`<pre style="padding:30px">Startup failed:\n${e.stack}</pre>`));
  }
}

if (!app.requestSingleInstanceLock()) app.quit();
app.whenReady().then(createWindow);
app.on('window-all-closed', async () => {
  try { await pg?.stop(); } catch {}
  app.quit();
});
