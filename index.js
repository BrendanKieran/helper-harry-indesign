/**
 * Helper Harry InDesign Plugin — Main Entry Point
 * UXP Plugin for Adobe InDesign
 */

const auth = require('./src/api/auth');
const workflow = require('./src/api/workflow');
const { createDocument } = require('./src/indesign/createDocument');
const { exportProofPdf, exportOkPdf } = require('./src/indesign/exportPdf');
const { placeImage } = require('./src/indesign/placeAsset');
const { getPrefs, savePrefs, saveFolderToken, getFolderFromToken } = require('./src/utils/storage');
const indesignModule = require('indesign');
const indesign = indesignModule.app;
const uxpStorage = require('uxp').storage;
const fs = uxpStorage.localFileSystem;

let currentJobId = null;
let currentCustomerId = null;
let jobCache = {}; // cache job numbers for export

// Expose key functions globally so onclick attributes work in UXP
if (typeof window !== 'undefined') {
  window.showSettings = function() { showSettings(); };
}

// Get or create a job subfolder under the working folder, respecting
// the folder structure setting (year / customer / flat).
async function getJobFolder(workingFolder, prefs, jobNumber, customerName) {
  if (!workingFolder) return null;
  try {
    var structure = prefs.folderStructure || 'year';
    var parentFolder = workingFolder;

    if (structure === 'year') {
      var year = String(new Date().getFullYear());
      try { parentFolder = await workingFolder.getEntry(year); }
      catch (e) { parentFolder = await workingFolder.createFolder(year); }
    } else if (structure === 'customer' && customerName) {
      var safeName = customerName.replace(/[/\\:*?"<>|]/g, '').substring(0, 50).trim();
      if (safeName) {
        try { parentFolder = await workingFolder.getEntry(safeName); }
        catch (e) { parentFolder = await workingFolder.createFolder(safeName); }
      }
    }
    // flat = use workingFolder directly

    // Job subfolder
    var jobFolder;
    try { jobFolder = await parentFolder.getEntry(jobNumber); }
    catch (e) { jobFolder = await parentFolder.createFolder(jobNumber); }
    return jobFolder;
  } catch (e) {
    return workingFolder; // fallback to root working folder
  }
}

// ── Render the UI ──

async function render() {
  const root = document.getElementById('root');
  const isLoggedIn = await auth.init();
  if (!isLoggedIn) { renderLogin(root); } else { renderMain(root); }
}

// ── Login Screen ──

function renderLogin(root) {
  root.innerHTML = `
    <div class="header"><span class="header-logo">Helper Harry</span></div>
    <div style="padding: 16px; text-align: center;">
      <p style="margin-bottom: 12px; color: var(--text-dim);">Log in with your Helper Harry account</p>
      <div class="field">
        <label class="label">Email</label>
        <input id="login-email" class="input" type="email" placeholder="you@printshop.ie" />
      </div>
      <div class="field">
        <label class="label">Password</label>
        <input id="login-password" class="input" type="password" placeholder="Password" />
      </div>
      <div id="login-error" class="msg msg-error" style="display: none;"></div>
      <button id="login-btn" class="btn btn-primary btn-block">Log In</button>
    </div>
  `;

  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    if (!email || !password) { errEl.textContent = 'Enter email and password'; errEl.style.display = 'block'; return; }
    try {
      document.getElementById('login-btn').textContent = 'Logging in...';
      await auth.login(email, password);
      renderMain(root);
    } catch (err) {
      errEl.textContent = err.message; errEl.style.display = 'block';
      document.getElementById('login-btn').textContent = 'Log In';
    }
  });
}

// ── Main Panel ──

async function renderMain(root) {
  const user = auth.user;
  const email = user?.email || '';

  root.innerHTML = `
    <div class="header">
      <span class="header-logo">Helper Harry</span>
      <span class="header-user">${email.split('@')[0]}</span>
      <span style="margin-left: auto; display: flex; gap: 4px; align-items: center;">
        <button id="settings-btn" class="gear-btn" title="Settings">Settings</button>
        <button id="logout-btn" class="btn btn-secondary btn-sm">Logout</button>
      </span>
    </div>

    <div class="section-title">MY JOBS <button id="refresh-btn" class="btn btn-secondary btn-sm" style="float: right;">Refresh</button></div>
    <div id="job-list"><div class="empty"><span class="spinner"></span> Loading jobs...</div></div>

    <div id="assets-section" style="display: none;">
      <div class="divider"></div>
      <div class="section-title">CUSTOMER ASSETS</div>
      <div id="asset-list"></div>
    </div>

    <div id="status-msg" class="msg msg-success" style="display: none;"></div>
    <div id="settings-overlay" class="settings-overlay" style="display: none;"></div>
  `;

  document.getElementById('logout-btn').addEventListener('click', async () => { await auth.logout(); renderLogin(root); });
  document.getElementById('refresh-btn').addEventListener('click', () => loadJobs());
  document.getElementById('settings-btn').addEventListener('click', function() {
    var overlay = document.getElementById('settings-overlay');
    var html = '<div class="settings-panel">';
    html += '<h2>Settings</h2>';
    html += '<div class="field"><label class="label">Working Folder</label>';
    html += '<div style="display:flex;gap:4px"><input id="pref-folder" class="input input-sm" value="" placeholder="Click Browse" readonly style="flex:1" />';
    html += '<button id="browse-folder-btn" class="btn btn-secondary btn-sm">Browse</button></div></div>';
    html += '<div class="field"><label class="label">Folder Structure (year / customer / flat)</label>';
    html += '<input id="pref-folder-structure" class="input input-sm" value="year" /></div>';
    html += '<div class="field"><label class="label">Default Bleed (mm)</label>';
    html += '<input id="pref-bleed" class="input input-sm" type="number" value="3" /></div>';
    html += '<div class="field"><label class="label">Default Margins (mm)</label>';
    html += '<input id="pref-margins" class="input input-sm" type="number" value="6" /></div>';
    html += '<div class="field"><label class="label">Proof DPI</label>';
    html += '<input id="pref-proof-dpi" class="input input-sm" type="number" value="150" /></div>';
    html += '<div class="field"><label class="label">OK PDF DPI</label>';
    html += '<input id="pref-ok-dpi" class="input input-sm" type="number" value="300" /></div>';
    html += '<div class="field"><label class="label">Auto-upload proof (true/false)</label>';
    html += '<input id="pref-auto-upload" class="input input-sm" value="true" /></div>';
    html += '<div class="field"><label class="label">API URL</label>';
    html += '<input id="pref-api-url" class="input input-sm" value="https://app.helperharry.com/api" /></div>';
    html += '<div class="settings-actions">';
    html += '<button id="settings-cancel" class="btn btn-secondary btn-sm">Cancel</button>';
    html += '<button id="settings-save" class="btn btn-primary btn-sm">Save</button>';
    html += '</div></div>';
    overlay.innerHTML = html;
    overlay.style.display = 'flex';

    // Load saved prefs into the fields (async but non-blocking)
    getPrefs().then(function(prefs) {
      if (!prefs) return;
      try {
        var el;
        el = document.getElementById('pref-folder');
        if (el) {
          el.value = prefs.workingFolder || '';
          if (prefs.workingFolderToken) el.setAttribute('data-token', prefs.workingFolderToken);
        }
        el = document.getElementById('pref-folder-structure'); if (el) el.value = prefs.folderStructure || 'year';
        el = document.getElementById('pref-bleed'); if (el) el.value = prefs.defaultBleed || 3;
        el = document.getElementById('pref-margins'); if (el) el.value = prefs.defaultMargins || 6;
        el = document.getElementById('pref-proof-dpi'); if (el) el.value = prefs.proofResolution || 150;
        el = document.getElementById('pref-ok-dpi'); if (el) el.value = prefs.okPdfResolution || 300;
        el = document.getElementById('pref-auto-upload'); if (el) el.value = prefs.autoSaveProof ? 'true' : 'false';
        el = document.getElementById('pref-api-url'); if (el) el.value = prefs.apiUrl || 'https://app.helperharry.com/api';
      } catch(e) {}
    }).catch(function() {});

    document.getElementById('browse-folder-btn').addEventListener('click', function() {
      fs.getFolder().then(function(folder) {
        if (folder) {
          document.getElementById('pref-folder').value = folder.nativePath;
          // Save persistent token so we can re-access this folder later
          saveFolderToken(folder).then(function(token) {
            document.getElementById('pref-folder').setAttribute('data-token', token || '');
          }).catch(function() {});
        }
      }).catch(function() {});
    });
    document.getElementById('settings-cancel').addEventListener('click', function() {
      overlay.style.display = 'none';
    });
    document.getElementById('settings-save').addEventListener('click', function() {
      var folderEl = document.getElementById('pref-folder');
      var updated = {
        apiUrl: document.getElementById('pref-api-url').value.trim() || 'https://app.helperharry.com/api',
        workingFolder: folderEl.value || '',
        workingFolderToken: folderEl.getAttribute('data-token') || '',
        folderStructure: document.getElementById('pref-folder-structure').value || 'year',
        defaultBleed: parseFloat(document.getElementById('pref-bleed').value) || 3,
        defaultMargins: parseFloat(document.getElementById('pref-margins').value) || 6,
        proofResolution: parseInt(document.getElementById('pref-proof-dpi').value) || 150,
        okPdfResolution: parseInt(document.getElementById('pref-ok-dpi').value) || 300,
        autoSaveProof: document.getElementById('pref-auto-upload').value === 'true',
        openPdfAfterExport: true
      };
      savePrefs(updated).then(function() {
        overlay.style.display = 'none';
        showStatus('Settings saved');
      }).catch(function(err) {
        showError('Save failed');
      });
    });
  });

  loadJobs();
}

// ── Load Jobs ──

async function loadJobs() {
  const listEl = document.getElementById('job-list');
  try {
    const data = await workflow.getMyJobs();
    const allJobs = [...(data.urgent || []), ...(data.thisWeek || []), ...(data.later || [])];

    if (allJobs.length === 0) {
      listEl.innerHTML = '<div class="empty">No jobs assigned to you</div>';
      return;
    }

    // Cache job data
    allJobs.forEach(j => { jobCache[j.id] = j; });

    listEl.innerHTML = allJobs.map(job => {
      const custName = job.customer_company || job.customer_first_name || '';
      const isOverdue = job.deadline && new Date(job.deadline) < new Date();
      const dueText = job.deadline ? new Date(job.deadline).toLocaleDateString() : '';
      const dueBadge = isOverdue ? '<span class="badge badge-overdue">OVERDUE</span>' : (dueText ? `<span class="badge badge-due">${dueText}</span>` : '');

      let specsText = '';
      if (job.production_specs && job.production_specs[0]) {
        const s = job.production_specs[0];
        specsText = [s.finished_size, s.custom_width_mm ? `${s.custom_width_mm}x${s.custom_height_mm}mm` : '', s.sheets_per_item > 1 ? `${s.sheets_per_item} pages` : ''].filter(Boolean).join(' · ');
      }

      const isActive = currentJobId === job.id;

      if (isActive) {
        // Active job: show export and upload actions
        return `
          <div class="job-card" data-job-id="${job.id}" style="border-color: var(--accent); background: #1a1a3e;">
            <div class="job-number">${job.job_number} ${dueBadge} <span style="font-size: 9px; color: var(--green);">ACTIVE</span></div>
            <div class="job-title">${job.description || ''}</div>
            <div class="job-meta">${custName}</div>
            ${specsText ? `<div class="job-specs">${specsText}</div>` : ''}
            <div class="job-actions">
              <button class="btn btn-amber btn-sm export-proof-btn" data-job-id="${job.id}" data-job-number="${job.job_number}">Export Proof</button>
              <button class="btn btn-green btn-sm export-ok-btn" data-job-id="${job.id}" data-job-number="${job.job_number}">Export OK PDF</button>
              <button class="btn btn-secondary btn-sm upload-btn" data-job-id="${job.id}" data-job-number="${job.job_number}">Upload File</button>
            </div>
          </div>
        `;
      } else {
        // Inactive job: show create/open actions
        return `
          <div class="job-card" data-job-id="${job.id}">
            <div class="job-number">${job.job_number} ${dueBadge}</div>
            <div class="job-title">${job.description || ''}</div>
            <div class="job-meta">${custName}</div>
            ${specsText ? `<div class="job-specs">${specsText}</div>` : ''}
            <div class="job-actions">
              <button class="btn btn-primary btn-sm create-doc-btn" data-job-id="${job.id}">Create Document</button>
              <button class="btn btn-secondary btn-sm open-doc-btn" data-job-id="${job.id}">Open</button>
            </div>
          </div>
        `;
      }
    }).join('');

    // Attach event listeners
    listEl.querySelectorAll('.create-doc-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); handleCreateDocument(btn.dataset.jobId); });
    });
    listEl.querySelectorAll('.open-doc-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); handleOpenDocument(btn.dataset.jobId); });
    });
    listEl.querySelectorAll('.export-proof-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); handleExportProof(btn.dataset.jobId, btn.dataset.jobNumber); });
    });
    listEl.querySelectorAll('.export-ok-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); handleExportOkPdf(btn.dataset.jobId, btn.dataset.jobNumber); });
    });
    listEl.querySelectorAll('.upload-btn').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); handleUploadFile(btn.dataset.jobId, btn.dataset.jobNumber); });
    });

  } catch (err) {
    listEl.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  }
}

// ── Create Document ──

async function handleCreateDocument(jobId) {
  try {
    showStatus('Creating document...');
    const job = await workflow.getJobDetails(jobId);
    const prefs = await getPrefs();
    currentJobId = jobId;
    currentCustomerId = job.customer_id;
    jobCache[jobId] = job;

    let widthMM = 210, heightMM = 297, pageCount = 1;
    const custName = job.customer_company || job.customer_first_name || 'Customer';

    if (job.production_specs && job.production_specs[0]) {
      const s = job.production_specs[0];
      if (s.custom_width_mm > 0) widthMM = s.custom_width_mm;
      if (s.custom_height_mm > 0) heightMM = s.custom_height_mm;
      if (s.sheets_per_item > 1) pageCount = s.sheets_per_item;
    }

    const facingPages = pageCount >= 4;

    const doc = createDocument({
      widthMM, heightMM, pageCount, facingPages,
      bleedMM: prefs.defaultBleed,
      marginMM: prefs.defaultMargins,
      jobNumber: job.job_number,
      customerName: custName,
      title: job.description || ''
    }, prefs);

    // Auto-save with job-based filename into the structured folder.
    try {
      const docName = `${job.job_number} ${(job.description || custName).substring(0, 40).replace(/[/\\:*?"<>|]/g, '')}`.trim();
      let workingFolder = null;
      if (prefs.workingFolderToken) {
        workingFolder = await getFolderFromToken(prefs.workingFolderToken).catch(() => null);
      }
      let targetFolder;
      if (workingFolder) {
        targetFolder = await getJobFolder(workingFolder, prefs, job.job_number, custName);
      } else {
        targetFolder = await fs.getFolder();
      }
      if (targetFolder) {
        const file = await targetFolder.createFile(`${docName}.indd`, { overwrite: true });
        doc.save(file);
        workflow.saveLocalFilePath(jobId, file.nativePath, 'indesign').catch(() => {});
      }
    } catch (saveErr) {
      // Save is nice-to-have — document is still open and usable
    }

    showStatus(`Document created: ${job.job_number}`);

    // Reload job list to show active state
    loadJobs();

    // Load customer assets
    if (job.customer_id) loadCustomerAssets(job.customer_id);

  } catch (err) {
    showError(`Create failed: ${err.message}`);
  }
}

// ── Open Existing Document ──

async function handleOpenDocument(jobId) {
  try {
    const localFile = await workflow.getLocalFilePath(jobId);
    if (!localFile || !localFile.file_path) {
      // No saved path — just activate this job
      currentJobId = jobId;
      const job = await workflow.getJobDetails(jobId);
      currentCustomerId = job.customer_id;
      jobCache[jobId] = job;
      loadJobs();
      if (job.customer_id) loadCustomerAssets(job.customer_id);
      showStatus('Job selected — open your InDesign file manually, then use Export');
      return;
    }

    const file = localFile.file_path;
    try {
      indesign.open(new (require('uxp').storage.File)(file));
    } catch (e) {
      // If file open fails, still activate the job
    }

    currentJobId = jobId;
    const job = await workflow.getJobDetails(jobId);
    currentCustomerId = job.customer_id;
    jobCache[jobId] = job;
    loadJobs();
    if (job.customer_id) loadCustomerAssets(job.customer_id);
    showStatus('Job activated');
  } catch (err) {
    // Activate job even if open fails
    currentJobId = jobId;
    loadJobs();
    showError(`Open failed: ${err.message}`);
  }
}

// ── Settings Panel ──

async function showSettings() {
  var overlay = document.getElementById('settings-overlay');
  if (!overlay) return;

  var prefs = { apiUrl: 'https://app.helperharry.com/api', workingFolder: '', folderStructure: 'year', defaultBleed: 3, defaultMargins: 6, proofResolution: 150, okPdfResolution: 300, autoSaveProof: true, openPdfAfterExport: true };
  try { var loaded = await getPrefs(); if (loaded) prefs = loaded; } catch (e) {}

  // Build with simple inputs only — no <select>, no template expressions
  // in attribute values (UXP can choke on those)
  var html = '<div class="settings-panel">';
  html += '<h2>Settings</h2>';

  html += '<div class="field"><label class="label">Working Folder</label>';
  html += '<div style="display:flex;gap:4px"><input id="pref-folder" class="input input-sm" value="" placeholder="Click Browse to set" readonly style="flex:1" />';
  html += '<button id="browse-folder-btn" class="btn btn-secondary btn-sm">Browse</button></div></div>';

  html += '<div class="field"><label class="label">Folder Structure (year / customer / flat)</label>';
  html += '<input id="pref-folder-structure" class="input input-sm" value="" /></div>';

  html += '<div class="field"><label class="label">Default Bleed (mm)</label>';
  html += '<input id="pref-bleed" class="input input-sm" type="number" value="" /></div>';

  html += '<div class="field"><label class="label">Default Margins (mm)</label>';
  html += '<input id="pref-margins" class="input input-sm" type="number" value="" /></div>';

  html += '<div class="field"><label class="label">Proof DPI (72 / 150 / 300)</label>';
  html += '<input id="pref-proof-dpi" class="input input-sm" type="number" value="" /></div>';

  html += '<div class="field"><label class="label">OK PDF DPI (150 / 300 / 600)</label>';
  html += '<input id="pref-ok-dpi" class="input input-sm" type="number" value="" /></div>';

  html += '<div class="field"><label class="label">Auto-upload proof (true / false)</label>';
  html += '<input id="pref-auto-upload" class="input input-sm" value="" /></div>';

  html += '<div class="field"><label class="label">API URL</label>';
  html += '<input id="pref-api-url" class="input input-sm" value="" /></div>';

  html += '<div class="settings-actions">';
  html += '<button id="settings-cancel" class="btn btn-secondary btn-sm">Cancel</button>';
  html += '<button id="settings-save" class="btn btn-primary btn-sm">Save</button>';
  html += '</div></div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';

  // Set values AFTER innerHTML (avoids template-in-attribute issues)
  document.getElementById('pref-folder').value = prefs.workingFolder || '';
  document.getElementById('pref-folder-structure').value = prefs.folderStructure || 'year';
  document.getElementById('pref-bleed').value = prefs.defaultBleed || 3;
  document.getElementById('pref-margins').value = prefs.defaultMargins || 6;
  document.getElementById('pref-proof-dpi').value = prefs.proofResolution || 150;
  document.getElementById('pref-ok-dpi').value = prefs.okPdfResolution || 300;
  document.getElementById('pref-auto-upload').value = prefs.autoSaveProof ? 'true' : 'false';
  document.getElementById('pref-api-url').value = prefs.apiUrl || 'https://app.helperharry.com/api';

  document.getElementById('browse-folder-btn').addEventListener('click', function() {
    fs.getFolder().then(function(folder) {
      if (folder) document.getElementById('pref-folder').value = folder.nativePath;
    }).catch(function() {});
  });

  document.getElementById('settings-cancel').addEventListener('click', function() {
    overlay.style.display = 'none';
  });

  document.getElementById('settings-save').addEventListener('click', function() {
    var updated = {
      apiUrl: document.getElementById('pref-api-url').value.trim() || 'https://app.helperharry.com/api',
      workingFolder: document.getElementById('pref-folder').value || '',
      folderStructure: document.getElementById('pref-folder-structure').value || 'year',
      defaultBleed: parseFloat(document.getElementById('pref-bleed').value) || 3,
      defaultMargins: parseFloat(document.getElementById('pref-margins').value) || 6,
      proofResolution: parseInt(document.getElementById('pref-ok-dpi').value) || 150,
      okPdfResolution: parseInt(document.getElementById('pref-ok-dpi').value) || 300,
      autoSaveProof: document.getElementById('pref-auto-upload').value === 'true',
      openPdfAfterExport: true
    };
    savePrefs(updated).then(function() {
      overlay.style.display = 'none';
      showStatus('Settings saved');
    }).catch(function(err) {
      showError('Save failed: ' + err.message);
    });
  });
}

// ── Export Proof ──

async function handleExportProof(jobId, jobNumber) {
  try {
    const doc = indesign.activeDocument;
    if (!doc) { showError('No document open in InDesign'); return; }

    const prefs = await getPrefs();
    let outputFolder = null;
    if (prefs.workingFolderToken) {
      try {
        var wf = await getFolderFromToken(prefs.workingFolderToken);
        var custName = (jobCache[jobId] && (jobCache[jobId].customer_company || jobCache[jobId].customer_first_name)) || '';
        outputFolder = await getJobFolder(wf, prefs, jobNumber, custName);
      } catch (e) {}
    }
    showStatus(outputFolder ? 'Exporting proof...' : 'Select folder for proof PDF...');
    const filename = `${jobNumber}-proof.pdf`;
    const outputPath = await exportProofPdf(doc, outputFolder, filename);

    showStatus('Proof exported! Uploading to Helper Harry...');
    try {
      // Read the file we just exported directly — no interactive picker
      const entry = await fs.getEntryForPersistentToken(outputPath).catch(() => null)
        || await fs.createSessionToken(outputPath).catch(() => null);
      let buffer;
      if (entry && entry.read) {
        buffer = await entry.read({ format: uxpStorage.formats.binary });
      } else {
        // Fallback: try reading via the path the export function returned
        const uxpFile = require('uxp').storage;
        const fileEntry = await uxpFile.localFileSystem.getFileForOpening({ initialLocation: outputPath });
        if (fileEntry) buffer = await fileEntry.read({ format: uxpFile.formats.binary });
      }
      if (buffer) {
        await workflow.uploadJobFile(jobId, buffer, filename, 'proof');
        showStatus('Proof uploaded to Helper Harry!');
      } else {
        showStatus('Proof saved locally (could not read file for upload)');
      }
    } catch (uploadErr) {
      showStatus(`Proof saved locally (upload: ${uploadErr.message || 'skipped'})`);
    }
  } catch (err) {
    showError(`Export failed: ${err.message}`);
  }
}

// ── Export OK PDF ──

async function handleExportOkPdf(jobId, jobNumber) {
  try {
    const doc = indesign.activeDocument;
    if (!doc) { showError('No document open in InDesign'); return; }

    const prefs = await getPrefs();
    let outputFolder = null;
    if (prefs.workingFolderToken) {
      try {
        var wf = await getFolderFromToken(prefs.workingFolderToken);
        var custName = (jobCache[jobId] && (jobCache[jobId].customer_company || jobCache[jobId].customer_first_name)) || '';
        outputFolder = await getJobFolder(wf, prefs, jobNumber, custName);
      } catch (e) {}
    }
    showStatus(outputFolder ? 'Exporting press-ready PDF...' : 'Select folder for press-ready PDF...');
    const filename = `${jobNumber}-OK.pdf`;
    const outputPath = await exportOkPdf(doc, outputFolder, filename, prefs.defaultBleed);

    showStatus('PDF exported! Uploading to Helper Harry...');
    try {
      const entry = await fs.getEntryForPersistentToken(outputPath).catch(() => null)
        || await fs.createSessionToken(outputPath).catch(() => null);
      let buffer;
      if (entry && entry.read) {
        buffer = await entry.read({ format: uxpStorage.formats.binary });
      } else {
        const uxpFile = require('uxp').storage;
        const fileEntry = await uxpFile.localFileSystem.getFileForOpening({ initialLocation: outputPath });
        if (fileEntry) buffer = await fileEntry.read({ format: uxpFile.formats.binary });
      }
      if (buffer) {
        await workflow.uploadJobFile(jobId, buffer, filename, 'print_ready');
        showStatus('Press-ready PDF uploaded!');
      } else {
        showStatus('PDF saved locally (could not read file for upload)');
      }
    } catch (uploadErr) {
      showStatus(`PDF saved locally (upload: ${uploadErr.message || 'skipped'})`);
    }
  } catch (err) {
    showError(`Export failed: ${err.message}`);
  }
}

// ── Upload File ──

async function handleUploadFile(jobId, jobNumber) {
  try {
    showStatus('Select a file to upload...');
    const file = await fs.getFileForOpening({
      types: ['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'eps', 'ai', 'psd', 'indd', 'svg', 'doc', 'docx']
    });

    if (!file) { showStatus('Upload cancelled'); return; }

    showStatus(`Uploading ${file.name}...`);
    const buffer = await file.read({ format: uxpStorage.formats.binary });
    await workflow.uploadJobFile(jobId, buffer, file.name, 'customer_supplied');
    showStatus(`${file.name} uploaded to ${jobNumber}!`);
  } catch (err) {
    showError(`Upload failed: ${err.message}`);
  }
}

// ── Customer Assets ──

async function loadCustomerAssets(customerId) {
  const section = document.getElementById('assets-section');
  const listEl = document.getElementById('asset-list');
  if (!section || !listEl) return;
  section.style.display = 'block';

  try {
    const assets = await workflow.getCustomerAssets(customerId);
    if (assets.length === 0) {
      listEl.innerHTML = '<div class="empty">No assets for this customer</div>';
      return;
    }

    listEl.innerHTML = assets.map(a => `
      <div class="asset-card" data-asset-id="${a.id}" data-storage-key="${a.storage_key}" data-filename="${a.original_filename}" data-mime="${a.mime_type || ''}">
        <span class="asset-type">${a.file_type}</span>
        <span class="asset-name">${a.original_filename}</span>
      </div>
    `).join('');

    listEl.querySelectorAll('.asset-card').forEach(card => {
      card.addEventListener('click', async () => {
        const mime = card.dataset.mime;
        if (mime && mime.startsWith('image/')) {
          try {
            showStatus('Placing image...');
            const result = await workflow.getAssetUrl(card.dataset.assetId);
            const doc = indesign.activeDocument;
            if (doc) {
              const prefs = await getPrefs();
              const imageUrl = `${prefs.apiUrl.replace('/api', '')}${result.url}`;
              await placeImage(doc, imageUrl, card.dataset.filename);
              showStatus('Image placed');
            }
          } catch (err) {
            showError(`Place failed: ${err.message}`);
          }
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = `<div class="msg msg-error">${err.message}</div>`;
  }
}

// ── Status Messages ──

function showStatus(msg) {
  const el = document.getElementById('status-msg');
  if (el) { el.className = 'msg msg-success'; el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 3000); }
}

function showError(msg) {
  const el = document.getElementById('status-msg');
  if (el) { el.className = 'msg msg-error'; el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 5000); }
}

// ── Plugin Entry ──

const { entrypoints } = require('uxp');
entrypoints.setup({
  panels: {
    hhPanel: {
      show() { render(); },
      hide() {}
    }
  }
});
