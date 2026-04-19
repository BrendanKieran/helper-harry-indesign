# Helper Harry InDesign Plugin

UXP plugin for Adobe InDesign that connects to Helper Harry's print shop workflow system.

## Features

- **Job List** — see your assigned jobs with specs, priority, due dates, and search/filter
- **Open / Create** — intelligently opens an existing InDesign file (from NAS, local folder, or cloud archive) or creates a new document with correct page size, bleed, margins, and page count
- **Job Progress** — tick Received / Designed / Proofed / Approved checkboxes directly from the panel. Auto-ticks Received when you complete any other state. Updates HH in real-time.
- **Save** — save the active document from the panel
- **Sync to Cloud** — zips the entire job folder (InDesign file + all linked assets, images, PDFs, fonts) and uploads to HH's cloud archive. Enables remote work — restore automatically when the NAS is unreachable from home.
- **Export Proof PDF** — 150 DPI, no bleed, compressed → saves locally + auto-uploads to HH as versioned proof
- **Export OK PDF** — 300 DPI, press quality, bleed + crop marks → saves locally + auto-uploads to HH as print-ready
- **Upload File** — pick any file from disk and upload it to the job on HH
- **Customer Assets** — browse, place into your layout (zero-stroke frames), and upload new assets (logos, images) to the customer's library
- **Customer History** — browse the customer's other jobs. Restore archived jobs into a reference subfolder for cross-job file reuse.
- **Open Folder** — copies the job folder path to clipboard for quick navigation in Finder (Cmd+Shift+G) or Explorer
- **Close** — save + close the document and deactivate the job in the panel
- **Settings** — persistent preferences for working folder, folder structure, bleed, margins, DPI, auto-upload, API URL
- **Enter to login** — press Enter on the password field to log in (no need to click the button)

## Requirements

- Adobe InDesign 2024+ (version 18.5+, UXP support required)
- Helper Harry account with Workflow module access
- macOS or Windows (cross-platform — all APIs are OS-agnostic)

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
8. Sign in with your Helper Harry credentials on first launch (Enter key works on the password field).

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

On first launch, log in with your Helper Harry email and password. The plugin stores your session securely via a local config file (persists across restarts).

### Settings panel

Click the **Settings** button in the Helper Harry panel header to open Settings. All preferences are saved locally and persist across InDesign restarts.

| Setting | Default | Description |
|---------|---------|-------------|
| Working Folder | — | Where job folders + exported PDFs are saved (see below) |
| Folder Structure | year | How subfolders are organised (see below) |
| Default Bleed | 3mm | Applied to new documents |
| Default Margins | 6mm | Applied to new documents |
| Proof Resolution | 150 DPI | Quality for proof PDF exports |
| OK PDF Resolution | 300 DPI | Quality for press-ready PDF exports |
| Auto Upload Proof | true | Upload proof PDF to Helper Harry after export |
| API URL | app.helperharry.com/api | Only change for self-hosted instances |

### Working Folder

Click **Browse** and pick the folder where you want everything to land (e.g. `D:\Print Jobs\` on Windows or `/Volumes/Data Drive/FACTORY-JOBS/` on Mac).

Once set, the plugin:
- **Auto-saves new documents** there, named after the job — e.g. `JOB-65734 John Smith Business Cards.indd`
- **Exports proof and OK PDFs** there without prompting for a folder each time
- **Syncs to cloud** from this folder — zips everything in the job subfolder
- **Remembers the folder** across InDesign restarts (uses UXP persistent tokens)

### Folder Structure

Controls how subfolders are created inside the working folder. Type one of these values:

| Option | Example path |
|--------|-------------|
| **year** | `2026/JOB-65734/` |
| **customer** | `John Smith - A33/JOB-65734/` |
| **yearCustomer** | `2026 Jobs/John Smith - A33/JOB-65734 John Smith Business Cards - Print/` |
| **flat** | `JOB-65734/` (directly in working folder) |

**yearCustomer** is the Factory's preferred layout — all of one customer's jobs for the year live under one folder, with the customer code appended to avoid name collisions.

---

## Sync to Cloud (Archive + Remote Work)

**Sync to Cloud** zips the entire job folder — InDesign file, linked images, exported PDFs, packaged fonts — and uploads the zip to HH's cloud archive (Cloudflare R2).

### How it works

1. Click **Sync to Cloud** on the active job
2. Plugin saves the document, locates the job folder, walks all files recursively
3. Builds a `.zip` with JSZip (compressed), uploads directly to R2 via presigned URL
4. Registers the archive on HH — visible in the job's Cloud Archive section on the web

### Remote work flow

| Location | Action |
|----------|--------|
| **Office (end of day)** | Click Sync to Cloud → zip uploads to R2 → go home |
| **Home (laptop, no NAS)** | Click Open / Create → NAS unreachable → plugin auto-restores from cloud → extracts zip to local folder → opens .indd |
| **Home (work done)** | Click Sync to Cloud → updated zip replaces the old one → go to office |
| **Office (next day)** | Click Open / Create → opens from NAS (or restores latest cloud if needed) |

### Cross-job reference (Customer History)

When a job is active, the **Customer History** section shows the same customer's other jobs. Jobs with cloud archives show a **CLOUD** badge and a **"Restore to current folder"** button that downloads + extracts the archive into a `Reference - JOB-XXXXX/` subfolder of the current job.

**Use case:** "I need the brochure layout we did for Acme last year" → one click → files appear in the current job folder ready to drag into the layout.

### Designer's instruction

> Keep everything in the job folder. If you need fonts packaged, run InDesign's **File → Package** first. Then click **Sync to Cloud**.

---

## Project Structure

```
helper-harry-indesign/
├── manifest.json          — UXP plugin manifest (includes launchProcess permission)
├── index.html             — panel UI (HTML + CSS, dark theme)
├── index.js               — main entry point (all UI logic, ~1200 lines)
├── src/
│   ├── api/
│   │   ├── auth.js        — login, token management
│   │   └── workflow.js    — HH API calls (jobs, files, assets, archives, states)
│   ├── indesign/
│   │   ├── createDocument.js  — document creation from job specs
│   │   ├── exportPdf.js       — proof and press-ready PDF export
│   │   └── placeAsset.js      — place images from customer assets (zero stroke)
│   └── utils/
│       ├── storage.js     — file-based prefs + persistent folder tokens
│       └── jszip.min.js   — JSZip 3.10.1 (pure JS zip library, 97kb)
├── dist/
│   ├── helper-harry-indesign-v1.0.0.zip             — plugin bundle
│   ├── helper-harry-print-uncoated-v1.0.joboptions  — PDF preset (FOGRA52)
│   ├── helper-harry-print-coated-v1.0.joboptions    — PDF preset (FOGRA39)
│   └── helper-harry-print-floor-agent-v1.0.0.zip    — Print Floor Agent
└── icons/
    └── plugin-icon.png    — panel icon
```

---

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Authenticate user |
| `GET /api/workflow/dashboard/my-jobs` | Fetch assigned jobs with customer code + last name |
| `GET /api/workflow/jobs/:id` | Job details with production specs + states + customer code |
| `POST /api/workflow/jobs/:id/states/:defId/toggle` | Toggle job progress state |
| `PUT /api/workflow/jobs/:id/local-file-path` | Store local InDesign file path (persistent token) |
| `GET /api/workflow/jobs/:id/local-file-path` | Retrieve saved file path |
| `POST /api/workflow/jobs/:id/files` | Upload proof/OK PDF/files |
| `GET /api/workflow/customers/:id/assets` | Customer asset library |
| `POST /api/workflow/customers/:id/assets` | Upload new customer asset |
| `GET /api/workflow/customer-assets/:id/url` | Asset download URL |
| `GET /api/workflow/customers/:id/jobs` | Customer's other jobs (with archive_count) |
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

**Settings don't persist after restart**
- Settings are saved to `hh-settings.json` in the plugin's data folder.
- If the file can't be written, check disk permissions.
- The working folder uses a UXP persistent token — if the folder moves, re-browse in Settings.

**Folder button doesn't open Finder/Explorer**
- UXP's `shell.openPath` is not available in InDesign v20.5.2. The path is copied to clipboard instead.
- **Mac**: Finder → Cmd+Shift+G → paste → Enter
- **Windows**: Explorer address bar → paste → Enter

**Everything else**
- Contact support at [support@helperharry.com](mailto:support@helperharry.com).
