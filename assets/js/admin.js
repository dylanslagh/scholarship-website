// Board dashboard: login gate, application list, and detail view.
(function () {
  var loginView = null, listView = null, detailView = null;

  document.addEventListener("DOMContentLoaded", function () {
    loginView = document.getElementById("login-view");
    listView = document.getElementById("list-view");
    detailView = document.getElementById("detail-view");

    document.getElementById("login-form").addEventListener("submit", onLogin);
    document.getElementById("back-link").addEventListener("click", function (e) {
      e.preventDefault(); showList();
    });
    document.getElementById("logout-link").addEventListener("click", function (e) {
      e.preventDefault();
      fetch("/api/admin/logout", { method: "POST" }).finally(function () { location.reload(); });
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
        renderList(body.applications || []);
        showList();
      })
      .catch(function () { if (!silent) { hideAll(); show(loginView); } });
  }

  function showList() { hideAll(); show(listView); }

  function renderList(apps) {
    var body = document.getElementById("list-body");
    var empty = document.getElementById("list-empty");
    body.innerHTML = "";
    document.getElementById("list-summary").textContent =
      apps.length + " application" + (apps.length === 1 ? "" : "s") + " received.";
    empty.style.display = apps.length ? "none" : "block";

    apps.forEach(function (a) {
      var tr = document.createElement("tr");
      var recBadge = a.rec_status === "submitted"
        ? '<span class="badge submitted">Received</span>'
        : '<span class="badge pending">Awaiting teacher</span>';
      tr.innerHTML =
        "<td>" + esc(a.full_name) + "<div class='hint'>" + esc(a.email) + "</div></td>" +
        "<td>" + (a.scholarship === "ag" ? "Ag" : "Memorial") + "</td>" +
        "<td>" + fmtDate(a.created_at) + "</td>" +
        "<td>" + recBadge + "</td>" +
        "<td><a href='#' data-id='" + a.id + "'>View</a></td>";
      tr.querySelector("a[data-id]").addEventListener("click", function (e) {
        e.preventDefault(); loadDetail(a.id);
      });
      body.appendChild(tr);
    });
  }

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

  var FIELD_GROUPS = [
    ["General", [
      ["full_name", "Name"], ["email", "Email"], ["phone", "Phone"], ["address", "Address"],
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

  function renderDetail(data) {
    var a = data.application;
    var html = "<h2>" + esc(a.full_name) + "</h2>";
    html += "<p class='hint'>" + esc(data.scholarship_label) + " &middot; submitted " + fmtDate(a.created_at) + "</p>";

    FIELD_GROUPS.forEach(function (group) {
      html += "<h3>" + group[0] + "</h3><dl class='detail-grid'>";
      group[1].forEach(function (f) {
        html += "<dt>" + f[1] + "</dt><dd>" + (a[f[0]] ? esc(a[f[0]]) : "—") + "</dd>";
      });
      html += "</dl>";
    });

    // Files
    html += "<h3>Documents</h3><div class='file-links'>";
    html += fileLink(a.transcript_key, "Transcript");
    html += fileLink(a.essay_key, "Essay");
    html += fileLink(a.applicant_sig_key, "Applicant Signature");
    html += fileLink(a.parent_sig_key, "Parent Signature");
    html += "</div>";

    // Recommendation
    html += "<h3>Teacher Recommendation</h3>";
    var r = data.recommendation;
    if (!r) {
      html += "<p>—</p>";
    } else if (r.status !== "submitted") {
      html += "<p>Requested from <strong>" + esc(r.teacher_name) + "</strong> (" + esc(r.teacher_email) +
        ") — <span class='badge pending'>awaiting response</span></p>";
    } else {
      html += "<p>From <strong>" + esc(r.teacher_name) + "</strong> (" + esc(r.teacher_email) + ") · " +
        fmtDate(r.submitted_at) + "</p>";
      if (r.rec_text) html += "<dd class='detail-grid' style='grid-template-columns:1fr'><div style='white-space:pre-wrap'>" + esc(r.rec_text) + "</div></dd>";
      html += "<div class='file-links'>" + fileLink(r.rec_file_key, "Recommendation File") + "</div>";
    }

    document.getElementById("detail-content").innerHTML = html;
  }

  function fileLink(key, label) {
    if (!key) return "";
    return "<a class='button' style='font-size:0.9em;padding:8px 14px' href='/api/admin/file/" +
      encodeURI(key) + "' target='_blank' rel='noopener'>" + label + "</a>";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleString();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
})();
