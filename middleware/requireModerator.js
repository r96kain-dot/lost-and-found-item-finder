// Mod actions use the ID saved by the login session
function requireModerator(req, res, next) {
    const moderatorId = req.session?.moderatorId;

    if (!Number.isInteger(moderatorId) || moderatorId <= 0) {
        return res.status(401).json({ error: "Moderator login required." });
    }

    next();
}

module.exports = requireModerator;
