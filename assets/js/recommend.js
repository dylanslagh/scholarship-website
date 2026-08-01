// Teacher recommendation page: load context by token, then submit.
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var token = new URLSearchParams(window.location.search).get("token");
    var loading = document.getElementById("rec-loading");
    var invalid = document.getElementById("rec-invalid");
    var done = document.getElementById("rec-done");
    var formWrap = document.getElementById("rec-form-wrap");
    var intro = document.getElementById("rec-intro");
    var message = document.getElementById("form-message");
    var form = document.getElementById("rec-form");
    var submitBtn = document.getElementById("rec-submit");

    function show(el) { el.style.display = "block"; }
    function hide(el) { el.style.display = "none"; }

    if (!token) { hide(loading); show(invalid); return; }

    fetch("/api/recommendation/" + encodeURIComponent(token))
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        hide(loading);
        if (!res.ok || !res.body.ok) { show(invalid); return; }
        if (res.body.status === "submitted") { show(done); return; }
        intro.innerHTML = "Dear <strong>" + escapeHtml(res.body.teacher_name) + "</strong>, <strong>" +
          escapeHtml(res.body.applicant_name) + "</strong> has asked you to provide a recommendation for the <strong>" +
          escapeHtml(res.body.scholarship_label) + "</strong>. Your response is confidential.";
        show(formWrap);
      })
      .catch(function () { hide(loading); show(invalid); });

    var recText = document.getElementById("rec_text");
    var recFile = document.getElementById("rec_file");
    var recTextError = document.getElementById("err-rec_text");

    function setTextError(msg) {
      recTextError.textContent = msg;
      recTextError.hidden = false;
      recText.setAttribute("aria-invalid", "true");
      recText.classList.add("has-error");
      recText.focus();
      recText.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function clearTextError() {
      recTextError.textContent = "";
      recTextError.hidden = true;
      recText.removeAttribute("aria-invalid");
      recText.classList.remove("has-error");
    }

    recText.addEventListener("input", clearTextError);
    recFile.addEventListener("change", clearTextError);

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Mirrors the server rule in functions/api/recommendation/[token].ts:
      // written text, a file, or both — but not neither.
      if (!recText.value.trim() && recFile.files.length === 0) {
        message.className = "form-message";
        setTextError("Write a recommendation here, or attach a letter below.");
        return;
      }
      clearTextError();

      var data = new FormData(form);
      submitBtn.classList.add("disabled");
      submitBtn.textContent = "Submitting…";
      message.className = "form-message";

      fetch("/api/recommendation/" + encodeURIComponent(token), { method: "POST", body: data })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok && res.body.ok) {
            hide(formWrap);
            show(done);
          } else {
            message.className = "form-message error";
            message.textContent = res.body.error || "Something went wrong. Please try again.";
            submitBtn.classList.remove("disabled");
            submitBtn.textContent = "Submit Recommendation";
          }
        })
        .catch(function () {
          message.className = "form-message error";
          message.textContent = "Network error. Please try again.";
          submitBtn.classList.remove("disabled");
          submitBtn.textContent = "Submit Recommendation";
        });
    });

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
  });
})();
