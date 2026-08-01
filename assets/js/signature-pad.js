// Minimal canvas signature pad. Captures a signature — drawn with a pointer or
// typed as a legal name — and exposes it as a PNG data URL via getDataURL().
// No external dependencies.
(function () {
  function SignaturePad(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.drawing = false;
    this.hasInk = false;
    // Set by setTypedName(): the pad holds a rendered name, not pointer strokes.
    this.typedName = "";
    // Set by fromDataURL(): the pad is showing a PNG restored from a draft.
    this.sourceURL = "";
    // Optional callback, invoked when the user starts drawing by hand.
    this.onDrawStart = null;
    this._resize();
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.strokeStyle = "#222";

    var self = this;
    // Pointer events cover mouse + touch + stylus.
    canvas.addEventListener("pointerdown", function (e) { self._start(e); });
    canvas.addEventListener("pointermove", function (e) { self._move(e); });
    window.addEventListener("pointerup", function () { self.drawing = false; });
    window.addEventListener("resize", function () { self._resize(); });
  }

  SignaturePad.prototype._resize = function () {
    // Preserve a blank white background sized to the element.
    var rect = this.canvas.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.scale(ratio, ratio);
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.strokeStyle = "#222";
    // Resizing clears the bitmap; a typed name or a restored PNG can be redrawn.
    if (this.typedName) this._renderTypedName();
    else if (this.sourceURL) this._renderSource();
  };

  // Re-measure after the pad has been hidden and shown again — a canvas sized
  // while display:none comes back 0x0 and silently swallows every stroke.
  SignaturePad.prototype.resize = function () { this._resize(); };

  SignaturePad.prototype._pos = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  SignaturePad.prototype._start = function (e) {
    // Drawing by hand replaces a typed name or a restored signature.
    if (this.typedName || this.sourceURL) {
      this.typedName = "";
      this.sourceURL = "";
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (this.onDrawStart) this.onDrawStart();
    this.drawing = true;
    this.hasInk = true;
    var p = this._pos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    e.preventDefault();
  };

  SignaturePad.prototype._move = function (e) {
    if (!this.drawing) return;
    var p = this._pos(e);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    e.preventDefault();
  };

  // Draw the typed name centred in the pad, shrinking it until it fits.
  SignaturePad.prototype._renderTypedName = function () {
    var rect = this.canvas.getBoundingClientRect();
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.fillStyle = "#222";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var size = 42;
    do {
      ctx.font = 'italic ' + size + 'px Georgia, "Times New Roman", serif';
      size -= 2;
    } while (size > 14 && ctx.measureText(this.typedName).width > rect.width - 32);
    ctx.fillText(this.typedName, rect.width / 2, rect.height / 2);
    ctx.restore();
  };

  // Sign by typing a legal name instead of drawing — the keyboard-accessible
  // alternative. The rendered result is still a PNG, so nothing downstream changes.
  SignaturePad.prototype.setTypedName = function (text) {
    this.typedName = String(text || "").trim();
    this.sourceURL = "";
    this.hasInk = this.typedName !== "";
    if (this.typedName) this._renderTypedName();
    else this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  SignaturePad.prototype._renderSource = function () {
    var self = this;
    var rect = this.canvas.getBoundingClientRect();
    var img = new Image();
    img.onload = function () {
      self.ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
      self.ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = this.sourceURL;
  };

  // Put a previously captured signature PNG back on the pad (draft restore).
  // getDataURL() returns the original bytes rather than a re-encode of the
  // repaint, so a restored signature survives even if the image is still
  // decoding when the applicant hits submit.
  SignaturePad.prototype.fromDataURL = function (url) {
    if (!url) return false;
    this.typedName = "";
    this.sourceURL = url;
    this.hasInk = true;
    this._renderSource();
    return true;
  };

  SignaturePad.prototype.clear = function () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.typedName = "";
    this.sourceURL = "";
    this.hasInk = false;
  };

  SignaturePad.prototype.isEmpty = function () { return !this.hasInk; };

  SignaturePad.prototype.getDataURL = function () {
    if (this.isEmpty()) return "";
    if (this.sourceURL) return this.sourceURL;
    // Flatten onto white so the PNG isn't transparent.
    var out = document.createElement("canvas");
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    var octx = out.getContext("2d");
    octx.fillStyle = "#fff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(this.canvas, 0, 0);
    return out.toDataURL("image/png");
  };

  window.SignaturePad = SignaturePad;
})();
