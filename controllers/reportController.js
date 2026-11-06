const crypto = require("crypto");
const pool = require("../db/connection");
const { findPotentialMatches } = require("../services/matchingService");


// Generate a unique LFIF reference code
async function createReferenceCode(connection) {
    for (let attempt = 0; attempt < 10; attempt++) {
        const number = crypto.randomInt(0, 1000000);
        const referenceCode = `LFIF-${number.toString().padStart(6, "0")}`;

        const [existing] = await connection.query(
            "SELECT report_id FROM item_reports WHERE reference_code = ? LIMIT 1",
            [referenceCode]
        );

        // Use the code if it is not already taken
        if (existing.length === 0) {
            return referenceCode;
        }
    }

    throw new Error("Could not generate a unique reference code.");
}


// Clean contact details before comparing them
function normaliseContact(value, contactMethod) {
    const contact = String(value || "").trim();

    if (contactMethod === "email") {
        return contact.toLowerCase();
    }

    // Phone formatting should not make an otherwise identical number fail
    return contact.replace(/[\s()-]/g, "");
}


// Save a new Lost or Found report
async function submitReport(req, res) {
    const {
        report_type,
        item_type,
        colour,
        brand_model,
        area,
        item_date,
        contact_method,
        contact_detail,
        notes
    } = req.body;


    // Check required fields
    if (
        !report_type ||
        !item_type ||
        !colour ||
        !area ||
        !item_date ||
        !contact_method ||
        !contact_detail
    ) {
        return res.status(400).json({
            error: "Missing required report fields."
        });
    }


    // Match the database ENUM values
    if (!["lost", "found"].includes(report_type)) {
        return res.status(400).json({
            error: "Invalid report type."
        });
    }

    if (!["phone", "email"].includes(contact_method)) {
        return res.status(400).json({
            error: "Invalid contact method."
        });
    }


    const connection = await pool.getConnection();

    try {
        // Keep the report and log in one transaction
        await connection.beginTransaction();

        const referenceCode = await createReferenceCode(connection);


        // Save the report
        const [result] = await connection.query(
            `INSERT INTO item_reports (
                reference_code,
                report_type,
                item_type,
                colour,
                brand_model,
                area,
                item_date,
                contact_method,
                contact_detail,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                referenceCode,
                report_type,
                item_type,
                colour,
                brand_model || null,
                area,
                item_date,
                contact_method,
                contact_detail,
                notes || null
            ]
        );


        // Add the first activity log entry
        await connection.query(
            `INSERT INTO activity_logs (
                report_id,
                moderator_id,
                action
            )
            VALUES (?, NULL, ?)`,
            [result.insertId, "report_submitted"]
        );


        // Check for potential matches as part of the same transaction
        await findPotentialMatches(connection, result.insertId);

        await connection.commit();


        // Send the new reference back to the frontend
        return res.status(201).json({
            message: "Report submitted successfully.",
            reference_code: referenceCode
        });

    } catch (error) {
        // Undo the transaction if anything fails
        await connection.rollback();

        console.error("Report submission failed:", error.message);

        return res.status(500).json({
            error: "Unable to submit report."
        });

    } finally {
        // Return the connection to the pool
        connection.release();
    }
}


// Look up a report using its reference code and contact detail
async function lookupReport(req, res) {
    const {
        reference_code,
        contact_detail
    } = req.body;

    const referenceCode = String(reference_code || "").trim().toUpperCase();
    const contactDetail = String(contact_detail || "").trim();

    if (!referenceCode || !contactDetail) {
        return res.status(400).json({
            error: "Reference code and contact detail are required."
        });
    }

    try {
        const [reports] = await pool.query(
            `SELECT
                reference_code,
                report_type,
                item_type,
                colour,
                brand_model,
                area,
                item_date,
                contact_method,
                contact_detail,
                report_status,
                collection_instructions,
                created_at,
                updated_at
            FROM item_reports
            WHERE reference_code = ?
            LIMIT 1`,
            [referenceCode]
        );


        // Use the same message whether the reference or contact is wrong
        if (reports.length === 0) {
            return res.status(404).json({
                error: "Report details did not match."
            });
        }

        const report = reports[0];

        const contactMatches =
            normaliseContact(contactDetail, report.contact_method) ===
            normaliseContact(report.contact_detail, report.contact_method);

        if (!contactMatches) {
            return res.status(404).json({
                error: "Report details did not match."
            });
        }


        // Return the report without sending the stored contact detail back
        return res.status(200).json({
            message: "Report found.",
            report: {
                reference_code: report.reference_code,
                report_type: report.report_type,
                item_type: report.item_type,
                colour: report.colour,
                brand_model: report.brand_model,
                area: report.area,
                item_date: report.item_date,
                report_status: report.report_status,
                collection_instructions: report.collection_instructions,
                created_at: report.created_at,
                updated_at: report.updated_at
            }
        });

    } catch (error) {
        console.error("Report lookup failed:", error.message);

        return res.status(500).json({
            error: "Unable to look up report."
        });
    }
}


module.exports = {
    submitReport,
    lookupReport
};