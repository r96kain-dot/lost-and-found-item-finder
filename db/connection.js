const mysql = require("mysql2/promise");

// Create a reusable pool of database connections
// Values come from .env so login isn't hardcoded
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Other backend files can import this pool when they need to query MySQL
module.exports = pool;