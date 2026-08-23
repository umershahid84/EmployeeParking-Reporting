const mysql = require('mysql2/promise');

// mysql2 speaks the MySQL wire protocol, which MariaDB implements, so
// DB_DIALECT is accepted (and validated) for configuration clarity but does
// not change how the connection is made.
const dialect = (process.env.DB_DIALECT || 'mariadb').toLowerCase();
if (!['mariadb', 'mysql'].includes(dialect)) {
  console.warn(`DB_DIALECT="${process.env.DB_DIALECT}" is not recognized; expected "mariadb" or "mysql". Continuing anyway.`);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

module.exports = pool;
