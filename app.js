require("dotenv").config();

const express = require("express");
// Reuse the MySQL connection pool from db/connection.js
const pool = require("./db/connection");
const reportRoutes = require("./routes/reportRoutes");

const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve the frontend files from public.
app.use(express.static(path.join(__dirname, "public")));
// Routes for public Lost and Found reports.
app.use("/api/reports", reportRoutes);

app.get("/", (req, res) => {
    res.send("Lost & Found Item Finder is running.");
});

app.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});

// Temporary startup test to confirm Express can reach lost_found_db
// This can be removed later
async function testDatabaseConnection() {
    try {
        const [rows] = await pool.query("SELECT DATABASE() AS database_name");

        // If this prints lost_found_db, the connection settings are working
        console.log("Database connection successful:", rows[0].database_name);
    } catch (error) {
        // Keep the database error visible while we're setting the backend up
        console.error("Database connection failed:", error.message);
    }
}

testDatabaseConnection();