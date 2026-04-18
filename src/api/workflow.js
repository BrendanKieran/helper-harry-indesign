const auth = require('./auth');
const { getPrefs } = require('../utils/storage');

class WorkflowAPI {

  async _fetch(path, opts = {}) {
    const prefs = await getPrefs();
    const url = `${prefs.apiUrl}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: { ...auth.getHeaders(), ...(opts.headers || {}) }
    });
    if (res.status === 401) {
      // Session expired — try to re-init rather than showing logged out
      throw new Error('Session expired. Click Refresh to reconnect.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `API error ${res.status}`);
    }
    return res.json();
  }

  // ── Jobs ──

  async getMyJobs() {
    return this._fetch('/workflow/dashboard/my-jobs');
  }

  async getJobDetails(jobId) {
    // Get full job with production specs
    const prefs = await getPrefs();
    const res = await fetch(`${prefs.apiUrl}/workflow/jobs/${jobId}`, {
      headers: auth.getHeaders()
    });
    if (!res.ok) throw new Error('Failed to load job');
    return res.json();
  }

  // ── Local File Paths ──

  async getLocalFilePath(jobId) {
    return this._fetch(`/workflow/jobs/${jobId}/local-file-path`);
  }

  async saveLocalFilePath(jobId, filePath, fileType = 'indesign') {
    return this._fetch(`/workflow/jobs/${jobId}/local-file-path`, {
      method: 'PUT',
      body: JSON.stringify({ filePath, fileType })
    });
  }

  // ── Customer Assets ──

  async getCustomerAssets(customerId) {
    return this._fetch(`/workflow/customers/${customerId}/assets`);
  }

  async getAssetUrl(assetId) {
    return this._fetch(`/workflow/customer-assets/${assetId}/url`);
  }

  async uploadCustomerAsset(customerId, fileBuffer, filename) {
    var prefs = await getPrefs();
    var ext = (filename || '').split('.').pop().toLowerCase();
    var mimeTypes = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml', eps: 'application/postscript', ai: 'application/postscript', psd: 'image/vnd.adobe.photoshop' };
    var mimeType = mimeTypes[ext] || 'application/octet-stream';
    var formData = new FormData();
    var file;
    try { file = new File([fileBuffer], filename || 'asset', { type: mimeType }); }
    catch (e) { file = new Blob([fileBuffer], { type: mimeType }); }
    formData.append('file', file, filename || 'asset');
    formData.append('originalFilename', filename || 'asset');
    formData.append('tags', 'from-indesign');
    var res = await fetch(prefs.apiUrl + '/workflow/customers/' + customerId + '/assets', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + auth.token },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  }

  // ── File Upload ──

  async uploadJobFile(jobId, fileBuffer, filename, category = 'proof') {
    const prefs = await getPrefs();
    // Determine mime type from filename
    const ext = (filename || '').split('.').pop().toLowerCase();
    const mimeTypes = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff', svg: 'image/svg+xml', eps: 'application/postscript', ai: 'application/postscript', psd: 'image/vnd.adobe.photoshop' };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    const formData = new FormData();
    // Use File (not Blob) so the filename propagates in the multipart
    // Content-Disposition header. UXP's Blob ignores the 3rd arg to append.
    var file;
    try {
      file = new File([fileBuffer], filename || 'upload.pdf', { type: mimeType });
    } catch (e) {
      // Fallback if File constructor isn't available
      file = new Blob([fileBuffer], { type: mimeType });
    }
    formData.append('file', file, filename || 'upload.pdf');
    formData.append('fileCategory', category);
    formData.append('notes', 'From InDesign plugin');
    // UXP's FormData may not send the filename in Content-Disposition,
    // so we send it as a separate field for the server to use as fallback
    formData.append('originalFilename', filename || 'upload.pdf');

    const res = await fetch(`${prefs.apiUrl}/workflow/jobs/${jobId}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${auth.token}` },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  }

  // ── Job State ──

  async getJobStates(jobId) {
    const job = await this.getJobDetails(jobId);
    return job.states || [];
  }

  async toggleJobState(jobId, stateDefId) {
    return this._fetch(`/workflow/jobs/${jobId}/states/${stateDefId}/toggle`, { method: 'POST' });
  }

  // ── Cloud Archive ──

  async getArchiveUploadUrl(jobId, filename, contentType, fileSize) {
    return this._fetch(`/workflow/jobs/${jobId}/archives/presign`, {
      method: 'POST',
      body: JSON.stringify({ filename: filename, contentType: contentType || 'application/zip', fileSize: fileSize || 0 })
    });
  }

  async registerArchive(jobId, data) {
    return this._fetch(`/workflow/jobs/${jobId}/archives`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async listArchives(jobId) {
    return this._fetch(`/workflow/jobs/${jobId}/archives`);
  }

  async getRestoreUrl(archiveId) {
    return this._fetch(`/workflow/archives/${archiveId}/restore`);
  }
}

module.exports = new WorkflowAPI();
