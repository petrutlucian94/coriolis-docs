/* Dark mode only: drop black logo canvases, and raise the lightness of
   artwork that would disappear on the dark page. Hue and saturation stay
   as they are, so brand colors are not inverted. */
(function () {
  var SELECTOR = [
    ".platform img",
    ".platform-vendors img",
    ".partner-logos-row img",
    ".partner-logos-banner",
    "table.docutils td:first-child img",
  ].join(",");
  var CUT = 0.32;
  var cache = new Map();

  function darkMode() {
    return document.documentElement.classList.contains("dark");
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var h = 0;
    var s = 0;
    var l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      var v = Math.round(l * 255);
      return [v, v, v];
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function hue(t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [
      Math.round(hue(h + 1 / 3) * 255),
      Math.round(hue(h) * 255),
      Math.round(hue(h - 1 / 3) * 255),
    ];
  }

  function nearBlack(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    return max < 42 && max - min < 28;
  }

  function blackCanvas(data, width, height) {
    function corner(x, y) {
      var i = (y * width + x) * 4;
      return data[i + 3] > 200 && nearBlack(data[i], data[i + 1], data[i + 2]);
    }
    if (!corner(0, 0) || !corner(width - 1, 0) || !corner(0, height - 1) || !corner(width - 1, height - 1)) {
      return false;
    }
    var dark = 0;
    var step = Math.max(1, Math.floor((width * height) / 4000));
    var seen = 0;
    for (var p = 0; p < width * height; p += step) {
      var i = p * 4;
      seen += 1;
      if (data[i + 3] > 200 && nearBlack(data[i], data[i + 1], data[i + 2])) dark += 1;
    }
    return dark / seen > 0.45;
  }

  function knockoutBlack(data) {
    for (var i = 0; i < data.length; i += 4) {
      var a = data[i + 3];
      if (a === 0) continue;
      var max = Math.max(data[i], data[i + 1], data[i + 2]);
      if (!nearBlack(data[i], data[i + 1], data[i + 2])) continue;
      if (max <= 16) {
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      } else {
        data[i + 3] = Math.round(a * ((max - 16) / 26));
      }
    }
  }

  function liftDark(data) {
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) {
        data[i] = data[i + 1] = data[i + 2] = 0;
        continue;
      }
      var hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      var l = hsl[2];
      if (l >= CUT) continue;
      var nl = 0.84 + (l / CUT) * (CUT - 0.84);
      var rgb = hslToRgb(hsl[0], hsl[1], nl);
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
    }
  }

  function showDark(img) {
    if (img.dataset.logoMode === "dark") return;
    if (!img.dataset.lightSrc) img.dataset.lightSrc = img.getAttribute("src");
    var key = img.dataset.lightSrc;
    if (cache.has(key)) {
      img.dataset.logoMode = "dark";
      img.setAttribute("src", cache.get(key));
      return;
    }
    if (!img.complete || !img.naturalWidth) {
      if (img.dataset.logoMode === "pending") return;
      img.dataset.logoMode = "pending";
      img.addEventListener(
        "load",
        function () {
          if (img.dataset.logoMode === "pending") img.dataset.logoMode = "";
          if (darkMode()) showDark(img);
        },
        { once: true }
      );
      return;
    }
    var canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    try {
      ctx.drawImage(img, 0, 0);
      var frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      img.dataset.logoMode = "light";
      return;
    }
    if (blackCanvas(frame.data, canvas.width, canvas.height)) knockoutBlack(frame.data);
    liftDark(frame.data);
    ctx.putImageData(frame, 0, 0);
    var url = canvas.toDataURL("image/png");
    cache.set(key, url);
    img.dataset.logoMode = "dark";
    img.setAttribute("src", url);
  }

  function showLight(img) {
    if (!img.dataset.lightSrc || img.dataset.logoMode === "light") return;
    img.dataset.logoMode = "light";
    img.setAttribute("src", img.dataset.lightSrc);
  }

  function apply() {
    var dark = darkMode();
    document.querySelectorAll(SELECTOR).forEach(function (img) {
      if (dark) showDark(img);
      else showLight(img);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
  new MutationObserver(apply).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
})();
