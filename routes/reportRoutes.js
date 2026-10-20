const express = require("express");
const {
    submitReport,
    lookupReport
} = require("../controllers/reportController");

const router = express.Router();


// Submit a new Lost or Found report
router.post("/", submitReport);


// Check an existing report
router.post("/lookup", lookupReport);


module.exports = router;