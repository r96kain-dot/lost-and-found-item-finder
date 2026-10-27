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

// The progress steps in order, using the backend's report_status values.
const REPORT_STEPS = [
  "submitted",
  "under_review",
  "matched",
  "ready_to_collect",
  "collected",
];

// The tick shown on finished steps.
const TICK_ICON =
  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
  '<path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" /></svg>';

// Adds "LFIF-" back if only the digits were typed (the backend needs the full code).
function fullReference(value) {
  return "LFIF-" + normaliseReference(value);
}

// Shows a date like "26 Oct 2026" in local time. The backend sends dates in UTC
// (midnight in NZ is 11am the day before), so cutting up the text would be a day out.
function formatDate(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(value + "T00:00")
    : new Date(value);
  return date.toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Looks up a report by Reference Number and contact detail, then shows it.
function initCheckReport() {
  const form = document.getElementById("find-report-form");
  const result = document.getElementById("check-result");
  if (!form || !result) return;

  const errorMessage = document.getElementById("check-error");
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.hidden = true;
    submit.disabled = true;
    let message = "We couldn't check your report right now. Please try again.";

    try {
      const response = await fetch("/api/reports/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference_code: fullReference(form.elements.reference_code.value),
          contact_detail: form.elements.contact_detail.value.trim(),
        }),
      });
      // Same message whether the number or the contact is wrong, like the backend.
      if (response.status === 404) {
        message =
          "We couldn't find a report with those details. Check the reference number and the phone number or email you gave.";
      }
      if (!response.ok) throw new Error(message);

      const data = await response.json();
      showReport(data.report);
      result.hidden = false;
      document.getElementById("check-result-title").focus();
    } catch (error) {
      result.hidden = true;
      errorMessage.textContent = message;
      errorMessage.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

// Fills the result with the report sent back by the backend.
function showReport(report) {
  const lost = report.report_type === "lost";
  const status = report.report_status;

  document.getElementById("result-reference").textContent =
    report.reference_code;
  const type = document.getElementById("result-type");
  type.textContent = lost ? "Lost" : "Found";
  type.className = "badge " + (lost ? "badge--lost" : "badge--found");
  document.getElementById("result-meta").textContent =
    "Filed " +
    formatDate(report.created_at) +
    "." +
    (status === "closed" ? " This report is closed." : "");

  // Steps before the current one get a tick; a collected report is all done.
  const current = REPORT_STEPS.indexOf(status);
  document.querySelectorAll(".progress__step").forEach((step) => {
    const index = REPORT_STEPS.indexOf(step.dataset.status);
    const done = index < current || status === "collected";
    const state = done ? "done" : index === current ? "current" : "todo";
    step.className = "progress__step progress__step--" + state;
    step.querySelector(".progress__marker").innerHTML = done ? TICK_ICON : "";
    if (state === "current") step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });

  // Collection details are only for the owner, once their item is ready.
  document.getElementById("result-ready").hidden = !(
    lost && status === "ready_to_collect"
  );
  if (report.collection_instructions) {
    document.getElementById("result-ready-text").textContent =
      report.collection_instructions;
  }

  document.getElementById("result-item-type").textContent = report.item_type;
  document.getElementById("result-colour").textContent = report.colour;
  document.getElementById("result-area").textContent = report.area;
  document.getElementById("result-date-label").textContent = lost
    ? "Lost on"
    : "Found on";
  document.getElementById("result-date").textContent = formatDate(
    report.item_date,
  );
  document.getElementById("result-brand").textContent =
    report.brand_model || "Not entered";
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

// Stops text from the database being read as HTML.
function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// The photo icon used in the table thumbnails.
const PHOTO_ICON =
  '<svg class="photo-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" ' +
  'height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>';

// Turns a time into "5 hours" or "4 days", counting from now.
function timeSince(value) {
  const hours = Math.max(0, (Date.now() - new Date(value)) / 36e5);
  if (hours < 1) return "Under an hour";
  if (hours < 24) return Math.floor(hours) + (hours < 2 ? " hour" : " hours");
  const days = Math.floor(hours / 24);
  return days + (days === 1 ? " day" : " days");
}

// Works out the Match Status shown for a match.
function matchStatus(match) {
  if (match.lost_report.report_status === "collected") return "collected";
  if (match.decision === "approved") return "approved";
  if (match.decision === "rejected") return "not-a-match";
  return "needs-review";
}

// One report's cell: photo thumbnail, item and colour, reference and area.
function matchReportCell(report) {
  const thumb = report.has_photo
    ? `<span class="thumb" role="img" aria-label="Photo">${PHOTO_ICON}</span>`
    : '<span class="thumb thumb--none" role="img" aria-label="No photo"></span>';
  return `<td><div class="match-report">${thumb}<div><strong>${escapeHtml(
    report.item_type,
  )} — ${escapeHtml(report.colour)}</strong><span>${escapeHtml(
    report.reference_code,
  )} · ${escapeHtml(report.area)}</span></div></div></td>`;
}

// Builds a table row for one match, in the same layout as the designs.
function matchRow(match) {
  const status = matchStatus(match);
  const closed = status === "collected" || status === "not-a-match";
  const score = Math.round(match.total_score);
  const scoreClass = closed ? "closed" : score >= 70 ? "high" : "mid";
  const days = (Date.now() - new Date(match.created_at)) / 864e5;
  const labels = {
    "needs-review": "Needs review",
    approved: "Approved",
    collected: "Collected",
    "not-a-match": "Not a match",
  };

  let waiting = escapeHtml(timeSince(match.created_at));
  if (closed) {
    waiting = `<span class="waiting--closed">Closed ${escapeHtml(
      timeSince(match.reviewed_at || match.created_at).toLowerCase(),
    )} ago</span>`;
  } else if (days > 3) {
    waiting = `<span class="waiting--late">${waiting} <span aria-hidden="true">!</span><span class="visually-hidden">(over 3 days)</span></span>`;
  }

  // Needs review opens Review Match; the rest open the View page.
  const action =
    status === "needs-review"
      ? `<a class="button button--primary button--small" href="review-match.html?match=${match.match_id}">Review</a>`
      : `<a class="button button--secondary button--small" href="view.html?match=${match.match_id}&amp;status=${
          status === "approved" ? "approved" : "collected"
        }">View</a>`;

  const references = [match.lost_report, match.found_report]
    .map((r) => normaliseReference(r.reference_code))
    .join(" ");
  return `<tr data-status="${status}" data-references="${escapeHtml(references)}"${
    closed ? ' class="is-closed"' : ""
  }>${matchReportCell(match.lost_report)}${matchReportCell(
    match.found_report,
  )}<td><span class="score score--${scoreClass}" style="--score: ${score}%">${score}%</span></td><td>${waiting}</td><td><span class="badge badge--status badge--${status}">${
    labels[status]
  }</span></td><td>${action}</td></tr>`;
}

// Loads the matches from the backend, fills the stat cards and the table, and
// sets up the Reference Number search and Match Status filter.
function initMatchFilter() {
  const table = document.getElementById("matches-table");
  if (!table) return;

  const search = document.getElementById("match-search");
  const status = document.getElementById("match-status");
  const empty = document.getElementById("matches-empty");
  const emptyText = empty.querySelector("td");
  let total = 0;

  // Hides rows that don't match, and shows a message if none are left.
  function applyFilter() {
    const query = normaliseReference(search.value);
    let shown = 0;

    table.querySelectorAll("tbody tr[data-status]").forEach((row) => {
      const matchesSearch =
        query === "" ||
        row.dataset.references.split(" ").some((ref) => ref.includes(query));
      const matchesStatus =
        status.value === "all" || row.dataset.status === status.value;
      row.hidden = !(matchesSearch && matchesStatus);
      if (!row.hidden) shown += 1;
    });

    emptyText.textContent = total
      ? "No Potential Matches fit this search."
      : "No Potential Matches yet.";
    empty.hidden = shown > 0;
  }

  search.addEventListener("input", applyFilter);
  status.addEventListener("change", applyFilter);

  fetch("/api/moderator/matches?decision=all", { credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error("Unable to load matches.");
      return response.json();
    })
    .then(({ matches }) => {
      // Open matches first, longest wait first ("Waiting ↓"), then closed ones.
      const open = matches.filter((m) =>
        ["needs-review", "approved"].includes(matchStatus(m)),
      );
      const closed = matches.filter((m) => !open.includes(m));
      open.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      closed.sort(
        (a, b) =>
          new Date(b.reviewed_at || b.created_at) -
          new Date(a.reviewed_at || a.created_at),
      );
      empty.insertAdjacentHTML(
        "beforebegin",
        [...open, ...closed].map(matchRow).join(""),
      );

      const count = (s) => matches.filter((m) => matchStatus(m) === s).length;
      document.getElementById("stat-awaiting").textContent =
        count("needs-review");
      document.getElementById("stat-late").textContent = matches.filter(
        (m) =>
          matchStatus(m) === "needs-review" &&
          (Date.now() - new Date(m.created_at)) / 864e5 > 3,
      ).length;
      document.getElementById("stat-approved").textContent = count("approved");
      document.getElementById("stat-collected").textContent =
        count("collected");

      total = matches.length;
      applyFilter();
    })
    .catch(() => {
      emptyText.textContent =
        "We couldn't load the matches. Please refresh the page.";
      empty.hidden = false;
    });
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
