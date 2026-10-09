// Lost & Found Item Finder - page behaviour.
// This file loads on every page, so each init function checks its elements
// exist first.

// --- Report an Item ----------------------------------------------------------

// Sets up the Report an Item form: Lost/Found labels and the Phone/Email toggle
// Sets up the Report an Item form and sends completed reports to the backend
function initReportForm() {
    const form = document.getElementById("report-form");
    if (!form) return;

    const typeLabels = form.querySelectorAll("[data-label-lost]");
    const contactInput = document.getElementById("contact");
    const contactLabel = document.getElementById("contact-label");

    // Save the default labels so reset can restore them
    typeLabels.forEach((label) => {
        label.dataset.labelNeutral = label.textContent;
    });

    // Change labels depending on Lost or Found
    function applyReportType() {
        const checked = form.querySelector('input[name="report_type"]:checked');
        const type = checked ? checked.value : null;

        typeLabels.forEach((label) => {
            if (type === "lost") {
                label.textContent = label.dataset.labelLost;
            } else if (type === "found") {
                label.textContent = label.dataset.labelFound;
            } else {
                label.textContent = label.dataset.labelNeutral;
            }
        });
    }

    // Switch the contact field between phone and email
    function applyContactMethod() {
        const checked = form.querySelector(
            'input[name="contact_method"]:checked',
        );

        if (!checked) return;

        const method = checked.value;

        if (method === "email") {
            contactInput.type = "email";
            contactInput.autocomplete = "email";
            contactInput.placeholder = "name@example.com";
            contactLabel.textContent = "Email address";
        } else {
            contactInput.type = "tel";
            contactInput.autocomplete = "tel";
            contactInput.placeholder = "021 234 5678";
            contactLabel.textContent = "Phone number";
        }
    }

    // Update labels when form options change
    form.addEventListener("change", (event) => {
        if (event.target.name === "report_type") {
            applyReportType();
        }

        if (event.target.name === "contact_method") {
            applyContactMethod();
        }
    });

    // Wait until reset finishes before restoring labels
    form.addEventListener("reset", () => {
        setTimeout(() => {
            applyReportType();
            applyContactMethod();
        });
    });

    // Send the completed report to the Express backend
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        const report = {
            report_type: formData.get("report_type"),
            item_type: formData.get("item_type"),
            colour: formData.get("colour"),
            brand_model: formData.get("brand_model"),
            area: formData.get("area"),
            item_date: formData.get("item_date"),
            contact_method: formData.get("contact_method"),
            contact_detail: formData.get("contact_detail"),
            notes: formData.get("notes"),
        };

        try {
            const response = await fetch("/api/reports", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(report),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Unable to submit report.");
            }

            // Save the result for the confirmation page
            sessionStorage.setItem(
                "submittedReport",
                JSON.stringify({
                    reference_code: result.reference_code,
                    report_type: report.report_type,
                    contact_detail: report.contact_detail,
                }),
            );

            // Open the confirmation page after a successful submission
            window.location.href =
                "report-submitted.html?report_type=" +
                encodeURIComponent(report.report_type);
        } catch (error) {
            console.error("Report submission failed:", error);
            alert("The report could not be submitted. Please try again.");
        }
    });

    applyReportType();
    applyContactMethod();
}

// Shows the reference and contact detail after a report is submitted
function initSubmittedReport() {
    const reference = document.getElementById("submitted-reference");
    const contact = document.getElementById("submitted-contact");

    if (!reference || !contact) return;

    const savedReport = sessionStorage.getItem("submittedReport");

    if (!savedReport) return;

    const report = JSON.parse(savedReport);

    reference.textContent = report.reference_code;
    contact.textContent = report.contact_detail;
}

// --- Show or hide parts of a page from the URL -------------------------------

// Shows elements whose data-show-for matches the URL, e.g. ?report_type=found on
// Report Submitted or ?status=collected on the moderator View page.
function initShowFor() {
  const parts = document.querySelectorAll("[data-show-for]");
  if (parts.length === 0) return;

  // The page can pick a different URL key or a default value on <body>.
  const { showParam = "report_type", showDefault = null } =
    document.body.dataset;
  const value =
    new URLSearchParams(window.location.search).get(showParam) || showDefault;

  parts.forEach((part) => {
    part.hidden = part.dataset.showFor !== value;
  });
}

// --- Check a Report ----------------------------------------------------------

// Shows the placeholder result when "Find my report" is pressed.
function initCheckReport() {
  const form = document.getElementById("find-report-form");
  const result = document.getElementById("check-result");
  if (!form || !result) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    result.hidden = false;
    document.getElementById("check-result-title").focus();
  });
}

// --- Moderator Log In --------------------------------------------------------

// Goes to Potential Matches after logging in, and toggles the forgot password tip.
function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  // Not sent anywhere yet, so the password never ends up in the URL.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    window.location.href = "matches.html";
  });

  const forgot = document.getElementById("forgot-password");
  const forgotHelp = document.getElementById("forgot-password-help");
  forgot.addEventListener("click", () => {
    forgotHelp.hidden = !forgotHelp.hidden;
    forgot.setAttribute("aria-expanded", String(!forgotHelp.hidden));
  });
}

// --- Potential Matches -------------------------------------------------------

// Removes "LFIF-", # and spaces so "LFIF-482913" and "482913" match.
function normaliseReference(value) {
  return value.replace(/lfif|[#\s-]/gi, "");
}

// Filters the table by Reference Number search and Match Status.
function initMatchFilter() {
  const table = document.getElementById("matches-table");
  if (!table) return;

  const search = document.getElementById("match-search");
  const status = document.getElementById("match-status");
  const rows = table.querySelectorAll("tbody tr[data-status]");
  const empty = document.getElementById("matches-empty");

  // Hides rows that don't match, and shows a message if none are left.
  function applyFilter() {
    const query = normaliseReference(search.value);
    let shown = 0;

    rows.forEach((row) => {
      const matchesSearch =
        query === "" ||
        row.dataset.references.split(" ").some((ref) => ref.includes(query));
      const matchesStatus =
        status.value === "all" || row.dataset.status === status.value;
      row.hidden = !(matchesSearch && matchesStatus);
      if (!row.hidden) shown += 1;
    });

    empty.hidden = shown > 0;
  }

  search.addEventListener("input", applyFilter);
  status.addEventListener("change", applyFilter);
}

// --- Verify Claimant ---------------------------------------------------------

// Placeholder details for Lost Report LFIF-205874 until the backend does the check.
const PLACEHOLDER_CLAIM = { reference: "205874", contact: "m.reyes@ac.nz" };

// Checks the Claimant's details and releases the item if they match.
function initVerifyClaimant() {
  const form = document.getElementById("verify-form");
  if (!form) return;

  const reference = document.getElementById("claim-reference");
  const contact = document.getElementById("claim-contact");
  const error = document.getElementById("verify-error");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const referenceOk =
      normaliseReference(reference.value) === PLACEHOLDER_CLAIM.reference;
    const contactOk =
      contact.value.replace(/\s/g, "").toLowerCase() ===
      PLACEHOLDER_CLAIM.contact;

    if (referenceOk && contactOk) {
      window.location.href = "view.html?status=collected";
    } else {
      error.hidden = false;
    }
  });

  // Hide the error once they start fixing the details.
  form.addEventListener("input", () => {
    error.hidden = true;
  });
}

initReportForm();
initSubmittedReport();
initShowFor();
initCheckReport();
initLogin();
initMatchFilter();
initVerifyClaimant();