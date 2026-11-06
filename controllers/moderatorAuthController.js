const pool = require("../db/connection");
const { findModerator } = require("../services/moderatorAuthService");

// Check the email and password, then remember which Mod logged in
async function login(req, res) {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
        return res.status(400).json({ error: "Email and password required." });
    }

    try {
        const moderator = await findModerator(pool, email, password);
        if (!moderator) return res.status(401).json({ error: "Invalid email or password." });

        // Start a fresh session after login, instead of reusing an old one
        req.session.regenerate(error => {
            if (error) {
                console.error("Moderator session failed:", error.message);
                return res.status(500).json({ error: "Unable to log in." });
            }

            req.session.moderatorId = Number(moderator.moderator_id);
            req.session.moderatorEmail = moderator.email;

            // The existing "Keep me signed in" option lasts 7 days, otherwise only 8 hours
            req.session.cookie.maxAge = req.body.remember === true
                ? 7 * 24 * 60 * 60 * 1000
                : 8 * 60 * 60 * 1000;
            req.session.save(error => {
                if (error) {
                    console.error("Saving moderator session failed:", error.message);
                    return res.status(500).json({ error: "Unable to log in." });
                }
                return res.json({ message: "Moderator has logged in.", moderator });
            });
        });
    } catch (error) {
        console.error("Moderator login failed:", error.message);
        return res.status(500).json({ error: "Unable to log in." });
    }
}

// Check whether a Mod is already logged in
function sessionInfo(req, res) {
    if (!Number.isInteger(req.session?.moderatorId)) {
        return res.status(401).json({ error: "Moderator login required." });
    }

    return res.json({
        logged_in: true,
        moderator_id: req.session.moderatorId,
        email: req.session.moderatorEmail || null
    });
}

// End the Mod's session and clear the browser cookie
function logout(req, res) {
    req.session.destroy(error => {
        if (error) {
            console.error("Moderator logout failed:", error.message);
            return res.status(500).json({ error: "Unable to log out." });
        }

        res.clearCookie("lfif.sid", { path: "/" });
        return res.json({ message: "Moderator logged out." });
    });
}

module.exports = { login, sessionInfo, logout };
