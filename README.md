# Helper Harry InDesign Plugin

UXP plugin for Adobe InDesign that connects to Helper Harry's print shop workflow system.

## Features

- **Job List** — see your assigned jobs with specs, priority, due dates, and search/filter
- **Open / Create** — intelligently opens an existing InDesign file (from NAS, local folder, or cloud archive) or creates a new document with correct page size, bleed, margins, and page count
- **Job Progress** — tick Received / Designed / Proofed / Approved checkboxes directly from the panel. Auto-ticks Received when you complete any other state. Updates HH in real-time.
- **Save** — save the active document from the panel (Cmd+S equivalent)
- **Sync to Cloud** — packages the .indd and linked assets, uploads to HH's cloud archive (R2). Enables remote work — restore automatically when the NAS is unreachable from home.
- **Export Proof PDF** — 150 DPI, no bleed, compressed → saves locally + auto-uploads to HH as versioned proof
- **Export OK PDF** — 300 DPI, press quality, bleed + crop marks → saves locally + auto-uploads to HH as print-ready
- **Upload File** — pick any file from disk and upload it to the job on HH
- **Customer Assets** — browse, place into your layout (zero-stroke frames), and upload new assets to the customer's library
- **Close** — save + close the document and deactivate the job in the panel
- **Settings** — persistent preferences for working folder, folder structure, bleed, margins, DPI, auto-upload, API URL

## Requirements

- Adobe InDesign 2024+ (version 18.5+, UXP support required)
- Helper Harry account with Workflow module access
- macOS or Windows

---

## Installation

### 1. Plugin (via UXP Developer Tool)

1. Download `helper-harry-indesign-v1.0.0.zip` from [dist/](./dist/) and extract it.
2. Install the free **UXP Developer Tool** from the Creative Cloud desktop app (search "UXP Developer Tool" in Apps and click Install).
3. Open **InDesign** (must be running).
4. Open the **UXP Developer Tool**.
5. Click **"Add Plugin"** → navigate to the extracted folder → select **`manifest.json`**.
6. Click **"Load"** — the plugin sideloads into InDesign.
7. In InDesign: **Window → Helper Harry** to open the panel.
8. Sign in with your Helper Harry credentials on first launch.

The plugin stays loaded across sessions until you explicitly remove it from the Developer Tool. This is the standard in-house distribution path for UXP plugins — no Adobe Developer certificate needed.

### 2. Print PDF Preset(s)

Two `.joboptions` presets ship in [dist/](./dist/) — pick the one matching the job's paper stock:

- **`helper-harry-print-uncoated-v1.0.joboptions`** — PSO Uncoated v3 (FOGRA52). Use for uncoated, recycled, and semi-recycled stocks. Most Factory jobs fall here.
- **`helper-harry-print-coated-v1.0.joboptions`** — Coated FOGRA39 (ISO 12647-2:2004). Use for coated / silk / gloss stocks.

**Both presets share the same structural settings** — PDF/X-4:2010, 3 mm bleed, crop marks, 300 DPI, CMYK preserved, fonts embedded. Only the output intent (ICC profile) differs.

**Install (per preset):**

1. Download the `.joboptions` file
2. In **InDesign**: File → Adobe PDF Presets → Define → Load → select the file → Open
3. In **Acrobat / Distiller**: double-click the `.joboptions` file and it auto-installs
4. When exporting a PDF, pick **Helper Harry Print - Uncoated** or **Helper Harry Print - Coated** from the preset dropdown

### 3. ICC Profiles (required for the PDF presets)

The presets use **PSO Uncoated v3 (FOGRA52)** and **Coated FOGRA39**. These ICC profiles ship with recent Adobe Creative Cloud installs by default, but older machines may need a manual install.

**How to check:** open InDesign → Edit → Color Settings → look under CMYK Working Space. If either profile is missing, install the ECI offset profile pack below.

**Where to get it (free):**

- <https://www.eci.org/downloads> → download "ECI offset profiles 2009" or "eci_offset_2009" package
- Unzip and move the `.icc` files to the Adobe colour folder:
  - **macOS**: `~/Library/Application Support/Adobe/Color/Profiles/`
  - **Windows**: `C:\Windows\System32\spool\drivers\color\`
- Restart InDesign. The FOGRA52 profile should now appear in the output-intent dropdown.

### 4. Production (Adobe Exchange)

Coming soon — the plugin will be distributed via Adobe Exchange for one-click install from within Creative Cloud.

---

## Configuration

On first launch, log in with your Helper Harry email and password. The plugin stores your session securely.

### Settings panel

Click the **gear icon ⚙** in the Helper Harry panel header to open Settings. All preferences are saved locally and persist across InDesign restarts.

| Setting | Default | Description |
|---------|---------|-------------|
| Working Folder | — | Where job folders + exported PDFs are saved (see below) |
| Folder Structure | By Year | How subfolders are organised (see below) |
| Default Bleed | 3mm | Applied to new documents |
| Default Margins | 6mm | Applied to new documents |
| Proof Resolution | 150 DPI | Quality for proof PDF exports |
| OK PDF Resolution | 300 DPI | Quality for press-ready PDF exports |
| Auto Upload Proof | On | Upload proof PDF to Helper Harry after export |
| Open PDF After Export | On | Open the exported PDF in your default viewer |
| API URL | app.helperharry.com/api | Only change for self-hosted instances |

### Working Folder

Click **Browse** and pick the folder where you want everything to land (e.g. `D:\Print Jobs\` on Windows or `/Users/designer/Print Jobs/` on Mac).

Once set, the plugin:
- **Auto-saves new documents** there, named after the job — e.g. `JOB-65734 Business Cards.indd`
- **Exports proof and OK PDFs** there without prompting for a folder each time
- **Remembers the folder** across InDesign restarts (no need to re-set after a reboot)

### Folder Structure

Controls how subfolders are created inside the working folder:

| Option | Example path |
|--------|-------------|
| **By Year** | `2026/JOB-65734/JOB-65734-proof.pdf` |
| **By Customer** | `Acme Ltd/JOB-65734/JOB-65734-proof.pdf` |
| **Flat** | `JOB-65734/JOB-65734-proof.pdf` (directly in working folder) |

---

## Project Structure

```
helper-harry-indesign/
├── manifest.json          — UXP plugin manifest
├── index.html             — panel UI (HTML + CSS)
├── index.js               — main entry point (all UI logic)
├── src/
│   ├── api/
│   │   ├── auth.js        — login, token management
│   │   └── workflow.js    — HH API calls (jobs, files, assets)
│   ├── indesign/
│   │   ├── createDocument.js  — document creation from job specs
│   │   ├── exportPdf.js       — proof and press-ready PDF export
│   │   └── placeAsset.js      — place images from customer assets
│   └── utils/
│       └── storage.js     — UXP secure storage for prefs/tokens
├── dist/
│   ├── helper-harry-indesign-v1.0.0.ccx        — plugin bundle
│   └── helper-harry-print-uncoated-v1.0.joboptions  — PDF preset
└── icons/
    └── plugin-icon.png    — panel icon
```

---

## API Endpoints Used

The plugin calls Helper Harry's existing API:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Authenticate user |
| `GET /api/workflow/dashboard/my-jobs` | Fetch assigned jobs with customer code |
| `GET /api/workflow/jobs/:id` | Job details with production specs + states |
| `POST /api/workflow/jobs/:id/states/:defId/toggle` | Toggle job progress state |
| `PUT /api/workflow/jobs/:id/local-file-path` | Store local InDesign file path |
| `GET /api/workflow/jobs/:id/local-file-path` | Retrieve saved file path |
| `POST /api/workflow/jobs/:id/files` | Upload proof/OK PDF/files |
| `GET /api/workflow/customers/:id/assets` | Customer asset library |
| `POST /api/workflow/customers/:id/assets` | Upload new customer asset |
| `GET /api/workflow/customer-assets/:id/url` | Asset download URL |
| `POST /api/workflow/jobs/:id/archives/presign` | Get presigned URL for archive upload |
| `POST /api/workflow/jobs/:id/archives` | Register completed archive |
| `GET /api/workflow/jobs/:id/archives` | List archives for restore |
| `GET /api/workflow/archives/:id/restore` | Get presigned download URL |

---

## Designer Workflow

1. Designer opens InDesign → opens Helper Harry panel → searches for their job
2. Clicks **Open / Create** → opens existing file from NAS/local/cloud, or creates new with specs
3. Designer works on the layout. Ticks **Designed** when done.
4. Clicks **Export Proof** → PDF saves locally + auto-uploads to HH → customer gets proof email
5. Customer approves → designer ticks **Approved** → clicks **Export OK PDF**
6. Press-ready PDF saves locally + uploads to HH → printer sees it in their queue
7. Clicks **Sync to Cloud** before leaving the office → safe to work from home tomorrow
8. Clicks **Close** → document saved and closed

### Remote Work (laptop at home, no NAS)

1. Designer opens InDesign + Helper Harry panel
2. Clicks **Open / Create** on the job
3. Plugin tries the NAS path → fails (unreachable) → checks cloud archive → restores automatically to local folder
4. Designer works normally. Export Proof / OK still auto-uploads to HH cloud.
5. Clicks **Sync to Cloud** before finishing → updated package goes to cloud
6. Back at the office next day: **Open / Create** opens from NAS or restores latest cloud version

---

## Troubleshooting

**"Plugin panel is blank / won't load"**
- Check your InDesign version is 2024 (18.5+) or later. UXP isn't supported on older versions.
- Quit InDesign fully (not just close window) and relaunch.

**"Output intent profile not found" when exporting PDF**
- Install the PSO Uncoated v3 ICC profile — see section 3 above.

**"Sign in failed"**
- Confirm you can sign in to `https://app.helperharry.com` in your browser first.
- Check your org has Workflow module access (contact your admin).

**Everything else**
- Contact support at [support@helperharry.com](mailto:support@helperharry.com).
