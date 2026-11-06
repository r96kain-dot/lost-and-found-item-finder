require("dotenv").config();

const express = require("express");
const session = require("express-session");
// Reuse the MySQL connection pool from db/connection.js
const pool = require("./db/connection");
const reportRoutes = require("./routes/reportRoutes");
const moderatorRoutes = require("./routes/moderatorRoutes");
const moderatorAuthRoutes = require("./routes/moderatorAuthRoutes");

const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in .env before starting the server.");
}

// Sessions let the backend identify the logged-in moderator
app.use(session({
    name: "lfif.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60 * 1000
    }
}));
// Require a Mod session before serving moderator pages, not just the API
app.use("/moderator", (req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || req.path === "/login.html") {
        return next();
    }

    if (!Number.isInteger(req.session?.moderatorId) || req.session.moderatorId <= 0) {
        return res.redirect("/moderator/login.html");
    }

    next();
});

// Serve the frontend files from public
app.use(express.static(path.join(__dirname, "public")));
// Routes for public Lost and Found reports
app.use("/api/reports", reportRoutes);
// Login is public; the match-review routes still check the session
app.use("/api/moderator", moderatorAuthRoutes);
// Moderator endpoints require a login session before they can be used
app.use("/api/moderator", moderatorRoutes);

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