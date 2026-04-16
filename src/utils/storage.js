// UXP persistent storage for settings and auth token
const storage = require('uxp').storage;

const PREFS_KEY = 'hh_preferences';
const TOKEN_KEY = 'hh_auth_token';

const defaults = {
  apiUrl: 'https://app.helperharry.com/api',
  workingFolder: '',
  folderStructure: 'year',  // year, flat, customer
  defaultBleed: 3,
  defaultMargins: 6,
  autoSaveProof: true,
  proofResolution: 150,
  okPdfResolution: 300,
  showJobInfo: true,
  openPdfAfterExport: true
};

async function getPrefs() {
  try {
    const data = await storage.secureStorage.getItem(PREFS_KEY);
    return data ? { ...defaults, ...JSON.parse(data) } : { ...defaults };
  } catch (e) {
    return { ...defaults };
  }
}

async function savePrefs(prefs) {
  await storage.secureStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

async function getToken() {
  try {
    return await storage.secureStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

async function saveToken(token) {
  await storage.secureStorage.setItem(TOKEN_KEY, token);
}

async function clearToken() {
  try { await storage.secureStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

module.exports = { getPrefs, savePrefs, getToken, saveToken, clearToken, defaults };
