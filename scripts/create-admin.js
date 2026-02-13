require('dotenv').config();

const { createOrUpdateAdmin, initSheets } = require('../src/services/sheetsService');

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('Pakai: npm run create-admin -- <username> <password>');
    process.exit(1);
  }

  await initSheets();
  const result = await createOrUpdateAdmin(username, password, true);

  if (result.updated) {
    console.log(`Admin ${username} berhasil diupdate.`);
  } else {
    console.log(`Admin ${username} berhasil dibuat.`);
  }
}

main().catch((error) => {
  console.error('Gagal membuat admin:', error.message);
  process.exit(1);
});
