// Minimal canvas signature pad. Captures a drawn signature and exposes it as a
// PNG data URL via getDataURL(). No external dependencies.
(function () {
  function SignaturePad(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.drawing = false;
    this.hasInk = false;
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
  };

  SignaturePad.prototype._pos = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  SignaturePad.prototype._start = function (e) {
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

  SignaturePad.prototype.clear = function () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasInk = false;
  };

  SignaturePad.prototype.isEmpty = function () { return !this.hasInk; };

  SignaturePad.prototype.getDataURL = function () {
    if (this.isEmpty()) return "";
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
