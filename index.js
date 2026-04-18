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

// Get or create a job subfolder under the working folder.
// jobInfo: { job_number, customer_company, customer_code, description, job_type_name }
async function getJobFolder(workingFolder, prefs, jobInfo) {
  if (!workingFolder) return null;
  var safe = function(s) { return (s || '').replace(/[/\\:*?"<>|]/g, '').trim(); };
  try {
    var structure = prefs.folderStructure || 'year';
    var parentFolder = workingFolder;
    var year = String(new Date().getFullYear());
    var custName = safe(jobInfo.customer_company || jobInfo.customer_first_name || 'Customer');
    var custCode = safe(jobInfo.customer_code || '');
    var jobNum = safe(jobInfo.job_number || 'JOB');
    var desc = safe((jobInfo.description || '').substring(0, 60));
    var jobType = safe(jobInfo.job_type_name || '');

    if (structure === 'year') {
      // 2026/JOB-1234/
      try { parentFolder = await workingFolder.getEntry(year); }
      catch (e) { parentFolder = await workingFolder.createFolder(year); }
      try { return await parentFolder.getEntry(jobNum); }
      catch (e) { return await parentFolder.createFolder(jobNum); }

    } else if (structure === 'customer') {
      // Customer Name - Code/JOB-1234/
      var custFolder2 = custCode ? (custName + ' - ' + custCode) : custName;
      try { parentFolder = await workingFolder.getEntry(custFolder2); }
      catch (e) { parentFolder = await workingFolder.createFolder(custFolder2); }
      try { return await parentFolder.getEntry(jobNum); }
      catch (e) { return await parentFolder.createFolder(jobNum); }

    } else if (structure === 'yearCustomer') {
      // Factory pattern:
      // 2026 Jobs/Customer Name - Code/JOB-1234 Customer Desc - Type/
      var yearLabel = year + ' Jobs';
      var yearFolder;
      try { yearFolder = await workingFolder.getEntry(yearLabel); }
      catch (e) { yearFolder = await workingFolder.createFolder(yearLabel); }

      var custFolderName = custCode ? (custName + ' - ' + custCode) : custName;
      var custFolder;
      try { custFolder = await yearFolder.getEntry(custFolderName); }
      catch (e) { custFolder = await yearFolder.createFolder(custFolderName); }

      var jobFolderName = [jobNum, custName, desc, jobType ? '- ' + jobType : ''].filter(Boolean).join(' ').substring(0, 120).trim();
      try { return await custFolder.getEntry(jobFolderName); }
      catch (e) { return await custFolder.createFolder(jobFolderName); }

    } else {
      // flat = JOB-1234/ directly in working folder
      try { return await workingFolder.getEntry(jobNum); }
      catch (e) { return await workingFolder.createFolder(jobNum); }
    }
  } catch (e) {
    return workingFolder;
  }
}

// Build a Factory-style filename: JOB-1234 Customer Desc - Type STATUS.pdf
function buildFilename(jobInfo, status) {
  var safe = function(s) { return (s || '').replace(/[/\\:*?"<>|]/g, '').trim(); };
  var parts = [
    safe(jobInfo.job_number || 'JOB'),
    safe(jobInfo.customer_company || jobInfo.customer_first_name || ''),
    safe((jobInfo.description || '').substring(0, 50))
  ];
  if (jobInfo.job_type_name) parts.push('- ' + safe(jobInfo.job_type_name));
  // Append date + time so repeat exports don't produce identical filenames
  var now = new Date();
  var dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  var timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
  parts.push(status + ' ' + dateStr + ' ' + timeStr);
  return parts.filter(Boolean).join(' ').substring(0, 180).trim() + '.pdf';
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
    <div style="margin-bottom:6px"><input id="job-search" class="input" placeholder="Search jobs..." style="font-size:11px;padding:4px 8px" /></div>
    <div id="job-list"><div class="empty"><span class="spinner"></span> Loading jobs...</div></div>

    <div id="assets-section" style="display: none;">
      <div class="divider"></div>
      <div class="section-title">CUSTOMER ASSETS <button id="upload-asset-btn" class="btn btn-secondary btn-sm" style="float:right;">+ Upload</button></div>
      <div id="asset-list"></div>
    </div>

    <div id="status-msg" class="msg msg-success" style="display: none;"></div>
    <div id="settings-overlay" class="settings-overlay" style="display: none;"></div>
  `;

  document.getElementById('logout-btn').addEventListener('click', async () => { await auth.logout(); renderLogin(root); });
  document.getElementById('refresh-btn').addEventListener('click', () => loadJobs());
  var searchTimer = null;
  document.getElementById('job-search').addEventListener('input', function() {
    var input = this;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function() {
      renderJobList(input.value.toLowerCase() || undefined);
    }, 300);
  });
  document.getElementById('upload-asset-btn').addEventListener('click', async function() {
    if (!currentCustomerId) { showError('Open a job first to upload assets'); return; }
    try {
      showStatus('Select a file to upload as customer asset...');
      var file = await fs.getFileForOpening({
        types: ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'pdf', 'eps', 'ai', 'psd', 'svg']
      });
      if (!file) { showStatus('Upload cancelled'); return; }
      showStatus('Uploading ' + file.name + '...');
      var buffer = await file.read({ format: uxpStorage.formats.binary });
      await workflow.uploadCustomerAsset(currentCustomerId, buffer, file.name);
      showStatus(file.name + ' saved to customer assets!');
      loadCustomerAssets(currentCustomerId);
    } catch (err) {
      showError('Asset upload failed: ' + err.message);
    }
  });

  document.getElementById('settings-btn').addEventListener('click', function() {
    var overlay = document.getElementById('settings-overlay');
    var html = '<div class="settings-panel">';
    html += '<h2>Settings</h2>';
    html += '<div class="field"><label class="label">Working Folder</label>';
    html += '<div style="display:flex;gap:4px"><input id="pref-folder" class="input input-sm" value="" placeholder="Click Browse" readonly style="flex:1" />';
    html += '<button id="browse-folder-btn" class="btn btn-secondary btn-sm">Browse</button></div></div>';
    html += '<div class="field"><label class="label">Folder Structure</label>';
    html += '<input id="pref-folder-structure" class="input input-sm" value="year" />';
    html += '<div style="font-size:10px;color:var(--text-dim);margin-top:2px">year = 2026/JOB-1234/<br>customer = Acme/JOB-1234/<br>yearCustomer = 2026 Jobs/Acme - JOB-1234/<br>flat = JOB-1234/</div></div>';
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

var allJobsCache = [];

async function loadJobs() {
  const listEl = document.getElementById('job-list');
  try {
    const data = await workflow.getMyJobs();
    allJobsCache = [...(data.urgent || []), ...(data.thisWeek || []), ...(data.later || [])];
    allJobsCache.forEach(j => { jobCache[j.id] = j; });
    // Preserve any active search filter
    var searchEl = document.getElementById('job-search');
    var currentSearch = searchEl ? searchEl.value.toLowerCase() : '';
    renderJobList(currentSearch || undefined);
  } catch (err) {
    listEl.innerHTML = '<div class="msg msg-error">' + err.message + '</div>';
  }
}

function renderJobList(searchQuery) {
  var listEl = document.getElementById('job-list');
  var allJobs = allJobsCache;

  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    allJobs = allJobs.filter(function(job) {
      var custName = (job.customer_company || job.customer_first_name || '').toLowerCase();
      var desc = (job.description || '').toLowerCase();
      var num = (job.job_number || '').toLowerCase();
      return custName.indexOf(q) >= 0 || desc.indexOf(q) >= 0 || num.indexOf(q) >= 0;
    });
  }

  if (allJobs.length === 0) {
    listEl.innerHTML = '<div class="empty">' + (searchQuery ? 'No matching jobs' : 'No jobs assigned to you') + '</div>';
    return;
  }

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
        // Build progress states — use the detailed jobCache (has states from getJobDetails)
        var detailedJob = jobCache[job.id] || job;
        var states = detailedJob.states || [];
        var progressStates = ['received', 'designed', 'proofed', 'approved'];
        var stateHtml = '';
        for (var si = 0; si < progressStates.length; si++) {
          var sName = progressStates[si];
          var state = states.find(function(s) { return s.state_name === sName; });
          if (state) {
            var checked = state.completed ? 'checked' : '';
            var color = state.completed ? 'var(--green)' : 'var(--text-dim)';
            stateHtml += '<label style="display:flex;align-items:center;gap:3px;font-size:10px;color:' + color + ';cursor:pointer;">';
            stateHtml += '<input type="checkbox" class="state-toggle" data-job-id="' + job.id + '" data-state-def-id="' + state.state_definition_id + '" data-state-name="' + sName + '" ' + checked + ' style="width:12px;height:12px;margin:0;" />';
            stateHtml += (state.display_name || sName) + '</label>';
          }
        }

        // Active job: show progress + export and upload actions
        return `
          <div class="job-card" data-job-id="${job.id}" style="border-color: var(--accent); background: #1a1a3e;">
            <div class="job-number">${job.job_number} ${dueBadge} <span style="font-size: 9px; color: var(--green);">ACTIVE</span></div>
            <div class="job-title">${job.description || ''}</div>
            <div class="job-meta">${custName}</div>
            ${specsText ? `<div class="job-specs">${specsText}</div>` : ''}
            ${stateHtml ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;padding:4px 0;border-top:1px solid var(--border);">${stateHtml}</div>` : ''}
            <div class="job-actions">
              <button class="btn btn-secondary btn-sm save-btn" data-job-id="${job.id}">Save</button>
              <button class="btn btn-primary btn-sm sync-cloud-btn" data-job-id="${job.id}" data-job-number="${job.job_number}" style="background:var(--accent);">Sync to Cloud</button>
              <button class="btn btn-amber btn-sm export-proof-btn" data-job-id="${job.id}" data-job-number="${job.job_number}">Export Proof</button>
              <button class="btn btn-green btn-sm export-ok-btn" data-job-id="${job.id}" data-job-number="${job.job_number}">Export OK PDF</button>
              <button class="btn btn-secondary btn-sm upload-btn" data-job-id="${job.id}" data-job-number="${job.job_number}">Upload File</button>
              <button class="btn btn-secondary btn-sm close-job-btn" data-job-id="${job.id}" style="color:var(--text-dim);">Close</button>
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
              <button class="btn btn-primary btn-sm create-doc-btn" data-job-id="${job.id}">Open / Create</button>
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
    // State toggle checkboxes — tick to complete a progress state
    listEl.querySelectorAll('.state-toggle').forEach(function(cb) {
      cb.addEventListener('change', function(e) {
        e.stopPropagation();
        var jobId = cb.dataset.jobId;
        var stateDefId = cb.dataset.stateDefId;
        var stateName = cb.dataset.stateName;
        var job = jobCache[jobId] || {};

        workflow.toggleJobState(jobId, stateDefId).then(function() {
          // Auto-tick Received if not already done
          if (stateName !== 'received') {
            var states = job.states || [];
            var received = states.find(function(s) { return s.state_name === 'received' && !s.completed; });
            if (received) {
              workflow.toggleJobState(jobId, received.state_definition_id).catch(function() {});
            }
          }
          // Refresh job details + re-render
          workflow.getJobDetails(jobId).then(function(updated) {
            jobCache[jobId] = updated;
            allJobsCache = allJobsCache.map(function(j) {
              return j.id === jobId ? Object.assign({}, j, { states: updated.states }) : j;
            });
            var searchEl = document.getElementById('job-search');
            renderJobList(searchEl ? searchEl.value.toLowerCase() || undefined : undefined);
            showStatus((stateName.charAt(0).toUpperCase() + stateName.slice(1)) + ' updated');
          }).catch(function() {});
        }).catch(function(err) {
          showError('State update failed: ' + err.message);
          // Revert checkbox
          cb.checked = !cb.checked;
        });
      });
    });
    listEl.querySelectorAll('.sync-cloud-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleSyncToCloud(btn.dataset.jobId, btn.dataset.jobNumber);
      });
    });
    listEl.querySelectorAll('.save-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          var doc = indesign.activeDocument;
          if (doc) { doc.save(); showStatus('Document saved'); }
          else { showError('No document open'); }
        } catch (err) { showError('Save failed: ' + err.message); }
      });
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
    listEl.querySelectorAll('.close-job-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        // Save and close the active InDesign document
        try {
          var doc = indesign.activeDocument;
          if (doc) {
            doc.save();
            doc.close();
          }
        } catch (err) {
          // Document might not have been saved before — close without saving
          try { indesign.activeDocument.close(1852776480); } catch (e) {} // SaveOptions.NO = 1852776480
        }
        currentJobId = null;
        currentCustomerId = null;
        var assetsSection = document.getElementById('assets-section');
        if (assetsSection) assetsSection.style.display = 'none';
        var searchEl = document.getElementById('job-search');
        renderJobList(searchEl ? searchEl.value.toLowerCase() || undefined : undefined);
        showStatus('Job saved and closed');
      });
    });
}

// ── Create Document ──

async function handleCreateDocument(jobId) {
  try {
    showStatus('Loading job...');
    const job = await workflow.getJobDetails(jobId);
    const prefs = await getPrefs();
    currentJobId = jobId;
    currentCustomerId = job.customer_id;
    jobCache[jobId] = job;

    // Check if a document already exists for this job — open it instead of creating new
    try {
      var localFile = await workflow.getLocalFilePath(jobId);
      if (localFile && localFile.file_path) {
        showStatus('Opening existing document...');
        try {
          var existingFile = await fs.getEntryForPersistentToken(localFile.file_path).catch(function() { return null; });
          if (!existingFile) {
            // Try as a plain path via session token
            existingFile = localFile.file_path;
          }
          indesign.open(existingFile.nativePath ? existingFile : new (require('uxp').storage.File)(localFile.file_path));
          showStatus('Opened: ' + job.job_number);
          var searchEl = document.getElementById('job-search');
          renderJobList(searchEl ? searchEl.value.toLowerCase() || undefined : undefined);
          if (job.customer_id) loadCustomerAssets(job.customer_id);
          return;
        } catch (openErr) {
          showStatus('Existing file not found — creating new document...');
        }
      }
    } catch (e) {
      // No saved path — continue to create new
    }

    var custName = job.customer_company || job.customer_first_name || 'Customer';
    var jobInfo = { job_number: job.job_number, customer_company: custName, customer_code: job.customer_code || '', description: job.description || '', job_type_name: job.job_type_name || '' };
    var docName = [job.job_number, custName, (job.description || '').substring(0, 40)].filter(Boolean).join(' ').replace(/[/\\:*?"<>|]/g, '').trim();

    // Check working folder for an existing .indd BEFORE creating a new doc
    var workingFolder = null;
    if (prefs.workingFolderToken) {
      workingFolder = await getFolderFromToken(prefs.workingFolderToken).catch(function() { return null; });
    }
    if (workingFolder) {
      try {
        var targetFolder = await getJobFolder(workingFolder, prefs, jobInfo);
        if (targetFolder) {
          var existingEntry = null;
          try { existingEntry = await targetFolder.getEntry(docName + '.indd'); } catch (e) {}
          if (existingEntry) {
            indesign.open(existingEntry);
            showStatus('Opened: ' + job.job_number);
            workflow.saveLocalFilePath(jobId, existingEntry.nativePath, 'indesign').catch(function() {});
            var searchEl2 = document.getElementById('job-search');
            renderJobList(searchEl2 ? searchEl2.value.toLowerCase() || undefined : undefined);
            if (job.customer_id) loadCustomerAssets(job.customer_id);
            return;
          }
        }
      } catch (e) {}
    }

    // No local file found — try restoring from cloud archive
    try {
      showStatus('Checking cloud archive...');
      var restoredFile = await restoreFromCloud(jobId, job.job_number, prefs);
      if (restoredFile) {
        indesign.open(restoredFile);
        showStatus('Restored from cloud: ' + job.job_number);
        var searchEl3 = document.getElementById('job-search');
        renderJobList(searchEl3 ? searchEl3.value.toLowerCase() || undefined : undefined);
        if (job.customer_id) loadCustomerAssets(job.customer_id);
        return;
      }
    } catch (restoreErr) {}

    // Nothing found anywhere — create a new document
    var widthMM = 210, heightMM = 297, pageCount = 1;
    if (job.production_specs && job.production_specs[0]) {
      var s = job.production_specs[0];
      if (s.custom_width_mm > 0) widthMM = s.custom_width_mm;
      if (s.custom_height_mm > 0) heightMM = s.custom_height_mm;
      if (s.sheets_per_item > 1) pageCount = s.sheets_per_item;
    }
    var facingPages = pageCount >= 4;
    var doc = createDocument({
      widthMM: widthMM, heightMM: heightMM, pageCount: pageCount, facingPages: facingPages,
      bleedMM: prefs.defaultBleed, marginMM: prefs.defaultMargins,
      jobNumber: job.job_number, customerName: custName, title: job.description || ''
    }, prefs);

    // Save the new doc to the structured folder
    try {
      var saveFolder = workingFolder ? await getJobFolder(workingFolder, prefs, jobInfo) : await fs.getFolder();
      if (saveFolder) {
        var file = await saveFolder.createFile(docName + '.indd', { overwrite: false });
        doc.save(file);
        workflow.saveLocalFilePath(jobId, file.nativePath, 'indesign').catch(function() {});
      }
    } catch (saveErr) {}

    showStatus('Document created: ' + job.job_number);

    // Re-render the job list with the active state + progress checkboxes.
    // Use renderJobList directly (data already cached) instead of loadJobs
    // (which re-fetches and can race with the jobCache update).
    var searchEl = document.getElementById('job-search');
    renderJobList(searchEl ? searchEl.value.toLowerCase() || undefined : undefined);

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
    const job = jobCache[jobId] || {};
    const jobInfo = { job_number: jobNumber, customer_company: job.customer_company || job.customer_first_name || '', customer_code: job.customer_code || '', description: job.description || '', job_type_name: job.job_type_name || '' };

    let outputFolder = null;
    if (prefs.workingFolderToken) {
      try { outputFolder = await getJobFolder(await getFolderFromToken(prefs.workingFolderToken), prefs, jobInfo); } catch (e) {}
    }
    showStatus(outputFolder ? 'Exporting proof...' : 'Select folder for proof PDF...');
    const filename = buildFilename(jobInfo, 'PROOF');
    const result = await exportProofPdf(doc, outputFolder, filename);

    showStatus('Proof exported! Uploading to Helper Harry...');
    try {
      var buffer = await result.entry.read({ format: uxpStorage.formats.binary });
      if (buffer) {
        await workflow.uploadJobFile(jobId, buffer, filename, 'proof');
        showStatus('Proof saved + uploaded to Helper Harry!');
      } else {
        showStatus('Proof saved locally (could not read for upload)');
      }
    } catch (uploadErr) {
      showStatus('Proof saved locally (upload: ' + (uploadErr.message || 'skipped') + ')');
    }
  } catch (err) {
    showError('Export failed: ' + err.message);
  }
}

// ── Export OK PDF ──

async function handleExportOkPdf(jobId, jobNumber) {
  try {
    const doc = indesign.activeDocument;
    if (!doc) { showError('No document open in InDesign'); return; }

    const prefs = await getPrefs();
    const job = jobCache[jobId] || {};
    const jobInfo = { job_number: jobNumber, customer_company: job.customer_company || job.customer_first_name || '', customer_code: job.customer_code || '', description: job.description || '', job_type_name: job.job_type_name || '' };

    let outputFolder = null;
    if (prefs.workingFolderToken) {
      try { outputFolder = await getJobFolder(await getFolderFromToken(prefs.workingFolderToken), prefs, jobInfo); } catch (e) {}
    }
    showStatus(outputFolder ? 'Exporting press-ready PDF...' : 'Select folder for press-ready PDF...');
    const filename = buildFilename(jobInfo, 'OK');
    const result = await exportOkPdf(doc, outputFolder, filename, prefs.defaultBleed);

    showStatus('PDF exported! Uploading to Helper Harry...');
    try {
      var buffer = await result.entry.read({ format: uxpStorage.formats.binary });
      if (buffer) {
        await workflow.uploadJobFile(jobId, buffer, filename, 'print_ready');
        showStatus('OK PDF saved + uploaded to Helper Harry!');
      } else {
        showStatus('PDF saved locally (could not read for upload)');
      }
    } catch (uploadErr) {
      showStatus('PDF saved locally (upload: ' + (uploadErr.message || 'skipped') + ')');
    }
  } catch (err) {
    showError('Export failed: ' + err.message);
  }
}

// ── Sync to Cloud ──
// Packages the active InDesign document + all linked assets into a zip
// and uploads to R2 via presigned URL. Serves as both long-term archive
// AND remote-work bridge (restore from cloud when NAS is unreachable).

async function handleSyncToCloud(jobId, jobNumber) {
  try {
    var doc = indesign.activeDocument;
    if (!doc) { showError('No document open'); return; }

    // Step 1: Save first
    showStatus('Saving document...');
    try { doc.save(); } catch (e) { showError('Save failed — save the document first'); return; }

    // Step 2: Collect files — the .indd + all linked assets
    showStatus('Collecting linked files...');
    var filesToPack = [];
    var docPath = doc.fullName ? doc.fullName.nativePath || String(doc.fullName) : null;

    // Add the .indd itself
    if (docPath) {
      try {
        var docEntry = await fs.getEntryForPersistentToken(docPath).catch(function() { return null; });
        if (!docEntry) {
          // Try via the folder the doc lives in
          var docFolder = doc.fullName ? doc.fullName.parent : null;
          if (docFolder) {
            var entries = await docFolder.getEntries();
            docEntry = entries.find(function(e) { return e.name === doc.name; });
          }
        }
        if (docEntry) filesToPack.push({ entry: docEntry, name: doc.name });
      } catch (e) {}
    }

    // Add linked images/assets
    try {
      for (var i = 0; i < doc.links.length; i++) {
        var link = doc.links[i];
        try {
          var linkPath = link.filePath;
          if (linkPath) {
            // Try to get the linked file entry
            var linkFolder = null;
            var linkName = linkPath.split('/').pop().split('\\').pop();
            try {
              // Try parent folder of the document first (relative links)
              if (doc.fullName && doc.fullName.parent) {
                var parentEntries = await doc.fullName.parent.getEntries();
                var found = parentEntries.find(function(e) { return e.name === linkName; });
                if (found) { filesToPack.push({ entry: found, name: 'Links/' + linkName }); continue; }
              }
            } catch (e2) {}
            // Try absolute path
            try {
              var absEntry = await fs.getEntryForPersistentToken(linkPath).catch(function() { return null; });
              if (absEntry) filesToPack.push({ entry: absEntry, name: 'Links/' + linkName });
            } catch (e3) {}
          }
        } catch (linkErr) {
          // Skip unresolvable links
        }
      }
    } catch (linksErr) {
      // doc.links might not be available
    }

    showStatus('Packaging ' + filesToPack.length + ' file(s)...');

    // Step 3: Read all files into buffers + compute total size
    var fileBuffers = [];
    var totalSize = 0;
    for (var fi = 0; fi < filesToPack.length; fi++) {
      try {
        var buf = await filesToPack[fi].entry.read({ format: uxpStorage.formats.binary });
        if (buf) {
          var size = buf.byteLength || buf.length || 0;
          fileBuffers.push({ name: filesToPack[fi].name, buffer: buf, size: size });
          totalSize += size;
        }
      } catch (readErr) {}
    }

    if (fileBuffers.length === 0) {
      showError('No files could be read for archiving');
      return;
    }

    // Step 4: Build a simple archive (concatenated with headers since
    // UXP doesn't have a zip library — server side can handle a tar-like
    // format, or we upload individual files). For MVP, upload the .indd
    // as a single file — the most critical asset. Linked images are
    // already on the customer's asset library or can be re-linked.
    // Future: proper zip packaging.

    // Upload the main .indd file as the archive
    var mainFile = fileBuffers[0]; // The .indd
    var archiveName = jobNumber + '-package.indd';

    showStatus('Uploading to cloud (' + Math.round(totalSize / 1024) + ' KB)...');

    // Get presigned URL
    var presign = await workflow.getArchiveUploadUrl(jobId, archiveName, 'application/octet-stream', mainFile.size);

    // Upload directly to R2
    var uploadRes = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: mainFile.buffer
    });
    if (!uploadRes.ok) throw new Error('Upload failed: ' + uploadRes.status);

    // Register the archive on HH
    await workflow.registerArchive(jobId, {
      storageKey: presign.storageKey,
      originalFilename: archiveName,
      fileCount: fileBuffers.length,
      totalSizeBytes: totalSize,
      notes: fileBuffers.length + ' files: ' + fileBuffers.map(function(f) { return f.name; }).join(', ')
    });

    showStatus('Synced to cloud! (' + fileBuffers.length + ' files, ' + Math.round(totalSize / 1024) + ' KB)');
  } catch (err) {
    showError('Sync failed: ' + err.message);
  }
}

// ── Restore from Cloud ──
// Downloads the latest cloud archive and extracts to a local folder.
// Called automatically when Open/Create can't reach the NAS path.

async function restoreFromCloud(jobId, jobNumber, prefs) {
  try {
    var archives = await workflow.listArchives(jobId);
    if (!archives || archives.length === 0) return null;

    var latest = archives[0]; // Already sorted DESC by created_at
    showStatus('Restoring from cloud (' + Math.round((latest.total_size_bytes || 0) / 1024) + ' KB)...');

    // Get download URL
    var restore = await workflow.getRestoreUrl(latest.id);
    if (!restore || !restore.url) throw new Error('No restore URL');

    // Download the file
    var response = await fetch(restore.url);
    if (!response.ok) throw new Error('Download failed');
    var buffer = await response.arrayBuffer();

    // Save to a local folder
    var workingFolder = null;
    if (prefs.workingFolderToken) {
      workingFolder = await getFolderFromToken(prefs.workingFolderToken).catch(function() { return null; });
    }
    if (!workingFolder) {
      // Use the system documents folder as fallback
      try { workingFolder = await fs.getFolder(); } catch (e) {}
    }
    if (!workingFolder) throw new Error('No folder available for restore');

    var job = jobCache[jobId] || {};
    var jobInfo = { job_number: jobNumber, customer_company: job.customer_company || '', customer_code: job.customer_code || '', description: job.description || '', job_type_name: job.job_type_name || '' };
    var targetFolder = await getJobFolder(workingFolder, prefs, jobInfo);

    var filename = latest.original_filename || (jobNumber + '-package.indd');
    var file = await targetFolder.createFile(filename, { overwrite: true });
    await file.write(buffer, { format: uxpStorage.formats.binary });

    // Save the new local path to HH
    workflow.saveLocalFilePath(jobId, file.nativePath, 'indesign').catch(function() {});

    showStatus('Restored from cloud: ' + filename);
    return file;
  } catch (err) {
    showError('Restore failed: ' + err.message);
    return null;
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
  var section = document.getElementById('assets-section');
  var listEl = document.getElementById('asset-list');
  if (!section || !listEl) return;
  section.style.display = 'block';
  listEl.innerHTML = '<div class="empty"><span class="spinner"></span> Loading assets...</div>';

  try {
    var assets = await workflow.getCustomerAssets(customerId);
    if (!assets || !Array.isArray(assets) || assets.length === 0) {
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
