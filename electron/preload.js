const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sistemaLocal', {
  info: () => ipcRenderer.invoke('app:info'),
  login: (email, senha) => ipcRenderer.invoke('auth:login', { email, senha }),
  listar: () => ipcRenderer.invoke('db:listar'),
  criar: (dados) => ipcRenderer.invoke('db:criar', dados),
  atualizarStatus: (id, status) => ipcRenderer.invoke('db:atualizar-status', { id, status }),
  deletar: (id) => ipcRenderer.invoke('db:deletar', { id }),
  exportarBackupJson: () => ipcRenderer.invoke('db:exportar-backup-json'),
  importarBackupJson: (mode) => ipcRenderer.invoke('db:importar-backup-json', { mode }),
  exportarCsv: () => ipcRenderer.invoke('db:exportar-csv'),
  importarCsv: (mode) => ipcRenderer.invoke('db:importar-csv', { mode }),
  abrirPasta: () => ipcRenderer.invoke('db:abrir-pasta')
});
