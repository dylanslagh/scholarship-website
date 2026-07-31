// Application form: word counters, signature pads, pre-select scholarship,
// and submit via fetch to /api/apply.
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("application-form");
    if (!form) return;

    // Applications closed: show the notice instead of a form the server would reject.
    // Mirrors APPLICATIONS_OPEN in wrangler.toml (the server-side gate).
    if (window.SiteConfig && SiteConfig.applicationsOpen === false) {
      var intro = document.getElementById("apply-intro");
      if (intro) intro.style.display = "none";
      form.style.display = "none";
      var closedMsg = document.getElementById("form-message");
      closedMsg.className = "form-message info";
      closedMsg.textContent = "The application period is currently closed. " +
        "Please check back next year for updated application information.";
      return;
    }

    // Pre-select scholarship from ?scholarship=ag|memorial
    var params = new URLSearchParams(window.location.search);
    var pre = params.get("scholarship");
    if (pre) {
      var radio = form.querySelector('input[name="scholarship"][value="' + pre + '"]');
      if (radio) radio.checked = true;
    }

    // Word counters for essay-style long text (data-maxwords).
    form.querySelectorAll("textarea[data-maxwords]").forEach(function (ta) {
      var max = parseInt(ta.getAttribute("data-maxwords"), 10);
      var counter = document.createElement("div");
      counter.className = "word-count";
      ta.parentNode.appendChild(counter);
      function update() {
        var words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        counter.textContent = words + " / " + max + " words";
        counter.style.color = words > max ? "#c0392b" : "#8a9199";
      }
      ta.addEventListener("input", update);
      update();
    });

    // Signature pads.
    var applicantPad = new SignaturePad(document.getElementById("applicant-sig"));
    var parentPad = new SignaturePad(document.getElementById("parent-sig"));
    document.getElementById("clear-applicant-sig").addEventListener("click", function () { applicantPad.clear(); });
    document.getElementById("clear-parent-sig").addEventListener("click", function () { parentPad.clear(); });

    var message = document.getElementById("form-message");
    var submitBtn = document.getElementById("submit-btn");

    function showMessage(type, text) {
      message.className = "form-message " + type;
      message.textContent = text;
      message.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (applicantPad.isEmpty()) { showMessage("error", "Please provide the applicant signature."); return; }

      var data = new FormData(form);
      data.set("applicant_signature", applicantPad.getDataURL());
      // The parent/guardian signature is optional — only send one if it was drawn.
      if (!parentPad.isEmpty()) data.set("parent_signature", parentPad.getDataURL());

      submitBtn.classList.add("disabled");
      submitBtn.textContent = "Submitting…";
      message.className = "form-message";

      fetch("/api/apply", { method: "POST", body: data })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok && res.body.ok) {
            form.style.display = "none";
            showMessage("success",
              "Thank you! Your application has been submitted. A confirmation email is on its way, and your teacher has been sent a private link to complete your recommendation.");
          } else {
            showMessage("error", res.body.error || "Something went wrong. Please try again.");
            submitBtn.classList.remove("disabled");
            submitBtn.textContent = "Submit Application";
            if (window.turnstile) window.turnstile.reset();
          }
        })
        .catch(function () {
          showMessage("error", "Network error. Please check your connection and try again.");
          submitBtn.classList.remove("disabled");
          submitBtn.textContent = "Submit Application";
        });
    });
  });
})();
