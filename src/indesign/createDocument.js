const indesign = require('indesign');
const { app } = indesign;

function createDocument(jobSpecs, prefs = {}) {
  const {
    widthMM = 210, heightMM = 297, pageCount = 1,
    facingPages = false,
    bleedMM = prefs.defaultBleed || 3,
    marginMM = prefs.defaultMargins || 6,
    jobNumber = '', customerName = '', title = ''
  } = jobSpecs;

  // Create document with properties at creation time
  const doc = app.documents.add({
    documentPreferences: {
      pageWidth: `${widthMM}mm`,
      pageHeight: `${heightMM}mm`,
      facingPages: facingPages,
      pagesPerDocument: pageCount,
      documentBleedTopOffset: `${bleedMM}mm`,
      documentBleedBottomOffset: `${bleedMM}mm`,
      documentBleedInsideOrLeftOffset: `${bleedMM}mm`,
      documentBleedOutsideOrRightOffset: `${bleedMM}mm`
    }
  });

  // Set margins using the .properties pattern from Adobe docs
  try {
    for (let i = 0; i < doc.pages.length; i++) {
      doc.pages[i].marginPreferences.properties = {
        top: `${marginMM}mm`,
        bottom: `${marginMM}mm`,
        left: `${marginMM}mm`,
        right: `${marginMM}mm`
      };
    }
  } catch (e) {
    // Margins are nice-to-have
  }

  // Add job info text frame on page 1 (non-printing)
  if (prefs.showJobInfo !== false && jobNumber) {
    try {
      const page1 = doc.pages[0];
      const textFrame = page1.textFrames.add();
      textFrame.geometricBounds = [
        `${marginMM}mm`, `${marginMM}mm`,
        `${marginMM + 6}mm`, `${widthMM - marginMM}mm`
      ];
      textFrame.contents = `${jobNumber} | ${customerName} | ${title}`;
      try { textFrame.texts[0].pointSize = 7; } catch (e) {}
      try { textFrame.nonprinting = true; } catch (e) {}
    } catch (e) {
      // Info frame is nice-to-have
    }
  }

  return doc;
}

module.exports = { createDocument };
