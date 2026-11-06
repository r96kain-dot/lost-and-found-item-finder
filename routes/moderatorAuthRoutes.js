// Login needs to be public unlike the Mod review routes
const express = require("express");
const { login, sessionInfo, logout } = require("../controllers/moderatorAuthController");

const router = express.Router();

router.post("/login", login);
router.get("/session", sessionInfo);
router.post("/logout", logout);

module.exports = router;
