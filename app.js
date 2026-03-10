/* ==========================================================
   CRISPY STATUS — App Logic
   Quality Engine v3 — Maximum WhatsApp Quality

   Strategy: Output the highest visual quality that stays
   under WhatsApp's re-compression threshold.
   
   WhatsApp's internal behavior:
   - Under ~5MB/30s: passes through with minimal compression
   - 5-10MB: light re-compression
   - Over 10MB: heavy re-compression
   
   Our approach:
   - CRF 18 (high quality per frame)
   - 640px short side (sharp on all phones)
   - High profile 4.0 (advanced encoding tools)
   - Medium preset (best quality-per-byte)
   - Smart CRF scaling based on duration
   - Maxrate cap prevents file size spikes
   ========================================================== */

/* ======================== CONFIG ======================== */
var CONFIG = {
    maxDuration   : 30,
    maxFileSize   : 500,
    dailyFreeUses : 1,

    quality: {
        // Resolution: 640px on the shorter dimension
        // Portrait 9:16 → 640×1138  |  Landscape 16:9 → 1138×640
        // This is the sweet spot: sharper than 540, smaller files than 720
        shortSide    : 640,

        // CRF 18 = high quality. Scale: 0 (lossless) to 51 (trash)
        // 18 is visually near-transparent quality
        // We dynamically adjust this based on duration (see getSmartCRF)
        baseCRF      : 18,

        // Bitrate ceiling — prevents file size spikes on complex scenes
        maxBitrate   : '3000k',
        bufSize      : '6000k',

        // Audio
        audioBitrate : '128k',
        audioRate    : 44100,
        audioChannels: 2,

        // Encoding
        fps          : 30,
        preset       : 'medium',   // Best quality-per-byte without being glacially slow
        profile      : 'high',     // Unlocks CABAC entropy coding + 8×8 DCT transforms
        level        : '4.0',      // Supports up to 1080p30
        keyint       : 30,         // 1 keyframe per second

        // File size targets (MB) — stay under WhatsApp's threshold
        targetMaxMB  : 5.5,        // Ideal max file size for 30s
        absoluteMaxMB: 8,          // Hard ceiling before WhatsApp gets aggressive
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
    '📐 Optimizing every pixel…',
    '🏆 Making it Status-worthy…',
];

var QUALITY_TIPS = [
    { icon: '📱', title: 'Post directly to Status',
      text: 'Open WhatsApp → Status → pick the crispy video. Don\'t use any other app or editor to open it first.' },
    { icon: '🚫', title: 'Never re-edit after download',
      text: 'Any trimming, filtering, or editing will re-compress your video and destroy the quality we just saved.' },
    { icon: '📂', title: 'Use the actual downloaded file',
      text: 'Don\'t screen-record, screenshot, or forward the video. Always use the original downloaded MP4.' },
    { icon: '⚡', title: 'Post immediately after download',
      text: 'Some phones re-compress gallery videos over time. Post to Status right after downloading for best results.' },
    { icon: '🔄', title: 'Don\'t forward the Status',
      text: 'When someone forwards your Status, WhatsApp compresses it again. Share the original file instead.' },
    { icon: '📶', title: 'Use Wi-Fi when posting',
      text: 'WhatsApp may compress more aggressively on mobile data to save bandwidth. Use Wi-Fi for best upload quality.' },
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
    log('Blob ready: ' + url.split('/').pop() + ' (' + formatBytes(buffer.byteLength) + ')');
    return URL.createObjectURL(blob);
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
        state.videoWidth = els.trimVideo.videoWidth;
        state.videoHeight = els.trimVideo.videoHeight;
        state.isPortrait = state.videoHeight >= state.videoWidth;

        log('Video info:', {
            duration: state.duration.toFixed(1) + 's',
            dimensions: state.videoWidth + '×' + state.videoHeight,
            orientation: state.isPortrait ? 'portrait' : 'landscape',
            originalSize: formatBytes(state.originalSize)
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
        showError('Unsupported format', 'Try MP4 or MOV format.');
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
            log('FFmpeg loaded ✅');
            break;
        } catch (err) {
            logError('CDN failed: ' + base, err.message || err);
        }
    }

    if (!loaded) throw new Error('ENGINE_LOAD_FAILED');
    state.ffmpegReady = true;
}

/* ======================== SMART QUALITY ENGINE ========================
   
   The core intelligence of Crispy Status.
   
   Problem: WhatsApp re-compresses videos above a certain quality/size.
   Solution: Calculate the MAXIMUM quality we can deliver while staying
   under WhatsApp's re-compression threshold.
   
   Variables we control:
   - CRF (quality per frame)
   - Resolution (pixel count)
   - Maxrate (bitrate ceiling)
   
   The math:
   - Target file size: ~5MB for 30 seconds
   - Available video bitrate: (5MB × 8) / 30s = ~1.3 Mbps
   - At 640p with CRF 18, typical output: ~2-3 Mbps
   - Maxrate cap at 3Mbps prevents spikes
   - For shorter videos, we can afford higher quality (lower CRF)
   - For longer videos, we tighten slightly (higher CRF)
   
   ================================================================== */

// Calculate the optimal CRF based on video duration
// Shorter videos get HIGHER quality because file size budget is easier to hit
function getSmartCRF(durationSec) {
    var q = CONFIG.quality;

    if (durationSec <= 5) {
        // Very short clip — max quality, file will be tiny
        var crf = q.baseCRF - 4; // CRF 14
        log('Smart CRF: ' + crf + ' (very short video, max quality)');
        return crf;
    }
    if (durationSec <= 10) {
        // Short — still generous
        var crf = q.baseCRF - 2; // CRF 16
        log('Smart CRF: ' + crf + ' (short video, high quality)');
        return crf;
    }
    if (durationSec <= 20) {
        // Medium — base quality
        log('Smart CRF: ' + q.baseCRF + ' (medium video, base quality)');
        return q.baseCRF; // CRF 18
    }
    if (durationSec <= 30) {
        // Full length — slight tightening to control file size
        var crf = q.baseCRF + 1; // CRF 19
        log('Smart CRF: ' + crf + ' (full length, optimized quality)');
        return crf;
    }

    // Shouldn't reach here, but safety
    return q.baseCRF + 2;
}

// Build the optimal scale filter based on orientation and source resolution
function buildScaleFilter() {
    var target = CONFIG.quality.shortSide;
    var w = state.videoWidth;
    var h = state.videoHeight;

    if (state.isPortrait) {
        // Portrait: width is the shorter side
        if (w <= target) {
            log('Scale: source (' + w + 'px wide) already ≤ target (' + target + 'px), keeping original');
            // Still ensure even dimensions for H.264
            return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
        }
        log('Scale: portrait ' + w + '×' + h + ' → ' + target + '×auto');
        return 'scale=' + target + ':-2';
    } else {
        // Landscape: height is the shorter side
        if (h <= target) {
            log('Scale: source (' + h + 'px tall) already ≤ target (' + target + 'px), keeping original');
            return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
        }
        log('Scale: landscape ' + w + '×' + h + ' → auto×' + target);
        return 'scale=-2:' + target;
    }
}

// Build the complete FFmpeg command with all quality optimizations
function buildFFmpegCommand(clipDuration) {
    var q = CONFIG.quality;
    var smartCRF = getSmartCRF(clipDuration);
    var scaleFilter = buildScaleFilter();

    var cmd = [
        '-y',

        // Seek to trim start BEFORE input (fast seek)
        '-ss', String(state.trimStart),
        '-i', 'input',
        '-t', String(clipDuration),

        // ===== VIDEO ENCODING =====

        // Scale filter with even dimension enforcement
        '-vf', scaleFilter,

        // H.264 via libx264
        '-c:v', 'libx264',

        // Quality: CRF mode with smart value
        // CRF = Constant Rate Factor
        // Lower = better quality, bigger file
        // Our smart system adjusts per duration
        '-crf', String(smartCRF),

        // Encoding speed vs compression efficiency
        // 'medium' gives ~40% better compression than 'fast'
        // meaning more visual quality per byte
        '-preset', q.preset,

        // H.264 Profile: High
        // Enables: CABAC entropy coding (10-15% better compression)
        //          8×8 DCT transforms (sharper detail)
        //          Weighted prediction (better fades/transitions)
        '-profile:v', q.profile,
        '-level:v', q.level,

        // Bitrate ceiling — prevents file size spikes
        // CRF handles average quality; maxrate prevents peaks
        '-maxrate', q.maxBitrate,
        '-bufsize', q.bufSize,

        // Keyframe interval: 1 per second
        // Helps WhatsApp process cleanly + enables smooth seeking
        '-g', String(q.keyint),
        '-keyint_min', String(q.keyint),

        // Frame rate: locked 30fps
        '-r', String(q.fps),

        // Pixel format: YUV 4:2:0 (universal compatibility)
        '-pix_fmt', 'yuv420p',

        // x264 advanced parameters for maximum quality
        // aq-mode=2: Variance-based adaptive quantization
        //   → Allocates more bits to complex regions (faces, text)
        //   → Uses fewer bits on smooth regions (sky, walls)
        // rc-lookahead=40: Looks 40 frames ahead for better rate control
        //   → Smoother quality distribution across scenes
        // ref=4: 4 reference frames for better motion compensation
        //   → Sharper moving objects
        '-x264-params', 'aq-mode=2:rc-lookahead=40:ref=4',

        // ===== AUDIO ENCODING =====

        '-c:a', 'aac',
        '-b:a', q.audioBitrate,
        '-ar', String(q.audioRate),
        '-ac', String(q.audioChannels),

        // ===== CONTAINER =====

        // Move metadata to start of file for instant playback
        // Without this, the video won't start playing until fully downloaded
        '-movflags', '+faststart',

        'output.mp4'
    ];

    // Log the full command and expected output
    log('FFmpeg command: ffmpeg ' + cmd.join(' '));
    log('Quality profile:', {
        crf: smartCRF,
        resolution: state.isPortrait ? q.shortSide + '×auto' : 'auto×' + q.shortSide,
        preset: q.preset,
        profile: q.profile + ' ' + q.level,
        maxBitrate: q.maxBitrate,
        duration: clipDuration + 's',
        estimatedSize: estimateFileSize(clipDuration, smartCRF)
    });

    return cmd;
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

        // STEP 3: Process with optimized settings
        updateStatus('Making it crispy… 🍳');
        var clipDur = Math.min(CONFIG.maxDuration, state.duration);
        var cmd = buildFFmpegCommand(clipDur);

        var exitCode = await state.ffmpeg.exec(cmd);
        log('Exit code: ' + exitCode);

        if (exitCode !== 0) throw new Error('FFMPEG_ERROR');
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 4: Read output
        updateStatus('Wrapping up… 🎁');
        var outputData;
        try {
            outputData = await state.ffmpeg.readFile('output.mp4');
            log('Output: ' + formatBytes(outputData.byteLength));
        } catch (e) {
            throw new Error('OUTPUT_READ_FAILED');
        }

        if (!outputData || outputData.byteLength < 1000) throw new Error('OUTPUT_EMPTY');

        state.outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;

        // Quality analysis
        var sizeMB = state.outputSize / (1024 * 1024);
        var bitrateKbps = Math.round((state.outputSize * 8) / (clipDur * 1000));

        log('=== Output Analysis ===');
        log('File size: ' + sizeMB.toFixed(2) + ' MB');
        log('Effective bitrate: ' + bitrateKbps + ' kbps');

        if (sizeMB <= CONFIG.quality.targetMaxMB) {
            log('✅ PERFECT — Under ' + CONFIG.quality.targetMaxMB + 'MB target. WhatsApp will not re-compress.');
        } else if (sizeMB <= CONFIG.quality.absoluteMaxMB) {
            log('⚠️ GOOD — Under ' + CONFIG.quality.absoluteMaxMB + 'MB. WhatsApp may apply light compression.');
        } else {
            log('⚠️ LARGE — ' + sizeMB.toFixed(1) + 'MB. WhatsApp may re-compress. Consider shorter clip.');
        }

        // Cleanup
        try {
            await state.ffmpeg.deleteFile('input');
            await state.ffmpeg.deleteFile('output.mp4');
        } catch (e) { }

        log('=== COMPLETE ✅ ===');
        haptic('success');
        showDone();

    } catch (err) {
        stopFunMessages();
        if (err.message === 'CANCELLED') {
            showToast('Processing cancelled', 'info');
            showScreen('home-screen');
            return;
        }
        logError('Failed', err);
        var title = 'Processing Failed';
        var msg = '';
        switch (err.message) {
            case 'SCRIPT_NOT_LOADED':
                title = 'Engine Not Loaded';
                msg = 'Refresh the page and check your internet.';
                break;
            case 'ENGINE_LOAD_FAILED':
                title = 'Engine Download Failed';
                msg = 'Check your internet connection and try again.';
                break;
            case 'FFMPEG_ERROR':
                title = 'Video Format Issue';
                msg = 'This video could not be processed. Try a different MP4 video.';
                break;
            case 'OUTPUT_READ_FAILED':
            case 'OUTPUT_EMPTY':
                title = 'Processing Error';
                msg = 'Output was empty. Try a shorter or smaller video.';
                break;
            default:
                msg = 'Something went wrong. Try a different video or refresh.';
        }
        showError(title, msg);
        showScreen('home-screen');
    } finally {
        state.processing = false;
        stopFunMessages();
    }
}

function cancelProcessing() {
    state.cancelled = true;
    showToast('Cancelling…', 'info', 2000);
}

/* ======================== PROGRESS ======================== */
function setProgress(pct) {
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = pct + ' %';
}
function updateStatus(msg) {
    els.processingStatus.style.opacity = '0';
    setTimeout(function() {
        els.processingStatus.textContent = msg;
        els.processingStatus.style.opacity = '1';
    }, 150);
}

var funTimer = null, funIdx = 0;
function startFunMessages() {
    funIdx = 0;
    funTimer = setInterval(function() {
        funIdx = (funIdx + 1) % FUN_MESSAGES.length;
        els.funTip.textContent = FUN_MESSAGES[funIdx];
    }, 3500);
}
function stopFunMessages() { clearInterval(funTimer); }

/* ======================== DONE ======================== */
function showDone() {
    els.statBefore.textContent = formatBytes(state.originalSize);
    els.statAfter.textContent = formatBytes(state.outputSize);
    var saved = Math.max(0, Math.round((1 - state.outputSize / state.originalSize) * 100));
    els.statSaved.textContent = saved > 0 ? ('-' + saved + '%') : '✨ optimized';

    if (state.outputUrl) {
        els.donePreview.src = state.outputUrl;
        els.donePlayBtn.classList.remove('hide');
        els.donePlayBtn.textContent = '▶';
    }

    state.tipsShown = false;
    els.tipsSection.classList.add('hidden');
    els.tipsList.innerHTML = '';

    showScreen('done-screen');
    setTimeout(function() { fireConfetti(); }, 300);
}

/* ======================== DOWNLOAD & SHARE ======================== */
function downloadVideo() {
    if (!state.outputUrl) return;
    haptic('medium');
    var a = document.createElement('a');
    a.href = state.outputUrl;
    a.download = 'crispy-status.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    markUsed();
    showToast('Video saved! Post it to Status now 🔥', 'success');
    if (!state.tipsShown) {
        state.tipsShown = true;
        setTimeout(function() { showTips(); }, 600);
    }
}

function shareToWhatsApp() {
    if (!state.outputBlob) return;
    haptic('medium');
    if (navigator.canShare) {
        var file = new File([state.outputBlob], 'crispy-status.mp4', { type: 'video/mp4' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file] }).then(function() {
                markUsed();
                showToast('Shared! 🚀', 'success');
            }).catch(function() {});
            return;
        }
    }
    downloadVideo();
}

/* ======================== TIPS ======================== */
function showTips() {
    els.tipsSection.classList.remove('hidden');
    els.tipsList.innerHTML = '';
    QUALITY_TIPS.forEach(function(tip) {
        var card = document.createElement('div');
        card.className = 'tip-card';
        card.innerHTML =
            '<span class="tip-icon">' + tip.icon + '</span>' +
            '<div class="tip-content">' +
            '<strong>' + tip.title + '</strong>' +
            '<p>' + tip.text + '</p></div>';
        els.tipsList.appendChild(card);
    });
    setTimeout(function() {
        els.tipsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
}

/* ======================== PWA ======================== */
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        state.installPrompt = e;
        if (!localStorage.getItem('crispy_install_dismissed')) {
            setTimeout(function() { els.installPrompt.classList.remove('hidden'); }, 5000);
        }
    });
    els.installYes.addEventListener('click', async function() {
        if (!state.installPrompt) return;
        await state.installPrompt.prompt();
        state.installPrompt = null;
        els.installPrompt.classList.add('hidden');
        showToast('Installed! 📲', 'success');
    });
    els.installDismiss.addEventListener('click', function() {
        els.installPrompt.classList.add('hidden');
        localStorage.setItem('crispy_install_dismissed', 'true');
    });
}

/* ======================== UTILITIES ======================== */
function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(1) + ' MB';
}
function formatTime(s) {
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}
function truncateFilename(n, max) {
    if (n.length <= max) return n;
    var ext = n.split('.').pop();
    return n.substring(0, max - ext.length - 3) + '….' + ext;
}
function estimateFileSize(durationSec, crf) {
    // Rough estimate based on CRF and resolution
    // CRF 18 at 640p ≈ 2-3 Mbps, CRF 14 ≈ 4-5 Mbps
    var baseBps = 2500000; // 2.5 Mbps base at CRF 18
    var crfFactor = Math.pow(1.15, 18 - crf); // each CRF point ≈ 15% size change
    var videoBps = baseBps * crfFactor;
    var audioBps = 128000;
    var totalBytes = ((videoBps + audioBps) * durationSec) / 8;
    return formatBytes(totalBytes);
}
function cleanup() {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
    state.objectUrl = null; state.outputUrl = null;
    state.outputBlob = null; state.file = null;
    state.tipsShown = false; state.videoWidth = 0; state.videoHeight = 0;
    els.fileInput.value = ''; els.donePreview.src = ''; els.trimVideo.src = '';
}

/* ======================== NAVIGATION ======================== */
function setupBackButton() {
    window.addEventListener('popstate', function() {
        if (state.processing) {
            history.pushState({ screen: 'processing-screen' }, '', '');
            showToast('Processing in progress… Cancel first.', 'info');
            return;
        }
        var current = document.querySelector('.screen.active');
        if (current) {
            if (current.id === 'trim-screen') { els.trimVideo.pause(); showScreen('home-screen'); }
            else if (current.id === 'done-screen') { cleanup(); showScreen('home-screen'); }
            else showScreen('home-screen');
        }
    });
}
function setupBeforeUnload() {
    window.addEventListener('beforeunload', function(e) {
        if (state.processing) { e.preventDefault(); e.returnValue = ''; }
    });
}

/* ======================== EVENTS ======================== */
function bindEvents() {

    els.uploadBtn.addEventListener('click', function() {
        if (!canUseToday()) { showPremium(); return; }
        haptic('light'); els.fileInput.click();
    });
    els.fileInput.addEventListener('change', function(e) {
        var f = e.target.files && e.target.files[0];
        if (f) handleFileSelect(f);
    });

    els.trimBackBtn.addEventListener('click', function() {
        haptic('light'); els.trimVideo.pause(); showScreen('home-screen');
    });

    var seekDebounce;
    els.trimSlider.addEventListener('input', function() {
        updateTrimUI();
        clearTimeout(seekDebounce);
        seekDebounce = setTimeout(function() { els.trimVideo.currentTime = state.trimStart; }, 60);
    });

    els.playPreviewBtn.addEventListener('click', function() {
        haptic('light');
        var v = els.trimVideo;
        if (v.paused) {
            v.currentTime = state.trimStart; v.muted = false; v.play();
            els.playPreviewBtn.textContent = '⏸';
            els.playPreviewBtn.classList.add('hide');
            var stopAt = state.trimStart + CONFIG.maxDuration;
            var stop = function() {
                if (v.currentTime >= stopAt) {
                    v.pause(); v.removeEventListener('timeupdate', stop);
                    els.playPreviewBtn.textContent = '▶';
                    els.playPreviewBtn.classList.remove('hide');
                }
            };
            v.addEventListener('timeupdate', stop);
        } else {
            v.pause();
            els.playPreviewBtn.textContent = '▶';
            els.playPreviewBtn.classList.remove('hide');
        }
    });

    els.trimVideo.addEventListener('click', function() { els.playPreviewBtn.click(); });
    els.trimContinueBtn.addEventListener('click', function() {
        haptic('medium'); els.trimVideo.pause(); startProcessing();
    });

    els.cancelBtn.addEventListener('click', function() { haptic('light'); cancelProcessing(); });

    els.donePlayBtn.addEventListener('click', function() {
        haptic('light');
        var v = els.donePreview;
        if (v.paused) { v.play(); els.donePlayBtn.classList.add('hide'); }
        else { v.pause(); els.donePlayBtn.classList.remove('hide'); }
    });
    els.donePreview.addEventListener('click', function() { els.donePlayBtn.click(); });
    els.donePreview.addEventListener('ended', function() {
        els.donePlayBtn.classList.remove('hide');
        els.donePlayBtn.textContent = '▶';
    });

    els.downloadBtn.addEventListener('click', downloadVideo);
    els.shareBtn.addEventListener('click', shareToWhatsApp);

    els.newVideoBtn.addEventListener('click', function() {
        haptic('light');
        if (!canUseToday()) { showPremium(); return; }
        cleanup(); showScreen('home-screen');
    });

    els.premiumCloseBtn.addEventListener('click', function() { haptic('light'); hidePremium(); });
    els.upgradeBtn.addEventListener('click', function() {
        haptic('medium'); showToast('Premium coming soon! 🚀', 'info');
    });
    els.errorCloseBtn.addEventListener('click', function() {
        haptic('light'); hideError(); showScreen('home-screen');
    });
    els.premiumModal.addEventListener('click', function(e) { if (e.target === els.premiumModal) hidePremium(); });
    els.errorModal.addEventListener('click', function(e) { if (e.target === els.errorModal) hideError(); });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (!els.premiumModal.classList.contains('hidden')) hidePremium();
            if (!els.errorModal.classList.contains('hidden')) hideError();
        }
    });

    window.addEventListener('resize', function() {
        els.confettiCanvas.width = window.innerWidth;
        els.confettiCanvas.height = window.innerHeight;
    });
}

/* ======================== SERVICE WORKER ======================== */
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function() {});
    }
}

/* ======================== PRELOAD ======================== */
function preloadFFmpeg() {
    setTimeout(function() {
        if (!state.ffmpegReady) {
            log('Preloading FFmpeg…');
            loadFFmpeg()
                .then(function() { log('Preload done ✅'); })
                .catch(function(e) { log('Preload failed (will retry): ' + e.message); });
        }
    }, 4000);
}

/* ======================== INIT ======================== */
function init() {
    log('Crispy Status v3 — Maximum Quality Engine');
    log('=========================================');

    if (typeof WebAssembly === 'undefined') {
        showError('Browser Not Supported', 'Use Chrome, Firefox, Safari, or Edge.');
        return;
    }
    log('WebAssembly: ✅');
    log('SharedArrayBuffer: ' + (typeof SharedArrayBuffer !== 'undefined' ? '✅' : 'N/A (OK)'));
    log('Quality config:', CONFIG.quality);

    bindEvents();
    registerSW();
    setupInstallPrompt();
    setupBackButton();
    setupBeforeUnload();
    showScreen('home-screen');
    preloadFFmpeg();

    els.confettiCanvas.width = window.innerWidth;
    els.confettiCanvas.height = window.innerHeight;

    log('Init complete ✅');
}

init();
