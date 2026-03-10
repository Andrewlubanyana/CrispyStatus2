/* ==========================================================
   CRISPY STATUS — App Logic
   
   Quality Engine v2:
   - Smart resolution detection (portrait vs landscape)
   - CRF-based encoding (quality per frame, not fixed bitrate)
   - H.264 Main Profile 3.1 (WhatsApp's native format)
   - File size optimized to stay under WhatsApp's re-compression threshold
   - Keyframe interval matched to WhatsApp's expectations
   ========================================================== */

/* ======================== CONFIG ======================== */
var CONFIG = {
    maxDuration   : 30,
    maxFileSize   : 500,
    dailyFreeUses : 1,

    // Quality settings optimized for WhatsApp Status
    // The goal: output a file so close to WhatsApp's internal format
    // that WhatsApp has almost nothing left to compress
    quality: {
        shortSide   : 540,     // pixels on the shorter dimension
        crf         : 23,      // quality level (18=high, 23=balanced, 28=small)
        maxBitrate  : '2500k', // cap to prevent file size spikes
        bufSize     : '5000k', // rate control buffer
        audioBitrate: '128k',
        audioRate   : 44100,
        fps         : 30,
        preset      : 'fast',  // encoding speed vs compression efficiency
        profile     : 'main',  // H.264 profile WhatsApp uses internally
        level       : '3.1',   // H.264 level
        keyint      : 30,      // keyframe every 1 second (fps / 1)
    },

    cdnUrls: [
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
    ],
};

var FUN_MESSAGES = [
    '🍳 Frying up the pixels…',
    '✨ Sharpening every frame…',
    '🧹 Sweeping away the blur…',
    '👨‍🍳 Almost gourmet quality…',
    '🧂 Adding a pinch of clarity…',
    '🎨 Painting in HD…',
    '🔥 Turning up the crispness…',
    '💎 Polishing your masterpiece…',
    '🎯 Fine-tuning the details…',
    '🚀 Almost there…',
];

var QUALITY_TIPS = [
    { icon: '📱', title: 'Post directly to Status',
      text: 'Open WhatsApp → Status tab → pick the crispy video from your gallery. Don\'t use any other app to send it.' },
    { icon: '🚫', title: 'Don\'t re-edit the video',
      text: 'Any editing, filtering, or trimming after download will re-compress and kill the quality.' },
    { icon: '📂', title: 'Use the downloaded file only',
      text: 'Never screenshot or screen-record your video. Always use the actual downloaded MP4 file.' },
    { icon: '⚡', title: 'Post it immediately',
      text: 'Some phones re-compress videos in your gallery over time. Post to Status right after downloading.' },
    { icon: '🔄', title: 'Don\'t forward the Status',
      text: 'Forwarding a Status video compresses it again. Ask people to save the original instead.' },
];

/* ======================== STATE ======================== */
var state = {
    file         : null,
    objectUrl    : null,
    duration     : 0,
    trimStart    : 0,
    originalSize : 0,
    videoWidth   : 0,
    videoHeight  : 0,
    isPortrait   : true,
    outputBlob   : null,
    outputUrl    : null,
    outputSize   : 0,
    ffmpeg       : null,
    ffmpegReady  : false,
    processing   : false,
    cancelled    : false,
    tipsShown    : false,
    installPrompt: null,
};

/* ======================== LOGGING ======================== */
function log(msg, data) {
    var ts = new Date().toISOString().substr(11, 12);
    if (data !== undefined) console.log('[Crispy ' + ts + '] ' + msg, data);
    else console.log('[Crispy ' + ts + '] ' + msg);
}
function logError(msg, err) {
    console.error('[Crispy ERROR] ' + msg, err);
}

/* ======================== DOM ======================== */
function $(id) { return document.getElementById(id); }

var els = {
    homeScreen       : $('home-screen'),
    trimScreen       : $('trim-screen'),
    processingScreen : $('processing-screen'),
    doneScreen       : $('done-screen'),
    uploadBtn        : $('upload-btn'),
    fileInput        : $('file-input'),
    trimBackBtn      : $('trim-back-btn'),
    trimVideo        : $('trim-video'),
    playPreviewBtn   : $('play-preview-btn'),
    trimSlider       : $('trim-slider'),
    trimWindow       : $('trim-window'),
    trimStartTime    : $('trim-start-time'),
    trimEndTime      : $('trim-end-time'),
    trimFileName     : $('trim-file-name'),
    trimFileDur      : $('trim-file-dur'),
    trimDurLabel     : $('trim-dur-label'),
    trimContinueBtn  : $('trim-continue-btn'),
    processingStatus : $('processing-status'),
    progressFill     : $('progress-fill'),
    progressText     : $('progress-text'),
    funTip           : $('fun-tip'),
    cancelBtn        : $('cancel-btn'),
    donePreview      : $('done-preview'),
    donePlayBtn      : $('done-play-btn'),
    statBefore       : $('stat-before'),
    statAfter        : $('stat-after'),
    statSaved        : $('stat-saved'),
    downloadBtn      : $('download-btn'),
    shareBtn         : $('share-btn'),
    tipsSection      : $('tips-section'),
    tipsList         : $('tips-list'),
    newVideoBtn      : $('new-video-btn'),
    premiumModal     : $('premium-modal'),
    upgradeBtn       : $('upgrade-btn'),
    premiumCloseBtn  : $('premium-close-btn'),
    errorModal       : $('error-modal'),
    errorMsg         : $('error-msg'),
    errorCloseBtn    : $('error-close-btn'),
    installPrompt    : $('install-prompt'),
    installYes       : $('install-yes'),
    installDismiss   : $('install-dismiss'),
    confettiCanvas   : $('confetti-canvas'),
};

/* ======================== toBlobURL ======================== */
async function toBlobURL(url, mimeType) {
    log('Fetching: ' + url);
    var response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
    var buffer = await response.arrayBuffer();
    var blob = new Blob([buffer], { type: mimeType });
    var blobUrl = URL.createObjectURL(blob);
    log('Blob ready: ' + url.split('/').pop() + ' (' + formatBytes(buffer.byteLength) + ')');
    return blobUrl;
}

/* ======================== SCREENS ======================== */
function showScreen(id) {
    log('Screen → ' + id);
    document.querySelectorAll('.screen').forEach(function(s) {
        s.classList.remove('active', 'screen-enter');
    });
    $(id).classList.add('active', 'screen-enter');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!history.state || history.state.screen !== id) {
        history.pushState({ screen: id }, '', '');
    }
}

/* ======================== TOAST ======================== */
function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3000;
    var container = $('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    var icons = { success: '✅', error: '❌', info: '💡' };
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || '💡') + '</span><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(function() {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', function() { toast.remove(); });
    }, duration);
}

/* ======================== CONFETTI ======================== */
function fireConfetti() {
    var canvas = els.confettiCanvas;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var colors = ['#FF6B35', '#FF3366', '#8B5CF6', '#22D67F', '#FBBF24', '#06B6D4', '#fff'];
    var particles = [];
    for (var i = 0; i < 90; i++) {
        particles.push({
            x: canvas.width / 2 + (Math.random() - 0.5) * 100,
            y: canvas.height * 0.35,
            vx: (Math.random() - 0.5) * 18,
            vy: Math.random() * -20 - 8,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 12,
            gravity: 0.4 + Math.random() * 0.2,
            opacity: 1,
            shape: Math.random() > 0.5 ? 'circle' : 'rect',
        });
    }
    var frame = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(function(p) {
            p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.vx *= 0.99;
            p.rotation += p.rotSpeed;
            p.opacity = Math.max(0, 1 - frame / 150);
            ctx.save(); ctx.globalAlpha = p.opacity;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation * Math.PI / 180);
            ctx.fillStyle = p.color;
            if (p.shape === 'circle') {
                ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            }
            ctx.restore();
        });
        frame++;
        if (frame < 150) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(draw);
}

/* ======================== HAPTIC ======================== */
function haptic(style) {
    if (!navigator.vibrate) return;
    var p = { light: [12], medium: [25], heavy: [50], success: [15, 50, 15] };
    navigator.vibrate(p[style || 'light'] || [12]);
}

/* ======================== DAILY LIMIT ======================== */
function canUseToday() {
    var today = new Date().toDateString();
    var saved = localStorage.getItem('crispy_date');
    var count = parseInt(localStorage.getItem('crispy_count') || '0', 10);
    if (saved !== today) return true;
    return count < CONFIG.dailyFreeUses;
}
function markUsed() {
    var today = new Date().toDateString();
    var saved = localStorage.getItem('crispy_date');
    var count = 0;
    if (saved === today) count = parseInt(localStorage.getItem('crispy_count') || '0', 10);
    localStorage.setItem('crispy_date', today);
    localStorage.setItem('crispy_count', String(count + 1));
}

/* ======================== MODALS ======================== */
function showPremium() {
    els.premiumModal.classList.remove('hidden');
    var card = els.premiumModal.querySelector('.modal-card');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    haptic('medium');
}
function hidePremium() { els.premiumModal.classList.add('hidden'); }

function showError(title, msg) {
    $('error-heading').textContent = title;
    els.errorMsg.textContent = msg;
    els.errorModal.classList.remove('hidden');
    haptic('heavy');
}
function hideError() { els.errorModal.classList.add('hidden'); }

/* ======================== FILE HANDLING ======================== */
function handleFileSelect(file) {
    log('File:', { name: file.name, size: formatBytes(file.size), type: file.type });

    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|avi|mkv|webm|3gp)$/i)) {
        showError('Not a video', 'Please select a video file.');
        return;
    }
    if (file.size > CONFIG.maxFileSize * 1024 * 1024) {
        showError('File too large', 'Please pick a video under ' + CONFIG.maxFileSize + ' MB.');
        return;
    }
    if (file.size < 10000) {
        showError('File too small', 'This file seems too small to be a video.');
        return;
    }

    cleanup();
    state.file = file;
    state.originalSize = file.size;
    state.objectUrl = URL.createObjectURL(file);

    setButtonLoading(els.uploadBtn, true);
    els.trimVideo.src = state.objectUrl;

    els.trimVideo.onloadedmetadata = function() {
        setButtonLoading(els.uploadBtn, false);
        state.duration = els.trimVideo.duration;

        // Detect video orientation
        state.videoWidth = els.trimVideo.videoWidth;
        state.videoHeight = els.trimVideo.videoHeight;
        state.isPortrait = state.videoHeight >= state.videoWidth;

        log('Video info:', {
            duration: state.duration + 's',
            dimensions: state.videoWidth + 'x' + state.videoHeight,
            orientation: state.isPortrait ? 'portrait' : 'landscape'
        });

        if (isNaN(state.duration) || state.duration < 0.5) {
            showError('Invalid video', 'Could not read this video. Try a different file.');
            return;
        }
        if (state.duration > CONFIG.maxDuration) {
            setupTrimmer();
            showScreen('trim-screen');
        } else {
            state.trimStart = 0;
            startProcessing();
        }
    };

    els.trimVideo.onerror = function() {
        setButtonLoading(els.uploadBtn, false);
        showError('Unsupported format', 'This video format is not supported. Try MP4 or MOV.');
    };
}

function setButtonLoading(btn, loading) {
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

/* ======================== TRIMMER ======================== */
function setupTrimmer() {
    var maxStart = Math.max(0, state.duration - CONFIG.maxDuration);
    var clipDur = Math.min(CONFIG.maxDuration, state.duration);
    els.trimSlider.min = 0;
    els.trimSlider.max = maxStart;
    els.trimSlider.value = 0;
    els.trimSlider.step = 0.1;
    state.trimStart = 0;
    els.trimFileName.textContent = truncateFilename(state.file.name, 25);
    els.trimFileDur.textContent = formatTime(state.duration) + ' total';
    els.trimDurLabel.textContent = Math.round(clipDur) + 's selected';
    updateTrimUI();
    els.playPreviewBtn.classList.remove('hide');
    els.playPreviewBtn.textContent = '▶';
    els.trimVideo.pause();
    els.trimVideo.currentTime = 0;
}

function updateTrimUI() {
    var start = parseFloat(els.trimSlider.value);
    var dur = state.duration;
    var clipDur = Math.min(CONFIG.maxDuration, dur);
    els.trimWindow.style.width = (clipDur / dur) * 100 + '%';
    els.trimWindow.style.left = (start / dur) * 100 + '%';
    els.trimStartTime.textContent = formatTime(start);
    els.trimEndTime.textContent = formatTime(start + clipDur);
    state.trimStart = start;
}

/* ======================== FFMPEG ======================== */
async function loadFFmpeg() {
    if (state.ffmpegReady) { log('FFmpeg already loaded'); return; }

    log('=== Loading FFmpeg ===');

    if (typeof FFmpegWASM === 'undefined') {
        logError('FFmpegWASM not found');
        throw new Error('SCRIPT_NOT_LOADED');
    }

    state.ffmpeg = new FFmpegWASM.FFmpeg();

    state.ffmpeg.on('log', function(ev) {
        console.log('[FFmpeg]', ev.message);
    });
    state.ffmpeg.on('progress', function(ev) {
        var pct = Math.min(Math.round(ev.progress * 100), 100);
        if (pct > 0) setProgress(pct);
    });

    var loaded = false;
    for (var i = 0; i < CONFIG.cdnUrls.length; i++) {
        var base = CONFIG.cdnUrls[i];
        try {
            log('Trying CDN: ' + base);
            updateStatus('Downloading Crispy engine… ⬇️');

            var coreURL = await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript');
            var wasmURL = await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm');

            updateStatus('Starting engine… 🔧');
            await state.ffmpeg.load({ coreURL: coreURL, wasmURL: wasmURL });

            loaded = true;
            log('FFmpeg loaded ✅ from ' + base);
            break;
        } catch (err) {
            logError('CDN failed: ' + base, err.message || err);
        }
    }

    if (!loaded) throw new Error('ENGINE_LOAD_FAILED');
    state.ffmpegReady = true;
}

/* ======================== SMART SCALE FILTER ========================
   Builds the optimal scale filter based on video orientation.
   
   Strategy: Scale the SHORTER side to 540px.
   - Portrait video (1080x1920) → 540x960
   - Landscape video (1920x1080) → 960x540
   - Square video (1080x1080) → 540x540
   
   The -2 ensures dimensions are divisible by 2 (required by H.264).
   ================================================================== */
function buildScaleFilter() {
    var shortSide = CONFIG.quality.shortSide;

    if (state.isPortrait) {
        // Width is the shorter side
        // If already smaller than target, don't upscale
        if (state.videoWidth <= shortSide) {
            log('Video already small enough, no resize needed');
            return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
        }
        log('Portrait: scaling width to ' + shortSide + 'px');
        return 'scale=' + shortSide + ':-2';
    } else {
        // Height is the shorter side
        if (state.videoHeight <= shortSide) {
            log('Video already small enough, no resize needed');
            return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
        }
        log('Landscape: scaling height to ' + shortSide + 'px');
        return 'scale=-2:' + shortSide;
    }
}

/* ======================== PROCESSING ======================== */
async function startProcessing() {
    if (state.processing) return;
    state.processing = true;
    state.cancelled = false;

    showScreen('processing-screen');
    setProgress(0);
    startFunMessages();

    try {
        // STEP 1: Load engine
        if (!state.ffmpegReady) {
            updateStatus('Loading Crispy engine… 🔧');
            await loadFFmpeg();
        }
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 2: Read file
        updateStatus('Reading your video… 📖');
        var fileData = new Uint8Array(await state.file.arrayBuffer());
        log('File read: ' + formatBytes(fileData.byteLength));
        await state.ffmpeg.writeFile('input', fileData);
        log('Written to FFmpeg ✅');
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 3: Build optimized command
        updateStatus('Making it crispy… 🍳');
        var q = CONFIG.quality;
        var clipDur = Math.min(CONFIG.maxDuration, state.duration);
        var scaleFilter = buildScaleFilter();

        var cmd = [
            '-y',
            '-ss', String(state.trimStart),
            '-i', 'input',
            '-t', String(clipDur),

            // Video filters: scale + force even dimensions
            '-vf', scaleFilter,

            // H.264 encoding — matched to WhatsApp's internal format
            '-c:v', 'libx264',
            '-preset', q.preset,
            '-crf', String(q.crf),
            '-profile:v', q.profile,
            '-level', q.level,
            '-maxrate', q.maxBitrate,
            '-bufsize', q.bufSize,

            // Keyframe interval: 1 keyframe per second
            // This helps WhatsApp process the video cleanly
            '-g', String(q.keyint),
            '-keyint_min', String(q.keyint),

            // Frame rate
            '-r', String(q.fps),

            // Pixel format (required for maximum compatibility)
            '-pix_fmt', 'yuv420p',

            // Audio — AAC at standard broadcast quality
            '-c:a', 'aac',
            '-b:a', q.audioBitrate,
            '-ar', String(q.audioRate),
            '-ac', '2',

            // Place metadata at start of file for instant playback
            '-movflags', '+faststart',

            'output.mp4'
        ];

        log('FFmpeg command: ffmpeg ' + cmd.join(' '));
        log('Expected output: ~' + estimateFileSize(clipDur) + ' for ' + clipDur + 's');

        var exitCode = await state.ffmpeg.exec(cmd);
        log('Exit code: ' + exitCode);

        if (exitCode !== 0) throw new Error('FFMPEG_ERROR');
        if (state.cancelled) 
