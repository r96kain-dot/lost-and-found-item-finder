require("dotenv").config();

const express = require("express");
const session = require("express-session");
// Added for Express and Socket.IO to run on the same sever
const http = require("http");
// Sends live updates to Moderators
const { Server } = require("socket.io");
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
// Further support to allow Express and Socket.IO to exist
// in the same space.
const sessionMiddleware = session({
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
});

app.use(sessionMiddleware);

// Sends a live update when a report or match changes successfully
app.use((req, res, next) => {
    const matchChanged =
        (req.method === "POST" && req.path === "/api/reports") ||
        (req.method === "POST" &&
            /^\/api\/moderator\/matches\/\d+\/review$/.test(req.path)) ||
        (req.method === "POST" &&
            /^\/api\/moderator\/items\/(receive|collect)\/\d+$/.test(req.path));

    const loggingOut =
        req.method === "POST" && req.path === "/api/moderator/logout";
    // Keeps the current session ID so we know which connections to disconnect
    const sessionId = req.sessionID;

    // This covers new reporots, match reviews, item hand-ins and collections
    // it SHOULD check if the request is one that changes the report or match info
    if (matchChanged || loggingOut) {
        // Only want to notify Mods after the request suceeds
        res.once("finish", () => {
            // Ignores failed requests so they don't trigger notifications
            if (res.statusCode < 200 || res.statusCode >= 300) return;
            // Lets us send notifications without changing existing routes
            const io = req.app.get("io");

            if (loggingOut) {
                // Disconnect sockets belonging to the logged-out session
                for (const socket of io.of("/").sockets.values()) {
                    if (socket.request.sessionID === sessionId) {
                        socket.disconnect(true);
                    }
                }
            } else {
                // Tells connected Moderators to reload their match data
                io.to("moderators").emit("matches:changed");
            }
        });
    }

    next();
});

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


// This runs Express and Socket.IO on the same HTTP server
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// And this reuses existing moderator sessions
io.engine.use(sessionMiddleware);

// Only allows logged-in moderators to connect
io.use((socket, next) => {
    const moderatorId = socket.request.session?.moderatorId;

    if (!Number.isInteger(moderatorId) || moderatorId <= 0) {
        return next(new Error("Moderator login required."));
    }

    next();
});

// Group connected moderators for notifications
io.on("connection", (socket) => {
    socket.join("moderators");
    console.log("Moderator connected to Socket.IO");
});

// Makes Socket.IO available to our existing controllers
app.set("io", io);

httpServer.listen(PORT, () => {
    console.log("Server running on http://localhost:" + PORT);
});
