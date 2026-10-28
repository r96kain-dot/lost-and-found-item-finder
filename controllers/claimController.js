const pool = require("../db/connection");
const { verifyClaimant } = require("../services/claimService");

// Passes claimant details to the claim service and returns the result
async function verifyClaim(req, res) {
    console.log("VERIFY CLAIM HIT:", req.body);

    try {
        const moderatorId = req.session.moderatorId;
        const referenceCode = String(req.body.reference_code || "").trim().toUpperCase();
        const contactDetail = req.body.contact_detail;

        const [reports] = await pool.query(
            `SELECT report_id
             FROM item_reports
             WHERE reference_code = ?
               AND report_type = 'lost'
             LIMIT 1`,
            [referenceCode]
        );

        if (reports.length === 0) {
            return res.status(404).json({
                error: "Lost report not found."
            });
        }

        const result = await verifyClaimant(pool, {
            reportId: reports[0].report_id,
            moderatorId,
            referenceCode,
            contactDetail
        });

        return res.status(200).json(result);
    } catch (error) {

        return res.status(400).json({
            error: error.message
        });
    }
}

module.exports = {
    verifyClaim
};