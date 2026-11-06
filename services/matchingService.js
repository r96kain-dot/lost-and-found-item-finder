// Automatic matching for Lost and Found reports
// For now skip zero-score pairs on items until
// we agree on a minimum score cutoff -Richard 
const MINIMUM_MATCH_SCORE = 1;

function normaliseText(value) {
    return String(value || "").trim().toLowerCase();
}

// The database query returns dates as YYYY-MM-DD strings
function calculateMatchScore(firstReport, secondReport) {
    if (!firstReport || !secondReport) {
        throw new Error("Two reports are required for matching.");
    }

    if (firstReport.report_type === secondReport.report_type) {
        return 0;
    }

    let score = 0;

    if (normaliseText(firstReport.area) === normaliseText(secondReport.area)) {
        score += 25;
    }

    const firstBrand = normaliseText(firstReport.brand_model);
    const secondBrand = normaliseText(secondReport.brand_model);
    if (firstBrand && secondBrand && firstBrand === secondBrand) {
        score += 20;
    }

    if (firstReport.item_date && firstReport.item_date === secondReport.item_date) {
        score += 15;
    }

    if (normaliseText(firstReport.item_type) === normaliseText(secondReport.item_type)) {
        score += 10;
    }

    if (normaliseText(firstReport.colour) === normaliseText(secondReport.colour)) {
        score += 10;
    }

    return score;
}

// Compare the new report with existing reports of the opposite type and
// use the same DB connection as report submission so everything saves together
async function findPotentialMatches(connection, reportId) {
    const [reports] = await connection.query(
        `SELECT
            report_id,
            report_type,
            item_type,
            colour,
            brand_model,
            area,
            DATE_FORMAT(item_date, '%Y-%m-%d') AS item_date
        FROM item_reports
        WHERE report_id = ?
        LIMIT 1`,
        [reportId]
    );

    if (reports.length === 0) {
        throw new Error("Report not found for matching.");
    }

    const report = reports[0];
    if (!["lost", "found"].includes(report.report_type)) {
        throw new Error("Invalid report type for matching.");
    }

    const oppositeType = report.report_type === "lost" ? "found" : "lost";
    const [candidates] = await connection.query(
        `SELECT
            report_id,
            report_type,
            item_type,
            colour,
            brand_model,
            area,
            DATE_FORMAT(item_date, '%Y-%m-%d') AS item_date
        FROM item_reports
        WHERE report_type = ?
          AND report_id <> ?
          AND report_status IN ('submitted', 'under_review')`,
        [oppositeType, reportId]
    );

    const savedMatches = [];

    for (const candidate of candidates) {
        const automaticScore = calculateMatchScore(report, candidate);
        if (automaticScore < MINIMUM_MATCH_SCORE) {
            continue;
        }

        const lostReportId = report.report_type === "lost"
            ? report.report_id
            : candidate.report_id;
        const foundReportId = report.report_type === "found"
            ? report.report_id
            : candidate.report_id;

        // The unique pair constraint prevents the same suggestion being saved twice
        const [result] = await connection.query(
            `INSERT IGNORE INTO potential_matches (
                lost_report_id,
                found_report_id,
                automatic_score
            ) VALUES (?, ?, ?)`,
            [lostReportId, foundReportId, automaticScore]
        );

        if (result.affectedRows === 0) {
            continue;
        }

        // Log new flagged potential matches against both reports
        await connection.query(
            `INSERT INTO activity_logs (
                report_id,
                match_id,
                moderator_id,
                action
            )
            VALUES
                (?, ?, NULL, ?),
                (?, ?, NULL, ?)`,
            [
                lostReportId,
                result.insertId,
                "potential_match_flagged",
                foundReportId,
                result.insertId,
                "potential_match_flagged"
            ]
        );

        await connection.query(
            `UPDATE item_reports
             SET report_status = 'under_review'
             WHERE report_id IN (?, ?)
               AND report_status = 'submitted'`,
            [lostReportId, foundReportId]
        );

        savedMatches.push({
            lostReportId,
            foundReportId,
            automaticScore
        });
    }

    return savedMatches;
}

module.exports = {
    calculateMatchScore,
    findPotentialMatches
};