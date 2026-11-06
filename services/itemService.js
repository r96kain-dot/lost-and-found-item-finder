//reusing Richard's code. Thanks Richard! verification

const { verifyClaimant } = require("./claimService");

//error handling for claim verification
function fail(status, message) {
    return Object.assign(new Error(message), { status });
}

//ID check, must be a whole number greater than 0
function validId(value) {
    return Number.isSafeInteger(value) && value > 0;
}

// Verify the claimant's details and log the result in the database
//data base operation fails, reverse the transaction and return an error to the moderator.

async function transaction(pool, operation)
{   const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const result = await operation(connection);

        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


// Record the physical receipt of a found item.
async function receiveItem(pool, { reportId, moderatorId }) {
    if (!validId(reportId) || !validId(moderatorId)) {
        throw fail(400, "Valid report and moderator IDs are required.");
    }

    return transaction(pool, async connection => {
        // Find and lock!! any approved match for this found report.
        const [matches] = await connection.query(
            `SELECT match_id, lost_report_id
             FROM potential_matches
             WHERE found_report_id = ?
               AND decision = 'approved'
             FOR UPDATE`,
            [reportId]
        );

        if (matches.length > 1) {
            throw fail(409, "Item has multiple approved matches.");
        }

        const match = matches[0];

        // Lock the found report and its matched lost report
        const [reports] = await connection.query(
            `SELECT report_id, report_type, report_status, received_at
             FROM item_reports
             WHERE report_id IN (?, ?)
             ORDER BY report_id
             FOR UPDATE`,
            [reportId, match?.lost_report_id || reportId]
        );

        const found = reports.find(row => row.report_id === reportId);

        // Throw this error only when the report was not found fejoajfewiojfewiaojw
        if (!found) {
            throw fail(404, "Found report not FOUND.");
        }

        if (found.report_type !== "found") {
            throw fail(400, "Restricted!! only found items can be received.");
        }

        if (
            found.received_at ||
            !["submitted", "under_review", "matched"].includes(
                found.report_status
            )
        ) {
            throw fail(
                409,
                "Item is already received, not available for receipt."
            );
        }

        if (match) {
            const lost = reports.find(
                row => row.report_id === match.lost_report_id
            );

            if (
                !lost ||
                lost.report_type !== "lost" ||
                lost.report_status !== "matched" ||
                found.report_status !== "matched"
            ) {
                throw fail(
                    409,
                    "Matched reports are not available for receipt."
                );
            }
        } else if (found.report_status === "matched") {
            throw fail(409, "Matched item has no approved match.");
        }

        // Save the receipt date and time.
        await connection.query(
            `UPDATE item_reports
             SET received_at = CURRENT_TIMESTAMP
             WHERE report_id = ?`,
            [reportId]
        );

        // Approved matches become ready once the item is received.
        if (match) {
            await connection.query(
                `UPDATE item_reports
                 SET report_status = 'ready_to_collect'
                 WHERE report_id IN (?, ?)`,
                [reportId, match.lost_report_id]
            );
        }

        // Record which moderator received the item.
        await connection.query(
            `INSERT INTO activity_logs
                (report_id, match_id, moderator_id, action)
             VALUES (?, ?, ?, 'item_received')`,
            [reportId, match?.match_id || null, moderatorId]
        );

        return {
            report_id: reportId,
            action: "item_received",
            report_status: match
                ? "ready_to_collect"
                : found.report_status
        };
    });
}

// Record handover after checking the match, receipt and claimant.
async function collectItem(
    pool,
    { matchId, moderatorId, referenceCode, contactDetail }
) {
    if (!validId(matchId) || !validId(moderatorId)) {
        throw fail(400, "Valid match and moderator IDs are required.");
    }

    if (
        typeof referenceCode !== "string" ||
        !referenceCode.trim() ||
        typeof contactDetail !== "string" ||
        !contactDetail.trim()
    ) {
        throw fail(
            400,
            "Lost reference code and contact detail are required."
        );
    }

    return transaction(pool, async connection => {
        const [matches] = await connection.query(
            `SELECT match_id, lost_report_id, found_report_id, decision
             FROM potential_matches
             WHERE match_id = ?
             FOR UPDATE`,
            [matchId]
        );

        const match = matches[0];

        if (!match) {
            throw fail(404, "Match not found.");
        }

        if (match.decision !== "approved") {
            throw fail(409, "Match must be approved before collection.");
        }

        const [reports] = await connection.query(
            `SELECT report_id, report_type, report_status, received_at
             FROM item_reports
             WHERE report_id IN (?, ?)
             ORDER BY report_id
             FOR UPDATE`,
            [match.lost_report_id, match.found_report_id]
        );

        const lost = reports.find(
            row => row.report_id === match.lost_report_id
        );

        const found = reports.find(
            row => row.report_id === match.found_report_id
        );

        if (
            !lost ||
            !found ||
            lost.report_type !== "lost" ||
            found.report_type !== "found" ||
            !found.received_at ||
            lost.report_status !== "ready_to_collect" ||
            found.report_status !== "ready_to_collect"
        ) {
            throw fail(
                409,
                "Both reports must be ready to collect and the item must be received."
            );
        }

        // Recheck the claimant's details at handover.
        const verification = await verifyClaimant(connection, {
            reportId: lost.report_id,
            moderatorId,
            referenceCode,
            contactDetail
        });

        // Keep the failed verification log, but do not collect the item.
        if (!verification.verified) {
            return {
                verified: false,
                action: verification.action
            };
        }

        // Update both reports after successful verification.
        await connection.query(
            `UPDATE item_reports
             SET report_status = 'collected',
                 collected_at = CURRENT_TIMESTAMP
             WHERE report_id IN (?, ?)`,
            [lost.report_id, found.report_id]
        );

        // Record collection against both reports.
        await connection.query(
            `INSERT INTO activity_logs
                (report_id, match_id, moderator_id, action)
             VALUES
                (?, ?, ?, 'item_collected'),
                (?, ?, ?, 'item_collected')`,
            [
                lost.report_id,
                matchId,
                moderatorId,
                found.report_id,
                matchId,
                moderatorId
            ]
        );

        return {
            verified: true,
            match_id: matchId,
            lost_report_id: lost.report_id,
            found_report_id: found.report_id,
            report_status: "collected",
            action: "item_collected"
        };
    });
}

// Make both functions available to the controller.
module.exports = { receiveItem, collectItem };
    