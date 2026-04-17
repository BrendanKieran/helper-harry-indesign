const indesign = require('indesign');
const { app, FitOptions } = indesign;
const fs = require('uxp').storage.localFileSystem;

async function placeImage(doc, imageUrl, imageName) {
  // Download image to temp file
  const tempFolder = await fs.getTemporaryFolder();
  const tempFile = await tempFolder.createFile(imageName, { overwrite: true });

  const response = await fetch(imageUrl);
  const buffer = await response.arrayBuffer();
  await tempFile.write(buffer);

  // Place in active page — try multiple UXP-compatible access patterns
  var page;
  try { page = doc.layoutWindows[0].activePage; } catch (e) {}
  if (!page) try { page = app.activeWindow.activePage; } catch (e) {}
  if (!page) try { page = doc.pages[0]; } catch (e) {}
  if (!page) throw new Error('No active page found — open a document first');

  var frame = page.rectangles.add();

  // Default: 50x50mm centred on page
  var pageWidth = parseFloat(doc.documentPreferences.pageWidth);
  var pageHeight = parseFloat(doc.documentPreferences.pageHeight);
  var size = Math.min(50, pageWidth * 0.4, pageHeight * 0.4);
  var x = (pageWidth - size) / 2;
  var y = (pageHeight - size) / 2;
  frame.geometricBounds = [y, x, y + size, x + size];

  frame.place(tempFile.nativePath);

  // Fit proportionally
  try {
    frame.fit(FitOptions.PROPORTIONALLY);
    frame.fit(FitOptions.FRAME_TO_CONTENT);
  } catch (e) {}

  return frame;
}

async function loadFont(fontUrl, fontName) {
  // Download font to temp
  const tempFolder = await fs.getTemporaryFolder();
  const tempFile = await tempFolder.createFile(fontName, { overwrite: true });

  const response = await fetch(fontUrl);
  const buffer = await response.arrayBuffer();
  await tempFile.write(buffer);

  // UXP doesn't have native font installation — the font file is available locally
  // InDesign will pick it up if placed in the document fonts folder
  return tempFile.nativePath;
}

module.exports = { placeImage, loadFont };
