(() => {
  'use strict';

  const MAX_LAYERS_HARD_LIMIT = 10;

  const state = {
    bgSrc: '',
    mode: 'luosheng',

    rm: {
      posX: 50,
      posY: 50,
      size: 38,
      frameColor: '#ffd1ac',
      thickness: 5,
      rotateSpeed: 36,
      tilt: 20,
      dynamic: false,
      dynamicRange: 10,
      dynamicSpeed: 0.5,
      preloadProtect: true,
      preloadAhead: 2,
      trailEnabled: true,
      trailStrength: 0.58,
      trailLag: 0.16,
      images: [],
      currentImageIndex: 0,
    },

    sl: {
      maxLayers: 3,
      transitionMs: 540,
      images: [],
      currentLayer: 1,
    },

    cross: {
      enabled: true,
      hideCursor: true,
      style: 'solid',
      width: 2,
      color: '#fffbf0',
      angle: 0,
      blinkEnabled: false,
      blinkType: 'none',
      blinkSpeed: 1,
      blinkStrength: 0.85,
      rotateEnabled: false,
      rotateSpeed: 25,
      rotateDirection: 'cw',
    },
  };

  const runtime = {
    rafId: 0,
    lastTime: performance.now(),
    rmAngle: 0,
    rmLastTurn: 0,
    rmActiveBuffer: 'a',
    rmSwapToken: 0,
    rmPreloadState: new Map(),
    rmTargetImageIndex: 0,
    rmTrailAngleA: 0,
    rmTrailAngleB: 0,
    crossSpinAngle: 0,
    crossBlinkTick: 0,
    crossX: window.innerWidth * 0.5,
    crossY: window.innerHeight * 0.5,
    crossBaseColor: '#fffbf0',
    crossCurrentColor: '#fffbf0',
    crossRainbowActive: false,
    mouseMoved: false,
    slLayers: [],
  };

  const dom = {
    bgImage: document.getElementById('bgImage'),
    bgVideo: document.getElementById('bgVideo'),

    luoshengmen: document.getElementById('luoshengmen'),
    rmRoot: document.getElementById('rmRoot'),
    rmRotor: document.getElementById('rmRotor'),
    rmFrame: document.getElementById('rmFrame'),
    rmTrailA: document.getElementById('rmTrailA'),
    rmTrailB: document.getElementById('rmTrailB'),
    rmImageA: document.getElementById('rmImageA'),
    rmImageB: document.getElementById('rmImageB'),

    senluomen: document.getElementById('senluomen'),
    slStage: document.getElementById('slStage'),

    crosshair: document.getElementById('crosshair'),
    crossInner: document.getElementById('crossInner'),

    hudMode: document.getElementById('hudMode'),
    hudLayer: document.getElementById('hudLayer'),
  };

  function updateCrosshairTransform() {
    const angle = state.cross.angle + runtime.crossSpinAngle;
    dom.crossInner.style.transform = `translate3d(${runtime.crossX}px, ${runtime.crossY}px, 0) rotate(${angle}deg)`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function readProp(entry) {
    if (entry === undefined || entry === null) return undefined;
    if (typeof entry === 'object' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
      return entry.value;
    }
    return entry;
  }

  function toBool(value, fallback = false) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
      if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
    }
    return fallback;
  }

  function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeMode(raw) {
    const v = String(raw || 'none').toLowerCase();
    if (v === 'luosheng' || v === '1' || v === 'roshomon') return 'luosheng';
    if (v === 'senluo' || v === '2') return 'senluo';
    return 'none';
  }

  function parseColor(value, fallback = '#ffffff') {
    if (!value) return fallback;
    if (Array.isArray(value) && value.length >= 3) {
      const r = clamp(Math.round(Number(value[0]) * 255), 0, 255);
      const g = clamp(Math.round(Number(value[1]) * 255), 0, 255);
      const b = clamp(Math.round(Number(value[2]) * 255), 0, 255);
      return `rgb(${r}, ${g}, ${b})`;
    }
    const text = String(value).trim();
    if (text.includes(' ')) {
      const parts = text.split(/\s+/).map(Number);
      if (parts.length >= 3 && parts.every((v) => Number.isFinite(v))) {
        const [r0, g0, b0] = parts;
        if (r0 <= 1 && g0 <= 1 && b0 <= 1) {
          const r = clamp(Math.round(r0 * 255), 0, 255);
          const g = clamp(Math.round(g0 * 255), 0, 255);
          const b = clamp(Math.round(b0 * 255), 0, 255);
          return `rgb(${r}, ${g}, ${b})`;
        }
        const r = clamp(Math.round(r0), 0, 255);
        const g = clamp(Math.round(g0), 0, 255);
        const b = clamp(Math.round(b0), 0, 255);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
    if (/^#[0-9a-f]{3,8}$/i.test(text)) return text;
    if (/^rgb/i.test(text) || /^hsl/i.test(text)) return text;
    return fallback;
  }

  function parseMediaList(value) {
    if (!value) return [];
    return String(value)
      .split(/[\n,;|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function normalizeMediaPath(src) {
    if (!src) return '';
    return String(src).trim().replace(/\\/g, '/');
  }

  function isVideo(src) {
    return /\.(webm|mp4|m4v|mov|avi|mkv)(\?.*)?$/i.test(src);
  }

  function setBackground(src) {
    const media = normalizeMediaPath(src);
    state.bgSrc = media;

    if (!media) {
      dom.bgImage.style.opacity = '0';
      dom.bgVideo.style.opacity = '0';
      dom.bgVideo.pause();
      dom.bgVideo.removeAttribute('src');
      dom.bgVideo.load();
      return;
    }

    if (isVideo(media)) {
      dom.bgImage.style.opacity = '0';
      if (dom.bgVideo.getAttribute('src') !== media) {
        dom.bgVideo.setAttribute('src', media);
        dom.bgVideo.load();
      }
      const playPromise = dom.bgVideo.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
      dom.bgVideo.style.opacity = '1';
    } else {
      dom.bgVideo.style.opacity = '0';
      dom.bgVideo.pause();
      dom.bgVideo.removeAttribute('src');
      dom.bgVideo.load();

      dom.bgImage.setAttribute('src', media);
      dom.bgImage.style.opacity = '1';
    }
  }

  function applyModeVisibility() {
    dom.luoshengmen.classList.toggle('hidden', state.mode !== 'luosheng');
    dom.senluomen.classList.toggle('hidden', state.mode !== 'senluo');

    if (state.mode === 'luosheng') {
      dom.hudMode.textContent = 'Mode: Luoshengmen';
    } else if (state.mode === 'senluo') {
      dom.hudMode.textContent = 'Mode: Senluomen';
    } else {
      dom.hudMode.textContent = 'Mode: None';
    }
  }

  function updateLuoshengMedia() {
    const images = state.rm.images;
    if (!images.length) {
      dom.rmImageA.removeAttribute('src');
      dom.rmImageB.removeAttribute('src');
      dom.rmImageA.classList.add('is-active');
      dom.rmImageB.classList.remove('is-active');
      runtime.rmActiveBuffer = 'a';
      runtime.rmTargetImageIndex = 0;
      updateLuoshengPreloadProgress();
      return;
    }

    const index = ((runtime.rmTargetImageIndex % images.length) + images.length) % images.length;
    const next = normalizeMediaPath(images[index]);

    const active = runtime.rmActiveBuffer === 'a' ? dom.rmImageA : dom.rmImageB;
    const inactive = runtime.rmActiveBuffer === 'a' ? dom.rmImageB : dom.rmImageA;

    if (active.getAttribute('src') === next) {
      state.rm.currentImageIndex = index;
      runtime.rmTargetImageIndex = index;
      preloadLuoshengNeighbor(index);
      updateLuoshengPreloadProgress();
      dom.rmRoot.classList.remove('rm-protect-waiting');
      return;
    }

    const ready = isImageReady(next);
    preloadImage(next);

    if (state.rm.preloadProtect && !ready) {
      dom.rmRoot.classList.add('rm-protect-waiting');
      updateLuoshengPreloadProgress();
      return;
    }

    const myToken = ++runtime.rmSwapToken;
    let swapped = false;
    const activate = () => {
      if (swapped) return;
      if (myToken !== runtime.rmSwapToken) return;
      swapped = true;
      active.classList.remove('is-active');
      inactive.classList.add('is-active');
      runtime.rmActiveBuffer = runtime.rmActiveBuffer === 'a' ? 'b' : 'a';
      state.rm.currentImageIndex = index;
      runtime.rmTargetImageIndex = index;
      dom.rmRoot.classList.remove('rm-protect-waiting');
      preloadLuoshengNeighbor(index);
      updateLuoshengPreloadProgress();
    };

    inactive.setAttribute('src', next);
    if (inactive.complete && inactive.naturalWidth > 0) {
      activate();
      return;
    }

    const onDone = () => {
      inactive.onload = null;
      inactive.onerror = null;
      activate();
    };

    inactive.onload = onDone;
    inactive.onerror = onDone;

    if (typeof inactive.decode === 'function') {
      inactive.decode().then(onDone).catch(() => {});
    }
  }

  function getPreloadStatus(src) {
    return runtime.rmPreloadState.get(normalizeMediaPath(src)) || 'idle';
  }

  function isImageReady(src) {
    return getPreloadStatus(src) === 'ready';
  }

  function preloadImage(src) {
    const media = normalizeMediaPath(src);
    if (!media) return;

    const status = getPreloadStatus(media);
    if (status === 'ready' || status === 'loading') return;

    runtime.rmPreloadState.set(media, 'loading');

    const img = new Image();
    img.decoding = 'async';
    let settled = false;
    const finalize = (nextStatus) => {
      if (settled) return;
      settled = true;
      runtime.rmPreloadState.set(media, nextStatus);
      updateLuoshengPreloadProgress();
      if (state.mode === 'luosheng') {
        updateLuoshengMedia();
      }
    };

    img.onload = () => finalize('ready');
    img.onerror = () => finalize('error');
    img.src = media;

    if (typeof img.decode === 'function') {
      img.decode().then(() => finalize('ready')).catch(() => {});
    }
  }

  function preloadLuoshengNeighbor(currentIndex) {
    if (!state.rm.images.length) return;
    const total = state.rm.images.length;
    const ahead = clamp(Math.round(state.rm.preloadAhead), 1, Math.min(6, total));

    for (let i = 1; i <= ahead; i += 1) {
      const nextIndex = (currentIndex + i) % total;
      preloadImage(state.rm.images[nextIndex]);
    }
  }

  function updateLuoshengPreloadProgress() {
    const list = state.rm.images.map((s) => normalizeMediaPath(s)).filter(Boolean);
    if (!list.length) {
      document.documentElement.style.setProperty('--rm-preload-progress', '1');
      return;
    }

    let ready = 0;
    list.forEach((src) => {
      const status = getPreloadStatus(src);
      if (status === 'ready' || status === 'error') ready += 1;
    });

    const progress = clamp(ready / list.length, 0, 1);
    document.documentElement.style.setProperty('--rm-preload-progress', String(progress));
  }

  function syncLuoshengStatics() {
    const minSide = Math.min(window.innerWidth, window.innerHeight);
    const px = clamp((state.rm.size / 100) * minSide, 80, minSide * 1.4);

    dom.rmRoot.style.left = `${clamp(state.rm.posX, 0, 100)}%`;
    dom.rmRoot.style.top = `${clamp(state.rm.posY, 0, 100)}%`;
    dom.rmRotor.style.width = `${px}px`;
    dom.rmRotor.style.height = `${px}px`;

    dom.rmFrame.style.borderColor = parseColor(state.rm.frameColor, '#ffd1ac');
    dom.rmFrame.style.borderWidth = `${clamp(state.rm.thickness, 1, 30)}px`;
  }

  function syncCrosshairStatics() {
    dom.crosshair.classList.toggle('hidden', !state.cross.enabled);
    document.body.classList.toggle('cursor-hidden', state.cross.enabled && state.cross.hideCursor);

    dom.crossInner.dataset.lineStyle = state.cross.style;
    dom.crossInner.dataset.blink = state.cross.blinkEnabled ? state.cross.blinkType : 'none';

    document.documentElement.style.setProperty('--cross-width', `${clamp(state.cross.width, 1, 14)}px`);
    runtime.crossBaseColor = parseColor(state.cross.color, '#fffbf0');
    runtime.crossCurrentColor = runtime.crossBaseColor;
    runtime.crossRainbowActive = false;
    document.documentElement.style.setProperty('--cross-color', runtime.crossBaseColor);
    document.documentElement.style.setProperty('--cross-glow', String(clamp(state.cross.blinkStrength, 0, 1)));

    if (!state.cross.blinkEnabled) {
      dom.crossInner.style.opacity = '1';
      dom.crossInner.style.filter = 'none';
      document.documentElement.style.setProperty('--cross-opacity', '1');
      runtime.crossCurrentColor = runtime.crossBaseColor;
      document.documentElement.style.setProperty('--cross-color', runtime.crossBaseColor);
    }

    updateCrosshairTransform();
  }

  function crosshairNeedsFrameAnimation() {
    return state.cross.enabled && (state.cross.blinkEnabled || state.cross.rotateEnabled);
  }

  function mediaForLayer(index) {
    const i = clamp(index - 1, 0, state.sl.images.length - 1);
    if (state.sl.images[i]) return normalizeMediaPath(state.sl.images[i]);
    if (state.bgSrc) return state.bgSrc;
    return '';
  }

  function createSenluoLayer(index) {
    const layer = document.createElement('div');
    layer.className = 'sl-layer';
    layer.dataset.layer = String(index);

    const full = document.createElement('div');
    full.className = 'sl-full';
    full.dataset.layer = String(index);

    const left = document.createElement('div');
    left.className = 'sl-side sl-left';
    left.dataset.layer = String(index);

    const right = document.createElement('div');
    right.className = 'sl-side sl-right';
    right.dataset.layer = String(index);

    layer.appendChild(full);
    layer.appendChild(left);
    layer.appendChild(right);
    dom.slStage.appendChild(layer);

    runtime.slLayers[index - 1] = { layer, full, left, right };

    full.addEventListener('click', () => {
      if (state.mode !== 'senluo') return;
      if (state.sl.currentLayer === index && index < state.sl.maxLayers) {
        state.sl.currentLayer += 1;
        updateSenluoLayout();
      }
    });

    const closeHandler = () => {
      if (state.mode !== 'senluo') return;
      if (state.sl.currentLayer > index) {
        state.sl.currentLayer = index;
        updateSenluoLayout();
      }
    };

    left.addEventListener('click', closeHandler);
    right.addEventListener('click', closeHandler);
  }

  function ensureSenluoLayers() {
    for (let i = 1; i <= MAX_LAYERS_HARD_LIMIT; i += 1) {
      if (!runtime.slLayers[i - 1]) createSenluoLayer(i);
    }
  }

  function updateSenluoLayout() {
    ensureSenluoLayers();

    const max = clamp(Math.round(state.sl.maxLayers), 1, MAX_LAYERS_HARD_LIMIT);
    state.sl.maxLayers = max;
    state.sl.currentLayer = clamp(Math.round(state.sl.currentLayer), 1, max);

    const segment = 100 / max;

    runtime.slLayers.forEach((obj, i) => {
      const index = i + 1;
      const inset = (index - 1) * (segment / 2);
      const currentWidth = 100 - (index - 1) * segment;
      const sideWidth = segment / 2;
      const src = mediaForLayer(index);

      [obj.full, obj.left, obj.right].forEach((el) => {
        if (src) {
          el.style.backgroundImage = `url("${src}")`;
        } else {
          el.style.backgroundImage = 'none';
        }
        el.style.transitionDuration = `${clamp(state.sl.transitionMs, 120, 2000)}ms`;
      });

      if (index > max) {
        obj.layer.style.zIndex = '0';
        obj.full.style.opacity = '0';
        obj.left.style.opacity = '0';
        obj.right.style.opacity = '0';
        obj.full.style.pointerEvents = 'none';
        obj.left.style.pointerEvents = 'none';
        obj.right.style.pointerEvents = 'none';
        return;
      }

      obj.layer.style.zIndex = String(300 + index);

      if (index < state.sl.currentLayer) {
        obj.full.style.opacity = '0';
        obj.full.style.pointerEvents = 'none';

        obj.left.style.opacity = '1';
        obj.left.style.pointerEvents = 'auto';
        obj.left.style.left = `${inset}%`;
        obj.left.style.width = `${sideWidth}%`;

        obj.right.style.opacity = '1';
        obj.right.style.pointerEvents = 'auto';
        obj.right.style.right = `${inset}%`;
        obj.right.style.width = `${sideWidth}%`;
      } else if (index === state.sl.currentLayer) {
        obj.left.style.opacity = '0';
        obj.right.style.opacity = '0';
        obj.left.style.pointerEvents = 'none';
        obj.right.style.pointerEvents = 'none';

        obj.full.style.opacity = '1';
        obj.full.style.pointerEvents = 'auto';
        obj.full.style.left = `${inset}%`;
        obj.full.style.width = `${currentWidth}%`;
      } else {
        obj.full.style.opacity = '0';
        obj.left.style.opacity = '0';
        obj.right.style.opacity = '0';
        obj.full.style.pointerEvents = 'none';
        obj.left.style.pointerEvents = 'none';
        obj.right.style.pointerEvents = 'none';
      }
    });

    dom.hudLayer.textContent = `Layer: ${state.sl.currentLayer}/${state.sl.maxLayers}`;
  }

  function applyPropertyBatch(props) {
    const p = (name) => readProp(props[name]);

    if (props.bg_media !== undefined) {
      setBackground(p('bg_media'));
    }

    if (props.effect_mode !== undefined) {
      state.mode = normalizeMode(p('effect_mode'));
      applyModeVisibility();
    }

    if (props.rm_pos_x !== undefined) state.rm.posX = clamp(toNumber(p('rm_pos_x'), state.rm.posX), 0, 100);
    if (props.rm_pos_y !== undefined) state.rm.posY = clamp(toNumber(p('rm_pos_y'), state.rm.posY), 0, 100);
    if (props.rm_size !== undefined) state.rm.size = clamp(toNumber(p('rm_size'), state.rm.size), 5, 100);
    if (props.rm_frame_color !== undefined) state.rm.frameColor = parseColor(p('rm_frame_color'), state.rm.frameColor);
    if (props.rm_thickness !== undefined) state.rm.thickness = clamp(toNumber(p('rm_thickness'), state.rm.thickness), 1, 30);
    if (props.rm_rotate_speed !== undefined) state.rm.rotateSpeed = clamp(toNumber(p('rm_rotate_speed'), state.rm.rotateSpeed), -720, 720);
    if (props.rm_tilt !== undefined) state.rm.tilt = clamp(toNumber(p('rm_tilt'), state.rm.tilt), -180, 180);
    if (props.rm_dynamic !== undefined) state.rm.dynamic = toBool(p('rm_dynamic'), state.rm.dynamic);
    if (props.rm_dynamic_range !== undefined) state.rm.dynamicRange = clamp(toNumber(p('rm_dynamic_range'), state.rm.dynamicRange), 0, 40);
    if (props.rm_dynamic_speed !== undefined) state.rm.dynamicSpeed = clamp(toNumber(p('rm_dynamic_speed'), state.rm.dynamicSpeed), 0, 8);
    if (props.rm_preload_protect !== undefined) state.rm.preloadProtect = toBool(p('rm_preload_protect'), state.rm.preloadProtect);
    if (props.rm_preload_ahead !== undefined) state.rm.preloadAhead = clamp(toNumber(p('rm_preload_ahead'), state.rm.preloadAhead), 1, 6);
    if (props.rm_trail_enable !== undefined) state.rm.trailEnabled = toBool(p('rm_trail_enable'), state.rm.trailEnabled);
    if (props.rm_trail_strength !== undefined) state.rm.trailStrength = clamp(toNumber(p('rm_trail_strength'), state.rm.trailStrength), 0, 1);
    if (props.rm_trail_lag !== undefined) state.rm.trailLag = clamp(toNumber(p('rm_trail_lag'), state.rm.trailLag), 0.04, 0.6);
    if (props.rm_images !== undefined) {
      state.rm.images = parseMediaList(p('rm_images'));
      state.rm.currentImageIndex = 0;
      runtime.rmTargetImageIndex = 0;
      runtime.rmLastTurn = 0;
      runtime.rmPreloadState.clear();
      preloadImage(state.rm.images[0]);
      updateLuoshengMedia();
    }

    if (props.sl_max_layers !== undefined) state.sl.maxLayers = clamp(toNumber(p('sl_max_layers'), state.sl.maxLayers), 1, MAX_LAYERS_HARD_LIMIT);
    if (props.sl_transition_ms !== undefined) state.sl.transitionMs = clamp(toNumber(p('sl_transition_ms'), state.sl.transitionMs), 120, 2000);
    if (props.sl_images !== undefined) state.sl.images = parseMediaList(p('sl_images'));
    if (props.sl_reset !== undefined && toBool(p('sl_reset'), false)) state.sl.currentLayer = 1;

    if (props.cross_enable !== undefined) state.cross.enabled = toBool(p('cross_enable'), state.cross.enabled);
    if (props.cross_hide_cursor !== undefined) state.cross.hideCursor = toBool(p('cross_hide_cursor'), state.cross.hideCursor);
    if (props.cross_style !== undefined) {
      const style = String(p('cross_style')).toLowerCase();
      state.cross.style = ['solid', 'dashed', 'dotted'].includes(style) ? style : 'solid';
    }
    if (props.cross_width !== undefined) state.cross.width = clamp(toNumber(p('cross_width'), state.cross.width), 1, 14);
    if (props.cross_color !== undefined) state.cross.color = parseColor(p('cross_color'), state.cross.color);
    if (props.cross_angle !== undefined) state.cross.angle = clamp(toNumber(p('cross_angle'), state.cross.angle), -180, 180);

    if (props.cross_blink_enable !== undefined) state.cross.blinkEnabled = toBool(p('cross_blink_enable'), state.cross.blinkEnabled);
    if (props.cross_blink_type !== undefined) {
      const blink = String(p('cross_blink_type')).toLowerCase();
      state.cross.blinkType = ['pulse', 'strobe', 'breathe', 'rainbow', 'meteor', 'none'].includes(blink) ? blink : 'none';
    }
    if (props.cross_blink_speed !== undefined) state.cross.blinkSpeed = clamp(toNumber(p('cross_blink_speed'), state.cross.blinkSpeed), 0.1, 12);
    if (props.cross_blink_strength !== undefined) state.cross.blinkStrength = clamp(toNumber(p('cross_blink_strength'), state.cross.blinkStrength), 0.1, 1);

    if (props.cross_rotate_enable !== undefined) state.cross.rotateEnabled = toBool(p('cross_rotate_enable'), state.cross.rotateEnabled);
    if (props.cross_rotate_speed !== undefined) state.cross.rotateSpeed = clamp(toNumber(p('cross_rotate_speed'), state.cross.rotateSpeed), 0, 720);
    if (props.cross_rotate_direction !== undefined) {
      const dir = String(p('cross_rotate_direction')).toLowerCase();
      state.cross.rotateDirection = dir === 'ccw' ? 'ccw' : 'cw';
    }

    syncLuoshengStatics();
    updateLuoshengMedia();
    updateSenluoLayout();
    syncCrosshairStatics();
  }

  function animateLuosheng(dt, nowMs) {
    if (state.mode !== 'luosheng') return;

    runtime.rmAngle += state.rm.rotateSpeed * dt;
    const turn = Math.floor(Math.abs(runtime.rmAngle) / 360);

    if (turn !== runtime.rmLastTurn && state.rm.images.length > 1) {
      runtime.rmLastTurn = turn;
      runtime.rmTargetImageIndex = (runtime.rmTargetImageIndex + 1) % state.rm.images.length;
      updateLuoshengMedia();
    }

    let dynamicScale = 1;
    if (state.rm.dynamic) {
      const phase = nowMs * 0.001 * Math.PI * 2 * state.rm.dynamicSpeed;
      dynamicScale = 1 + Math.sin(phase) * (state.rm.dynamicRange / 100);
    }

    const totalAngle = runtime.rmAngle + state.rm.tilt;
    dom.rmRotor.style.transform = `rotate(${totalAngle}deg) scale(${dynamicScale})`;
    dom.rmImageA.style.transform = `rotate(${-totalAngle}deg)`;
    dom.rmImageB.style.transform = `rotate(${-totalAngle}deg)`;

    if (state.rm.trailEnabled) {
      const lagA = clamp(dt / Math.max(state.rm.trailLag, 0.04), 0, 1);
      const lagB = clamp(dt / Math.max(state.rm.trailLag * 1.8, 0.04), 0, 1);
      runtime.rmTrailAngleA += (totalAngle - runtime.rmTrailAngleA) * lagA;
      runtime.rmTrailAngleB += (runtime.rmTrailAngleA - runtime.rmTrailAngleB) * lagB;

      const s = clamp(state.rm.trailStrength, 0, 1);
      dom.rmTrailA.style.opacity = `${0.12 + s * 0.5}`;
      dom.rmTrailB.style.opacity = `${0.08 + s * 0.34}`;
      dom.rmTrailA.style.borderColor = parseColor(state.rm.frameColor, '#ffd1ac');
      dom.rmTrailB.style.borderColor = parseColor(state.rm.frameColor, '#ffd1ac');
      dom.rmTrailA.style.borderWidth = `${Math.max(1, state.rm.thickness - 1)}px`;
      dom.rmTrailB.style.borderWidth = `${Math.max(1, state.rm.thickness - 2)}px`;

      dom.rmTrailA.style.transform = `rotate(${runtime.rmTrailAngleA}deg) scale(${dynamicScale * 1.004})`;
      dom.rmTrailB.style.transform = `rotate(${runtime.rmTrailAngleB}deg) scale(${dynamicScale * 1.01})`;
    } else {
      dom.rmTrailA.style.opacity = '0';
      dom.rmTrailB.style.opacity = '0';
    }
  }

  function animateCrosshair(dt) {
    if (!state.cross.enabled) return;

    runtime.crossBlinkTick += dt;

    const dirSign = state.cross.rotateDirection === 'ccw' ? -1 : 1;
    if (state.cross.rotateEnabled) {
      runtime.crossSpinAngle += dirSign * state.cross.rotateSpeed * dt;
    }

    let opacity = 1;
    let hue = 0;
    let meteor = 0;
    let color = runtime.crossBaseColor;

    if (state.cross.blinkEnabled) {
      const t = runtime.crossBlinkTick;
      const f = state.cross.blinkSpeed;
      if (state.cross.blinkType === 'pulse') {
        opacity = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * f));
      } else if (state.cross.blinkType === 'strobe') {
        opacity = Math.sin(t * Math.PI * 2 * f) > 0 ? 1 : 0.2;
      } else if (state.cross.blinkType === 'breathe') {
        opacity = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * f), 1.8);
      } else if (state.cross.blinkType === 'rainbow') {
        opacity = 0.7 + 0.3 * Math.sin(t * Math.PI * 2 * f);
        hue = (t * f * 240) % 360;
        color = `hsl(${Math.round(hue)} 100% 72%)`;
      } else if (state.cross.blinkType === 'meteor') {
        opacity = 0.85;
        meteor = (t * f * 220) % 200;
      }
    }

    if (color !== runtime.crossCurrentColor) {
      runtime.crossCurrentColor = color;
      document.documentElement.style.setProperty('--cross-color', color);
    }

    updateCrosshairTransform();
    dom.crossInner.style.opacity = `${clamp(opacity, 0, 1)}`;
    dom.crossInner.style.filter = `hue-rotate(${hue}deg)`;
    document.documentElement.style.setProperty('--cross-opacity', `${clamp(opacity, 0, 1)}`);
    document.documentElement.style.setProperty('--cross-meteor', `${meteor}%`);
  }

  function tick(nowMs) {
    const dt = clamp((nowMs - runtime.lastTime) * 0.001, 0, 0.1);
    runtime.lastTime = nowMs;

    animateLuosheng(dt, nowMs);
    if (crosshairNeedsFrameAnimation()) {
      animateCrosshair(dt);
    }

    runtime.rafId = requestAnimationFrame(tick);
  }

  function installPointerTracking() {
    const handlePointerMove = (event) => {
      if (typeof event.getCoalescedEvents === 'function') {
        const packed = event.getCoalescedEvents();
        if (packed.length > 0) {
          event = packed[packed.length - 1];
        }
      }
      runtime.crossX = Math.round(event.clientX);
      runtime.crossY = Math.round(event.clientY);
      runtime.mouseMoved = true;
      if (state.cross.enabled) {
        updateCrosshairTransform();
      }
    };

    if ('onpointerrawupdate' in window) {
      window.addEventListener('pointerrawupdate', handlePointerMove, { passive: true });
    }

    if ('onpointermove' in window) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
    } else {
      window.addEventListener('mousemove', handlePointerMove, { passive: true });
    }

    window.addEventListener('resize', () => {
      syncLuoshengStatics();
      updateSenluoLayout();
      if (!runtime.mouseMoved) {
        runtime.crossX = window.innerWidth * 0.5;
        runtime.crossY = window.innerHeight * 0.5;
        updateCrosshairTransform();
      }
    });
  }

  function bootDefaults() {
    applyModeVisibility();
    syncLuoshengStatics();
    updateLuoshengMedia();
    ensureSenluoLayers();
    updateSenluoLayout();
    syncCrosshairStatics();

    setBackground('');

    preloadImage(state.rm.images[0]);
    updateLuoshengPreloadProgress();

    runtime.rafId = requestAnimationFrame(tick);
  }

  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      applyPropertyBatch(properties || {});
    },
  };

  installPointerTracking();
  bootDefaults();
})();
