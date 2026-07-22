// Board dashboard: login gate, stats, filterable application list, detail view
// with board review tools (status, score, notes), CSV export.
(function () {
  var loginView = null, listView = null, detailView = null;

  var STATUS_LABELS = {
    submitted: "New",
    in_review: "In review",
    awarded: "Awarded",
    not_awarded: "Not awarded",
  };

  var state = {
    apps: [],
    search: "",
    scholarship: "",
    status: "",
    rec: "",
    sortKey: "created_at",
    sortDir: -1, // newest first
  };

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
    ["scholarship", "status", "rec"].forEach(function (key) {
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
    ];
    document.getElementById("stat-row").innerHTML = stats.map(function (s) {
      return "<div class='stat'><div class='num'>" + s[0] + "</div><div class='lbl'>" + s[1] + "</div></div>";
    }).join("");
  }

  /* ---------- List ---------- */

  function visibleApps() {
    var apps = state.apps.filter(function (a) {
      if (state.scholarship && a.scholarship !== state.scholarship) return false;
      if (state.status && a.status !== state.status) return false;
      if (state.rec === "submitted" && a.rec_status !== "submitted") return false;
      if (state.rec === "pending" && a.rec_status === "submitted") return false;
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

  function renderList() {
    var apps = visibleApps();
    var body = document.getElementById("list-body");
    var empty = document.getElementById("list-empty");
    body.innerHTML = "";
    empty.style.display = apps.length ? "none" : "block";
    document.getElementById("list-summary").textContent =
      "Showing " + apps.length + " of " + state.apps.length + " application" +
      (state.apps.length === 1 ? "" : "s") + ".";

    apps.forEach(function (a) {
      var tr = document.createElement("tr");
      var recBadge = a.rec_status === "submitted"
        ? '<span class="badge submitted">Received</span>'
        : '<span class="badge pending">Awaiting teacher</span>';
      tr.innerHTML =
        "<td><strong>" + esc(a.full_name) + "</strong><div class='subtle'>" + esc(a.email) + "</div></td>" +
        "<td>" + esc(a.high_school || "—") + "<div class='subtle'>" + esc(a.college || "") + "</div></td>" +
        "<td>" + (a.scholarship === "ag" ? "Ag" : "Memorial") + "</td>" +
        "<td>" + esc(a.gpa || "—") + "</td>" +
        "<td>" + fmtDate(a.created_at, true) + "</td>" +
        "<td>" + recBadge + "</td>" +
        "<td>" + statusBadge(a.status) + "</td>" +
        "<td>" + scorePips(a.score) + "</td>";
      tr.addEventListener("click", function () { loadDetail(a.id); });
      body.appendChild(tr);
    });
  }

  /* ---------- Detail ---------- */

  var FIELD_GROUPS = [
    ["General", [
      ["email", "Email"], ["phone", "Phone"], ["address", "Address"],
      ["high_school", "High School"], ["college", "College Accepted At"],
      ["date_accepted", "Date Accepted"], ["major", "Major"], ["parent_names", "Parent/Guardian(s)"],
    ]],
    ["Academic", [
      ["gpa", "GPA"], ["act_sat", "ACT/SAT"], ["class_rank", "Class Rank"], ["class_size", "Class Size"],
      ["awards", "Awards/Honors"], ["activities", "Clubs/Activities"],
    ]],
    ["Financial", [
      ["financing_plan", "Financing Plan"], ["work_during_school", "Will Work During School"],
      ["other_scholarships", "Other Scholarships"], ["pct_parents", "% Paid by Parents"],
      ["parent_income", "Parent Income"], ["num_dependents", "# Dependents"],
      ["dependent_ages", "Dependent Ages"], ["parent_occupations", "Parent Occupation(s)"],
    ]],
  ];

  function loadDetail(id) {
    fetch("/api/admin/application/" + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body.ok) return;
        renderDetail(body);
        hideAll(); show(detailView);
        window.scrollTo(0, 0);
      });
  }

  function renderDetail(data) {
    var a = data.application;
    var html =
      "<div class='detail-head'>" +
        "<div><h2>" + esc(a.full_name) + "</h2>" +
        "<p class='meta'>" + esc(data.scholarship_label) + " &middot; submitted " + fmtDate(a.created_at) + "</p></div>" +
        "<div class='actions'><button type='button' class='btn ghost small' id='print-btn'>Print</button></div>" +
      "</div>";

    html += "<div class='detail-cols'><div>";

    FIELD_GROUPS.forEach(function (group) {
      html += "<div class='panel'><h3>" + group[0] + "</h3><dl class='detail-grid'>";
      group[1].forEach(function (f) {
        html += "<dt>" + f[1] + "</dt><dd>" + (a[f[0]] ? esc(a[f[0]]) : "—") + "</dd>";
      });
      html += "</dl></div>";
    });

    // Documents
    html += "<div class='panel'><h3>Documents</h3><div class='file-links'>";
    html += fileLink(a.transcript_key, "Transcript");
    html += fileLink(a.essay_key, "Essay");
    html += fileLink(a.applicant_sig_key, "Applicant Signature");
    html += fileLink(a.parent_sig_key, "Parent Signature");
    html += "</div></div>";

    // Recommendation
    html += "<div class='panel'><h3>Teacher Recommendation</h3>";
    var r = data.recommendation;
    if (!r) {
      html += "<p>—</p>";
    } else if (r.status !== "submitted") {
      html += "<p>Requested from <strong>" + esc(r.teacher_name) + "</strong> (" + esc(r.teacher_email) +
        ") — <span class='badge pending'>awaiting response</span></p>";
      if (r.link) {
        html += "<p class='copy-link'>If the email didn't reach them, share the private link directly: " +
          "<button type='button' class='btn ghost small' id='copy-rec-link'>Copy Link</button> " +
          "<span id='copy-note' class='subtle'></span></p>";
      }
    } else {
      html += "<p>From <strong>" + esc(r.teacher_name) + "</strong> (" + esc(r.teacher_email) + ") &middot; " +
        fmtDate(r.submitted_at) + "</p>";
      if (r.rec_text) html += "<div class='rec-quote'>" + esc(r.rec_text) + "</div>";
      if (r.rec_file_key) html += "<div class='file-links' style='margin-top:0.8rem'>" + fileLink(r.rec_file_key, "Recommendation File") + "</div>";
    }
    html += "</div>";

    html += "</div>"; // end left column

    // Review panel (right column)
    html += "<div><div class='panel review-panel'>" +
      "<h3>Board Review</h3>" +
      "<label for='review-status'>Status</label>" +
      "<select id='review-status'>" +
        Object.keys(STATUS_LABELS).map(function (s) {
          return "<option value='" + s + "'" + (a.status === s ? " selected" : "") + ">" + STATUS_LABELS[s] + "</option>";
        }).join("") +
      "</select>" +
      "<label>Score</label>" +
      "<div class='score-picker' id='score-picker'>" +
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
    "</div></div>";

    html += "</div>"; // end detail-cols

    document.getElementById("detail-content").innerHTML = html;

    wireReviewPanel(a, data.recommendation);
  }

  function wireReviewPanel(a, rec) {
    var currentScore = a.score || null;
    var saveNote = document.getElementById("save-note");

    document.getElementById("print-btn").addEventListener("click", function () { window.print(); });

    var copyBtn = document.getElementById("copy-rec-link");
    if (copyBtn && rec && rec.link) {
      copyBtn.addEventListener("click", function () {
        navigator.clipboard.writeText(rec.link).then(function () {
          document.getElementById("copy-note").textContent = "Copied!";
        }, function () {
          document.getElementById("copy-note").textContent = rec.link;
        });
      });
    }

    document.getElementById("score-picker").querySelectorAll("button[data-score]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-score");
        currentScore = v === "" ? null : parseInt(v, 10);
        document.getElementById("score-picker").querySelectorAll("button[data-score]").forEach(function (b) {
          var n = parseInt(b.getAttribute("data-score"), 10);
          if (!isNaN(n)) b.classList.toggle("on", currentScore !== null && n <= currentScore);
        });
      });
    });

    document.getElementById("save-review").addEventListener("click", function () {
      var btn = this;
      btn.classList.add("disabled"); btn.textContent = "Saving…";
      saveNote.className = "save-note"; saveNote.textContent = "";
      fetch("/api/admin/application/" + encodeURIComponent(a.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: document.getElementById("review-status").value,
          score: currentScore,
          board_notes: document.getElementById("review-notes").value,
        }),
      })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          btn.classList.remove("disabled"); btn.textContent = "Save Review";
          if (res.ok && res.body.ok) {
            saveNote.className = "save-note saved";
            saveNote.textContent = "Saved " + new Date().toLocaleTimeString() + ".";
          } else {
            saveNote.textContent = res.body.error || "Could not save. Please try again.";
          }
        })
        .catch(function () {
          btn.classList.remove("disabled"); btn.textContent = "Save Review";
          saveNote.textContent = "Network error — changes not saved.";
        });
    });
  }

  /* ---------- Helpers ---------- */

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

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
})();
