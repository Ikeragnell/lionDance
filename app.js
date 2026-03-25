/* ═══════════════════════════════════════════════════════════
   Lion Dance Trainer – app.js
   ═══════════════════════════════════════════════════════════ */

// ─── Constants ───────────────────────────────────────────────
const TILE_H          = 6;        // tile height in px
const HIT_ZONE_RATIO  = 0.82;     // hit zone at 82% canvas height
const BASE_PPS        = 160;      // pixels per second at speed 1×
const VALID_WINDOW    = 0.18;     // ±seconds shown as valid band
const COUNTDOWN_SEC   = 3;        // countdown before playback
const PAST_FADE_SEC   = 0.6;      // how long past tiles stay visible
const FLASH_MS        = 120;      // tap-key flash duration ms

const C_BG      = '#0d0d1a';
const C_DIVIDER = 'rgba(255,255,255,0.08)';
const C_HITZONE = 'rgba(255,255,255,0.30)';
const C_VALID   = 'rgba(255,255,255,0.06)';
const C_LABEL   = 'rgba(255,255,255,0.40)';
const C_CYMBAL  = '#f5a623';
const C_DRUM1   = '#e84040';
const C_DRUM2   = '#e88040';
const C_DRUM3   = '#40c8e8';
const C_DRUM4   = '#a040e8';

const DRUM_DEFS = [
    { key: 'drum1', color: C_DRUM1, label: 'S' },
    { key: 'drum2', color: C_DRUM2, label: 'D' },
    { key: 'drum3', color: C_DRUM3, label: 'K' },
    { key: 'drum4', color: C_DRUM4, label: 'L' },
];

// ─── State ────────────────────────────────────────────────────
const state = {
    pattern: { cymbal: [], drum1: [], drum2: [], drum3: [], drum4: [] },

    audio: {
        ctx: null,
        buffer: null,
        source: null,
        fileName: '',
    },

    playback: {
        playing: false,
        audioScheduledAt: 0,   // audioCtx.currentTime when audio fires
        seekOffset: 0,         // seconds into the buffer where playback started
    },

    settings: {
        speed: 1.0,
        instrument: 'both',
    },

    editor: {
        activeInst: 'cymbal',
    },

    tap: {
        active: false,
        cymbalTaps: [],
        drum1Taps: [], drum2Taps: [], drum3Taps: [], drum4Taps: [],
        audioCtxStartTime: 0,
    },

    animId: null,
};

// ─── Audio helpers ────────────────────────────────────────────
function ensureAudioCtx() {
    if (!state.audio.ctx) {
        state.audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

async function loadAudioUrl(url, name) {
    ensureAudioCtx();
    const ab = await (await fetch(url)).arrayBuffer();
    state.audio.buffer = await state.audio.ctx.decodeAudioData(ab);
    state.audio.fileName = name;
    document.getElementById('audio-filename').textContent = name;
    document.getElementById('btn-play').disabled = false;
    const dur = state.audio.buffer.duration;
    const slider = document.getElementById('seek-slider');
    slider.max   = dur;
    slider.value = 0;
    slider.disabled = false;
    document.getElementById('seek-time').textContent = '0:00 / ' + formatTime(dur);
}

function startAudioAfter(delaySec, offsetSec = 0) {
    killAudioSource();
    const src = state.audio.ctx.createBufferSource();
    src.buffer = state.audio.buffer;
    src.connect(state.audio.ctx.destination);
    const fireAt = state.audio.ctx.currentTime + delaySec;
    src.playbackRate.value = state.settings.speed;
    src.start(fireAt, offsetSec);
    state.audio.source = src;
    state.playback.audioScheduledAt = fireAt;
    state.playback.seekOffset = offsetSec;
    return fireAt;
}

function killAudioSource() {
    if (state.audio.source) {
        try { state.audio.source.stop(); } catch (_) {}
        state.audio.source = null;
    }
}

function getAudioTime() {
    if (!state.audio.ctx) return 0;
    const elapsed = state.audio.ctx.currentTime - state.playback.audioScheduledAt;
    const rate = state.audio.source?.playbackRate?.value ?? 1;
    return state.playback.seekOffset + elapsed * rate;
}

function formatTime(secs) {
    const s = Math.max(0, secs);
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// ─── Canvas ───────────────────────────────────────────────────
const canvas = document.getElementById('main-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
    const c = document.getElementById('canvas-container');
    canvas.width  = c.clientWidth  * devicePixelRatio;
    canvas.height = c.clientHeight * devicePixelRatio;
    canvas.style.width  = c.clientWidth  + 'px';
    canvas.style.height = c.clientHeight + 'px';
    ctx.scale(devicePixelRatio, devicePixelRatio);
}

function logicalSize() {
    return {
        w: canvas.width  / devicePixelRatio,
        h: canvas.height / devicePixelRatio,
    };
}

// ─── Renderer ─────────────────────────────────────────────────
function renderFrame() {
    const { w, h } = logicalSize();
    const audioTime = getAudioTime();
    const speed     = state.settings.speed;
    const pps       = BASE_PPS * speed;
    const hitY      = h * HIT_ZONE_RATIO;
    const validPx   = VALID_WINDOW * pps;
    const inst      = state.settings.instrument;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, w, h);

    if (inst === 'both') {
        const laneW = w / 5;
        drawLane(0, laneW, hitY, validPx, pps, audioTime, state.pattern.cymbal, C_CYMBAL, 'CYMBAL');
        DRUM_DEFS.forEach((d, i) => {
            const x0 = (i + 1) * laneW;
            ctx.strokeStyle = C_DIVIDER;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
            drawLane(x0, x0 + laneW, hitY, validPx, pps, audioTime, state.pattern[d.key], d.color, d.label);
        });
    } else if (inst === 'cymbal') {
        drawLane(0, w, hitY, validPx, pps, audioTime, state.pattern.cymbal, C_CYMBAL, 'CYMBAL');
    } else {
        const laneW = w / 4;
        DRUM_DEFS.forEach((d, i) => {
            const x0 = i * laneW;
            if (i > 0) {
                ctx.strokeStyle = C_DIVIDER;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
            }
            drawLane(x0, x0 + laneW, hitY, validPx, pps, audioTime, state.pattern[d.key], d.color, d.label);
        });
    }

    if (state.playback.playing) drawCountdown(audioTime, w, h);

    // sync seek slider
    if (state.audio.buffer) {
        const dur = state.audio.buffer.duration;
        const t   = Math.min(Math.max(0, audioTime), dur);
        const slider = document.getElementById('seek-slider');
        if (document.activeElement !== slider) slider.value = t;
        document.getElementById('seek-time').textContent = formatTime(t) + ' / ' + formatTime(dur);
        // auto-stop at end
        if (state.playback.playing && audioTime >= dur) stop();
    }
}

function drawLane(x0, x1, hitY, validPx, pps, audioTime, timestamps, color, label) {
    const lw = x1 - x0;
    const tw = lw * 0.55;
    const tx = x0 + (lw - tw) / 2;

    // valid window band
    ctx.fillStyle = C_VALID;
    ctx.fillRect(x0, hitY - validPx, lw, validPx * 2);

    // hit zone line
    ctx.strokeStyle = C_HITZONE;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, hitY); ctx.lineTo(x1, hitY); ctx.stroke();

    // hit zone ghost tile
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(ctx, tx, hitY - TILE_H / 2, tw, TILE_H, 5);
    ctx.fill();

    // tiles
    for (const ht of timestamps) {
        const dt = ht - audioTime;
        if (dt > (canvas.height / devicePixelRatio) / pps + 0.5) continue; // way above screen
        if (dt < -PAST_FADE_SEC) continue;                                   // long gone

        const y = hitY - dt * pps;
        if (y < -TILE_H || y > canvas.height / devicePixelRatio + TILE_H) continue;

        const past  = dt < 0;
        const inWin = Math.abs(dt) < VALID_WINDOW;

        ctx.globalAlpha = past ? Math.max(0, 1 + dt / PAST_FADE_SEC) : 1;

        if (inWin && !past) {
            // glow
            ctx.shadowColor = color;
            ctx.shadowBlur  = 18;
        }

        ctx.fillStyle = past ? hexDim(color, 0.35) : color;
        roundRect(ctx, tx, y - TILE_H / 2, tw, TILE_H, 5);
        ctx.fill();

        ctx.shadowBlur  = 0;
        ctx.globalAlpha = 1;
    }

    // lane label
    ctx.fillStyle = C_LABEL;
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x0 + lw / 2, 12);
    ctx.textBaseline = 'alphabetic';
}

function drawCountdown(audioTime, w, h) {
    if (audioTime >= 0) return;
    const secsLeft = -audioTime;
    const label = secsLeft <= 0.5 ? 'GO!' : String(Math.ceil(secsLeft));

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.round(h * 0.18)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2);
    ctx.textBaseline = 'alphabetic';
}

// ─── Utility: rounded rect ────────────────────────────────────
function roundRect(c, x, y, w, h, r) {
    if (c.roundRect) {
        c.beginPath();
        c.roundRect(x, y, w, h, r);
    } else {
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.quadraticCurveTo(x + w, y, x + w, y + r);
        c.lineTo(x + w, y + h - r);
        c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        c.lineTo(x + r, y + h);
        c.quadraticCurveTo(x, y + h, x, y + h - r);
        c.lineTo(x, y + r);
        c.quadraticCurveTo(x, y, x + r, y);
        c.closePath();
    }
}

function hexDim(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Animation loop ───────────────────────────────────────────
function startLoop() {
    if (state.animId) return;
    function loop() {
        renderFrame();
        state.animId = requestAnimationFrame(loop);
    }
    state.animId = requestAnimationFrame(loop);
}

function stopLoop() {
    if (state.animId) { cancelAnimationFrame(state.animId); state.animId = null; }
}

// ─── Playback control ─────────────────────────────────────────
function play() {
    if (!state.audio.buffer) return;
    ensureAudioCtx();
    if (state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
    state.playback.playing = true;
    const offset = parseFloat(document.getElementById('seek-slider').value) || 0;
    startAudioAfter(COUNTDOWN_SEC, offset);
    document.getElementById('btn-play').disabled = true;
    document.getElementById('btn-stop').disabled = false;
    startLoop();
}

function stop() {
    killAudioSource();
    state.playback.playing = false;
    stopLoop();
    document.getElementById('btn-play').disabled  = !state.audio.buffer;
    document.getElementById('btn-stop').disabled = true;
    renderFrame();
}

// ─── Pattern utilities ────────────────────────────────────────
function sortedUnique(arr) {
    return [...new Set(arr.map(n => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
}


function getActivePattern() { return state.pattern[state.editor.activeInst]; }
function setActivePattern(arr) {
    state.pattern[state.editor.activeInst] = sortedUnique(arr);
}

// ─── Export / Import ──────────────────────────────────────────
function exportPattern() {
    const json = JSON.stringify(state.pattern, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'lion-dance-pattern.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

function importPattern(file) {
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.cymbal) state.pattern.cymbal = sortedUnique(data.cymbal);
            if (data.drum1)  state.pattern.drum1  = sortedUnique(data.drum1);
            if (data.drum2)  state.pattern.drum2  = sortedUnique(data.drum2);
            if (data.drum3)  state.pattern.drum3  = sortedUnique(data.drum3);
            if (data.drum4)  state.pattern.drum4  = sortedUnique(data.drum4);
            refreshEditorUI();
        } catch (_) {
            alert('Invalid JSON file.');
        }
    };
    reader.readAsText(file);
}

// ─── Fine-tune list UI ────────────────────────────────────────
function refreshFineTuneList() {
    const arr  = getActivePattern();
    const list = document.getElementById('finetune-list');
    document.getElementById('ts-count').textContent = `(${arr.length})`;
    list.innerHTML = '';

    arr.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'ft-row';

        const idx = document.createElement('span');
        idx.className = 'ft-idx';
        idx.textContent = i + 1;

        const inp = document.createElement('input');
        inp.type  = 'number';
        inp.value = t.toFixed(3);
        inp.step  = '0.001';
        inp.min   = '0';
        inp.addEventListener('change', () => {
            const v = parseFloat(inp.value);
            if (!isNaN(v) && v >= 0) {
                arr[i] = v;
                setActivePattern(arr);
                refreshFineTuneList();
            }
        });

        const m10 = nudgeBtn('-10ms', () => nudge(i, -0.010));
        const p10 = nudgeBtn('+10ms', () => nudge(i, +0.010));
        const m100 = nudgeBtn('-100ms', () => nudge(i, -0.100));
        const p100 = nudgeBtn('+100ms', () => nudge(i, +0.100));

        const del = document.createElement('button');
        del.textContent = '✕';
        del.className = 'ft-del';
        del.addEventListener('click', () => {
            arr.splice(i, 1);
            setActivePattern(arr);
            refreshFineTuneList();
        });

        row.append(idx, m100, m10, inp, p10, p100, del);
        list.appendChild(row);
    });
}

function nudgeBtn(label, action) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'ft-nudge';
    b.addEventListener('click', action);
    return b;
}

function nudge(i, delta) {
    const arr = getActivePattern();
    arr[i] = Math.max(0, arr[i] + delta);
    setActivePattern(arr);
    refreshFineTuneList();
}

function refreshEditorUI() {
    refreshFineTuneList();
}

// ─── Tap recording ────────────────────────────────────────────
function startTapRecording() {
    if (!state.audio.buffer) { alert('Load an audio file first.'); return; }
    ensureAudioCtx();
    if (state.audio.ctx.state === 'suspended') state.audio.ctx.resume();

    state.tap.active       = true;
    state.tap.cymbalTaps   = [];
    state.tap.drum1Taps    = [];
    state.tap.drum2Taps    = [];
    state.tap.drum3Taps    = [];
    state.tap.drum4Taps    = [];

    const delay = Math.max(0, parseFloat(document.getElementById('tap-delay').value) || 0);
    startAudioAfter(delay);
    state.tap.audioCtxStartTime = state.playback.audioScheduledAt;

    // show canvas tiles while tapping (use playback loop)
    state.playback.playing = true;
    startLoop();

    // show tap overlay
    document.getElementById('ov-cymbal').textContent = '0';
    document.getElementById('ov-drum1').textContent  = '0';
    document.getElementById('ov-drum2').textContent  = '0';
    document.getElementById('ov-drum3').textContent  = '0';
    document.getElementById('ov-drum4').textContent  = '0';
    document.getElementById('tap-overlay').classList.remove('hidden');

    document.getElementById('tap-status').textContent = 'Recording…';
}

function stopTapRecording() {
    killAudioSource();
    state.tap.active       = false;
    state.playback.playing = false;
    stopLoop();
    renderFrame();

    document.getElementById('tap-overlay').classList.add('hidden');

    // merge taps into pattern
    state.pattern.cymbal = sortedUnique([...state.pattern.cymbal, ...state.tap.cymbalTaps]);
    state.pattern.drum1  = sortedUnique([...state.pattern.drum1,  ...state.tap.drum1Taps]);
    state.pattern.drum2  = sortedUnique([...state.pattern.drum2,  ...state.tap.drum2Taps]);
    state.pattern.drum3  = sortedUnique([...state.pattern.drum3,  ...state.tap.drum3Taps]);
    state.pattern.drum4  = sortedUnique([...state.pattern.drum4,  ...state.tap.drum4Taps]);

    document.getElementById('tap-status').textContent =
        `Done — cymbal: ${state.tap.cymbalTaps.length}, drums: ${state.tap.drum1Taps.length}/${state.tap.drum2Taps.length}/${state.tap.drum3Taps.length}/${state.tap.drum4Taps.length} taps.`;

    refreshEditorUI();

    // reopen editor
    document.getElementById('editor-modal').classList.remove('hidden');
}

function recordTap(inst) {
    if (!state.tap.active || !state.audio.ctx) return;
    const t = getAudioTime();
    if (t < 0) return;

    const tapsKey = inst === 'cymbal' ? 'cymbalTaps' : inst + 'Taps';
    state.tap[tapsKey].push(t);
    document.getElementById('ov-' + inst).textContent = state.tap[tapsKey].length;
    flashTapKey(inst);
}

function flashTapKey(inst) {
    const el = document.querySelector(`.tap-key.${inst}-key`);
    if (!el) return;
    el.classList.add(`flash-${inst}`);
    setTimeout(() => el.classList.remove(`flash-${inst}`), FLASH_MS);
}

// ─── Event listeners ──────────────────────────────────────────
function initEvents() {
    // Audio load
    document.getElementById('audio-select').addEventListener('change', e => {
        const val = e.target.value;
        if (val) loadAudioUrl(val, e.target.options[e.target.selectedIndex].text);
    });

    // Playback
    document.getElementById('btn-play').addEventListener('click', play);
    document.getElementById('btn-stop').addEventListener('click', stop);

    // Seek slider
    document.getElementById('seek-slider').addEventListener('input', e => {
        const t = parseFloat(e.target.value);
        if (state.playback.playing) {
            // restart from new position without countdown
            startAudioAfter(0, t);
        }
        if (state.audio.buffer) {
            document.getElementById('seek-time').textContent =
                formatTime(t) + ' / ' + formatTime(state.audio.buffer.duration);
        }
        renderFrame();
    });

    // Speed slider
    const slider  = document.getElementById('speed-slider');
    const speedLbl = document.getElementById('speed-value');
    slider.addEventListener('input', () => {
        state.settings.speed = parseFloat(slider.value);
        speedLbl.textContent = state.settings.speed.toFixed(2) + '×';
        if (state.audio.source) state.audio.source.playbackRate.value = state.settings.speed;
    });

    // Instrument selector
    document.getElementById('instrument-select').addEventListener('change', e => {
        state.settings.instrument = e.target.value;
        renderFrame();
    });

    // Export / Import
    document.getElementById('btn-export').addEventListener('click', exportPattern);
    document.getElementById('btn-import').addEventListener('click', () =>
        document.getElementById('import-file-input').click());
    document.getElementById('import-file-input').addEventListener('change', e => {
        if (e.target.files[0]) importPattern(e.target.files[0]);
        e.target.value = '';
    });

    // Editor open/close
    document.getElementById('btn-open-editor').addEventListener('click', openEditor);
    document.getElementById('btn-close-editor').addEventListener('click', closeEditor);
    document.getElementById('editor-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('editor-modal')) closeEditor();
    });

    // Instrument tabs
    document.querySelectorAll('.inst-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.inst-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.editor.activeInst = btn.dataset.inst;
            refreshEditorUI();
        });
    });

    // Tap panel
    document.getElementById('btn-tap-start').addEventListener('click', () => {
        closeEditor();
        startTapRecording();
    });
    document.getElementById('btn-tap-stop').addEventListener('click', stopTapRecording);
    document.getElementById('btn-tap-overlay-stop').addEventListener('click', stopTapRecording);

    // Fine-tune add / clear
    document.getElementById('btn-ts-add').addEventListener('click', () => {
        const arr = getActivePattern();
        setActivePattern([...arr, 0]);
        refreshFineTuneList();
    });
    document.getElementById('btn-ts-clear').addEventListener('click', () => {
        if (!confirm(`Clear all ${state.editor.activeInst} timestamps?`)) return;
        setActivePattern([]);
        refreshEditorUI();
    });
    document.getElementById('btn-ts-clear-all').addEventListener('click', () => {
        if (!confirm('Clear ALL timestamps for every instrument?')) return;
        state.pattern.cymbal = [];
        state.pattern.drum1  = [];
        state.pattern.drum2  = [];
        state.pattern.drum3  = [];
        state.pattern.drum4  = [];
        refreshEditorUI();
    });

    // Keyboard
    document.addEventListener('keydown', e => {
        if (state.tap.active) {
            if (e.code === 'KeyC') { e.preventDefault(); recordTap('cymbal'); }
            if (e.code === 'KeyS') { e.preventDefault(); recordTap('drum1'); }
            if (e.code === 'KeyD') { e.preventDefault(); recordTap('drum2'); }
            if (e.code === 'KeyK') { e.preventDefault(); recordTap('drum3'); }
            if (e.code === 'KeyL') { e.preventDefault(); recordTap('drum4'); }
            if (e.code === 'Escape') stopTapRecording();
        }
    });

    // Resize
    window.addEventListener('resize', () => { resizeCanvas(); renderFrame(); });
}

function openEditor() {
    refreshEditorUI();
    document.getElementById('editor-modal').classList.remove('hidden');
}

function closeEditor() {
    document.getElementById('editor-modal').classList.add('hidden');
}

// ─── Init ─────────────────────────────────────────────────────
function init() {
    resizeCanvas();
    initEvents();
    renderFrame();
    document.getElementById('btn-stop').disabled = true;
}

init();
