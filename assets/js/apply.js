// Application form: word counters, signature pads, draft autosave, pre-select
// scholarship, client-side validation with inline errors, and submit to /api/apply.
(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("application-form");
    if (!form) return;

    var pads = null; // set once the pads exist, so showOpenState can re-measure them

    // Applications closed: show the notice instead of a form the server would reject.
    // The static default in site-config.js paints this immediately; SiteConfig.load()
    // then corrects it from APPLICATIONS_OPEN for *this* environment, which is how
    // preview runs open while production stays closed.
    function showOpenState(open) {
      var intro = document.getElementById("apply-intro");
      var notice = document.getElementById("form-message");
      if (intro) intro.style.display = open ? "" : "none";
      form.style.display = open ? "" : "none";
      if (open) {
        if (notice.classList.contains("info")) {
          notice.className = "form-message";
          notice.textContent = "";
        }
        // The pads were sized while hidden; a 0x0 canvas ignores every stroke.
        if (pads) pads.forEach(function (p) { p.resize(); });
      } else {
        notice.className = "form-message info";
        notice.textContent = "The application period is currently closed. " +
          "Please check back next year for updated application information.";
        // A restored-draft notice over a hidden form would just be confusing.
        var draftNotice = document.getElementById("draft-notice");
        if (draftNotice) draftNotice.hidden = true;
      }
    }

    // Wire everything up first — including while closed, so nothing depends on
    // the config request landing before the applicant touches the form.
    showOpenState(!window.SiteConfig || SiteConfig.applicationsOpen !== false);
    if (window.SiteConfig && SiteConfig.load) {
      SiteConfig.load(function (cfg) { showOpenState(cfg.applicationsOpen); });
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

    // ----- Inline field errors -------------------------------------------------
    // Every control points at its own `.field-error` paragraph through
    // aria-describedby, so showing an error is just filling that node in.

    function errorNodeFor(el) {
      var ids = (el.getAttribute("aria-describedby") || "").split(/\s+/);
      for (var i = 0; i < ids.length; i++) {
        if (ids[i].indexOf("err-") === 0) return document.getElementById(ids[i]);
      }
      return null;
    }

    // Radios share one error node; mark the whole group, not just one button.
    function groupFor(el) {
      if (el.type === "radio" && el.name) {
        return Array.prototype.slice.call(form.querySelectorAll('input[name="' + el.name + '"]'));
      }
      return [el];
    }

    function setError(el, message) {
      var node = errorNodeFor(el);
      if (node) {
        node.textContent = message;
        node.hidden = false;
      }
      groupFor(el).forEach(function (member) {
        member.setAttribute("aria-invalid", "true");
        member.classList.add("has-error");
      });
    }

    function clearError(el) {
      var node = errorNodeFor(el);
      if (node) {
        node.textContent = "";
        node.hidden = true;
      }
      groupFor(el).forEach(function (member) {
        member.removeAttribute("aria-invalid");
        member.classList.remove("has-error");
      });
    }

    function clearAllErrors() {
      form.querySelectorAll(".field-error").forEach(function (node) {
        node.textContent = "";
        node.hidden = true;
      });
      form.querySelectorAll("[aria-invalid]").forEach(function (el) {
        el.removeAttribute("aria-invalid");
        el.classList.remove("has-error");
      });
    }

    // The visible name of a field: its <label>, or the <legend> of its group.
    function labelFor(el) {
      var label = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
      if (el.type === "radio") {
        var group = el.closest("fieldset");
        label = group ? group.querySelector("legend") : null;
      }
      if (!label) return "This field";
      return label.textContent.replace(/\*/g, "").replace(/\(optional\)/i, "").trim();
    }

    // Questions ("Which scholarship…?") don't read as "… is required."
    function requiredMessage(el) {
      var label = labelFor(el);
      return /\?$/.test(label) ? "Please answer: " + label : label + " is required.";
    }

    // Clear a field's error as soon as the applicant works on it again.
    form.addEventListener("input", function (e) {
      if (e.target.classList.contains("has-error")) clearError(e.target);
    });
    form.addEventListener("change", function (e) {
      if (e.target.classList.contains("has-error")) clearError(e.target);
    });

    // ----- Signature pads ------------------------------------------------------
    // Each pad can be signed by drawing or by typing a legal name; typing renders
    // the name into the same canvas, so the submitted PNG comes from one place.

    function setUpPad(canvasId, typedId, clearId) {
      var canvas = document.getElementById(canvasId);
      var typed = document.getElementById(typedId);
      var pad = new SignaturePad(canvas);

      typed.addEventListener("input", function () {
        pad.setTypedName(typed.value);
        if (typed.classList.contains("has-error")) clearError(typed);
      });
      // Drawing by hand wins over a typed name; drop the text so they can't disagree.
      pad.onDrawStart = function () {
        typed.value = "";
        if (typed.classList.contains("has-error")) clearError(typed);
      };
      document.getElementById(clearId).addEventListener("click", function () {
        pad.clear();
        typed.value = "";
      });
      // The canvas itself can't be operated by keyboard — send focus to the
      // typed-name field, which is the keyboard path to the same result.
      canvas.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          typed.focus();
        }
      });

      return { pad: pad, typed: typed };
    }

    var applicant = setUpPad("applicant-sig", "applicant-sig-typed", "clear-applicant-sig");
    var parent = setUpPad("parent-sig", "parent-sig-typed", "clear-parent-sig");
    pads = [applicant.pad, parent.pad];

    // ----- Draft autosave ------------------------------------------------------
    // Answers are kept in this browser so a refresh doesn't cost the applicant
    // their work. Files can't be restored — see form-draft.js.

    var draft = window.FormDraft && FormDraft.attach(form, {
      key: "andresen-apply-draft-v1",
      skip: ["cf-turnstile-response"],
      extras: {
        read: function () {
          var out = {};
          [["applicant", applicant], ["parent", parent]].forEach(function (entry) {
            var name = entry[0], sig = entry[1];
            if (sig.typed.value.trim()) {
              // A typed name redraws itself; no need to store the PNG as well.
              out[name + "Typed"] = sig.typed.value;
            } else if (!sig.pad.isEmpty()) {
              out[name + "Sig"] = sig.pad.getDataURL();
            }
          });
          return out;
        },
        write: function (data) {
          var restored = 0;
          [["applicant", applicant], ["parent", parent]].forEach(function (entry) {
            var name = entry[0], sig = entry[1];
            if (data[name + "Typed"]) {
              sig.typed.value = data[name + "Typed"];
              sig.pad.setTypedName(sig.typed.value);
              restored++;
            } else if (data[name + "Sig"]) {
              sig.pad.fromDataURL(data[name + "Sig"]);
              restored++;
            }
          });
          return restored;
        },
      },
      onRestore: function (info) {
        var notice = document.getElementById("draft-notice");
        if (!notice) return;
        document.getElementById("draft-notice-text").textContent =
          "We brought back what you had already filled in on this device (saved " + info.age +
          "). Your transcript and essay files are not saved — please attach them again.";
        notice.hidden = false;
      },
    });

    var startOver = document.getElementById("draft-start-over");
    if (startOver) {
      startOver.addEventListener("click", function () {
        if (draft) draft.clear();
        window.location.replace(window.location.pathname + window.location.search);
      });
    }

    var message = document.getElementById("form-message");
    var submitBtn = document.getElementById("submit-btn");

    function showMessage(type, text) {
      message.className = "form-message " + type;
      message.textContent = text;
      message.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // ----- Validation ----------------------------------------------------------

    // Walk the form in DOM order and collect { el, message } for each problem, so
    // "the first error" is the first one the applicant would reach by scrolling.
    function validate() {
      var problems = [];
      var seenGroups = {};

      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.id === "applicant-sig-typed") {
          if (applicant.pad.isEmpty()) {
            problems.push({
              el: el,
              message: "Add the applicant signature — draw in the box above or type your full legal name.",
            });
          }
          return;
        }
        if (!el.willValidate || el.type === "hidden") return;

        if (el.type === "radio") {
          if (seenGroups[el.name]) return;
          seenGroups[el.name] = true;
          if (!el.required) return;
          if (!form.querySelector('input[name="' + el.name + '"]:checked')) {
            problems.push({ el: el, message: requiredMessage(el) });
          }
          return;
        }

        if (el.type === "file") {
          if (el.required && el.files.length === 0) {
            problems.push({ el: el, message: requiredMessage(el) });
          }
          return;
        }

        if (el.checkValidity()) return;
        if (el.validity.valueMissing) {
          problems.push({ el: el, message: requiredMessage(el) });
        } else if (el.validity.typeMismatch && el.type === "email") {
          problems.push({ el: el, message: "Enter a valid email address." });
        } else {
          problems.push({ el: el, message: el.validationMessage });
        }
      });

      return problems;
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // Paint every problem inline, summarise them at the top with links, and put
    // focus on the first offending control.
    function showProblems(problems) {
      clearAllErrors();
      problems.forEach(function (p) { setError(p.el, p.message); });

      var items = problems.map(function (p) {
        var target = p.el.id ? '<a href="#' + p.el.id + '">' + escapeHtml(p.message) + "</a>"
          : escapeHtml(p.message);
        return "<li>" + target + "</li>";
      }).join("");
      message.className = "form-message error error-summary";
      message.innerHTML = "<p>Please fix " + problems.length +
        (problems.length === 1 ? " item" : " items") + " before submitting:</p><ul>" + items + "</ul>";

      var first = problems[0].el;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Map a server-reported field name back to the control that owns it.
    function elementForField(field) {
      if (field === "applicant_signature") return applicant.typed;
      var el = form.elements[field];
      if (!el) return null;
      return el.length && !el.tagName ? el[0] : el; // RadioNodeList -> first radio
    }

    // Server rejections carry field keys; highlight those instead of printing a
    // paragraph. Returns false when there's nothing field-specific to show.
    function showServerErrors(body) {
      var list = Array.isArray(body.errors) ? body.errors
        : body.field ? [{ field: body.field, message: body.error }] : [];
      var problems = [];
      list.forEach(function (item) {
        var el = elementForField(item.field);
        if (el) problems.push({ el: el, message: item.message });
      });
      if (!problems.length) return false;
      showProblems(problems);
      return true;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var problems = validate();
      if (problems.length) { showProblems(problems); return; }
      clearAllErrors();

      var data = new FormData(form);
      data.set("applicant_signature", applicant.pad.getDataURL());
      // The parent/guardian signature is optional — only send one if it was provided.
      if (!parent.pad.isEmpty()) data.set("parent_signature", parent.pad.getDataURL());

      submitBtn.classList.add("disabled");
      submitBtn.textContent = "Submitting…";
      message.className = "form-message";
      message.textContent = "";

      function reenable() {
        submitBtn.classList.remove("disabled");
        submitBtn.textContent = "Submit Application";
      }

      fetch("/api/apply", { method: "POST", body: data })
        .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok && res.body.ok) {
            // Submitted — the draft has served its purpose and shouldn't sit in
            // the browser afterwards, least of all on a shared school computer.
            if (draft) draft.clear();
            var draftNotice = document.getElementById("draft-notice");
            if (draftNotice) draftNotice.hidden = true;
            form.style.display = "none";
            showMessage("success",
              "Thank you! Your application has been submitted. A confirmation email is on its way, and your teacher has been sent a private link to complete your recommendation.");
          } else {
            if (!showServerErrors(res.body)) {
              showMessage("error", res.body.error || "Something went wrong. Please try again.");
            }
            reenable();
            if (window.turnstile) window.turnstile.reset();
          }
        })
        .catch(function () {
          showMessage("error", "Network error. Please check your connection and try again.");
          reenable();
        });
    });
  });
})();
