// Claim verification logic, collection happens separately

function normaliseReference(value) {
    return String(value || "").trim().toUpperCase();
}

function normaliseContact(value, contactMethod) {
    const contact = String(value || "").trim();

    if (contactMethod === "email") {
        return contact.toLowerCase();
    }

    // Phone formatting should not make an otherwise identical number fail
    return contact.replace(/[\s()-]/g, "");
}

// Check the claimant and log whether they pass or fail
// Do not mark the item collected here, verification and
// handover are separate steps
async function verifyClaimant(
    connection,
    { reportId, moderatorId, referenceCode, contactDetail }
) {
    if (!Number.isInteger(reportId) || reportId <= 0) {
        throw new Error("A valid report ID is required.");
    }

    if (!Number.isInteger(moderatorId) || moderatorId <= 0) {
        throw new Error("A valid moderator ID is required.");
    }

    if (!String(referenceCode || "").trim() || !String(contactDetail || "").trim()) {
        throw new Error("Reference code and contact detail are required.");
    }

    const [reports] = await connection.query(
        `SELECT
            report_id,
            reference_code,
            report_type,
            report_status,
            contact_method,
            contact_detail
        FROM item_reports
        WHERE report_id = ?
        LIMIT 1`,
        [reportId]
    );

    if (reports.length === 0) {
        throw new Error("Lost report not found.");
    }

    const report = reports[0];

    if (report.report_type !== "lost") {
        throw new Error("Claim verification can only be used with a Lost Report.");
    }

    if (report.report_status !== "ready_to_collect") {
        throw new Error("This report is not ready for claimant verification.");
    }

    const referenceMatches =
        normaliseReference(referenceCode) ===
        normaliseReference(report.reference_code);

    const contactMatches =
        normaliseContact(contactDetail, report.contact_method) ===
        normaliseContact(report.contact_detail, report.contact_method);

    const verified = referenceMatches && contactMatches;

    const action = verified
        ? "claim_verified"
        : "claim_verification_failed";

    // Record the verification result only
    // The item is marked as collected later during handover
    await connection.query(
        `INSERT INTO activity_logs (
            report_id,
            moderator_id,
            action
        )
        VALUES (?, ?, ?)`,
        [reportId, moderatorId, action]
    );

    return {
        verified,
        action
    };
}

module.exports = {
    verifyClaimant
};
