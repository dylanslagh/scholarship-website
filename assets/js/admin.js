// Board dashboard: login gate, stats, filterable application list, detail view
// with board review tools (status, score, notes), recommendation follow-up,
// detail corrections, check tracking, and CSV export.
(function () {
  var loginView = null, listView = null, detailView = null;

  var STATUS_LABELS = {
    submitted: "New",
    in_review: "In review",
    awarded: "Awarded",
    not_awarded: "Not awarded",
  };

  // Where an award's check stands (see summarizeChecks in functions/lib/checks.ts).
  var CHECK_STATE_LABELS = {
    needs_check: "Needs a check",
    outstanding: "Not cashed yet",
    follow_up: "Needs follow-up",
    cleared: "Cashed",
  };

  var CHECK_STATUS_ORDER = ["issued", "handed_out", "cleared", "lost", "void"];

  var EMAIL_KIND_LABELS = {
    applicant_confirmation: "Application confirmation to student",
    teacher_request: "Recommendation request to teacher",
    duplicate_notice: "Duplicate-application notice to student",
    board_new_application: "New-application alert to board",
    board_recommendation_received: "Recommendation alert to board",
    applicant_recommendation_received: "Recommendation-received notice to student",
    check_reminder: "Cash-the-check reminder to student",
  };

  // "Sent" is what the email service told us. It can't see whether the message
  // reached the inbox, landed in spam, or was read.
  var EMAIL_OUTCOMES = {
    accepted: ["Sent", "submitted", "Accepted by the email service. This can't confirm it reached the inbox."],
    failed: ["Failed", "failed", "The email service refused this message."],
    logged: ["Not sent (test mode)", "pending", "Test mode: the email was written to the log instead of being sent."],
    sending: ["Sending…", "pending", "The send hadn't finished when this was recorded."],
  };

  var FIELD_LABELS = {
    full_name: "Name", email: "Email", phone: "Phone", address: "Address",
    high_school: "High School", college: "College Accepted At", date_accepted: "Date Accepted",
    major: "Major", parent_names: "Parent/Guardian(s)",
    teacher_name: "Teacher's name", teacher_email: "Teacher's email", private_link: "Private link",
    shared_phone: "Shared phone number",
    amount: "Amount", payee: "Payee", check_number: "Check #", status: "Status",
    issued_on: "Written", handed_out_on: "Handed out", cleared_on: "Cashed (bank date)",
    confirmed_on: "Confirmed on statement", replaces: "Replaces", note: "Note", deleted: "Deleted",
  };

  var state = {
    apps: [],
    search: "",
    scholarship: "",
    status: "",
    rec: "",
    check: "",
    sortKey: "created_at",
    sortDir: -1, // newest first
  };

  // The application open in the detail view, and its most recent API payload.
  var detail = { id: null, data: null, score: null };

  document.addEventListener("DOMContentLoaded", function () {
    loginView = document.getElementById("login-view");
    listView = document.getElementById("list-view");
    detailView = document.getElementById("detail-view");

    document.getElementById("login-form").addEventListener("submit", onLogin);

    var pwToggle = document.getElementById("pw-toggle");
    if (pwToggle) {
      pwToggle.addEventListener("click", function () {
        var input = document.getElementById("admin-password");
        var reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        pwToggle.textContent = reveal ? "Hide" : "Show";
        pwToggle.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        pwToggle.setAttribute("aria-pressed", reveal ? "true" : "false");
        input.focus();
      });
    }
    document.getElementById("back-link").addEventListener("click", function (e) {
      e.preventDefault(); loadApplications(false);
    });
    document.getElementById("logout-link").addEventListener("click", function (e) {
      e.preventDefault();
      fetch("/api/admin/logout", { method: "POST" }).finally(function () { location.reload(); });
    });

    document.getElementById("filter-search").addEventListener("input", function (e) {
      state.search = e.target.value.toLowerCase(); renderList();
    });
    ["scholarship", "status", "rec", "check"].forEach(function (key) {
      document.getElementById("filter-" + key).addEventListener("change", function (e) {
        state[key] = e.target.value; renderList();
      });
    });
    document.querySelectorAll("th.sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var key = th.getAttribute("data-sort");
        if (state.sortKey === key) { state.sortDir = -state.sortDir; }
        else { state.sortKey = key; state.sortDir = key === "created_at" ? -1 : 1; }
        renderList();
      });
    });
    document.getElementById("sort-mobile").addEventListener("change", function (e) {
      var parts = e.target.value.split(":");
      state.sortKey = parts[0]; state.sortDir = parseInt(parts[1], 10);
      renderList();
    });

    // Probe auth state by attempting to load the list.
    loadApplications(true);
  });

  function show(el) { el.style.display = "block"; }
  function hide(el) { el.style.display = "none"; }
  function hideAll() { hide(loginView); hide(listView); hide(detailView); }

  function onLogin(e) {
    e.preventDefault();
    var msg = document.getElementById("login-message");
    var btn = document.getElementById("login-btn");
    msg.className = "form-message";
    btn.classList.add("disabled"); btn.textContent = "Logging in…";
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("admin-password").value }),
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        btn.classList.remove("disabled"); btn.textContent = "Log In";
        if (res.ok && res.body.ok) { loadApplications(false); }
        else { msg.className = "form-message error"; msg.textContent = res.body.error || "Login failed."; }
      })
      .catch(function () {
        btn.classList.remove("disabled"); btn.textContent = "Log In";
        msg.className = "form-message error"; msg.textContent = "Network error.";
      });
  }

  function loadApplications(silent) {
    fetch("/api/admin/applications")
      .then(function (r) {
        if (r.status === 401) { hideAll(); show(loginView); return null; }
        return r.json();
      })
      .then(function (body) {
        if (!body) return;
        document.getElementById("logout-link").style.display = "inline";
        state.apps = body.applications || [];
        detail.id = null;
        renderStats();
        renderList();
        hideAll(); show(listView);
      })
      .catch(function () { if (!silent) { hideAll(); show(loginView); } });
  }

  /* ---------- Stats ---------- */

  function renderStats() {
    var apps = state.apps;
    var count = function (fn) { return apps.filter(fn).length; };
    var stats = [
      [apps.length, "Applications"],
      [count(function (a) { return a.scholarship === "ag"; }), "Ag"],
      [count(function (a) { return a.scholarship === "memorial"; }), "Memorial"],
      [count(function (a) { return a.rec_status !== "submitted"; }), "Awaiting Rec"],
      [count(function (a) { return a.status === "submitted"; }), "Not Yet Reviewed"],
      [count(function (a) { return a.status === "awarded"; }), "Awarded"],
      [count(function (a) { return a.outstanding_cents > 0; }), "Checks Not Cashed"],
    ];
    document.getElementById("stat-row").innerHTML = stats.map(function (s) {
      return "<div class='stat'><div class='num'>" + s[0] + "</div><div class='lbl'>" + s[1] + "</div></div>";
    }).join("");
  }

  /* ---------- List ---------- */

  function requestFailed(a) {
    return a.rec_status !== "submitted" && a.last_request_outcome === "failed";
  }

  function visibleApps() {
    var apps = state.apps.filter(function (a) {
      if (state.scholarship && a.scholarship !== state.scholarship) return false;
      if (state.status && a.status !== state.status) return false;
      if (state.rec === "submitted" && a.rec_status !== "submitted") return false;
      if (state.rec === "pending" && a.rec_status === "submitted") return false;
      if (state.rec === "failed" && !requestFailed(a)) return false;
      if (state.check === "shared_phone") { if (!a.shared_phone) return false; }
      else if (state.check && a.check_state !== state.check) return false;
      if (state.search) {
        var hay = [a.full_name, a.email, a.high_school, a.college, a.major, a.parent_names]
          .join(" ").toLowerCase();
        if (hay.indexOf(state.search) === -1) return false;
      }
      return true;
    });

    var key = state.sortKey, dir = state.sortDir;
    apps.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (key === "gpa" || key === "score") {
        av = av == null || av === "" ? -1 : parseFloat(av);
        bv = bv == null || bv === "" ? -1 : parseFloat(bv);
        if (isNaN(av)) av = -1; if (isNaN(bv)) bv = -1;
        return (av - bv) * dir;
      }
      av = String(av == null ? "" : av).toLowerCase();
      bv = String(bv == null ? "" : bv).toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return apps;
  }

  function scorePips(score) {
    if (!score) return "<span class='subtle'>—</span>";
    var out = "";
    for (var i = 1; i <= 5; i++) out += i <= score ? "●" : "<span class='off'>●</span>";
    return "<span class='score-pips'>" + out + "</span>";
  }

  function statusBadge(status) {
    return "<span class='badge st-" + esc(status) + "'>" + esc(STATUS_LABELS[status] || status) + "</span>";
  }

  function checkLine(a) {
    if (!a.check_state || a.check_state === "none") return "";
    var text = a.check_state === "outstanding" && a.check_status_label
      ? a.check_status_label : CHECK_STATE_LABELS[a.check_state];
    return "<div class='subtle ck-line ck-" + esc(a.check_state) + "'>Check: " + esc(text) + "</div>";
  }

  function renderList() {
    var apps = visibleApps();
    var body = document.getElementById("list-body");
    var empty = document.getElementById("list-empty");
    body.innerHTML = "";
    empty.style.display = apps.length ? "none" : "block";

    var summary = "Showing " + apps.length + " of " + state.apps.length + " application" +
      (state.apps.length === 1 ? "" : "s") + ".";
    var outstanding = apps.reduce(function (sum, a) { return sum + (a.outstanding_cents || 0); }, 0);
    if (state.check && outstanding) {
      summary += " " + fmtMoney(outstanding) + " in checks not cashed yet (replaced checks aren't counted).";
    }
    document.getElementById("list-summary").textContent = summary;

    apps.forEach(function (a) {
      var tr = document.createElement("tr");
      var recBadge = a.rec_status === "submitted"
        ? '<span class="badge submitted">Received</span>'
        : requestFailed(a)
          ? '<span class="badge failed">Request failed</span>'
          : '<span class="badge pending">Awaiting teacher</span>';
      tr.innerHTML =
        "<td><strong>" + esc(a.full_name) + "</strong>" +
          (a.shared_phone ? " <span class='badge flag'>Shared phone</span>" : "") +
          "<div class='subtle'>" + esc(a.email) + "</div></td>" +
        "<td>" + esc(a.high_school || "—") + "<div class='subtle'>" + esc(a.college || "") + "</div></td>" +
        "<td>" + (a.scholarship === "ag" ? "Ag" : "Memorial") + "</td>" +
        "<td>" + esc(a.gpa || "—") + "</td>" +
        "<td>" + fmtDate(a.created_at, true) + "</td>" +
        "<td>" + recBadge + "</td>" +
        "<td>" + statusBadge(a.status) + checkLine(a) + "</td>" +
        "<td>" + scorePips(a.score) + "</td>";
      tr.addEventListener("click", function () { loadDetail(a.id); });
      body.appendChild(tr);
    });
  }

  /* ---------- Detail ---------- */

  var GENERAL_FIELDS = [
    ["full_name", "Name"], ["email", "Email"], ["phone", "Phone"], ["address", "Address"],
    ["high_school", "High School"], ["college", "College Accepted At"],
    ["date_accepted", "Date Accepted"], ["major", "Major"], ["parent_names", "Parent/Guardian(s)"],
  ];
  var ACADEMIC_FIELDS = [
    ["gpa", "GPA"], ["act_sat", "ACT/SAT"], ["class_rank", "Class Rank"], ["class_size", "Class Size"],
    ["awards", "Awards/Honors"], ["activities", "Clubs/Activities"],
  ];

  function loadDetail(id) {
    fetch("/api/admin/application/" + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body.ok) return;
        detail.id = id;
        detail.score = body.application.score || null;
        renderDetail(body);
        hideAll(); show(detailView);
        window.scrollTo(0, 0);
      });
  }

  // Re-fetch after an action without losing the reader's place or anything they
  // have typed into the Board Review panel but not saved yet.
  function reloadDetail(afterRender) {
    var y = window.scrollY;
    var statusEl = document.getElementById("review-status");
    var notesEl = document.getElementById("review-notes");
    var kept = statusEl && notesEl
      ? { status: statusEl.value, notes: notesEl.value, score: detail.score } : null;
    return fetch("/api/admin/application/" + encodeURIComponent(detail.id))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body.ok) return;
        renderDetail(body);
        if (kept) {
          document.getElementById("review-status").value = kept.status;
          document.getElementById("review-notes").value = kept.notes;
          setScore(kept.score);
        }
        window.scrollTo(0, y);
        if (afterRender) afterRender();
      });
  }

  function renderDetail(data) {
    detail.data = data;
    var a = data.application;
    var html =
      "<div class='detail-head'>" +
        "<div><h2>" + esc(a.full_name) + "</h2>" +
        "<p class='meta'>" + esc(data.scholarship_label) + " &middot; submitted " + fmtDate(a.created_at) + "</p></div>" +
        "<div class='actions'><button type='button' class='btn ghost small' id='print-btn'>Print</button></div>" +
      "</div>";

    html += "<div class='detail-cols'><div>";
    html += phoneNotice(data);
    html += "<div class='panel' id='general-panel'>" + generalView(data) + "</div>";

    html += "<div class='panel'><h3>Academic</h3><dl class='detail-grid'>";
    ACADEMIC_FIELDS.forEach(function (f) {
      html += "<dt>" + f[1] + "</dt><dd>" + (a[f[0]] ? esc(a[f[0]]) : "—") + "</dd>";
    });
    html += "</dl></div>";

    // Documents
    html += "<div class='panel'><h3>Documents</h3><div class='file-links'>";
    html += fileLink(a.transcript_key, "Transcript");
    html += fileLink(a.essay_key, "Essay");
    html += fileLink(a.applicant_sig_key, "Applicant Signature");
    html += fileLink(a.parent_sig_key, "Parent Signature");
    html += "</div></div>";

    html += "<div class='panel' id='rec-panel'>" + recommendationPanel(data) + "</div>";
    html += emailHistoryPanel(data);
    html += changeHistoryPanel(data);

    html += "</div>"; // end left column

    // Right column: review, then the check.
    html += "<div><div class='panel review-panel'>" +
      "<h3>Board Review</h3>" +
      "<label for='review-status'>Status</label>" +
      "<select id='review-status'>" +
        Object.keys(STATUS_LABELS).map(function (s) {
          return "<option value='" + s + "'" + (a.status === s ? " selected" : "") + ">" + STATUS_LABELS[s] + "</option>";
        }).join("") +
      "</select>" +
      // A plain <label> would name nothing here — the score is a row of buttons.
      "<span class='field-label' id='review-score-label'>Score</span>" +
      "<div class='score-picker' id='score-picker' role='group' aria-labelledby='review-score-label'>" +
        [1, 2, 3, 4, 5].map(function (n) {
          return "<button type='button' data-score='" + n + "'" +
            (a.score >= n ? " class='on'" : "") + " aria-label='Score " + n + "'>●</button>";
        }).join("") +
        "<button type='button' data-score='' class='btn ghost small no-print' style='margin-left:0.5rem'>Clear</button>" +
      "</div>" +
      "<label for='review-notes'>Board Notes</label>" +
      "<textarea id='review-notes' placeholder='Shared notes for the board — impressions, follow-ups, decisions.'>" +
        esc(a.board_notes || "") + "</textarea>" +
      "<footer class='controls no-print' style='margin-top:0.9em'>" +
        "<button type='button' class='btn small' id='save-review'>Save Review</button>" +
      "</footer>" +
      "<p class='save-note' id='save-note'></p>" +
    "</div>" +
    "<div class='panel check-panel' id='check-panel'>" + checkPanel(data) + "</div>" +
    "</div>";

    html += "</div>"; // end detail-cols

    document.getElementById("detail-content").innerHTML = html;

    wireReviewPanel(a);
    wirePhoneNotice(data);
    wireGeneralPanel(data);
    wireRecommendationPanel(data);
    wireCheckPanel(data);
  }

  function wireReviewPanel(a) {
    var saveNote = document.getElementById("save-note");

    document.getElementById("print-btn").addEventListener("click", function () { window.print(); });

    document.getElementById("score-picker").querySelectorAll("button[data-score]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-score");
        setScore(v === "" ? null : parseInt(v, 10));
      });
    });

    document.getElementById("save-review").addEventListener("click", function () {
      var btn = this;
      btn.classList.add("disabled"); btn.textContent = "Saving…";
      saveNote.className = "save-note"; saveNote.textContent = "";
      send("PATCH", "/api/admin/application/" + encodeURIComponent(a.id), {
        status: document.getElementById("review-status").value,
        score: detail.score,
        board_notes: document.getElementById("review-notes").value,
      }).then(function (res) {
        btn.classList.remove("disabled"); btn.textContent = "Save Review";
        if (res.ok) {
          a.status = document.getElementById("review-status").value;
          saveNote.className = "save-note saved";
          saveNote.textContent = "Saved " + new Date().toLocaleTimeString() + ".";
          // Awarding changes what the check panel should say.
          document.getElementById("check-panel").innerHTML = checkPanel(detail.data);
          wireCheckPanel(detail.data);
        } else {
          saveNote.textContent = res.error || "Could not save. Please try again.";
        }
      });
    });
  }

  function setScore(score) {
    detail.score = score;
    var picker = document.getElementById("score-picker");
    if (!picker) return;
    picker.querySelectorAll("button[data-score]").forEach(function (b) {
      var n = parseInt(b.getAttribute("data-score"), 10);
      if (!isNaN(n)) b.classList.toggle("on", score !== null && n <= score);
    });
  }

  /* ----- Shared phone number ----- */

  function phoneNotice(data) {
    var matches = data.phone_matches || [];
    if (!matches.length) return "";
    var list = matches.map(function (m) {
      return "<li><a href='#' class='open-app' data-id='" + esc(m.id) + "'>" + esc(m.full_name) + "</a> — " +
        esc(m.scholarship_label) + ", submitted " + fmtDate(m.created_at, true) + "</li>";
    }).join("");
    if (!data.phone_needs_review) {
      return "<p class='alert-box quiet no-print'>Shares a phone number with " +
        matches.map(function (m) { return esc(m.full_name); }).join(", ") +
        " — the board confirmed they're different students.</p>";
    }
    return "<div class='alert-box no-print' id='phone-notice'>" +
      "<p><strong>Another application this season has the same phone number.</strong></p>" +
      "<ul>" + list + "</ul>" +
      "<p>Brothers and sisters often share a family phone, so both applications were accepted. " +
        "If this is the same student applying twice, keep the first application and mark the later one " +
        "<em>Not awarded</em> with a note.</p>" +
      "<div class='button-row'><button type='button' class='btn small' id='phone-ok'>They're different students</button></div>" +
      "<p class='save-note' id='phone-note' role='status'></p>" +
    "</div>";
  }

  function wirePhoneNotice(data) {
    document.querySelectorAll(".open-app").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault(); loadDetail(link.getAttribute("data-id"));
      });
    });
    var btn = document.getElementById("phone-ok");
    if (!btn) return;
    btn.addEventListener("click", function () {
      busy(btn, "Saving…");
      send("POST", appUrl("phone-reviewed"), {}).then(function (res) {
        if (res.ok) { reloadDetail(); return; }
        idle(btn);
        document.getElementById("phone-note").textContent = res.error || "Could not save.";
      });
    });
  }

  /* ----- General details (view + correction form) ----- */

  function generalView(data) {
    var a = data.application;
    var original = data.original_values || {};
    var html = "<h3>General</h3>" +
      "<button type='button' class='btn ghost small panel-action no-print' id='edit-general'>Edit</button>" +
      "<p class='save-note saved' id='general-note' role='status'></p>" +
      "<dl class='detail-grid'>";
    GENERAL_FIELDS.forEach(function (f) {
      if (f[0] === "full_name") return; // already the page heading
      html += "<dt>" + f[1] + "</dt><dd>" + (a[f[0]] ? esc(a[f[0]]) : "—") + wasLine(original, f[0]) + "</dd>";
    });
    if (original.full_name !== undefined) {
      html += "<dt>Name</dt><dd>" + esc(a.full_name) + wasLine(original, "full_name") + "</dd>";
    }
    return html + "</dl>";
  }

  function wasLine(original, field) {
    if (!(field in original)) return "";
    return "<div class='was'>Corrected — originally submitted as: " +
      (original[field] ? esc(original[field]) : "<em>blank</em>") + "</div>";
  }

  function generalForm(data) {
    var a = data.application;
    var html = "<h3>Correct Details</h3>" +
      "<p class='hint'>Saving doesn't email anyone. The original answers stay in the change history.</p>" +
      "<form class='edit-form' id='general-form' novalidate>";
    GENERAL_FIELDS.forEach(function (f) {
      var tag = f[0] === "address" ? "textarea" : "input";
      html += "<div class='edit-field'>" + label("g-" + f[0], f[1]) +
        (tag === "textarea"
          ? "<textarea id='g-" + f[0] + "' name='" + f[0] + "' rows='2'>" + esc(a[f[0]] || "") + "</textarea>"
          : "<input id='g-" + f[0] + "' name='" + f[0] + "' type='" + (f[0] === "email" ? "email" : "text") +
            "' value='" + esc(a[f[0]] || "") + "'>") +
        errorSlot("g-" + f[0]) + "</div>";
    });
    html += "<div class='edit-field'>" + label("g-reason", "Reason for the change (optional)") +
      "<input id='g-reason' name='reason' type='text' placeholder='e.g. Student emailed a new address'></div>" +
      "<div class='button-row'><button type='submit' class='btn small'>Save Changes</button>" +
      "<button type='button' class='btn ghost small' id='general-cancel'>Cancel</button></div>" +
      "<p class='save-note' id='general-form-note' role='status'></p></form>";
    return html;
  }

  function wireGeneralPanel(data) {
    var panel = document.getElementById("general-panel");
    var edit = document.getElementById("edit-general");
    if (!edit) return;
    edit.addEventListener("click", function () {
      panel.innerHTML = generalForm(data);
      var form = document.getElementById("general-form");
      document.getElementById("g-full_name").focus();
      document.getElementById("general-cancel").addEventListener("click", function () {
        panel.innerHTML = generalView(data); wireGeneralPanel(data);
      });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var fields = {};
        GENERAL_FIELDS.forEach(function (f) { fields[f[0]] = document.getElementById("g-" + f[0]).value; });
        var btn = form.querySelector("button[type=submit]");
        clearErrors(form);
        busy(btn, "Saving…");
        send("POST", appUrl("details"), {
          fields: fields, reason: document.getElementById("g-reason").value,
        }).then(function (res) {
          idle(btn);
          if (res.ok) {
            reloadDetail(function () {
              var note = document.getElementById("general-note");
              note.textContent = "Saved. No email was sent.";
            });
            return;
          }
          showErrors(form, "g-", res, document.getElementById("general-form-note"));
        });
      });
    });
  }

  /* ----- Teacher recommendation ----- */

  function recommendationPanel(data) {
    var r = data.recommendation;
    var html = "<h3>Teacher Recommendation</h3>";
    if (!r) return html + "<p>—</p>";

    var emails = data.emails || [];
    if (r.status === "submitted") {
      html += "<p>From <strong>" + esc(r.teacher_name) + "</strong> (" + esc(r.teacher_email) + ") &middot; " +
        fmtDate(r.submitted_at) + "</p>";
      if (r.rec_text) html += "<div class='rec-quote'>" + esc(r.rec_text) + "</div>";
      if (r.rec_file_key) html += "<div class='file-links' style='margin-top:0.8rem'>" + fileLink(r.rec_file_key, "Recommendation File") + "</div>";
      var told = emails.filter(function (e) { return e.kind === "applicant_recommendation_received"; })[0];
      if (told) {
        html += "<p class='subtle no-print' style='margin-top:0.8rem'>Student notified " + fmtDate(told.created_at) +
          " — " + outcomeBadge(told) + "</p>";
      }
      return html;
    }

    var requests = emails.filter(function (e) { return e.kind === "teacher_request"; });
    var last = requests[0];
    html += "<p>Requested from <strong>" + esc(r.teacher_name) + "</strong> (" + esc(r.teacher_email) +
      ") — <span class='badge pending'>awaiting response</span></p>";

    if (last && last.outcome === "failed") {
      html += "<div class='alert-box error no-print'><strong>The last request didn't send.</strong> " +
        "This usually means the address is mistyped. Check it, correct it if needed, then send again." +
        (last.error ? "<div class='subtle'>" + esc(last.error) + "</div>" : "") + "</div>";
    }

    html += "<div class='no-print'>";
    if (requests.length) {
      html += "<p class='field-label'>Request emails</p><ul class='history-list compact'>" +
        requests.map(function (e) {
          return "<li>" + fmtDate(e.created_at) + " to " + esc(e.recipients || "—") + " " + outcomeBadge(e) + "</li>";
        }).join("") + "</ul>";
    } else {
      html += "<p class='subtle'>No request email is on record. (Applications submitted before the email history " +
        "existed won't show one.)</p>";
    }
    html += "<div class='button-row'>" +
        "<button type='button' class='btn small' id='resend-request'>Email the request to " + esc(r.teacher_email) + "</button>" +
        "<button type='button' class='btn ghost small' id='edit-teacher'>Change teacher</button>" +
        (r.link ? "<button type='button' class='btn ghost small' id='copy-rec-link'>Copy private link</button>" : "") +
      "</div>" +
      "<p class='save-note' id='rec-note' role='status'></p>" +
      "<div id='teacher-form-wrap'></div>" +
    "</div>";
    return html;
  }

  function wireRecommendationPanel(data) {
    var r = data.recommendation;
    if (!r || r.status === "submitted") return;
    var note = document.getElementById("rec-note");

    var copyBtn = document.getElementById("copy-rec-link");
    if (copyBtn && r.link) {
      copyBtn.addEventListener("click", function () {
        navigator.clipboard.writeText(r.link).then(function () {
          note.className = "save-note saved"; note.textContent = "Link copied. Anyone with it can submit the recommendation.";
        }, function () {
          note.className = "save-note"; note.textContent = r.link;
        });
      });
    }

    var resend = document.getElementById("resend-request");
    resend.addEventListener("click", function () {
      busy(resend, "Sending…");
      note.className = "save-note"; note.textContent = "";
      send("POST", appUrl("resend-request"), {}).then(function (res) {
        if (res.ok) {
          reloadDetail(function () {
            var n = document.getElementById("rec-note");
            n.className = "save-note saved";
            n.textContent = res.body.outcome === "logged"
              ? "Test mode: the email was logged, not sent."
              : "Sent to " + res.body.recipient + ".";
          });
          return;
        }
        idle(resend);
        if (res.body && res.body.recent_at) {
          note.textContent = "A request already went out at " + new Date(res.body.recent_at).toLocaleTimeString() +
            ". To avoid emailing the teacher twice by accident, wait two minutes before sending another.";
        } else {
          // A failure is recorded too, so refresh to show it in the list.
          var message = res.error || "Could not send.";
          reloadDetail(function () {
            var n = document.getElementById("rec-note");
            n.className = "save-note"; n.textContent = message;
          });
        }
      });
    });

    document.getElementById("edit-teacher").addEventListener("click", function () {
      var wrap = document.getElementById("teacher-form-wrap");
      wrap.innerHTML =
        "<form class='edit-form' id='teacher-form' novalidate>" +
          "<p class='hint'>Saving doesn't email anyone. If you change the email address, the old private link " +
          "stops working — send the request again afterwards.</p>" +
          "<div class='edit-field'>" + label("t-teacher_name", "Teacher's name") +
            "<input id='t-teacher_name' type='text' value='" + esc(r.teacher_name) + "'>" + errorSlot("t-teacher_name") + "</div>" +
          "<div class='edit-field'>" + label("t-teacher_email", "Teacher's email") +
            "<input id='t-teacher_email' type='email' value='" + esc(r.teacher_email) + "'>" + errorSlot("t-teacher_email") + "</div>" +
          "<div class='edit-field'>" + label("t-reason", "Reason for the change (optional)") +
            "<input id='t-reason' type='text' placeholder='e.g. Student gave the wrong email'></div>" +
          "<div class='button-row'><button type='submit' class='btn small'>Save Teacher</button>" +
          "<button type='button' class='btn ghost small' id='teacher-cancel'>Cancel</button></div>" +
          "<p class='save-note' id='teacher-form-note' role='status'></p>" +
        "</form>";
      var form = document.getElementById("teacher-form");
      document.getElementById("t-teacher_name").focus();
      document.getElementById("teacher-cancel").addEventListener("click", function () { wrap.innerHTML = ""; });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var btn = form.querySelector("button[type=submit]");
        clearErrors(form);
        busy(btn, "Saving…");
        send("POST", appUrl("teacher"), {
          teacher_name: document.getElementById("t-teacher_name").value,
          teacher_email: document.getElementById("t-teacher_email").value,
          reason: document.getElementById("t-reason").value,
        }).then(function (res) {
          idle(btn);
          if (res.ok) {
            reloadDetail(function () {
              var n = document.getElementById("rec-note");
              n.className = "save-note saved";
              n.textContent = res.body.link_replaced
                ? "Saved. The old link no longer works, and the new teacher hasn't been emailed yet."
                : "Saved. No email was sent.";
            });
            return;
          }
          showErrors(form, "t-", res, document.getElementById("teacher-form-note"));
        });
      });
    });
  }

  /* ----- Email and change history ----- */

  function outcomeBadge(e) {
    var o = EMAIL_OUTCOMES[e.outcome] || [e.outcome, "pending", ""];
    return "<span class='badge " + o[1] + "' title='" + esc(o[2]) + "'>" + esc(o[0]) + "</span>";
  }

  function emailHistoryPanel(data) {
    var emails = data.emails || [];
    var html = "<details class='panel history-panel no-print'><summary><h3>Email History <span class='subtle'>(" +
      emails.length + ")</span></h3></summary>";
    if (!emails.length) {
      html += "<p class='subtle'>No emails recorded for this application yet.</p>";
    } else {
      html += "<p class='hint'>“Sent” means the email service accepted the message. It can't tell us whether it " +
        "reached the inbox or the spam folder.</p><ul class='history-list'>" +
        emails.map(function (e) {
          return "<li><div><strong>" + esc(EMAIL_KIND_LABELS[e.kind] || e.kind) + "</strong> " + outcomeBadge(e) + "</div>" +
            "<div class='subtle'>" + fmtDate(e.created_at) + " · to " + esc(e.recipients || "—") + "</div>" +
            (e.error ? "<div class='subtle error-text'>" + esc(e.error) + "</div>" : "") + "</li>";
        }).join("") + "</ul>";
    }
    return html + "</details>";
  }

  function changeHistoryPanel(data) {
    var changes = data.changes || [];
    if (!changes.length) return "";
    var checks = data.checks || [];
    var html = "<details class='panel history-panel no-print'><summary><h3>Change History <span class='subtle'>(" +
      changes.length + ")</span></h3></summary><ul class='history-list'>";
    changes.forEach(function (entry) {
      html += "<li><div><strong>" + esc(changeTitle(entry, checks)) + "</strong></div>" +
        "<div class='subtle'>" + fmtDate(entry.created_at) + "</div><ul class='diff'>" +
        entry.changes.map(function (c) {
          if (c.field === "deleted") return "";
          return "<li>" + esc(FIELD_LABELS[c.field] || c.field) + ": " +
            (c.before ? "<s>" + esc(c.before) + "</s> → " : "") +
            (c.after ? esc(c.after) : "<em>blank</em>") + "</li>";
        }).join("") + "</ul>" +
        (entry.reason ? "<div class='subtle'>Reason: " + esc(entry.reason) + "</div>" : "") + "</li>";
    });
    return html + "</ul></details>";
  }

  function changeTitle(entry, checks) {
    if (entry.entity === "application") {
      return entry.changes.length === 1 && entry.changes[0].field === "shared_phone"
        ? "Shared phone number reviewed" : "Details corrected";
    }
    if (entry.entity === "recommendation") return "Teacher changed";
    var deleted = entry.changes.some(function (c) { return c.field === "deleted"; });
    var created = entry.changes.every(function (c) { return c.before === null; });
    var check = checks.filter(function (c) { return c.id === entry.entity_id; })[0];
    var name = check && check.check_number ? "Check #" + check.check_number : "Check";
    return deleted ? "Check deleted" : created ? name + " recorded" : name + " updated";
  }

  /* ----- Scholarship check ----- */

  function checkPanel(data) {
    var a = data.application;
    var checks = (data.checks || []).slice().reverse(); // newest first
    var s = data.check_summary;
    var labels = data.check_status_labels || {};
    var html = "<h3>Scholarship Check</h3>";

    // The summary is computed server-side against the saved status; an award
    // saved in this view moments ago is reflected by a.status here.
    if (!checks.length) {
      html += a.status === "awarded"
        ? "<p><span class='badge failed'>Needs a check</span> Awarded, and no check is recorded yet.</p>"
        : "<p class='subtle'>No check recorded. Record one once this application is awarded.</p>";
    } else if (s.state === "follow_up") {
      html += "<div class='alert-box error'><strong>Needs follow-up</strong><ul>" +
        s.follow_up.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul></div>";
    } else if (s.state === "cleared") {
      html += "<p><span class='badge submitted'>Cashed</span></p>";
    } else if (s.current) {
      html += "<p><span class='badge pending'>" + esc(labels[s.current.status] || s.current.status) +
        "</span> Not cashed yet.</p>";
    }

    var replacedBy = {};
    (data.checks || []).forEach(function (c) { if (c.replaces_check_id) replacedBy[c.replaces_check_id] = c; });
    var byId = {};
    (data.checks || []).forEach(function (c) { byId[c.id] = c; });

    checks.forEach(function (c) {
      var isCurrent = s.current && s.current.id === c.id;
      html += "<div class='check-card" + (replacedBy[c.id] ? " replaced" : "") + "'>" +
        "<div class='check-head'><strong>" + (c.check_number ? "Check #" + esc(c.check_number) : "Check (no number)") +
          "</strong> <span>" + fmtMoney(c.amount_cents) + "</span> " +
          "<span class='badge ck-" + esc(c.status) + "'>" + esc(labels[c.status] || c.status) + "</span></div>" +
        "<dl class='check-grid'>" +
          dtdd("Payee", c.payee) +
          dtdd("Written", fmtDay(c.issued_on)) +
          dtdd("Handed out", fmtDay(c.handed_out_on)) +
          dtdd("Cashed (bank date)", fmtDay(c.cleared_on)) +
          dtdd("Confirmed on statement", fmtDay(c.confirmed_on)) +
          (c.replaces_check_id ? dtdd("Replaces", checkName(byId[c.replaces_check_id])) : "") +
          (replacedBy[c.id] ? dtdd("Replaced by", checkName(replacedBy[c.id])) : "") +
          dtdd("Note", c.note) +
        "</dl>" +
        (replacedBy[c.id] ? "<p class='subtle'>Replaced — not counted toward what's outstanding.</p>" : "") +
        (c.status === "handed_out" && !replacedBy[c.id] ? reminderInfo(data) : "") +
        "<div class='button-row no-print'>" +
          (c.status === "handed_out" && !replacedBy[c.id]
            ? "<button type='button' class='btn small remind-check' data-id='" + esc(c.id) + "'>Send cash-the-check reminder</button>"
            : "") +
          "<button type='button' class='btn ghost small edit-check' data-id='" + esc(c.id) + "'>Update</button>" +
          (isCurrent && (c.status === "lost" || c.status === "void")
            ? "<button type='button' class='btn small replace-check' data-id='" + esc(c.id) + "'>Record replacement check</button>"
            : "") +
        "</div>" +
        "<div class='check-form-wrap' id='check-form-" + esc(c.id) + "'></div>" +
      "</div>";
    });

    html += "<div class='no-print'>" +
      "<div class='button-row'><button type='button' class='btn " + (checks.length ? "ghost " : "") +
        "small' id='new-check'>Record a check</button></div>" +
      "<div class='check-form-wrap' id='check-form-new'></div>" +
      "<p class='save-note saved' id='check-note' role='status'></p>" +
    "</div>";
    return html;
  }

  // Who a reminder goes to, and when earlier ones went out, so nobody sends a
  // second one without knowing about the first.
  function reminderInfo(data) {
    var sent = (data.emails || []).filter(function (e) { return e.kind === "check_reminder"; });
    return "<div class='reminder-info no-print'><span class='subtle'>A reminder goes to " +
      esc(data.application.email) + ".</span>" +
      (sent.length
        ? "<ul class='history-list compact'>" + sent.map(function (e) {
            return "<li>Reminder " + fmtDate(e.created_at) + " " + outcomeBadge(e) + "</li>";
          }).join("") + "</ul>"
        : "<div class='subtle'>No reminder sent yet.</div>") +
    "</div>";
  }

  function checkName(c) {
    if (!c) return "—";
    return c.check_number ? "#" + c.check_number : "check with no number";
  }

  function wireCheckPanel(data) {
    var byId = {};
    (data.checks || []).forEach(function (c) { byId[c.id] = c; });

    document.getElementById("new-check").addEventListener("click", function () {
      openCheckForm(data, "check-form-new", null, null);
    });
    document.querySelectorAll(".edit-check").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = byId[btn.getAttribute("data-id")];
        openCheckForm(data, "check-form-" + c.id, c, null);
      });
    });
    document.querySelectorAll(".replace-check").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openCheckForm(data, "check-form-new", null, byId[btn.getAttribute("data-id")]);
      });
    });
    document.querySelectorAll(".remind-check").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var c = byId[btn.getAttribute("data-id")];
        var a = data.application;
        if (!window.confirm("Email " + a.full_name + " at " + a.email + " a reminder to cash " +
          (c.check_number ? "check #" + c.check_number : "their check") + "?")) return;
        busy(btn, "Sending…");
        send("POST", "/api/admin/checks/" + encodeURIComponent(c.id) + "/reminder", {}).then(function (res) {
          var message = res.ok
            ? (res.body.outcome === "logged" ? "Test mode: the reminder was logged, not sent." : "Reminder sent to " + res.body.recipient + ".")
            : res.body && res.body.recent_at
              ? "A reminder already went out at " + new Date(res.body.recent_at).toLocaleTimeString() + "."
              : res.error || "Could not send the reminder.";
          // Reload either way: a failure is recorded in the email history too.
          reloadDetail(function () {
            var note = document.getElementById("check-note");
            note.className = res.ok ? "save-note saved" : "save-note";
            note.textContent = message;
          });
        });
      });
    });
  }

  // One form for recording, updating, and replacing a check.
  function openCheckForm(data, wrapId, check, replacing) {
    document.querySelectorAll(".check-form-wrap").forEach(function (w) { w.innerHTML = ""; });
    var wrap = document.getElementById(wrapId);
    var labels = data.check_status_labels || {};
    var a = data.application;
    var editing = !!check;
    var v = check || {
      amount_cents: replacing ? replacing.amount_cents : 150000,
      payee: replacing ? replacing.payee : a.full_name,
      status: "issued",
      replaces_check_id: replacing ? replacing.id : null,
    };
    var others = (data.checks || []).filter(function (c) { return !check || c.id !== check.id; });

    var html = "<form class='edit-form' id='check-form' novalidate>" +
      (replacing ? "<p class='hint'>Recording a replacement for " + esc(checkName(replacing)) +
        ". The old check stays on record. Marking a check lost or voided here doesn't contact the bank.</p>" : "") +
      "<div class='edit-grid'>" +
        "<div class='edit-field'>" + label("c-check_number", "Check #") +
          "<input id='c-check_number' type='text' value='" + esc(v.check_number || "") + "'>" + errorSlot("c-check_number") + "</div>" +
        "<div class='edit-field'>" + label("c-amount", "Amount ($)") +
          "<input id='c-amount' type='text' inputmode='decimal' value='" + esc((v.amount_cents / 100).toFixed(2)) + "'>" + errorSlot("c-amount") + "</div>" +
      "</div>" +
      "<div class='edit-field'>" + label("c-payee", "Payee") +
        "<input id='c-payee' type='text' value='" + esc(v.payee || "") + "'></div>" +
      "<div class='edit-field'>" + label("c-status", "Status") +
        "<select id='c-status'>" + CHECK_STATUS_ORDER.map(function (st) {
          return "<option value='" + st + "'" + (v.status === st ? " selected" : "") + ">" + esc(labels[st] || st) + "</option>";
        }).join("") + "</select>" + errorSlot("c-status") + "</div>" +
      "<p class='hint'>Dates are optional. Leave a date blank rather than guessing.</p>" +
      "<div class='edit-grid'>" +
        dateField("issued_on", "Date written", v.issued_on) +
        dateField("handed_out_on", "Date handed out", v.handed_out_on) +
        dateField("cleared_on", "Date cashed (bank date, if known)", v.cleared_on) +
        dateField("confirmed_on", "Date you saw it on a statement", v.confirmed_on) +
      "</div>" +
      (others.length
        ? "<div class='edit-field'>" + label("c-replaces_check_id", "Replaces") +
            "<select id='c-replaces_check_id'><option value=''>Nothing — this is the first check</option>" +
            others.map(function (o) {
              return "<option value='" + esc(o.id) + "'" + (v.replaces_check_id === o.id ? " selected" : "") + ">" +
                esc(checkName(o)) + " (" + esc(labels[o.status] || o.status) + ")</option>";
            }).join("") + "</select>" + errorSlot("c-replaces_check_id") + "</div>"
        : "") +
      "<div class='edit-field'>" + label("c-note", "Note (optional)") +
        "<textarea id='c-note' rows='2'>" + esc(v.note || "") + "</textarea></div>" +
      (editing
        ? "<div class='edit-field'>" + label("c-reason", "Reason for the change (optional)") +
            "<input id='c-reason' type='text' placeholder='e.g. Marked cashed by mistake'></div>"
        : "") +
      "<div class='button-row'><button type='submit' class='btn small'>" +
        (editing ? "Save Check" : replacing ? "Save Replacement" : "Save Check") + "</button>" +
        "<button type='button' class='btn ghost small' id='check-cancel'>Cancel</button>" +
        (editing ? "<span class='spacer'></span><button type='button' class='link-btn' id='check-delete'>Delete — entered by mistake</button>" : "") +
      "</div>" +
      "<p class='save-note' id='check-form-note' role='status'></p>" +
    "</form>";
    wrap.innerHTML = html;

    var form = document.getElementById("check-form");
    document.getElementById("c-check_number").focus();
    document.getElementById("check-cancel").addEventListener("click", function () { wrap.innerHTML = ""; });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector("button[type=submit]");
      var replacesEl = document.getElementById("c-replaces_check_id");
      var body = {
        check_number: document.getElementById("c-check_number").value,
        amount: document.getElementById("c-amount").value,
        payee: document.getElementById("c-payee").value,
        status: document.getElementById("c-status").value,
        issued_on: document.getElementById("c-issued_on").value,
        handed_out_on: document.getElementById("c-handed_out_on").value,
        cleared_on: document.getElementById("c-cleared_on").value,
        confirmed_on: document.getElementById("c-confirmed_on").value,
        replaces_check_id: replacesEl ? replacesEl.value : (v.replaces_check_id || ""),
        note: document.getElementById("c-note").value,
        reason: editing ? document.getElementById("c-reason").value : "",
      };
      clearErrors(form);
      busy(btn, "Saving…");
      var request = editing
        ? send("PATCH", "/api/admin/checks/" + encodeURIComponent(check.id), body)
        : send("POST", appUrl("checks"), body);
      request.then(function (res) {
        idle(btn);
        if (res.ok) {
          reloadDetail(function () { document.getElementById("check-note").textContent = "Check saved."; });
          return;
        }
        showErrors(form, "c-", res, document.getElementById("check-form-note"));
      });
    });

    var del = document.getElementById("check-delete");
    if (del) {
      del.addEventListener("click", function () {
        if (!window.confirm("Delete this check? Use this only for a check entered by mistake — for a real " +
          "check that was lost or cancelled, set its status instead. The change history keeps a record.")) return;
        send("DELETE", "/api/admin/checks/" + encodeURIComponent(check.id), {}).then(function (res) {
          if (res.ok) {
            reloadDetail(function () { document.getElementById("check-note").textContent = "Check deleted."; });
            return;
          }
          document.getElementById("check-form-note").textContent = res.error || "Could not delete.";
        });
      });
    }
  }

  function dateField(name, text, value) {
    return "<div class='edit-field'>" + label("c-" + name, text) +
      "<input id='c-" + name + "' type='date' value='" + esc(value || "") + "'>" + errorSlot("c-" + name) + "</div>";
  }

  function dtdd(term, value) {
    if (!value || value === "—") return "";
    return "<dt>" + esc(term) + "</dt><dd>" + esc(value) + "</dd>";
  }

  /* ---------- Helpers ---------- */

  function appUrl(action) {
    return "/api/admin/application/" + encodeURIComponent(detail.id) + "/" + action;
  }

  // JSON request that always resolves to { ok, status, body, error }.
  function send(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (r.status === 401) { hideAll(); show(loginView); }
        return r.json().catch(function () { return {}; }).then(function (b) {
          return { ok: r.ok && b.ok, status: r.status, body: b, error: b.error };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, body: {}, error: "Network error — nothing was saved." };
      });
  }

  function busy(btn, text) {
    btn.setAttribute("data-label", btn.textContent);
    btn.classList.add("disabled"); btn.disabled = true; btn.textContent = text;
  }

  function idle(btn) {
    btn.classList.remove("disabled"); btn.disabled = false;
    btn.textContent = btn.getAttribute("data-label") || btn.textContent;
  }

  function label(id, text) {
    return "<label for='" + id + "'>" + esc(text) + "</label>";
  }

  function errorSlot(id) {
    return "<p class='field-error' id='err-" + id + "' hidden></p>";
  }

  function clearErrors(form) {
    form.querySelectorAll(".field-error").forEach(function (p) { p.hidden = true; p.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby"); el.classList.remove("has-error");
    });
  }

  // Paint server errors next to their fields; anything without a field goes in `note`.
  function showErrors(form, prefix, res, note) {
    var errors = (res.body && res.body.errors) || [];
    var first = null;
    var unplaced = [];
    errors.forEach(function (err) {
      var input = document.getElementById(prefix + err.field);
      var slot = document.getElementById("err-" + prefix + err.field);
      if (!input || !slot) { unplaced.push(err.message); return; }
      slot.textContent = err.message; slot.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", slot.id);
      input.classList.add("has-error");
      if (!first) first = input;
    });
    if (!errors.length) unplaced.push(res.error || "Could not save. Please try again.");
    note.className = "save-note";
    note.textContent = unplaced.join(" ");
    if (first) first.focus();
  }

  function fileLink(key, label) {
    if (!key) return "";
    return "<a class='btn ghost small' href='/api/admin/file/" +
      encodeURI(key) + "' target='_blank' rel='noopener'>" + label + "</a>";
  }

  function fmtDate(iso, short) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return short ? d.toLocaleDateString() : d.toLocaleString();
  }

  // A YYYY-MM-DD calendar date, shown without shifting it through a time zone.
  function fmtDay(day) {
    if (!day) return "";
    var p = day.split("-");
    return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString() : day;
  }

  function fmtMoney(cents) {
    return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
})();
