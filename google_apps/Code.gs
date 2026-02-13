function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Koperasi')
    .addItem('Format semua sheet', 'formatAllSheets')
    .addItem('Buka Quick Add', 'showQuickAddSidebar')
    .addItem('Buat Dashboard', 'createDashboard')
    .addItem('Kirim Peringatan Stok Rendah', 'sendLowStockFromNotifications')
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
  ScriptApp.newTrigger('sendLowStockFromNotifications')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}
