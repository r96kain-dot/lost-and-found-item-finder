// Password checks for Moderator login using Node's built-in crypto
// This works really well for computers that wouldn't be able to install bcryptjs
const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// Hash the pass before saving it to the DB
// Each password gets its own random salt for extra protection
async function hashPassword(password) {
    if (typeof password !== "string" || password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
    }

    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync(password, salt, KEY_LENGTH);
    return `scrypt:${salt}:${hash.toString("hex")}`;
}

// Check the password entered by the Mod against the saved hash
// This means we don't need to store their actual password in the DB
async function checkPassword(password, storedHash) {
    if (typeof password !== "string" || typeof storedHash !== "string") return false;

    // To make sure the saved hash is in the expected format
    const parts = storedHash.split(":");
    if (parts.length !== 3) return false;
    const [method, salt, hashHex] = parts;

    if (method !== "scrypt" || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(hashHex)) {
        return false;
    }

    // Hash the entered password using the saved salt
    // then compare both hashes securely
    const original = Buffer.from(hashHex, "hex");
    const supplied = await scryptAsync(password, salt, KEY_LENGTH);
    return timingSafeEqual(original, supplied);
}

// Find a Mod by email and check their password
// Only return their ID and email if the login details are correct
async function findModerator(pool, email, password) {
    if (typeof email !== "string" || typeof password !== "string") return null;

    const [rows] = await pool.query(
        `SELECT moderator_id, email, password_hash
         FROM moderators WHERE email = ? LIMIT 1`,
        [email.trim().toLowerCase()]
    );

    const moderator = rows[0];
    if (!moderator || !(await checkPassword(password, moderator.password_hash))) return null;

    return { moderator_id: moderator.moderator_id, email: moderator.email };
}

module.exports = { hashPassword, checkPassword, findModerator };