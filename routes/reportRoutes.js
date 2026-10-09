const express = require("express");
const { submitReport } = require("../controllers/reportController");

const router = express.Router();

// Submit a new Lost or Found report.
router.post("/", submitReport);

module.exports = router;