// Lost & Found Item Finder - page behaviour.
// This file loads on every page, so each init function checks its elements
// exist first. Required fields use the browser's own checks.

// --- Report an Item ----------------------------------------------------------

// Sets up the Report an Item form: Lost/Found labels, the Phone/Email toggle,
// and sending the report to the backend.
function initReportForm() {
  const form = document.getElementById("report-form");
  if (!form) return;

  const typeLabels = form.querySelectorAll("[data-label-lost]");
  const contactInput = document.getElementById("contact");
  const contactLabel = document.getElementById("contact-label");

  // Save the default label text so it can come back after a reset.
  typeLabels.forEach((label) => {
    label.dataset.labelNeutral = label.textContent;
  });

  // Changes the date and area labels for Lost or Found.
  function applyReportType() {
    const checked = form.querySelector('input[name="report_type"]:checked');
    const type = checked ? checked.value : null;

    typeLabels.forEach((label) => {
      if (type === "lost") label.textContent = label.dataset.labelLost;
      else if (type === "found") label.textContent = label.dataset.labelFound;
      else label.textContent = label.dataset.labelNeutral;
    });
  }

  // Switches the contact input between phone and email.
  function applyContactMethod() {
    const checked = form.querySelector('input[name="contact_method"]:checked');
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

  form.addEventListener("change", (event) => {
    if (event.target.name === "report_type") applyReportType();
    if (event.target.name === "contact_method") applyContactMethod();
  });

  // Reset fires before the values clear, so wait a tick before updating.
  form.addEventListener("reset", () => {
    setTimeout(() => {
      applyReportType();
      applyContactMethod();
    });
  });

  // Send the report to the backend, then open the confirmation page.
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Same names as the item_reports columns. The photo isn't sent yet,
    // since the backend doesn't take uploads.
    const data = new FormData(form);
    const report = {
      report_type: data.get("report_type"),
      item_type: data.get("item_type"),
      colour: data.get("colour"),
      brand_model: data.get("brand_model"),
      area: data.get("area"),
      item_date: data.get("item_date"),
      contact_method: data.get("contact_method"),
      contact_detail: data.get("contact_detail"),
      notes: data.get("notes"),
    };

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to submit report.");

      // Keep the reference for the confirmation page.
      sessionStorage.setItem(
        "submittedReport",
        JSON.stringify({
          reference_code: result.reference_code,
          contact_detail: report.contact_detail,
        }),
      );
      window.location.href =
        "report-submitted.html?report_type=" +
        encodeURIComponent(report.report_type);
    } catch (error) {
      // Backend down or it sent back an error, so keep the form filled in.
      console.error("Report submission failed:", error);
      alert("The report could not be submitted. Please try again.");
    }
  });

  applyReportType();
  applyContactMethod();
}

// Shows the reference number and contact detail after a report is submitted.
function initSubmittedReport() {
  const reference = document.getElementById("submitted-reference");
  const contact = document.getElementById("submitted-contact");
  const saved = sessionStorage.getItem("submittedReport");
  if (!reference || !contact || !saved) return;

  const report = JSON.parse(saved);
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

// Sends the login to the backend and opens Potential Matches if it works.
// Also toggles the forgot password tip.
function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const errorMessage = document.getElementById("login-error");
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.hidden = true;
    submit.disabled = true;

    try {
      const response = await fetch("/api/moderator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value,
          remember: form.elements.remember.checked,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to log in.");

      form.elements.password.value = "";
      window.location.assign("matches.html");
    } catch (error) {
      errorMessage.textContent = error.message || "Unable to log in.";
      errorMessage.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  const forgot = document.getElementById("forgot-password");
  const forgotHelp = document.getElementById("forgot-password-help");
  forgot.addEventListener("click", () => {
    forgotHelp.hidden = !forgotHelp.hidden;
    forgot.setAttribute("aria-expanded", String(!forgotHelp.hidden));
  });
}

// Sends Moderators to Log In if they aren't logged in, fills in their
// initials, and makes Log out end the session.
function initModeratorSession() {
  if (!document.querySelector(".site-header__badge")) return;

  fetch("/api/moderator/session", { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) {
        window.location.replace("login.html");
        return;
      }

      const session = await response.json();
      if (!session.email) return;

      // Initials come from the email, since moderator accounts only store
      // an email (no names).
      const avatar = document.querySelector(".avatar");
      if (avatar) {
        const name = session.email.split("@")[0];
        const initials =
          name
            .split(/[._-]+/)
            .filter(Boolean)
            .map((part) => part[0])
            .join("")
            .slice(0, 2) || name.slice(0, 2);
        avatar.querySelector('[aria-hidden="true"]').textContent =
          initials.toUpperCase();
        avatar.querySelector(".visually-hidden").textContent =
          "Signed in as " + session.email;
      }
    })
    .catch(() => {
      // Backend not reachable, so back to Log In.
      window.location.replace("login.html");
    });

  // Log out ends the session before going back to Log In.
  document.querySelectorAll("[data-moderator-logout]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        const response = await fetch("/api/moderator/logout", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Unable to log out.");
        window.location.replace("login.html");
      } catch (error) {
        alert("Couldn't log out. Please try again.");
      }
    });
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
initModeratorSession();
initMatchFilter();
initVerifyClaimant();
