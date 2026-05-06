const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const APP_TITLE = 'Controle NF Chevron';
const ROOT_FOLDER = path.join('thIAguinho Soluções', 'Controle NF Chevron');
const DB_VERSION = 1;

let mainWindow = null;
let appDirs = null;
let dbFile = null;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function getDirs() {
  if (appDirs) return appDirs;
  const root = path.join(app.getPath('documents'), ROOT_FOLDER);
  const banco = path.join(root, 'banco');
  const backups = path.join(root, 'backups');
  const relatorios = path.join(root, 'relatorios');
  const logs = path.join(root, 'logs');
  [root, banco, backups, relatorios, logs].forEach(ensureDir);
  appDirs = { root, banco, backups, relatorios, logs };
  dbFile = path.join(banco, 'controle_nf_db.json');
  return appDirs;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function createEmptyDb() {
  const now = new Date().toISOString();
  const senha = hashPassword('123456');
  return {
    meta: {
      app: APP_TITLE,
      db_version: DB_VERSION,
      created_at: now,
      updated_at: now
    },
    usuarios: [
      {
        id: 'admin-local',
        email: 'admin@local',
        nome: 'Administrador Local',
        perfil: 'admin',
        ativo: true,
        senha_salt: senha.salt,
        senha_hash: senha.hash,
        created_at: now
      }
    ],
    devolucoes: []
  };
}

function atomicWriteJson(filePath, data) {
  data.meta = data.meta || {};
  data.meta.updated_at = new Date().toISOString();
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function ensureDb() {
  getDirs();
  if (!fs.existsSync(dbFile)) {
    atomicWriteJson(dbFile, createEmptyDb());
  }
}

function readDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    const data = JSON.parse(raw || '{}');
    data.meta = data.meta || {};
    data.usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
    data.devolucoes = Array.isArray(data.devolucoes) ? data.devolucoes : [];
    if (!data.usuarios.length) {
      const fresh = createEmptyDb();
      data.usuarios = fresh.usuarios;
    }
    return data;
  } catch (error) {
    const dirs = getDirs();
    const corruptName = `controle_nf_db_corrompido_${safeTimestamp()}.json`;
    try {
      fs.copyFileSync(dbFile, path.join(dirs.backups, corruptName));
    } catch (_) {}
    const fresh = createEmptyDb();
    atomicWriteJson(dbFile, fresh);
    return fresh;
  }
}

function writeDb(data) {
  ensureDb();
  atomicWriteJson(dbFile, data);
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function moneyNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return 0;
  const normalized = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  const allowed = ['pendente', 'descontado_boleto', 'recebido', 'concluido'];
  return allowed.includes(value) ? value : 'pendente';
}

function normalizeRecord(input) {
  const now = new Date().toISOString();
  const pecas = Array.isArray(input.pecas) ? input.pecas.map((p) => ({
    descricao: normalizeText(p.descricao || p.produto || p.nome),
    qtd: Math.max(1, Number.parseInt(p.qtd, 10) || 1),
    vunit: moneyNumber(p.vunit || p.valor_unitario || p.valorUnitario)
  })).filter((p) => p.descricao) : [];
  const valorCalculado = pecas.reduce((sum, p) => sum + (p.qtd * p.vunit), 0);
  return {
    id: normalizeText(input.id) || crypto.randomUUID(),
    tipo_processo: normalizeText(input.tipo_processo || input.tipo || 'Devolução') || 'Devolução',
    fornecedor: normalizeText(input.fornecedor).toUpperCase(),
    data_registro: normalizeText(input.data_registro || input.data || new Date().toISOString().slice(0, 10)),
    nf_compra: normalizeText(input.nf_compra || input.nfCompra),
    nf_devolucao: normalizeText(input.nf_devolucao || input.nfDevolucao),
    pecas,
    valor: moneyNumber(input.valor) || valorCalculado,
    observacoes: normalizeText(input.observacoes),
    status: normalizeStatus(input.status),
    boleto_referencia: normalizeText(input.boleto_referencia),
    data_desconto_boleto: normalizeText(input.data_desconto_boleto),
    valor_descontado: moneyNumber(input.valor_descontado),
    timestamp: normalizeText(input.timestamp) || now,
    updated_at: now
  };
}

function createAutomaticBackup(reason = 'backup') {
  const dirs = getDirs();
  ensureDb();
  const file = path.join(dirs.backups, `${reason}_${safeTimestamp()}.json`);
  fs.copyFileSync(dbFile, file);
  return file;
}

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(records) {
  const headers = [
    'id',
    'data_registro',
    'tipo_processo',
    'fornecedor',
    'nf_compra',
    'nf_devolucao',
    'status',
    'boleto_referencia',
    'data_desconto_boleto',
    'valor_descontado',
    'valor',
    'observacoes',
    'pecas_json',
    'pecas_resumo',
    'timestamp',
    'updated_at'
  ];
  const lines = [headers.join(';')];
  for (const item of records) {
    const pecasResumo = (item.pecas || []).map((p) => `${p.qtd}x ${p.descricao} (${Number(p.vunit || 0).toFixed(2)})`).join(' | ');
    const row = [
      item.id,
      item.data_registro,
      item.tipo_processo,
      item.fornecedor,
      item.nf_compra,
      item.nf_devolucao,
      item.status,
      item.boleto_referencia,
      item.data_desconto_boleto,
      item.valor_descontado,
      item.valor,
      item.observacoes,
      JSON.stringify(item.pecas || []),
      pecasResumo,
      item.timestamp,
      item.updated_at
    ].map(csvEscape);
    lines.push(row.join(';'));
  }
  return '\ufeff' + lines.join('\r\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\ufeff/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ';') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((c) => String(c || '').trim())).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] || ''; });
    let pecas = [];
    if (obj.pecas_json) {
      try { pecas = JSON.parse(obj.pecas_json); } catch (_) { pecas = []; }
    }
    obj.pecas = pecas;
    obj.valor = moneyNumber(obj.valor);
    obj.valor_descontado = moneyNumber(obj.valor_descontado);
    return obj;
  });
}

function mergeRecords(currentRecords, importedRecords, mode = 'merge') {
  const normalized = importedRecords.map(normalizeRecord);
  if (mode === 'replace') return normalized;
  const map = new Map(currentRecords.map((item) => [item.id, item]));
  for (const record of normalized) {
    map.set(record.id, { ...(map.get(record.id) || {}), ...record, updated_at: new Date().toISOString() });
  }
  return Array.from(map.values());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#f3f4f6',
    title: APP_TITLE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.setName(APP_TITLE);
app.whenReady().then(() => {
  ensureDb();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle('app:info', () => {
  const dirs = getDirs();
  const db = readDb();
  return {
    appTitle: APP_TITLE,
    rootDir: dirs.root,
    dbFile,
    backupsDir: dirs.backups,
    relatoriosDir: dirs.relatorios,
    totalRegistros: db.devolucoes.length,
    usuarioInicial: 'admin@local',
    senhaInicial: '123456'
  };
});

ipcMain.handle('auth:login', (_event, { email, senha }) => {
  const db = readDb();
  const user = db.usuarios.find((u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase() && u.ativo !== false);
  if (!user) return { ok: false, message: 'Usuário não encontrado.' };
  const ok = verifyPassword(String(senha || ''), user.senha_salt, user.senha_hash);
  if (!ok) return { ok: false, message: 'Senha incorreta.' };
  return { ok: true, user: { id: user.id, email: user.email, nome: user.nome, perfil: user.perfil } };
});

ipcMain.handle('db:listar', () => {
  const db = readDb();
  return db.devolucoes;
});

ipcMain.handle('db:criar', (_event, payload) => {
  const db = readDb();
  const record = normalizeRecord(payload || {});
  db.devolucoes.push(record);
  writeDb(db);
  return { ok: true, record };
});

ipcMain.handle('db:atualizar-status', (_event, { id, status }) => {
  const db = readDb();
  const item = db.devolucoes.find((r) => r.id === id);
  if (!item) return { ok: false, message: 'Registro não encontrado.' };
  item.status = normalizeStatus(status);
  if (item.status === 'descontado_boleto' && !item.data_desconto_boleto) {
    item.data_desconto_boleto = new Date().toISOString().slice(0, 10);
  }
  item.updated_at = new Date().toISOString();
  writeDb(db);
  return { ok: true, record: item };
});

ipcMain.handle('db:deletar', (_event, { id }) => {
  const db = readDb();
  const before = db.devolucoes.length;
  db.devolucoes = db.devolucoes.filter((r) => r.id !== id);
  writeDb(db);
  return { ok: true, removed: before - db.devolucoes.length };
});

ipcMain.handle('db:exportar-backup-json', async () => {
  const db = readDb();
  const dirs = getDirs();
  const defaultPath = path.join(dirs.backups, `backup_controle_nf_${safeTimestamp()}.json`);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar backup completo do banco',
    defaultPath,
    filters: [{ name: 'Backup JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, JSON.stringify(db, null, 2), 'utf8');
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle('db:importar-backup-json', async (_event, { mode = 'merge' } = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar backup JSON',
    properties: ['openFile'],
    filters: [{ name: 'Backup JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
  const filePath = result.filePaths[0];
  const imported = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const current = readDb();
  createAutomaticBackup('antes_importar_json');
  const importedRecords = Array.isArray(imported.devolucoes) ? imported.devolucoes : (Array.isArray(imported) ? imported : []);
  current.devolucoes = mergeRecords(current.devolucoes, importedRecords, mode);
  if (mode === 'replace' && Array.isArray(imported.usuarios) && imported.usuarios.length) {
    current.usuarios = imported.usuarios;
  }
  writeDb(current);
  return { ok: true, filePath, total: current.devolucoes.length, imported: importedRecords.length, mode };
});

ipcMain.handle('db:exportar-csv', async () => {
  const db = readDb();
  const dirs = getDirs();
  const defaultPath = path.join(dirs.relatorios, `planilha_controle_nf_${safeTimestamp()}.csv`);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar planilha CSV',
    defaultPath,
    filters: [{ name: 'Planilha CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(result.filePath, toCsv(db.devolucoes), 'utf8');
  return { ok: true, filePath: result.filePath, total: db.devolucoes.length };
});

ipcMain.handle('db:importar-csv', async (_event, { mode = 'merge' } = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar planilha CSV',
    properties: ['openFile'],
    filters: [{ name: 'Planilha CSV', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
  const filePath = result.filePaths[0];
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const db = readDb();
  createAutomaticBackup('antes_importar_csv');
  db.devolucoes = mergeRecords(db.devolucoes, rows, mode);
  writeDb(db);
  return { ok: true, filePath, imported: rows.length, total: db.devolucoes.length, mode };
});

ipcMain.handle('db:abrir-pasta', async () => {
  const dirs = getDirs();
  await shell.openPath(dirs.root);
  return { ok: true, path: dirs.root };
});
