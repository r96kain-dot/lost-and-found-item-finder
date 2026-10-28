// Mod review of suggested Lost and Found matches

// Points the Mod can give during revisioon
const VALID_POINTS = [0, 5, 10, 15, 20];

// Error handling so the conotroller knows what to sned back
function reviewError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

// Match details from DB and joins both reports together so the Mod can compare
const matchDetailsQuery = `
    SELECT
        p.match_id, p.automatic_score, p.moderator_points,
        p.decision, p.reviewed_by, p.reviewed_at, p.created_at,
        l.report_id AS lost_report_id,
        l.reference_code AS lost_reference_code,
        l.item_type AS lost_item_type,
        l.colour AS lost_colour,
        l.brand_model AS lost_brand_model,
        l.area AS lost_area,
        DATE_FORMAT(l.item_date, '%Y-%m-%d') AS lost_item_date,
        l.notes AS lost_notes,
        l.contact_method AS lost_contact_method,
        l.contact_detail AS lost_contact_detail,
        l.photo_key IS NOT NULL AS lost_has_photo,
        l.report_status AS lost_report_status,
        l.created_at AS lost_created_at,
        f.report_id AS found_report_id,
        f.reference_code AS found_reference_code,
        f.item_type AS found_item_type,
        f.colour AS found_colour,
        f.brand_model AS found_brand_model,
        f.area AS found_area,
        DATE_FORMAT(f.item_date, '%Y-%m-%d') AS found_item_date,
        f.notes AS found_notes,
        f.contact_method AS found_contact_method,
        f.contact_detail AS found_contact_detail,
        f.photo_key IS NOT NULL AS found_has_photo,
        f.received_at AS found_received_at,
        f.report_status AS found_report_status,
        f.created_at AS found_created_at
    FROM potential_matches p
    JOIN item_reports l ON l.report_id = p.lost_report_id
    JOIN item_reports f ON f.report_id = p.found_report_id
`;

// Organises the DB into something easier for frontend to use
function formatMatch(row, includeContact = false) {

    // Using this to build the Lost or Found report using the same
    // fields to try help us save time from writing everything multiple times
    function report(prefix) {
        const result = {
            report_id: row[`${prefix}_report_id`],
            reference_code: row[`${prefix}_reference_code`],
            item_type: row[`${prefix}_item_type`],
            colour: row[`${prefix}_colour`],
            brand_model: row[`${prefix}_brand_model`],
            area: row[`${prefix}_area`],
            item_date: row[`${prefix}_item_date`],
            report_status: row[`${prefix}_report_status`],

            // For Alex: return filed date with each report
            created_at: row[`${prefix}_created_at`],

            has_photo: Boolean(row[`${prefix}_has_photo`])
        };

        // This will only include contact details when viewing from specific match
        // to keep the main list from displaying too much information
        if (includeContact) {
            result.notes = row[`${prefix}_notes`];
            result.contact_method = row[`${prefix}_contact_method`];
            result.contact_detail = row[`${prefix}_contact_detail`];
            if (prefix === "found") result.received_at = row.found_received_at;
        }

        return result;
    }

    // Convert score to numbers. Mod points stay null if there hasn't been a review
    const automaticScore = Number(row.automatic_score);
    const moderatorPoints = row.moderator_points == null
        ? null
        : Number(row.moderator_points);

    return {
        match_id: row.match_id,
        automatic_score: automaticScore,
        moderator_points: moderatorPoints,
        total_score: automaticScore + (moderatorPoints ?? 0),
        decision: row.decision,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
        lost_report: report("lost"),
        found_report: report("found")
    };
}

// Gets the match list for the Mod. Defaults to pending
// matches with the highest scores first
async function listMatches(pool, decision = "pending") {

    // ONLY allow these four options when filtering matches for now
    // note to find this easier later: Ctrl+F FILTER to update this
    // section if we decide on using another system
    if (!["pending", "approved", "rejected", "all"].includes(decision)) {
        throw reviewError(400, "Invalid match status.");
    }

    // 'all' removes the selected filters
    const where = decision === "all" ? "" : "WHERE p.decision = ?";
    const values = decision === "all" ? [] : [decision];

    const [rows] = await pool.query(
        `${matchDetailsQuery} ${where}
         ORDER BY p.automatic_score DESC, p.created_at ASC, p.match_id ASC`,
        values
    );

    return rows.map(row => formatMatch(row));
}

// Gets one match with the full details of both reports,
//used when the Mod opens a match to review
async function getMatch(pool, matchId) {
    const [rows] = await pool.query(
        `${matchDetailsQuery} WHERE p.match_id = ? LIMIT 1`,
        [matchId]
    );

    if (!rows.length) throw reviewError(404, "Potential match not found.");

    return formatMatch(rows[0], true);
}

// Saves the Mod's score and decision to the database
async function reviewMatch(pool, { matchId, moderatorId, moderatorPoints, decision }) {

    // Checks the score and decision before doing anything to the database
    if (!VALID_POINTS.includes(moderatorPoints)) {
        throw reviewError(400, "Moderator points must be 0, 5, 10, 15 or 20.");
    }

    if (!["approved", "rejected"].includes(decision)) {
        throw reviewError(400, "Decision must be approved or rejected.");
    }

    // Uses a transaction so everything saves together
    // If something fails, none of the changes should be kept
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // A pending match can only be reviewed once to stop two different Mods
        // from reviewing the same match at once
        // IMPORTANT:Future proofing incase we end up needing multiple Mods working
        // on matches at the same time. In our current scope we only have one point of contact
        const [matches] = await connection.query(
            `SELECT match_id, lost_report_id, found_report_id, decision
             FROM potential_matches
             WHERE match_id = ? LIMIT 1 FOR UPDATE`,
            [matchId]
        );

        if (!matches.length) throw reviewError(404, "Potential match not found.");
        const match = matches[0];

        // Don't allow a match to be reviewed again
        if (match.decision !== "pending") {
            throw reviewError(409, "This match has already been reviewed.");
        }

        // Lock both reports so overlapping approvals don't happen together
        const [reports] = await connection.query(
            `SELECT report_id, report_type, report_status
             FROM item_reports
             WHERE report_id IN (?, ?)
             ORDER BY report_id FOR UPDATE`,
            [match.lost_report_id, match.found_report_id]
        );

        // Makes sure that we're working with onoe Lost and one Found report
        const lost = reports.find(r => r.report_id === match.lost_report_id);
        const found = reports.find(r => r.report_id === match.found_report_id);
        if (!lost || !found || lost.report_type !== "lost" || found.report_type !== "found") {
            throw reviewError(409, "The reports are not a valid Lost and Found pair.");
        }

        if (decision === "approved") {

            // Report needs to be available before approving match
            if (
                !["submitted", "under_review"].includes(lost.report_status) ||
                !["submitted", "under_review"].includes(found.report_status)
            ) {
                throw reviewError(409, "One of these reports is no longer available for matching.");
            }

            // A report must never be part of two approved matches
            // We don't want one Lost item matched to multiple Found items
            const [approved] = await connection.query(
                `SELECT match_id FROM potential_matches
                 WHERE decision = 'approved'
                   AND match_id <> ?
                   AND (lost_report_id = ? OR found_report_id = ?)
                 LIMIT 1`,
                [matchId, match.lost_report_id, match.found_report_id]
            );

            if (approved.length) {
                throw reviewError(409, "One of these reports already has an approved match.");
            }
        }

        // Save the Mod's score, decision, ID and review time
        await connection.query(
            `UPDATE potential_matches
             SET moderator_points = ?, decision = ?,
                 reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE match_id = ? AND decision = 'pending'`,
            [moderatorPoints, decision, moderatorId, matchId]
        );

        if (decision === "approved") {

            // Both reports become matched, but collection happens later
            await connection.query(
                `UPDATE item_reports SET report_status = 'matched'
                 WHERE report_id IN (?, ?)`,
                [match.lost_report_id, match.found_report_id]
            );
        }

        // Log the decision against both reports, using the same match ID
        // This gives a history of what the Mod approved or rejected
        const action = decision === "approved" ? "match_approved" : "match_rejected";
        await connection.query(
            `INSERT INTO activity_logs (report_id, match_id, moderator_id, action)
             VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
            [
                match.lost_report_id, matchId, moderatorId, action,
                match.found_report_id, matchId, moderatorId, action
            ]
        );

        // Keep all changes if everything worked
        await connection.commit();
        return { match_id: matchId, decision, moderator_points: moderatorPoints, action };
    } catch (error) {

        // Undo any changes if something went wrong
        await connection.rollback();
        throw error;
    } finally {

        // Give the database connection back when finished
        connection.release();
    }
}

module.exports = {
    listMatches,
    getMatch,
    reviewMatch
};