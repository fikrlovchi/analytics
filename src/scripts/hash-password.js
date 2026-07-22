// Foydalanish: node src/scripts/hash-password.js "parol"
const bcrypt = require("bcryptjs");
const pw = process.argv[2];
if (!pw) {
  console.error('Foydalanish: node src/scripts/hash-password.js "parolingiz"');
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 10));
