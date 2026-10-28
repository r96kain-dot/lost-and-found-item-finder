// Protecting Mod routes from public users i.e: Public users can't connect to Mod pages via direct url
const express = require("express");
const requireModerator = require("../middleware/requireModerator");
const { listMatches, getMatch, reviewMatch } = require("../controllers/matchReviewController");
const { verifyClaim } = require("../controllers/claimController");

const router = express.Router();

// All routes are private, login route will set moderatorId in the session
router.use(requireModerator);

router.get("/matches", listMatches);
router.get("/matches/:matchId", getMatch);
router.post("/matches/:matchId/review", reviewMatch);

// Checks claimant details before the item is handed over
router.post("/claims/verify", verifyClaim);

module.exports = router;