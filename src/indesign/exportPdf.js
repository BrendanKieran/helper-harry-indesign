const indesign = require('indesign');
const { app, ExportFormat, Sampling, CompressionQuality, BitmapCompression } = indesign;
const uxpfs = require('uxp').storage;
const localFS = uxpfs.localFileSystem;

async function exportProofPdf(doc, outputFolder, filename) {
  // Proof: low res, no bleed, no marks, compressed
  app.pdfExportPreferences.viewPDF = false;
  app.pdfExportPreferences.cropMarks = false;
  app.pdfExportPreferences.bleedMarks = false;
  app.pdfExportPreferences.registrationMarks = false;
  app.pdfExportPreferences.colorBars = false;
  app.pdfExportPreferences.pageInformationMarks = false;

  app.pdfExportPreferences.bleedTop = '0mm';
  app.pdfExportPreferences.bleedBottom = '0mm';
  app.pdfExportPreferences.bleedInside = '0mm';
  app.pdfExportPreferences.bleedOutside = '0mm';

  app.pdfExportPreferences.colorBitmapSampling = Sampling.BICUBIC_DOWNSAMPLE;
  app.pdfExportPreferences.colorBitmapSamplingDPI = 150;
  app.pdfExportPreferences.colorBitmapQuality = CompressionQuality.MEDIUM;
  app.pdfExportPreferences.grayscaleBitmapSampling = Sampling.BICUBIC_DOWNSAMPLE;
  app.pdfExportPreferences.grayscaleBitmapSamplingDPI = 150;

  // Use configured working folder if available; fall back to a picker
  const folder = outputFolder || await localFS.getFolder();
  if (!folder) throw new Error('No folder selected');
  const file = await folder.createFile(filename, { overwrite: true });
  doc.exportFile(ExportFormat.PDF_TYPE, file.nativePath, false);
  return file.nativePath;
}

async function exportOkPdf(doc, outputFolder, filename, bleedMM = 3) {
  // Press-ready: high res, bleed, crop marks, max quality
  app.pdfExportPreferences.viewPDF = false;
  app.pdfExportPreferences.cropMarks = true;
  app.pdfExportPreferences.bleedMarks = true;
  app.pdfExportPreferences.registrationMarks = true;
  app.pdfExportPreferences.colorBars = false;
  app.pdfExportPreferences.pageInformationMarks = false;

  app.pdfExportPreferences.bleedTop = `${bleedMM}mm`;
  app.pdfExportPreferences.bleedBottom = `${bleedMM}mm`;
  app.pdfExportPreferences.bleedInside = `${bleedMM}mm`;
  app.pdfExportPreferences.bleedOutside = `${bleedMM}mm`;

  app.pdfExportPreferences.colorBitmapSampling = Sampling.BICUBIC_DOWNSAMPLE;
  app.pdfExportPreferences.colorBitmapSamplingDPI = 300;
  app.pdfExportPreferences.colorBitmapQuality = CompressionQuality.MAXIMUM;
  app.pdfExportPreferences.colorBitmapCompression = BitmapCompression.AUTO_COMPRESSION;
  app.pdfExportPreferences.thresholdToCompressColor = 450;
  app.pdfExportPreferences.grayscaleBitmapSampling = Sampling.BICUBIC_DOWNSAMPLE;
  app.pdfExportPreferences.grayscaleBitmapSamplingDPI = 300;
  app.pdfExportPreferences.grayscaleBitmapQuality = CompressionQuality.MAXIMUM;

  // Use configured working folder if available; fall back to a picker
  const folder = outputFolder || await localFS.getFolder();
  if (!folder) throw new Error('No folder selected');
  const file = await folder.createFile(filename, { overwrite: true });
  doc.exportFile(ExportFormat.PDF_TYPE, file.nativePath, false);
  return file.nativePath;
}

module.exports = { exportProofPdf, exportOkPdf };
