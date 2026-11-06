const pool = require("../db/connection");
const matchReview = require("../services/matchReviewService");

// Handles errors from review functions
// Expected errors return their message
// otherwise, this logs the problem
function sendError(res, error) {
    if (!error.status) console.error("Moderator match review failed:", error.message);
    return res.status(error.status || 500).json({
        error: error.status ? error.message : "Unable to process match review."
    });
}

// Gets a list of matches for the Mod
async function listMatches(req, res) {
    try {
        const matches = await matchReview.listMatches(pool, req.query.decision || "pending");
        return res.json({ matches });
    } catch (error) {
        return sendError(res, error);
    }
}

// Gets the selected match for comparison
async function getMatch(req, res) {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
        return res.status(400).json({ error: "Valid match ID required." });
    }

    try {
        const match = await matchReview.getMatch(pool, matchId);
        return res.json({ match });
    } catch (error) {
        return sendError(res, error);
    }
}

// Sends the Mod score and decision to the review service
async function reviewMatch(req, res) {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
        return res.status(400).json({ error: "Valid match ID required." });
    }

    try {
        const result = await matchReview.reviewMatch(pool, {
            matchId,
            moderatorId: req.session.moderatorId,
            moderatorPoints: req.body.moderator_points,
            decision: req.body.decision
        });
        return res.json({ message: "Match reviewed.", ...result });
    } catch (error) {
        return sendError(res, error);
    }
}

module.exports = { listMatches, getMatch, reviewMatch };
