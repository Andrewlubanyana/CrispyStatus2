/* ==========================================================
   CRISPY STATUS — App Logic (CORS Worker Fix)

   Fixes applied:
   1. Worker CORS patch in HTML handles cross-origin Workers
   2. Custom toBlobURL replaces @ffmpeg/util dependency
   3. Direct ArrayBuffer reading for file input
   4. Comprehensive error handling and logging
   ========================================================== */

/* ======================== CONFIG ======================== */
const CONFIG = {
    maxDuration   : 30,
    maxFileSize   : 500,
    dailyFreeUses : 1,
    outputWidth   : 720,
    videoBitrate  : '4M',
    audioBitrate  : '128k',
    fps           : 30,
    cdnUrls: [
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
    ],
};

const FUN_MESSAGES = [
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

const QUALITY_TIPS = [
    { icon: '📱', title: 'Post directly to Status',
      text: 'Open WhatsApp → Status tab → pick the crispy video from your gallery.' },
    { icon: '🚫', title: "Don't re-edit the video",
      text: 'Any editing after download may re-compress and reduce quality.' },
    { icon: '📂', title: 'Use the original file',
      text: 'Never screenshot or screen-record your video — always use the downloaded file.' },
    { icon: '⚡', title: 'Post it right away',
      text: 'Upload to Status soon after downloading. Some phones re-compress stored videos.' },
    { icon: '📐', title: 'Film vertical next time',
      text: '9:16 vertical videos fill the entire Status screen perfectly.' },
];

/* ======================== STATE ======================== */
const state = {
    file         : null,
    objectUrl    : null,
    duration     : 0,
    trimStart    : 0,
    originalSize : 0,
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

/* ======================== DOM REFS ======================== */
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

/* ======================== toBlobURL ========================
   Replaces @ffmpeg/util entirely.
   Fetches a remote file and converts it to a local blob URL
   so FFmpeg core can load it without CORS issues.
   ========================================================== */
async function toBlobURL(url, mimeType) {
    log('Fetching: ' + url);
    var response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status + ' fetching ' + url);
    var buffer = await response.arrayBuffer();
    var blob = new Blob([buffer], { type: mimeType });
    var blobUrl = URL.createObjectURL(blob);
    log('Blob URL ready for: ' + url.split('/').pop() + ' (' + formatBytes(buffer.byteLength) + ')');
    return blobUrl;
}

/* ======================== SCREEN NAV ======================== */
function showScreen(id) {
    log('Screen → ' + id);
    document.querySelectorAll('.screen').forEach(function(s) {
        s.classList.remove('active', 'screen-enter');
    });
    var target = $(id);
    target.classList.add('active', 'screen-enter');
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
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || icons.info) + '</span><span>' + message + '</span>';
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
    var maxFrames = 150;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(function(p) {
            p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.vx *= 0.99;
            p.rotation += p.rotSpeed;
            p.opacity = Math.max(0, 1 - frame / maxFrames);
            ctx.save();
            ctx.globalAlpha = p.opacity;
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            }
            ctx.restore();
        });
        frame++;
        if (frame < maxFrames) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(draw);
}

/* ======================== HAPTIC ======================== */
function haptic(style) {
    style = style || 'light';
    if (!navigator.vibrate) return;
    var patterns = { light: [12], medium: [25], heavy: [50], success: [15, 50, 15] };
    navigator.vibrate(patterns[style] || patterns.light);
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
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
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
    log('File selected:', { name: file.name, size: formatBytes(file.size), type: file.type });

    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|avi|mkv|webm|3gp)$/i)) {
        showError('Not a video', 'Please select a video file to continue.');
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
        log('Duration: ' + state.duration + 's');

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

/* ======================== BUTTON LOADING ======================== */
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
    var windowPct = (clipDur / dur) * 100;
    var leftPct = (start / dur) * 100;
    els.trimWindow.style.width = windowPct + '%';
    els.trimWindow.style.left = leftPct + '%';
    els.trimStartTime.textContent = formatTime(start);
    els.trimEndTime.textContent = formatTime(start + clipDur);
    state.trimStart = start;
}

/* ======================== FFMPEG LOADING ======================== */
async function loadFFmpeg() {
    if (state.ffmpegReady) {
        log('FFmpeg already loaded');
        return;
    }

    log('=== Loading FFmpeg Engine ===');

    if (typeof FFmpegWASM === 'undefined') {
        logError('FFmpegWASM not found — CDN script did not load');
        throw new Error('SCRIPT_NOT_LOADED');
    }
    log('FFmpegWASM global: ✅');

    var FFmpeg = FFmpegWASM.FFmpeg;
    state.ffmpeg = new FFmpeg();
    log('FFmpeg instance created');

    // Capture FFmpeg internal logs
    state.ffmpeg.on('log', function(ev) {
        console.log('[FFmpeg]', ev.message);
    });

    // Progress tracking
    state.ffmpeg.on('progress', function(ev) {
        var pct = Math.min(Math.round(ev.progress * 100), 100);
        if (pct > 0) setProgress(pct);
    });

    // Try each CDN until one works
    var loaded = false;
    for (var i = 0; i < CONFIG.cdnUrls.length; i++) {
        var base = CONFIG.cdnUrls[i];
        try {
            log('Trying CDN: ' + base);
            updateStatus('Downloading Crispy engine… ⬇️');

            var coreURL = await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript');
            var wasmURL = await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm');

            updateStatus('Starting engine… 🔧');
            log('Calling ffmpeg.load()…');

            await state.ffmpeg.load({ coreURL: coreURL, wasmURL: wasmURL });

            loaded = true;
            log('FFmpeg loaded from ' + base + ' ✅');
            break;

        } catch (err) {
            logError('CDN failed: ' + base, err.message || err);
        }
    }

    if (!loaded) {
        logError('All CDNs failed');
        throw new Error('ENGINE_LOAD_FAILED');
    }

    state.ffmpegReady = true;
    log('FFmpeg engine ready ✅');
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
        log('=== STEP 1: Load engine ===');
        if (!state.ffmpegReady) {
            updateStatus('Loading Crispy engine… 🔧');
            await loadFFmpeg();
        } else {
            log('Engine already loaded');
        }
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 2: Read file
        log('=== STEP 2: Read file ===');
        updateStatus('Reading your video… 📖');

        var fileBuffer = await state.file.arrayBuffer();
        log('ArrayBuffer size: ' + formatBytes(fileBuffer.byteLength));

        var fileData = new Uint8Array(fileBuffer);
        await state.ffmpeg.writeFile('input', fileData);
        log('Written to FFmpeg filesystem ✅');

        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 3: Process
        log('=== STEP 3: Process video ===');
        updateStatus('Making it crispy… 🍳');

        var clipDur = Math.min(CONFIG.maxDuration, state.duration);
        var cmd = [
            '-y',
            '-ss', String(state.trimStart),
            '-i', 'input',
            '-t', String(clipDur),
            '-vf', 'scale=' + CONFIG.outputWidth + ':-2',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-b:v', CONFIG.videoBitrate,
            '-maxrate', '5M',
            '-bufsize', '8M',
            '-c:a', 'aac',
            '-b:a', CONFIG.audioBitrate,
            '-r', String(CONFIG.fps),
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            'output.mp4',
        ];
        log('Command: ffmpeg ' + cmd.join(' '));

        var exitCode = await state.ffmpeg.exec(cmd);
        log('Exit code: ' + exitCode);

        if (exitCode !== 0) {
            logError('FFmpeg returned error code ' + exitCode);
            throw new Error('FFMPEG_ERROR');
        }
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 4: Read output
        log('=== STEP 4: Read output ===');
        updateStatus('Wrapping up… 🎁');

        var outputData;
        try {
            outputData = await state.ffmpeg.readFile('output.mp4');
            log('Output size: ' + formatBytes(outputData.byteLength));
        } catch (readErr) {
            logError('Cannot read output', readErr);
            throw new Error('OUTPUT_READ_FAILED');
        }

        if (!outputData || outputData.byteLength < 1000) {
            logError('Output too small: ' + (outputData ? outputData.byteLength : 0));
            throw new Error('OUTPUT_EMPTY');
        }

        state.outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;
        log('Blob ready: ' + formatBytes(state.outputSize));

        // Cleanup temp files
        try {
            await state.ffmpeg.deleteFile('input');
            await state.ffmpeg.deleteFile('output.mp4');
        } catch (e) { /* ignore */ }

        // DONE
        log('=== COMPLETE ✅ ===');
        haptic('success');
        showDone();

    } catch (err) {
        stopFunMessages();

        if (err.message === 'CANCELLED') {
            log('Cancelled by user');
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
                msg = 'The video engine could not load. Refresh the page and check your internet.';
                break;
            case 'ENGINE_LOAD_FAILED':
                title = 'Engine Download Failed';
                msg = 'Could not download the processing engine. Check your internet and try again.';
                break;
            case 'FFMPEG_ERROR':
                title = 'Video Format Issue';
                msg = 'This video format could not be processed. Try a different MP4 video.';
                break;
            case 'OUTPUT_READ_FAILED':
            case 'OUTPUT_EMPTY':
                title = 'Processing Error';
                msg = 'The output was empty. Try a shorter or smaller video.';
                break;
            default:
                msg = 'Something went wrong. Try a different video or refresh the page.';
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

var funTimer = null;
var funIdx = 0;
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
    showToast('Video saved! Post it to Status 🔥', 'success');
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
        var data = { files: [file] };
        if (navigator.canShare(data)) {
            navigator.share(data).then(function() {
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
            '<p>' + tip.text + '</p>' +
            '</div>';
        els.tipsList.appendChild(card);
    });
    setTimeout(function() {
        els.tipsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
}

/* ======================== PWA INSTALL ======================== */
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
function cleanup() {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
    state.objectUrl = null;
    state.outputUrl = null;
    state.outputBlob = null;
    state.file = null;
    state.tipsShown = false;
    els.fileInput.value = '';
    els.donePreview.src = '';
    els.trimVideo.src = '';
}

/* ======================== BACK BUTTON ======================== */
function setupBackButton() {
    window.addEventListener('popstate', function() {
        if (state.processing) {
            history.pushState({ screen: 'processing-screen' }, '', '');
            showToast('Processing in progress… Cancel first.', 'info');
            return;
        }
        var current = document.querySelector('.screen.active');
        if (current) {
            switch (current.id) {
                case 'trim-screen':
                    els.trimVideo.pause();
                    showScreen('home-screen');
                    break;
                case 'done-screen':
                    cleanup();
                    showScreen('home-screen');
                    break;
                default:
                    showScreen('home-screen');
            }
        }
    });
}

/* ======================== BEFOREUNLOAD ======================== */
function setupBeforeUnload() {
    window.addEventListener('beforeunload', function(e) {
        if (state.processing) { e.preventDefault(); e.returnValue = ''; }
    });
}

/* ======================== EVENT LISTENERS ======================== */
function bindEvents() {

    /* Home */
    els.uploadBtn.addEventListener('click', function() {
        if (!canUseToday()) { showPremium(); return; }
        haptic('light');
        els.fileInput.click();
    });
    els.fileInput.addEventListener('change', function(e) {
        var f = e.target.files && e.target.files[0];
        if (f) handleFileSelect(f);
    });

    /* Trim */
    els.trimBackBtn.addEventListener('click', function() {
        haptic('light'); els.trimVideo.pause(); showScreen('home-screen');
    });

    var seekDebounce;
    els.trimSlider.addEventListener('input', function() {
        updateTrimUI();
        clearTimeout(seekDebounce);
        seekDebounce = setTimeout(function() {
            els.trimVideo.currentTime = state.trimStart;
        }, 60);
    });

    els.playPreviewBtn.addEventListener('click', function() {
        haptic('light');
        var v = els.trimVideo;
        if (v.paused) {
            v.currentTime = state.trimStart;
            v.muted = false;
            v.play();
            els.playPreviewBtn.textContent = '⏸';
            els.playPreviewBtn.classList.add('hide');
            var stopAt = state.trimStart + CONFIG.maxDuration;
            var stop = function() {
                if (v.currentTime >= stopAt) {
                    v.pause();
                    v.removeEventListener('timeupdate', stop);
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

    /* Processing */
    els.cancelBtn.addEventListener('click', function() { haptic('light'); cancelProcessing(); });

    /* Done */
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
        cleanup();
        showScreen('home-screen');
    });

    /* Modals */
    els.premiumCloseBtn.addEventListener('click', function() { haptic('light'); hidePremium(); });
    els.upgradeBtn.addEventListener('click', function() { haptic('medium'); showToast('Premium coming soon! 🚀', 'info'); });
    els.errorCloseBtn.addEventListener('click', function() { haptic('light'); hideError(); showScreen('home-screen'); });
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
            log('Preloading FFmpeg in background…');
            loadFFmpeg().then(function() {
                log('Background preload complete ✅');
            }).catch(function(err) {
                log('Background preload failed (will retry): ' + (err.message || err));
            });
        }
    }, 4000);
}

/* ======================== INIT ======================== */
function init() {
    log('Crispy Status initializing…');

    if (typeof WebAssembly === 'undefined') {
        showError('Browser Not Supported',
            'Your browser does not support WebAssembly. Use Chrome, Firefox, Safari, or Edge.');
        return;
    }
    log('WebAssembly: ✅');

    if (typeof SharedArrayBuffer === 'undefined') {
        log('SharedArrayBuffer: not available (single-threaded mode — this is fine)');
    } else {
        log('SharedArrayBuffer: ✅');
    }

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
