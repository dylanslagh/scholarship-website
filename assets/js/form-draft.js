// Keeps a form's answers in localStorage so a refresh, a closed tab, or a dead
// battery doesn't cost an applicant their work. Deliberately not a "save
// progress" feature: there is no button, no account, and nothing reaches the
// server until they submit.
//
// What is NOT saved: file inputs. Browsers don't allow a page to re-populate a
// file picker, so an applicant who reloads has to re-attach their transcript and
// essay. The restore notice says so rather than letting them submit and find out.
//
// The draft lives on one device, in one browser. It's cleared on a successful
// submit and expires on its own, because a school computer is a plausible place
// to fill this out and nobody's address should linger there.
(function () {
  var MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  var SAVE_DEBOUNCE_MS = 400;

  function readStore(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.savedAt) return null;
      if (Date.now() - data.savedAt > MAX_AGE_MS) {
        window.localStorage.removeItem(key);
        return null;
      }
      return data;
    } catch (e) {
      // Private browsing, a full quota, or hand-edited JSON — never fatal.
      return null;
    }
  }

  function writeStore(key, data) {
    try {
      window.localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  // "3 minutes ago" — vague on purpose; the exact second doesn't help anyone.
  function describeAge(savedAt) {
    var mins = Math.round((Date.now() - savedAt) / 60000);
    if (mins < 1) return "a moment ago";
    if (mins === 1) return "1 minute ago";
    if (mins < 60) return mins + " minutes ago";
    var hours = Math.round(mins / 60);
    if (hours === 1) return "about an hour ago";
    if (hours < 24) return "about " + hours + " hours ago";
    var days = Math.round(hours / 24);
    return days === 1 ? "yesterday" : days + " days ago";
  }

  // options:
  //   key      storage key (bump the version suffix if the shape changes)
  //   skip     field names never written to disk
  //   extras   { read: fn -> object, write: fn(object) } for values that aren't
  //            plain form fields — the signature pads, here
  //   onRestore fn(info) called only when a draft was actually applied
  function attach(form, options) {
    var key = options.key;
    var skip = options.skip || [];
    var extras = options.extras;
    var timer = null;
    // Set by clear(). Without it the pagehide/visibilitychange handlers below
    // would write the still-populated form straight back to storage on the way
    // out, resurrecting a draft that was just submitted or discarded.
    var stopped = false;

    function fieldValues() {
      var values = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || skip.indexOf(el.name) !== -1) return;
        if (el.type === "file" || el.type === "hidden" || el.disabled) return;
        if (el.type === "radio" || el.type === "checkbox") {
          if (el.checked) values[el.name] = el.value;
        } else if (el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.type === "text" ||
          el.type === "email" || el.type === "tel" || el.type === "date" || el.type === "number") {
          if (el.value !== "") values[el.name] = el.value;
        }
      });
      return values;
    }

    function save() {
      if (stopped) return;
      var data = { savedAt: Date.now(), fields: fieldValues() };
      if (extras && extras.read) data.extras = extras.read();
      var empty = !Object.keys(data.fields).length &&
        (!data.extras || !Object.keys(data.extras).some(function (k) { return data.extras[k]; }));
      if (empty) { clear(); return; }
      writeStore(key, data);
    }

    function scheduleSave() {
      window.clearTimeout(timer);
      timer = window.setTimeout(save, SAVE_DEBOUNCE_MS);
    }

    // Forget the draft *and* stop saving. Both callers (a successful submit, and
    // "start over") are done with this page, so silence is what they want.
    function clear() {
      stopped = true;
      window.clearTimeout(timer);
      try { window.localStorage.removeItem(key); } catch (e) { /* nothing to do */ }
    }

    function restore() {
      var data = readStore(key);
      if (!data) return null;
      var restored = 0;
      Object.keys(data.fields || {}).forEach(function (name) {
        var el = form.elements[name];
        if (!el) return;
        var value = data.fields[name];
        if (el.length && !el.tagName) { // RadioNodeList
          Array.prototype.forEach.call(el, function (radio) {
            if (radio.value === value) { radio.checked = true; restored++; }
          });
          return;
        }
        if (el.type === "radio" || el.type === "checkbox") {
          if (el.value === value) { el.checked = true; restored++; }
          return;
        }
        el.value = value;
        restored++;
      });
      if (extras && extras.write && data.extras) restored += extras.write(data.extras) || 0;
      if (!restored) return null;
      return { savedAt: data.savedAt, age: describeAge(data.savedAt), count: restored };
    }

    var info = restore();
    if (info && options.onRestore) options.onRestore(info);

    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);
    // A tab closed or backgrounded mid-sentence should still keep the last keystroke.
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") save();
    });

    return { save: save, clear: clear, restored: info };
  }

  window.FormDraft = { attach: attach };
})();
