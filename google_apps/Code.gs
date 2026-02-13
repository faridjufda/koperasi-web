function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Koperasi')
    .addItem('Format semua sheet', 'formatAllSheets')
    .addItem('Buka Quick Add', 'showQuickAddSidebar')
    .addItem('Buat Dashboard', 'createDashboard')
    .addItem('Kirim Peringatan Stok Rendah', 'sendLowStockFromNotifications')
    .addItem('Aktifkan Trigger Harian', 'createTimeDrivenTrigger')
    .addItem('Nonaktifkan Trigger Harian', 'deleteTimeDrivenTriggers')
    .addItem('Export Laporan (PDF)', 'exportDashboardAsPDF')
    .addToUi();
}

function formatAllSheets() {
  const ss = SpreadsheetApp.getActive();
  ss.getSheets().forEach(s => {
    s.setTabColor('#F2F7FF');
    s.setFrozenRows(1);
    const lastCol = Math.max(5, s.getLastColumn());
    s.getRange(1,1,1,lastCol).setFontWeight('bold').setFontSize(13).setBackground('#d9ecff');
    s.setColumnWidths(1, lastCol, 110);
    s.getRange(1,1,Math.min(1000,s.getLastRow()), lastCol).setVerticalAlignment('middle');
    s.getRange(1,1,1,lastCol).setHorizontalAlignment('center');
  });
  SpreadsheetApp.getUi().alert('Format diterapkan ke semua sheet.');
}

function createDashboard() {
  const ss = SpreadsheetApp.getActive();
  let dash = ss.getSheetByName('Dashboard');
  if (!dash) dash = ss.insertSheet('Dashboard', {index:0});
  dash.clear();
  dash.getRange('A1').setValue('KOPERASI - DASHBOARD').setFontSize(18).setFontWeight('bold');
  dash.getRange('A3').setValue('Total Produk');
  dash.getRange('B3').setFormula(`=IFERROR(COUNTA(products!A2:A),0)`);
  dash.getRange('A4').setValue('Total Transaksi (Hari Ini)');
  dash.getRange('B4').setFormula(`=IFERROR(COUNTIF( transactions!B2:B, TODAY() ),0)`);
  dash.getRange('A6').setValue('Produk Stok Rendah (<= minStock)');
  dash.getRange('A7').setFormula(`=IFERROR(FILTER(products!B2:B, VALUE(products!E2:E) <= VALUE(products!F2:F)), "Semua cukup")`);
  dash.autoResizeColumns(1,3);
  SpreadsheetApp.getUi().alert('Dashboard dibuat/diupdate.');
}

function showQuickAddSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('quickAdd')
    .setTitle('Quick Add Barang / Transaksi');
  SpreadsheetApp.getUi().showSidebar(html);
}

function addProductQuick(p){
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('products') || ss.insertSheet('products');
  const id = 'PRD-'+(new Date()).getTime();
  sheet.appendRow([id, p.name, p.sellPrice, p.buyPrice, p.stock, 0, new Date()]);
}

function sendLowStockFromNotifications(){
  const ss = SpreadsheetApp.getActive();
  const nots = ss.getSheetByName('notifications');
  if (!nots) return SpreadsheetApp.getUi().alert('Tidak ada notifikasi.');
  const rows = nots.getDataRange().getValues();
  const header = rows.shift();
  if (!rows.length) return SpreadsheetApp.getUi().alert('Tidak ada notifikasi.');
  const body = rows.map(r => `${r[1]} - ${r[2]} (stok ${r[3]})`).join('\n');
  const owner = Session.getActiveUser().getEmail();
  MailApp.sendEmail(owner, 'Peringatan Stok Rendah - Koperasi', body);
  SpreadsheetApp.getUi().alert('Email peringatan dikirim.');
}

function createTimeDrivenTrigger(){
  // run every day at 08:00
  // creates a trigger that will run sendLowStockFromNotifications each day
  ScriptApp.newTrigger('sendLowStockFromNotifications')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  SpreadsheetApp.getUi().alert('Trigger harian dibuat: akan mengirim peringatan setiap hari pukul 08:00.');
}

function deleteTimeDrivenTriggers(){
  const all = ScriptApp.getProjectTriggers();
  let removed = 0;
  all.forEach(t=>{
    if (t.getHandlerFunction() === 'sendLowStockFromNotifications') { ScriptApp.deleteTrigger(t); removed++; }
  });
  SpreadsheetApp.getUi().alert('Trigger dihapus: ' + removed + ' trigger dihapus.');
}

function exportDashboardAsPDF(){
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('Dashboard');
  if (!sheet) return SpreadsheetApp.getUi().alert('Dashboard belum dibuat. Klik "Buat Dashboard" terlebih dahulu.');

  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf' +
    '&size=A4&portrait=true&fitw=true&sheetnames=false&printtitle=false&pagenumbers=false' +
    '&gridlines=false&fzr=false&gid=' + sheet.getSheetId();

  const token = ScriptApp.getOAuthToken();
  const resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const blob = resp.getBlob().setName('Koperasi-Dashboard-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.pdf');

  // save to Drive folder "Koperasi Reports" (create if missing)
  const folders = DriveApp.getFoldersByName('Koperasi Reports');
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Koperasi Reports');
  const file = folder.createFile(blob);

  // also email the owner a copy
  const owner = Session.getActiveUser().getEmail();
  MailApp.sendEmail(owner, 'Laporan Dashboard Koperasi (PDF)', 'Laporan dashboard disimpan di Google Drive dan terlampir.', { attachments: [blob] });

  SpreadsheetApp.getUi().alert('Laporan Dashboard (PDF) dibuat dan dikirim ke email Anda. File disimpan di Drive > Koperasi Reports.');
}
