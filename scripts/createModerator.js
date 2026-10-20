// A script for the MVP to create moderator accounts, something simple for our MVP without
// needing to create multiple forms for a lightweight app that may not see much use - Richard
// To use this script, follow these next steps I've provided:
// Run node scripts/createModerator.js on the computer hosting the backend
// Enter the Moderator's email and a password
// Log in via created credentials
require("dotenv").config();

const readline = require("node:readline");
const pool = require("../db/connection");
const { hashPassword } = require("../services/moderatorAuthService");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY)
});

// Hide the password while typing it in the terminal
function askHidden(question) {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
            return reject(new Error("Password entry requires an interactive terminal."));
        }

        let password = "";
        const wasRaw = Boolean(process.stdin.isRaw);

        readline.emitKeypressEvents(process.stdin);
        process.stdout.write(question);

        function cleanup() {
            process.stdin.removeListener("keypress", onKeypress);
            process.stdin.setRawMode(wasRaw);
            process.stdin.pause();
        }

        function onKeypress(str, key) {
            if (key && key.ctrl && key.name === "c") {
                cleanup();
                process.stdout.write("\n");
                reject(new Error("Password entry cancelled."));
                return;
            }

            if (key && (key.name === "return" || key.name === "enter")) {
                cleanup();
                process.stdout.write("\n");
                resolve(password);
                return;
            }

            if (key && (key.name === "backspace" || key.name === "delete")) {
                password = password.slice(0, -1);
                return;
            }

            if (key && (key.ctrl || key.meta)) return;

            if (typeof str === "string" && /^[^\x00-\x1f\x7f]*$/.test(str)) {
                password += str;
            }
        }

        process.stdin.on("keypress", onKeypress);
        process.stdin.setRawMode(true);
        process.stdin.resume();
    });
}

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
    const email = (await ask("Moderator email: ")).trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Enter a valid email address.");
    }

    rl.close();

    const password = await askHidden("Password (hidden, at least 8 characters): ");

    if (password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
    }

    const confirmPassword = await askHidden("Confirm password (hidden): ");

    if (password !== confirmPassword) {
        throw new Error("Passwords do not match. Moderator account was not created.");
    }

    const passwordHash = await hashPassword(password);

    const [result] = await pool.query(
        "INSERT INTO moderators (email, password_hash) VALUES (?, ?)",
        [email, passwordHash]
    );

    console.log(`Moderator account created: ${email} (ID ${result.insertId})`);
}

main()
    .catch(error => {
        console.error("Unable to create Moderator:", error.code === "ER_DUP_ENTRY"
            ? "That email already has an account."
            : error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        rl.close();
        await pool.end();
    });