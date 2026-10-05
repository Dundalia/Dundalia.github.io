// Interactive profile block on the about page, enabled from the `profile` front matter:
// - `draggable`: the photo can be dragged around and the bio re-wraps around it,
//   laid out with Pretext (https://github.com/chenglou/pretext). Double-click resets it.
// - `ascii_hover`: an ASCII-art version of the photo follows the cursor and fades behind it.
// - `tilt`: the photo tilts toward the cursor in 3D, with a light glare following it.
// - `holo`: with `tilt`, adds a holographic foil while hovered (ported from the Pokémon V
//   card of pokemon-cards-css, see _sass/_holo-foil.scss); `holo_mask` limits it to the
//   background, so the person stays clean like the artwork on a holo card.
(() => {
  const profile = document.querySelector(".about-page .profile");
  const img = profile && profile.querySelector("img");
  if (!img) return;

  if (profile.dataset.asciiHover === "true") setupAsciiHover(img);
  if (profile.dataset.tilt === "true") {
    setupTilt(img, profile.dataset.holo === "true" && { mask: profile.dataset.holoMask });
  }
  if (profile.dataset.draggable === "true") setupReflow(profile, img);

  function whenImageReady(image) {
    if (image.complete && image.naturalWidth) return Promise.resolve();
    return new Promise((resolve) => image.addEventListener("load", resolve, { once: true }));
  }

  // ---------------------------------------------------------------------------
  // Draggable photo with the bio re-flowing around it
  // ---------------------------------------------------------------------------

  async function setupReflow(profile, img) {
    const PRETEXT_URL = "https://cdn.jsdelivr.net/npm/@chenglou/pretext@0.0.9/dist/";
    const MIN_WIDTH = 600; // below this the photo stacks above the bio as usual
    const GAP = 16; // horizontal space between photo and text, same as the float margin
    const MIN_SLOT = 100; // narrowest space beside the photo worth putting a line in
    const INLINE_TAGS = "a, em, strong, i, b, span, code, sup, sub, abbr";

    const article = profile.parentElement;
    const bio = article.querySelector(":scope > .clearfix");
    const paragraphs = bio ? [...bio.children] : [];
    const supported =
      paragraphs.length > 0 && paragraphs.every((p) => p.tagName === "P" && !p.querySelector(`:not(${INLINE_TAGS})`));
    if (!supported) return;

    let pretext;
    try {
      const [richInline, layout] = await Promise.all([import(PRETEXT_URL + "rich-inline.js"), import(PRETEXT_URL + "layout.js")]);
      pretext = { ...richInline, clearCache: layout.clearCache };
    } catch (error) {
      return; // CDN unreachable: keep the static layout
    }
    if (document.fonts) await document.fonts.ready;
    await whenImageReady(img);

    // Each paragraph becomes a list of text runs; a run remembers the inline elements
    // (links, emphasis) around it so every line fragment can be rebuilt with them.
    const linkIds = new Map();
    const parsed = paragraphs.map((p) => {
      const runs = [];
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const chain = [];
        for (let el = node.parentElement; el !== p; el = el.parentElement) {
          chain.unshift(el);
          if (el.tagName === "A" && !linkIds.has(el)) linkIds.set(el, String(linkIds.size));
        }
        runs.push({ text: node.data, parent: node.parentElement, chain });
      }
      return { runs, prepared: null };
    });

    const textStyle = getComputedStyle(paragraphs[0]);
    const fontSize = parseFloat(textStyle.fontSize);
    const lineHeight = parseFloat(textStyle.lineHeight) || fontSize * 1.5;
    const paragraphGap = parseFloat(textStyle.marginBottom) || 0;
    const alignLeft = profile.classList.contains("float-left");

    const flow = document.createElement("div");
    flow.className = "bio-flow";
    flow.style.font = textStyle.font;
    bio.after(flow);

    let enabled = false;
    let pos = null; // photo position in article coordinates; null means the original corner
    let drag = null;
    let frame = 0;
    let lastWidth = 0;
    let naturalHeight = 0; // bio height with no photo in the way, bounds vertical dragging

    function canvasFont(el) {
      const s = getComputedStyle(el);
      return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    }

    function prepareAll() {
      pretext.clearCache();
      for (const para of parsed) {
        para.prepared = pretext.prepareRichInline(para.runs.map((run) => ({ text: run.text, font: canvasFont(run.parent) })));
      }
    }

    // Widest horizontal slot for a line band, leaving out the photo when they overlap.
    function slotFor(width, top, obstacle) {
      if (!obstacle || top + lineHeight <= obstacle.top || top >= obstacle.bottom) return { left: 0, right: width };
      const slots = [
        { left: 0, right: obstacle.left },
        { left: obstacle.right, right: width },
      ].filter((slot) => slot.right - slot.left >= MIN_SLOT);
      if (slots.length === 0) return null;
      return slots.reduce((best, slot) => (slot.right - slot.left > best.right - best.left ? slot : best));
    }

    function layoutLines(width, obstacle) {
      const lines = [];
      let y = 0;
      parsed.forEach((para, index) => {
        if (index > 0) y += paragraphGap;
        let cursor;
        while (y < 100000) {
          const slot = slotFor(width, y, obstacle);
          if (!slot) {
            y += lineHeight;
            continue;
          }
          const range = pretext.layoutNextRichInlineLineRange(para.prepared, slot.right - slot.left, cursor);
          if (!range) break;
          lines.push({ x: slot.left, y, para, range });
          cursor = range.end;
          y += lineHeight;
        }
      });
      return { lines, height: y };
    }

    function lineKey(line) {
      const parts = line.range.fragments.map(
        (f) => `${f.itemIndex}.${f.start.segmentIndex}.${f.start.graphemeIndex}-${f.end.segmentIndex}.${f.end.graphemeIndex}`
      );
      return `${parsed.indexOf(line.para)}|${parts.join(",")}`;
    }

    function buildLine(line) {
      const nodes = [];
      const { fragments } = pretext.materializeRichInlineLineRange(line.para.prepared, line.range);
      fragments.forEach((fragment, index) => {
        if (index > 0 && fragment.gapBefore > 0) nodes.push(document.createTextNode(" "));
        let node = document.createTextNode(fragment.text);
        const { chain } = line.para.runs[fragment.itemIndex];
        for (let i = chain.length - 1; i >= 0; i--) {
          const wrapper = chain[i].cloneNode(false);
          if (linkIds.has(chain[i])) wrapper.dataset.link = linkIds.get(chain[i]);
          wrapper.append(node);
          node = wrapper;
        }
        nodes.push(node);
      });
      return nodes;
    }

    function render(lines) {
      const pool = flow.children;
      lines.forEach((line, index) => {
        let el = pool[index];
        if (!el) {
          el = document.createElement("div");
          el.className = "bio-line";
          flow.append(el);
        }
        const key = lineKey(line);
        if (el.dataset.key !== key) {
          el.dataset.key = key;
          el.replaceChildren(...buildLine(line));
        }
        el.style.transform = `translate(${line.x}px, ${line.y}px)`;
      });
      while (pool.length > lines.length) pool[pool.length - 1].remove();
    }

    function setEnabled(on) {
      enabled = on;
      article.classList.toggle("bio-reflow", on);
      img.draggable = !on;
      if (on) {
        img.title = "Drag me around (double-click to reset)";
      } else {
        img.removeAttribute("title");
        profile.style.left = profile.style.top = "";
      }
    }

    function clampPosition(p, width, pw, ph) {
      const maxY = Math.max(0, naturalHeight - ph / 2);
      return {
        x: Math.min(Math.max(p.x, 0), Math.max(0, width - pw)),
        y: Math.min(Math.max(p.y, 0), maxY),
      };
    }

    function update() {
      frame = 0;
      const width = article.clientWidth;
      const on = width >= MIN_WIDTH;
      if (on !== enabled) setEnabled(on);
      if (!on) return;
      if (width !== lastWidth) {
        lastWidth = width;
        naturalHeight = layoutLines(width, null).height;
      }

      const pw = profile.offsetWidth;
      const ph = profile.offsetHeight;
      const p = clampPosition(pos || { x: alignLeft ? 0 : width - pw, y: 0 }, width, pw, ph);
      if (pos) pos = p;
      profile.style.left = `${p.x}px`;
      profile.style.top = `${p.y}px`;

      const top = p.y - flow.offsetTop;
      const obstacle = { left: p.x - GAP, right: p.x + pw + GAP, top, bottom: top + ph };
      const { lines, height } = layoutLines(width, obstacle);
      render(lines);
      flow.style.height = `${Math.max(height, obstacle.bottom)}px`;
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }

    // Animate the photo back to its corner, re-flowing the text on every frame.
    function resetPosition() {
      if (!pos) return;
      const from = pos;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 350);
        const ease = 1 - Math.pow(1 - t, 3);
        const width = article.clientWidth;
        const to = { x: alignLeft ? 0 : width - profile.offsetWidth, y: 0 };
        pos = { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };
        update();
        if (t < 1) requestAnimationFrame(step);
        else pos = null;
      };
      requestAnimationFrame(step);
    }

    // While held, the photo sways toward the direction of travel as if it hung from
    // the grab point: a damped lean driven by horizontal speed (the Trello card trick).
    const figure = img.closest("figure") || img;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let sway = 0;
    let swayFrame = 0;
    let movedX = 0;
    let pressTimer = 0;

    function animateSway() {
      sway = sway * 0.85 + 1.2 * Math.tanh(movedX / 20);
      movedX = 0;
      if (drag || Math.abs(sway) > 0.05) {
        figure.style.rotate = `${sway.toFixed(2)}deg`;
        swayFrame = requestAnimationFrame(animateSway);
      } else {
        sway = 0;
        swayFrame = 0;
        figure.style.rotate = "";
      }
    }

    img.addEventListener("pointerdown", (event) => {
      if (!enabled || event.button !== 0) return;
      event.preventDefault();
      const current = { x: profile.offsetLeft, y: profile.offsetTop };
      drag = { id: event.pointerId, dx: event.pageX - current.x, dy: event.pageY - current.y, lastX: event.pageX };
      img.setPointerCapture(event.pointerId);

      // Pinch for a moment, then lift, scaling around the point where it was grabbed.
      const box = figure.getBoundingClientRect();
      figure.style.transformOrigin = `${event.clientX - box.left}px ${event.clientY - box.top}px`;
      profile.classList.add("is-dragging", "is-pressed");
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => profile.classList.remove("is-pressed"), 90);
      if (!reducedMotion && !swayFrame) swayFrame = requestAnimationFrame(animateSway);
    });
    const endDrag = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      clearTimeout(pressTimer);
      profile.classList.remove("is-dragging", "is-pressed");
    };
    img.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      if (event.pointerType === "mouse" && !(event.buttons & 1)) return endDrag(event); // released outside the page
      movedX += event.pageX - drag.lastX;
      drag.lastX = event.pageX;
      pos = { x: event.pageX - drag.dx, y: event.pageY - drag.dy };
      schedule();
    });
    img.addEventListener("pointerup", endDrag);
    img.addEventListener("pointercancel", endDrag);
    img.addEventListener("dblclick", () => enabled && resetPosition());

    // A link split across two lines is two elements; underline both halves together.
    const setLinkHover = (event, on) => {
      const link = event.target.closest && event.target.closest("a[data-link]");
      if (!link) return;
      flow.querySelectorAll(`a[data-link="${link.dataset.link}"]`).forEach((a) => a.classList.toggle("is-hover", on));
    };
    flow.addEventListener("mouseover", (event) => setLinkHover(event, true));
    flow.addEventListener("mouseout", (event) => setLinkHover(event, false));

    new ResizeObserver(() => {
      if (article.clientWidth !== lastWidth) schedule();
    }).observe(article);
    if (document.fonts) {
      document.fonts.addEventListener("loadingdone", () => {
        prepareAll();
        lastWidth = 0;
        schedule();
      });
    }

    prepareAll();
    update();
  }

  // ---------------------------------------------------------------------------
  // ASCII-art trail over the photo
  // ---------------------------------------------------------------------------

  function setupAsciiHover(img) {
    const RAMP = " .:-=+*#%@"; // from sparse to dense
    const FONT_SIZE = 7;
    const FONT = `${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    const FADE = 0.08; // share of the trail erased on each frame
    const LINGER = 1500; // ms the loop keeps running after the last movement

    const host = img.parentElement;
    host.classList.add("has-ascii");
    const view = document.createElement("canvas");
    view.className = "profile-ascii";
    view.setAttribute("aria-hidden", "true");
    host.append(view);
    const art = document.createElement("canvas"); // the photo fully rendered as ASCII
    const mask = document.createElement("canvas"); // where the ASCII version shows

    let width = 0;
    let height = 0;
    let dpr = 1;
    let pointer = null;
    let lastStamp = null;
    let frame = 0;
    let lingerUntil = 0;

    function pageBackground() {
      for (const el of [document.body, document.documentElement]) {
        const rgba = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
        if (rgba && (rgba.length < 4 || Number(rgba[3]) > 0)) return rgba.slice(0, 3).map(Number);
      }
      return [255, 255, 255];
    }

    function drawArt() {
      const ctx = art.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = pageBackground();
      const darkPage = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 < 0.5;
      ctx.fillStyle = `rgb(${bg.join(",")})`;
      ctx.fillRect(0, 0, width, height);

      ctx.font = FONT;
      ctx.textBaseline = "top";
      const cellWidth = ctx.measureText("M").width;
      const cols = Math.floor(width / cellWidth);
      const rows = Math.floor(height / FONT_SIZE);
      const sample = document.createElement("canvas");
      sample.width = cols;
      sample.height = rows;
      const sctx = sample.getContext("2d", { willReadFrequently: true });
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(img, 0, 0, cols, rows);
      const pixels = sctx.getImageData(0, 0, cols, rows).data;

      const luma = new Float32Array(cols * rows);
      let min = 1;
      let max = 0;
      for (let i = 0; i < luma.length; i++) {
        const l = (0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2]) / 255;
        luma[i] = l;
        min = Math.min(min, l);
        max = Math.max(max, l);
      }

      // On a dark page bright pixels get dense glyphs, on a light page dark ones do.
      const offsetX = (width - cols * cellWidth) / 2;
      const offsetY = (height - rows * FONT_SIZE) / 2;
      const tint = darkPage ? 1.35 : 0.7;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const t = (luma[i] - min) / (max - min || 1);
          const char = RAMP[Math.round((darkPage ? t : 1 - t) * (RAMP.length - 1))];
          if (char === " ") continue;
          const [r, g, b] = [0, 1, 2].map((c) => Math.min(255, Math.round(pixels[i * 4 + c] * tint)));
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillText(char, offsetX + col * cellWidth, offsetY + row * FONT_SIZE);
        }
      }
    }

    function resize() {
      width = img.clientWidth;
      height = img.clientHeight;
      if (!width || !height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const canvas of [view, art, mask]) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      Object.assign(view.style, {
        left: `${img.offsetLeft}px`,
        top: `${img.offsetTop}px`,
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: getComputedStyle(img).borderRadius,
      });
      drawArt();
    }

    // Paint soft dots from the previous cursor position to the current one, so fast
    // movements still leave a continuous trail.
    function stamp(ctx, from, to) {
      const radius = Math.max(28, width * 0.16);
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (radius / 4)));
      for (let s = 1; s <= steps; s++) {
        const x = from.x + ((to.x - from.x) * s) / steps;
        const y = from.y + ((to.y - from.y) * s) / steps;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, "rgba(0,0,0,0.9)");
        gradient.addColorStop(0.55, "rgba(0,0,0,0.55)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function tick(now) {
      const m = mask.getContext("2d");
      m.setTransform(dpr, 0, 0, dpr, 0, 0);
      m.globalCompositeOperation = "destination-out";
      m.fillStyle = `rgba(0,0,0,${FADE})`;
      m.fillRect(0, 0, width, height);
      m.globalCompositeOperation = "source-over";
      if (pointer) {
        stamp(m, lastStamp || pointer, pointer);
        lastStamp = pointer;
        lingerUntil = now + LINGER;
      }

      const v = view.getContext("2d");
      v.globalCompositeOperation = "copy";
      v.drawImage(art, 0, 0);
      v.globalCompositeOperation = "destination-in";
      v.drawImage(mask, 0, 0);
      v.globalCompositeOperation = "source-over";

      if (now < lingerUntil) {
        frame = requestAnimationFrame(tick);
      } else {
        frame = 0;
        m.clearRect(0, 0, width, height);
        v.clearRect(0, 0, view.width, view.height);
      }
    }

    img.addEventListener("pointermove", (event) => {
      const rect = img.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      lingerUntil = performance.now() + LINGER;
      if (!frame && width) frame = requestAnimationFrame(tick);
    });
    img.addEventListener("pointerleave", () => {
      pointer = null;
      lastStamp = null;
    });

    whenImageReady(img).then(() => {
      resize();
      new ResizeObserver(resize).observe(img);
      img.addEventListener("load", resize); // the browser may switch to another srcset size
      new MutationObserver(drawArt).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    });
  }

  // ---------------------------------------------------------------------------
  // 3D tilt with a light glare, optionally over the holographic foil (_holo-foil.scss)
  // ---------------------------------------------------------------------------

  function setupTilt(img, holo) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const MAX_TILT = 12; // degrees at the edges of the photo
    // Spring constants per 60 fps frame, the values the pokemon-cards-css demo uses:
    // the tilt and the foil follow the cursor softly, with a little lag.
    const STIFFNESS = 0.066;
    const DAMPING = 0.25;

    const host = img.parentElement; // <picture>, so the overlays tilt with the photo
    const frameBox = host.parentElement; // never transformed, gives stable pointer geometry
    host.classList.add("has-tilt");
    host.style.borderRadius = getComputedStyle(img).borderRadius; // inherited by the overlays
    if (holo && holo.mask) host.style.setProperty("--holo-mask", `url("${holo.mask}")`);
    for (const name of holo ? ["profile-holo", "profile-glare"] : ["profile-glare"]) {
      const layer = document.createElement("span");
      layer.className = name;
      layer.setAttribute("aria-hidden", "true");
      host.append(layer);
    }

    let target = null; // pointer position over the photo, in 0..1 on both axes
    let frame = 0;
    let lastTime = 0;
    // Where the light currently is (x, y) and how lifted the photo is (lift, 0..1),
    // each moving toward its goal on a spring.
    const state = { x: 0.5, y: 0.5, lift: 0 };
    const velocity = { x: 0, y: 0, lift: 0 };

    // The overlays are drawn in CSS from these variables. The foil's positions follow
    // the demo's mapping and are computed here instead of with calc() in the stylesheet:
    // the production CSS minifier strips the spaces around `+`, which breaks the rule.
    function render() {
      const { x, y, lift } = state;
      host.style.transform = `perspective(800px) rotateX(${(0.5 - y) * 2 * MAX_TILT}deg) rotateY(${(x - 0.5) * 2 * MAX_TILT}deg) scale(${1 + 0.03 * lift})`;
      const backgroundX = 37 + 26 * x;
      const backgroundY = 33 + 34 * y;
      host.style.setProperty("--pointer-x", `${x * 100}%`);
      host.style.setProperty("--pointer-y", `${y * 100}%`);
      host.style.setProperty("--background-x", `${backgroundX}%`);
      host.style.setProperty("--background-y", `${backgroundY}%`);
      // The foil's stretched copy moves the opposite way. The demo negates the position,
      // which brings that layer's tile edge inside the photo and cuts a band along a
      // vertical line; mirroring it within 0-100% keeps the tile over the whole photo.
      host.style.setProperty("--background-x-opposite", `${100 - backgroundX}%`);
      host.style.setProperty("--background-y-opposite", `${100 - backgroundY}%`);
    }

    function tick(now) {
      const frames = lastTime ? Math.min(4, ((now - lastTime) * 60) / 1000) : 1;
      lastTime = now;
      const goal = target ? { ...target, lift: 1 } : { x: 0.5, y: 0.5, lift: 0 };
      let moving = false;
      for (const key of ["x", "y", "lift"]) {
        velocity[key] += ((goal[key] - state[key]) * STIFFNESS - velocity[key] * DAMPING) * frames;
        state[key] += velocity[key] * frames;
        if (Math.abs(goal[key] - state[key]) > 0.0005 || Math.abs(velocity[key]) > 0.0005) moving = true;
      }
      host.classList.toggle("is-tilting", Boolean(target));
      if (moving) {
        render();
        frame = requestAnimationFrame(tick);
      } else {
        Object.assign(state, goal);
        render();
        if (!target) host.style.transform = "";
        frame = 0;
        lastTime = 0;
      }
    }

    function start() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    img.addEventListener("pointermove", (event) => {
      const rect = frameBox.getBoundingClientRect();
      target = {
        x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
        y: Math.min(Math.max((event.clientY - rect.top) / img.offsetHeight, 0), 1),
      };
      start();
    });
    img.addEventListener("pointerleave", () => {
      target = null;
      start();
    });

    // Where the photo can't be dragged (small screens, phones), a tap turns it in the
    // light instead: the light circles the photo once, swelling and fading, so it tilts
    // in 3D and the foil runs across it, then it settles back.
    const SWEEP_DURATION = 1400;
    let sweepFrame = 0;
    img.addEventListener("click", () => {
      if (img.closest(".bio-reflow") || sweepFrame) return;
      const sweepStart = performance.now();
      const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - sweepStart) / SWEEP_DURATION));
        const reach = 0.45 * Math.sin(Math.PI * t); // distance from the centre: 0, out, back to 0
        const angle = Math.PI * (2 * t - 0.75); // one turn, starting from the top-left
        target = { x: 0.5 + reach * Math.cos(angle), y: 0.5 + reach * Math.sin(angle) };
        if (t < 1) {
          sweepFrame = requestAnimationFrame(step);
        } else {
          sweepFrame = 0;
          target = null;
        }
        start();
      };
      sweepFrame = requestAnimationFrame(step);
    });
  }
})();
