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

  // Place in active page
  const page = doc.layoutWindows[0].activePage;
  const frame = page.rectangles.add();

  // Default: 50x50mm centred on page
  const pageWidth = parseFloat(doc.documentPreferences.pageWidth);
  const pageHeight = parseFloat(doc.documentPreferences.pageHeight);
  const size = Math.min(50, pageWidth * 0.4, pageHeight * 0.4);
  const x = (pageWidth - size) / 2;
  const y = (pageHeight - size) / 2;
  frame.geometricBounds = [y, x, y + size, x + size];

  frame.place(new File(tempFile.nativePath));

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
