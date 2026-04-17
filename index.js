/**
 * Helper Harry InDesign Plugin — Main Entry Point
 * UXP Plugin for Adobe InDesign
 */

const auth = require('./src/api/auth');
const workflow = require('./src/api/workflow');
const { createDocument } = require('./src/indesign/createDocument');
const { exportProofPdf, exportOkPdf } = require('./src/indesign/exportPdf');
const { placeImage } = require('./src/indesign/placeAsset');
const { getPrefs, savePrefs } = require('./src/utils/storage');
const indesignModule = require('indesign');
const indesign = indesignModule.app;
const uxpStorage = require('uxp').storage;
const fs = uxpStorage.localFileSystem;

let currentJobId = null;
let currentCustomerId = null;
let jobCache = {}; // cache job numbers for export

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
        <button id="settings-btn" class="gear-btn" title="Settings">&#9881;</button>
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
  document.getElementById('settings-btn').addEventListener('click', () => showSettings());

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

    createDocument({
      widthMM, heightMM, pageCount, facingPages,
      bleedMM: prefs.defaultBleed,
      marginMM: prefs.defaultMargins,
      jobNumber: job.job_number,
      customerName: custName,
      title: job.description || ''
    }, prefs);

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
  const overlay = document.getElementById('settings-overlay');
  const prefs = await getPrefs();

  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="settings-panel">
      <h2>&#9881; Settings</h2>

      <div class="field">
        <label class="label">Working Folder</label>
        <div style="display: flex; gap: 4px;">
          <input id="pref-folder" class="input input-sm" value="${prefs.workingFolder || ''}" placeholder="Not set — click Browse" readonly style="flex: 1;" />
          <button id="browse-folder-btn" class="btn btn-secondary btn-sm">Browse</button>
        </div>
        <div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">Where job folders are created on this machine</div>
      </div>

      <div class="field">
        <label class="label">Folder Structure</label>
        <select id="pref-folder-structure" class="input input-sm">
          <option value="year" ${prefs.folderStructure === 'year' ? 'selected' : ''}>By Year (2026/JOB-001/)</option>
          <option value="customer" ${prefs.folderStructure === 'customer' ? 'selected' : ''}>By Customer (Acme/JOB-001/)</option>
          <option value="flat" ${prefs.folderStructure === 'flat' ? 'selected' : ''}>Flat (JOB-001/)</option>
        </select>
      </div>

      <div class="settings-row">
        <div class="field">
          <label class="label">Default Bleed (mm)</label>
          <input id="pref-bleed" class="input input-sm" type="number" value="${prefs.defaultBleed}" min="0" max="25" step="0.5" />
        </div>
        <div class="field">
          <label class="label">Default Margins (mm)</label>
          <input id="pref-margins" class="input input-sm" type="number" value="${prefs.defaultMargins}" min="0" max="50" step="1" />
        </div>
      </div>

      <div class="settings-row">
        <div class="field">
          <label class="label">Proof Resolution (DPI)</label>
          <select id="pref-proof-dpi" class="input input-sm">
            <option value="72" ${prefs.proofResolution === 72 ? 'selected' : ''}>72 (screen)</option>
            <option value="150" ${prefs.proofResolution === 150 ? 'selected' : ''}>150 (standard)</option>
            <option value="300" ${prefs.proofResolution === 300 ? 'selected' : ''}>300 (high)</option>
          </select>
        </div>
        <div class="field">
          <label class="label">OK PDF Resolution (DPI)</label>
          <select id="pref-ok-dpi" class="input input-sm">
            <option value="150" ${prefs.okPdfResolution === 150 ? 'selected' : ''}>150</option>
            <option value="300" ${prefs.okPdfResolution === 300 ? 'selected' : ''}>300 (standard)</option>
            <option value="600" ${prefs.okPdfResolution === 600 ? 'selected' : ''}>600 (high)</option>
          </select>
        </div>
      </div>

      <div class="field">
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
          <input id="pref-auto-upload" type="checkbox" ${prefs.autoSaveProof ? 'checked' : ''} />
          Auto-upload proof PDF to Helper Harry after export
        </label>
      </div>

      <div class="field">
        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px;">
          <input id="pref-open-pdf" type="checkbox" ${prefs.openPdfAfterExport ? 'checked' : ''} />
          Open PDF after export
        </label>
      </div>

      <div class="field">
        <label class="label">API URL</label>
        <input id="pref-api-url" class="input input-sm" value="${prefs.apiUrl}" placeholder="https://app.helperharry.com/api" />
        <div style="font-size: 10px; color: var(--text-dim); margin-top: 2px;">Only change this if your shop runs a self-hosted instance</div>
      </div>

      <div class="settings-actions">
        <button id="settings-cancel" class="btn btn-secondary btn-sm">Cancel</button>
        <button id="settings-save" class="btn btn-primary btn-sm">Save</button>
      </div>
    </div>
  `;

  // Browse folder button
  document.getElementById('browse-folder-btn').addEventListener('click', async () => {
    try {
      const folder = await fs.getFolder();
      if (folder) document.getElementById('pref-folder').value = folder.nativePath;
    } catch (e) { /* user cancelled */ }
  });

  document.getElementById('settings-cancel').addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  document.getElementById('settings-save').addEventListener('click', async () => {
    const updated = {
      ...prefs,
      workingFolder: document.getElementById('pref-folder').value || '',
      folderStructure: document.getElementById('pref-folder-structure').value,
      defaultBleed: parseFloat(document.getElementById('pref-bleed').value) || 3,
      defaultMargins: parseFloat(document.getElementById('pref-margins').value) || 6,
      proofResolution: parseInt(document.getElementById('pref-proof-dpi').value) || 150,
      okPdfResolution: parseInt(document.getElementById('pref-ok-dpi').value) || 300,
      autoSaveProof: document.getElementById('pref-auto-upload').checked,
      openPdfAfterExport: document.getElementById('pref-open-pdf').checked,
      apiUrl: document.getElementById('pref-api-url').value.trim() || 'https://app.helperharry.com/api'
    };
    await savePrefs(updated);
    overlay.style.display = 'none';
    showStatus('Settings saved');
  });
}

// ── Export Proof ──

async function handleExportProof(jobId, jobNumber) {
  try {
    const doc = indesign.activeDocument;
    if (!doc) { showError('No document open in InDesign'); return; }

    showStatus('Select folder for proof PDF...');
    const filename = `${jobNumber}-proof.pdf`;
    const outputPath = await exportProofPdf(doc, null, filename);

    showStatus('Proof exported! Uploading to Helper Harry...');
    try {
      const file = await fs.getFileForOpening(outputPath);
      if (file) {
        const buffer = await file.read({ format: uxpStorage.formats.binary });
        await workflow.uploadJobFile(jobId, buffer, filename, 'proof');
        showStatus('Proof uploaded to Helper Harry!');
      } else {
        showStatus('Proof saved locally');
      }
    } catch (uploadErr) {
      showStatus('Proof saved locally (upload skipped)');
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

    showStatus('Select folder for press-ready PDF...');
    const prefs = await getPrefs();
    const filename = `${jobNumber}-OK.pdf`;
    const outputPath = await exportOkPdf(doc, null, filename, prefs.defaultBleed);

    showStatus('PDF exported! Uploading to Helper Harry...');
    try {
      const file = await fs.getFileForOpening(outputPath);
      if (file) {
        const buffer = await file.read({ format: uxpStorage.formats.binary });
        await workflow.uploadJobFile(jobId, buffer, filename, 'print_ready');
        showStatus('Press-ready PDF uploaded!');
      } else {
        showStatus('PDF saved locally');
      }
    } catch (uploadErr) {
      showStatus('PDF saved locally (upload skipped)');
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
