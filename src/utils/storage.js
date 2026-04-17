// UXP persistent storage — uses the plugin's data folder (a JSON file)
// instead of secureStorage which doesn't reliably persist across reloads
// in InDesign 2025. Auth token stays in secureStorage (it's sensitive).
var uxp = require('uxp');
var storage = uxp.storage;
var localFS = storage.localFileSystem;

var PREFS_FILE = 'hh-settings.json';
var TOKEN_KEY = 'hh_auth_token';

var defaults = {
  apiUrl: 'https://app.helperharry.com/api',
  workingFolder: '',
  workingFolderToken: '',
  folderStructure: 'year',
  defaultBleed: 3,
  defaultMargins: 6,
  autoSaveProof: true,
  proofResolution: 150,
  okPdfResolution: 300,
  showJobInfo: true,
  openPdfAfterExport: true
};

async function _getDataFolder() {
  try {
    return await localFS.getDataFolder();
  } catch (e) {
    return await localFS.getTemporaryFolder();
  }
}

async function getPrefs() {
  try {
    var folder = await _getDataFolder();
    var entries = await folder.getEntries();
    var file = entries.find(function(e) { return e.name === PREFS_FILE; });
    if (!file) return Object.assign({}, defaults);
    var text = await file.read({ format: storage.formats.utf8 });
    var parsed = JSON.parse(text);
    return Object.assign({}, defaults, parsed);
  } catch (e) {
    return Object.assign({}, defaults);
  }
}

async function savePrefs(prefs) {
  try {
    var folder = await _getDataFolder();
    var file = await folder.createFile(PREFS_FILE, { overwrite: true });
    await file.write(JSON.stringify(prefs, null, 2), { format: storage.formats.utf8 });
  } catch (e) {
    // Fallback: try secureStorage
    try { await storage.secureStorage.setItem('hh_preferences', JSON.stringify(prefs)); } catch (e2) {}
  }
}

// Folder tokens — UXP requires a persistent token to re-access a folder
// in future sessions. nativePath alone isn't enough.
async function saveFolderToken(folder) {
  try {
    var token = await localFS.createPersistentToken(folder);
    return token;
  } catch (e) {
    return '';
  }
}

async function getFolderFromToken(token) {
  if (!token) return null;
  try {
    return await localFS.getEntryForPersistentToken(token);
  } catch (e) {
    return null;
  }
}

// Auth token — kept in secureStorage (it's sensitive + short-lived)
async function getToken() {
  try {
    return await storage.secureStorage.getItem(TOKEN_KEY);
  } catch (e) {
    // Fallback: try reading from the data file
    try {
      var prefs = await getPrefs();
      return prefs._authToken || null;
    } catch (e2) {
      return null;
    }
  }
}

async function saveToken(token) {
  try {
    await storage.secureStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    // Fallback: save alongside prefs (less secure but works)
    try {
      var prefs = await getPrefs();
      prefs._authToken = token;
      await savePrefs(prefs);
    } catch (e2) {}
  }
}

async function clearToken() {
  try { await storage.secureStorage.removeItem(TOKEN_KEY); } catch (e) {}
  try {
    var prefs = await getPrefs();
    delete prefs._authToken;
    await savePrefs(prefs);
  } catch (e) {}
}

module.exports = { getPrefs, savePrefs, getToken, saveToken, clearToken, saveFolderToken, getFolderFromToken, defaults };
