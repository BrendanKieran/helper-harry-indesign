# Helper Harry InDesign Plugin

UXP plugin for Adobe InDesign that connects to Helper Harry's print shop workflow system.

## Features

- **Job List** — see your assigned jobs with specs, priority, and due dates
- **Create Document** — one click creates an InDesign document with correct page size, bleed, margins, and page count
- **Export Proof PDF** — 150 DPI, no bleed, compressed → uploads to HH as versioned proof
- **Export OK PDF** — 300 DPI, press quality, bleed + crop marks → uploads to HH as print-ready
- **Customer Assets** — browse and place customer logos/photos directly into your document
- **Local File Tracking** — remembers where your InDesign files are saved

## Requirements

- Adobe InDesign 2024+ (version 18.5+, UXP support required)
- Helper Harry account with Workflow module access
- macOS or Windows

## Installation

### Development (sideload)

1. Open InDesign
2. Go to **Plugins → Development → Show Plugin Folder**
3. Copy the `helper-harry-indesign` folder into the plugins folder
4. Restart InDesign
5. Go to **Window → Helper Harry** to open the panel

### Production (Adobe Exchange)

Coming soon — will be distributed via Adobe Exchange marketplace.

## Configuration

On first launch, log in with your Helper Harry email and password. The plugin stores your session securely.

### Preferences (stored locally)

| Setting | Default | Description |
|---------|---------|-------------|
| Working Folder | — | Where job folders are created |
| Folder Structure | year | year / flat / customer-based folder naming |
| Default Bleed | 3mm | Applied to new documents |
| Default Margins | 6mm | Applied to new documents |
| Auto Upload Proof | true | Upload proof PDF to HH after export |
| Proof Resolution | 150 DPI | Quality for proof exports |
| OK PDF Resolution | 300 DPI | Quality for press-ready exports |

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
└── icons/
    └── plugin-icon.png    — panel icon
```

## API Endpoints Used

The plugin calls Helper Harry's existing API:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Authenticate user |
| `GET /api/workflow/dashboard/my-jobs` | Fetch assigned jobs |
| `GET /api/workflow/jobs/:id` | Job details with production specs |
| `PUT /api/workflow/jobs/:id/local-file-path` | Store local InDesign file path |
| `GET /api/workflow/jobs/:id/local-file-path` | Retrieve saved file path |
| `POST /api/workflow/jobs/:id/files` | Upload proof/OK PDF |
| `GET /api/workflow/customers/:id/assets` | Customer asset library |
| `GET /api/workflow/customer-assets/:id/url` | Asset download URL |

## Workflow

1. Designer opens InDesign → opens Helper Harry panel
2. Sees assigned jobs → clicks "Create Document" on a job
3. Plugin creates InDesign document with correct specs
4. Designer works on the design
5. Clicks "Export Proof" → uploads to HH → customer gets proof email
6. Customer approves → designer clicks "Export OK PDF"
7. Press-ready PDF uploaded to HH → printer sees it in their queue
