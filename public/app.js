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
    const method = form.querySelector('input[name="contact_method"]:checked').value;

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

// --- Report Submitted: show the parts for ?type=lost or ?type=found ----------

function initReportSubmitted() {
  const parts = document.querySelectorAll("[data-show-for]");
  if (parts.length === 0) return;

  const type = new URLSearchParams(window.location.search).get("type");

  parts.forEach((part) => {
    part.hidden = part.dataset.showFor !== type;
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

initReportForm();
initReportSubmitted();
initCheckReport();
