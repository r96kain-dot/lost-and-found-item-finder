// Lost & Found Item Finder: UI behaviour only.
// Nothing is saved here and there is no custom validation; required fields use
// the browser's built-in checks. app.js loads on every page, so each part checks
// that its elements exist before doing anything.

// --- Report an Item: Report type and contact method --------------------------

function initReportForm() {
  const form = document.getElementById("report-form");
  if (!form) return;

  const typeLabels = form.querySelectorAll("[data-label-lost]");
  const handInField = document.getElementById("hand-in-field");
  const handInSelect = document.getElementById("site-office");
  const contactInput = document.getElementById("contact");
  const contactLabel = document.getElementById("contact-label");

  // Remember the neutral label ("Date", "Where") for when nothing is selected.
  typeLabels.forEach((label) => {
    label.dataset.labelNeutral = label.textContent;
  });

  function applyReportType() {
    const checked = form.querySelector('input[name="type"]:checked');
    const type = checked ? checked.value : null;

    typeLabels.forEach((label) => {
      if (type === "lost") label.textContent = label.dataset.labelLost;
      else if (type === "found") label.textContent = label.dataset.labelFound;
      else label.textContent = label.dataset.labelNeutral;
    });

    // A Lost report has nothing to hand in. Disabling the select stops its
    // required check from blocking the submit.
    const isFound = type === "found";
    handInField.hidden = !isFound;
    handInSelect.disabled = !isFound;
  }

  function applyContactMethod() {
    const method = form.querySelector(
      'input[name="contact_method"]:checked',
    ).value;

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
    if (event.target.name === "type") applyReportType();
    if (event.target.name === "contact_method") applyContactMethod();
  });

  // Cancel resets the form. The reset event fires before the values change,
  // so update the labels on the next tick.
  form.addEventListener("reset", () => {
    setTimeout(() => {
      applyReportType();
      applyContactMethod();
    });
  });

  applyReportType();
  applyContactMethod();
}

// --- Show parts of a page for one URL value ----------------------------------
// Elements with data-show-for only show when the URL value matches. The value
// is read from ?type= unless <body data-show-param> names another one, and
// <body data-show-default> sets it when the URL has none.
// Report Submitted: ?type=lost / found. Moderator View: ?status=owner-notified / claimed.

function initShowFor() {
  const parts = document.querySelectorAll("[data-show-for]");
  if (parts.length === 0) return;

  const { showParam = "type", showDefault = null } = document.body.dataset;
  const value =
    new URLSearchParams(window.location.search).get(showParam) || showDefault;

  parts.forEach((part) => {
    part.hidden = part.dataset.showFor !== value;
  });
}

// --- Check a Report: show the placeholder result -----------------------------

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

// --- Moderator Log In ---------------------------------------------------------

function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  // The browser checks the required fields first. Nothing is sent: a GET form
  // would put the password in the URL. The backend replaces this at integration.
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

// --- Potential Matches: search and Match Status filter -----------------------

// "#1 000" and "1000" both become "1000".
function normaliseReference(value) {
  return value.replace(/[#\s]/g, "");
}

function initMatchFilter() {
  const table = document.getElementById("matches-table");
  if (!table) return;

  const search = document.getElementById("match-search");
  const status = document.getElementById("match-status");
  const rows = table.querySelectorAll("tbody tr[data-status]");
  const empty = document.getElementById("matches-empty");

  // Each row lists both Reference Numbers in data-references.
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

// --- Verify Claimant ------------------------------------------------------------

// Placeholder details for Lost Report #1009 until the backend checks the real
// Report. Contact Details are compared without spaces and ignoring case.
const PLACEHOLDER_CLAIM = { reference: "1009", contact: "m.reyes@ac.nz" };

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
      window.location.href = "view.html?status=claimed";
    } else {
      error.hidden = false;
    }
  });

  // Hide the error again once the Moderator starts correcting the details.
  form.addEventListener("input", () => {
    error.hidden = true;
  });
}

initReportForm();
initShowFor();
initCheckReport();
initLogin();
initMatchFilter();
initVerifyClaimant();
