// Protecting Mod routes from public users
const express = require("express");
const requireModerator = require("../middleware/requireModerator");
const { listMatches, getMatch, reviewMatch } = require("../controllers/matchReviewController");

const router = express.Router();

// All three routes are private, login route will set moderatorId in the session
router.use(requireModerator);
router.get("/matches", listMatches);
router.get("/matches/:matchId", getMatch);
router.post("/matches/:matchId/review", reviewMatch);

module.exports = router;
