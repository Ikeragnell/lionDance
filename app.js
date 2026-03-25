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
const C_DRUM    = '#e84040';

// ─── State ────────────────────────────────────────────────────
const state = {
    pattern: { cymbal: [], drum: [] },

    audio: {
        ctx: null,
        buffer: null,
        source: null,
        fileName: '',
    },

    playback: {
        playing: false,
        audioScheduledAt: 0,   // audioCtx.currentTime when audio fires
    },

    settings: {
        speed: 1.0,
        instrument: 'both',
    },

    editor: {
        activeInst: 'cymbal',
        activeMode: 'bpm',
        // BPM grid
        bpm: 120,
        beatsPerBar: 4,
        stepsPerBeat: 4,
        numBars: 4,
        bpmStart: 0,
        selectedSteps: new Set(),
    },

    tap: {
        active: false,
        cymbalTaps: [],
        drumTaps: [],
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

async function loadAudioFile(file) {
    ensureAudioCtx();
    const ab = await file.arrayBuffer();
    state.audio.buffer = await state.audio.ctx.decodeAudioData(ab);
    state.audio.fileName = file.name;
    document.getElementById('audio-filename').textContent = file.name;
    document.getElementById('btn-play').disabled = false;
}

function startAudioAfter(delaySec) {
    killAudioSource();
    const src = state.audio.ctx.createBufferSource();
    src.buffer = state.audio.buffer;
    src.connect(state.audio.ctx.destination);
    const fireAt = state.audio.ctx.currentTime + delaySec;
    src.playbackRate.value = state.settings.speed;
    src.start(fireAt);
    state.audio.source = src;
    state.playback.audioScheduledAt = fireAt;
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
    return elapsed * rate;
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
        const mid = w / 2;
        // divider
        ctx.strokeStyle = C_DIVIDER;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mid, 0); ctx.lineTo(mid, h); ctx.stroke();
        drawLane(0,   mid, hitY, validPx, pps, audioTime, state.pattern.cymbal, C_CYMBAL, 'CYMBAL');
        drawLane(mid, w,   hitY, validPx, pps, audioTime, state.pattern.drum,   C_DRUM,   'DRUM');
    } else if (inst === 'cymbal') {
        drawLane(0, w, hitY, validPx, pps, audioTime, state.pattern.cymbal, C_CYMBAL, 'CYMBAL');
    } else {
        drawLane(0, w, hitY, validPx, pps, audioTime, state.pattern.drum, C_DRUM, 'DRUM');
    }

    if (state.playback.playing) drawCountdown(audioTime, w, h);
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
    startAudioAfter(COUNTDOWN_SEC);
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

function parseTimestampText(text) {
    return sortedUnique(
        text.split(/[\s,;]+/)
            .map(s => parseFloat(s.trim()))
            .filter(n => !isNaN(n) && n >= 0)
    );
}

function bpmGridToTimestamps() {
    const { bpm, beatsPerBar, stepsPerBeat, numBars, bpmStart, selectedSteps } = state.editor;
    const stepDur = 60 / bpm / stepsPerBeat;
    const result  = [];
    selectedSteps.forEach(i => result.push(bpmStart + i * stepDur));
    return result;
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
            if (data.drum)   state.pattern.drum   = sortedUnique(data.drum);
            refreshEditorUI();
        } catch (_) {
            alert('Invalid JSON file.');
        }
    };
    reader.readAsText(file);
}

// ─── BPM Grid UI ─────────────────────────────────────────────
function rebuildBpmGrid() {
    const { beatsPerBar, stepsPerBeat, numBars, selectedSteps } = state.editor;
    const stepsPerBar  = beatsPerBar * stepsPerBeat;
    const totalSteps   = stepsPerBar * numBars;
    const grid         = document.getElementById('bpm-grid');

    grid.innerHTML = '';
    grid.style.gridTemplateColumns = `repeat(${stepsPerBar}, 1fr)`;

    for (let i = 0; i < totalSteps; i++) {
        const btn = document.createElement('button');
        btn.className = 'grid-step';
        if (i % stepsPerBeat === 0) btn.classList.add('beat-start');
        if (i % stepsPerBar  === 0) btn.classList.add('bar-start');
        if (selectedSteps.has(i))   btn.classList.add('active');
        btn.addEventListener('click', () => {
            selectedSteps.has(i) ? selectedSteps.delete(i) : selectedSteps.add(i);
            btn.classList.toggle('active');
        });
        grid.appendChild(btn);
    }
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

function syncTextarea() {
    document.getElementById('ts-textarea').value =
        getActivePattern().map(t => t.toFixed(3)).join('\n');
}

function refreshEditorUI() {
    refreshFineTuneList();
    syncTextarea();
}

// ─── Tap recording ────────────────────────────────────────────
function startTapRecording() {
    if (!state.audio.buffer) { alert('Load an audio file first.'); return; }
    ensureAudioCtx();
    if (state.audio.ctx.state === 'suspended') state.audio.ctx.resume();

    state.tap.active       = true;
    state.tap.cymbalTaps   = [];
    state.tap.drumTaps     = [];

    // start audio immediately (no countdown in tap mode — listen live)
    startAudioAfter(0);
    state.tap.audioCtxStartTime = state.playback.audioScheduledAt;

    // show canvas tiles while tapping (use playback loop)
    state.playback.playing = true;
    startLoop();

    // show tap overlay
    document.getElementById('ov-cymbal').textContent = '0';
    document.getElementById('ov-drum').textContent   = '0';
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
    const cymbal = sortedUnique([...state.pattern.cymbal, ...state.tap.cymbalTaps]);
    const drum   = sortedUnique([...state.pattern.drum,   ...state.tap.drumTaps]);
    state.pattern.cymbal = cymbal;
    state.pattern.drum   = drum;

    const total = state.tap.cymbalTaps.length + state.tap.drumTaps.length;
    document.getElementById('tap-status').textContent =
        `Done — recorded ${state.tap.cymbalTaps.length} cymbal, ${state.tap.drumTaps.length} drum taps.`;

    refreshEditorUI();

    // reopen editor
    document.getElementById('editor-modal').classList.remove('hidden');
}

function recordTap(inst) {
    if (!state.tap.active || !state.audio.ctx) return;
    const t = getAudioTime();
    if (t < 0) return;

    if (inst === 'cymbal') {
        state.tap.cymbalTaps.push(t);
        document.getElementById('ov-cymbal').textContent = state.tap.cymbalTaps.length;
        flashTapKey('cymbal');
    } else {
        state.tap.drumTaps.push(t);
        document.getElementById('ov-drum').textContent = state.tap.drumTaps.length;
        flashTapKey('drum');
    }
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
    document.getElementById('btn-load-audio').addEventListener('click', () =>
        document.getElementById('audio-file-input').click());
    document.getElementById('audio-file-input').addEventListener('change', e => {
        if (e.target.files[0]) loadAudioFile(e.target.files[0]);
        e.target.value = '';
    });

    // Playback
    document.getElementById('btn-play').addEventListener('click', play);
    document.getElementById('btn-stop').addEventListener('click', stop);

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

    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
            document.getElementById('panel-' + btn.dataset.mode).classList.remove('hidden');
            state.editor.activeMode = btn.dataset.mode;
        });
    });

    // BPM param changes → rebuild grid
    ['bpm-input','beats-per-bar','steps-per-beat','num-bars','bpm-start'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            state.editor.bpm          = parseFloat(document.getElementById('bpm-input').value)     || 120;
            state.editor.beatsPerBar  = parseInt(document.getElementById('beats-per-bar').value)   || 4;
            state.editor.stepsPerBeat = parseInt(document.getElementById('steps-per-beat').value)  || 4;
            state.editor.numBars      = parseInt(document.getElementById('num-bars').value)        || 4;
            state.editor.bpmStart     = parseFloat(document.getElementById('bpm-start').value)     || 0;
            state.editor.selectedSteps.clear();
            rebuildBpmGrid();
        });
    });

    document.getElementById('btn-bpm-clear-sel').addEventListener('click', () => {
        state.editor.selectedSteps.clear();
        rebuildBpmGrid();
    });

    document.getElementById('btn-bpm-apply').addEventListener('click', () => {
        const newTs = bpmGridToTimestamps();
        setActivePattern([...getActivePattern(), ...newTs]);
        refreshEditorUI();
    });

    document.getElementById('btn-bpm-replace').addEventListener('click', () => {
        setActivePattern(bpmGridToTimestamps());
        refreshEditorUI();
    });

    // Timestamps panel
    document.getElementById('btn-ts-apply').addEventListener('click', () => {
        setActivePattern(parseTimestampText(document.getElementById('ts-textarea').value));
        refreshFineTuneList();
    });
    document.getElementById('btn-ts-merge').addEventListener('click', () => {
        const parsed = parseTimestampText(document.getElementById('ts-textarea').value);
        setActivePattern([...getActivePattern(), ...parsed]);
        refreshFineTuneList();
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

    // Keyboard
    document.addEventListener('keydown', e => {
        if (state.tap.active) {
            if (e.code === 'KeyC') { e.preventDefault(); recordTap('cymbal'); }
            if (e.code === 'KeyD') { e.preventDefault(); recordTap('drum'); }
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
    rebuildBpmGrid();
    renderFrame();
    document.getElementById('btn-stop').disabled = true;
}

init();
