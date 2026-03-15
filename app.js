/* ==========================================================
   CRISPY STATUS — App Logic
   v7 — WhatsApp Quality Fix
   
   KEY INSIGHT: 1080p looks WORSE on WhatsApp because WhatsApp
   aggressively re-compresses large files. 720p at high quality
   stays sharp because WhatsApp barely touches small, efficient files.
   ========================================================== */

/* ======================== CONFIG ======================== */
var CONFIG = {
    maxDuration   : 30,
    maxFileSize   : 500,

    quality: {
        shortSide    : 720,        // REVERTED — WhatsApp displays Status at ~720p
        baseCRF      : 18,         // REVERTED — high quality (was 24 = bad)
        maxBitrate   : '2500k',    // TUNED — stays under WhatsApp re-compression trigger
        bufSize      : '5000k',    // 2× maxBitrate
        audioBitrate : '128k',
        audioRate    : 44100,
        audioChannels: 2,
        fps          : 30,
        preset       : 'fast',     // COMPROMISE — 2× faster than medium, way better than veryfast
        profile      : 'high',     // REVERTED — better compression efficiency
        level        : '4.0',
        keyint       : 30,         // REVERTED — more keyframes = better quality
        targetMaxMB  : 5.5,        // REVERTED — WhatsApp won't re-compress under this
        absoluteMaxMB: 8,          // REVERTED — hard ceiling
    },

    watermark: {
        text     : 'crispystatus.com',
        fontSize : 18,
        opacity  : 0.7,
        padding  : 16,
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
    '🏷️ Stamping the crispy seal…',
];

var QUALITY_TIPS = [
    { icon: '📱', title: 'Post directly to Status',
      text: 'Open WhatsApp → Status → pick the crispy video. Don\'t use any other app or editor to open it first.' },
    { icon: '🚫', title: 'Never re-edit after download',
      text: 'Any trimming, filtering, or editing will re-compress your video and destroy the quality.' },
    { icon: '📂', title: 'Use the actual downloaded file',
      text: 'Don\'t screen-record, screenshot, or forward the video. Always use the original downloaded MP4.' },
    { icon: '⚡', title: 'Post immediately after download',
      text: 'Some phones re-compress gallery videos over time. Post to Status right after downloading.' },
    { icon: '🔄', title: 'Don\'t forward the Status',
      text: 'When someone forwards your Status, WhatsApp compresses it again. Share the original file instead.' },
    { icon: '📶', title: 'Use Wi-Fi when posting',
      text: 'WhatsApp may compress more aggressively on mobile data. Use Wi-Fi for best upload quality.' },
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
    hasWatermark : false,

    // Background processing
    wakeLock         : null,
    notifPermission  : 'default',
    wasHidden        : false,
    processStartTime : 0,

    // Silent audio
    silentAudioCtx   : null,
    silentAudioSource: null,

    // PiP progress
    pipCanvas        : null,
    pipCtx           : null,
    pipVideo         : null,
    pipStream        : null,
    pipActive        : false,
    pipUpdateTimer   : null,
    pipProgress      : 0,
    pipStatusText    : 'Starting…',
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
    bgNotice         : $('bg-notice'),
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
    errorModal       : $('error-modal'),
    errorMsg         : $('error-msg'),
    errorCloseBtn    : $('error-close-btn'),
    installPrompt    : $('install-prompt'),
    installYes       : $('install-yes'),
    installDismiss   : $('install-dismiss'),
    confettiCanvas   : $('confetti-canvas'),
};

/* ========================================================
   INDEXEDDB CACHE
   ======================================================== */
var CACHE_DB = 'crispy-cache';
var CACHE_STORE = 'files';
var CACHE_VERSION = 1;

function openCacheDB() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(CACHE_DB, CACHE_VERSION);
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
        };
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function getCached(key) {
    return openCacheDB().then(function(db) {
        return new Promise(function(resolve) {
            var tx = db.transaction(CACHE_STORE, 'readonly');
            var req = tx.objectStore(CACHE_STORE).get(key);
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { resolve(null); };
        });
    }).catch(function() { return null; });
}

function setCache(key, data) {
    return openCacheDB().then(function(db) {
        return new Promise(function(resolve) {
            var tx = db.transaction(CACHE_STORE, 'readwrite');
            tx.objectStore(CACHE_STORE).put(data, key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function() { resolve(); };
        });
    }).catch(function() {});
}

async function toBlobURL(url, mimeType) {
    var cacheKey = url.split('/').pop();
    try {
        var cached = await getCached(cacheKey);
        if (cached) {
            log('⚡ Cache hit: ' + cacheKey + ' (' + formatBytes(cached.byteLength) + ')');
            return URL.createObjectURL(new Blob([cached], { type: mimeType }));
        }
    } catch (e) {}

    log('⬇️ Downloading: ' + url);
    var response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var buffer = await response.arrayBuffer();

    try { await setCache(cacheKey, buffer); log('💾 Cached: ' + cacheKey); } catch (e) {}
    return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

/* ========================================================
   PIP PROGRESS — Android anti-throttle
   ======================================================== */
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
function isPiPSupported() {
    return document.pictureInPictureEnabled && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function';
}

function drawPipFrame() {
    var canvas = state.pipCanvas, ctx = state.pipCtx;
    if (!canvas || !ctx) return;
    var w = canvas.width, h = canvas.height, pct = state.pipProgress;

    ctx.fillStyle = '#0B0B1A';
    ctx.fillRect(0, 0, w, h);
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(139, 92, 246, 0.1)');
    grad.addColorStop(1, 'rgba(255, 107, 53, 0.1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.font = '36px serif'; ctx.textAlign = 'center';
    ctx.fillText('🍳', w / 2, 42);
    ctx.font = '600 14px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(state.pipStatusText, w / 2, 68);

    var barX = 30, barY = 90, barW = w - 60, barH = 16, barR = 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    roundRect(ctx, barX, barY, barW, barH, barR); ctx.fill();

    if (pct > 0) {
        var fillW = Math.max(barH, (barW * pct) / 100);
        var gradient = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        gradient.addColorStop(0, '#FF6B35'); gradient.addColorStop(1, '#FF3366');
        ctx.fillStyle = gradient;
        roundRect(ctx, barX, barY, fillW, barH, barR); ctx.fill();
    }

    ctx.font = '800 28px sans-serif'; ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center'; ctx.fillText(pct + '%', w / 2, 140);
    ctx.font = '500 10px sans-serif'; ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillText('crispystatus.com', w / 2, 170);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

async function startPiP() {
    if (!isPiPSupported()) return false;
    try {
        state.pipCanvas = document.createElement('canvas');
        state.pipCanvas.width = 320; state.pipCanvas.height = 180;
        state.pipCtx = state.pipCanvas.getContext('2d');
        state.pipProgress = 0; state.pipStatusText = 'Starting…';
        drawPipFrame();

        state.pipStream = state.pipCanvas.captureStream(10);
        state.pipVideo = document.createElement('video');
        state.pipVideo.srcObject = state.pipStream;
        state.pipVideo.muted = true; state.pipVideo.playsInline = true;
        state.pipVideo.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;bottom:0;left:0';
        document.body.appendChild(state.pipVideo);
        await state.pipVideo.play();
        await state.pipVideo.requestPictureInPicture();
        state.pipActive = true;

        state.pipUpdateTimer = setInterval(drawPipFrame, 500);
        state.pipVideo.addEventListener('leavepictureinpicture', function() {
            state.pipActive = false;
            if (state.processing) showToast('⚠️ Keep app open for fastest processing', 'info', 4000);
        });
        log('📺 PiP started');
        return true;
    } catch (err) {
        log('PiP failed: ' + err.message); cleanupPiP(); return false;
    }
}

function updatePiP(pct, statusText) {
    state.pipProgress = pct;
    if (statusText) state.pipStatusText = statusText;
    if (state.pipActive) drawPipFrame();
}

function showPiPDone() {
    if (!state.pipActive) return;
    var ctx = state.pipCtx, w = state.pipCanvas.width, h = state.pipCanvas.height;
    ctx.fillStyle = '#0B0B1A'; ctx.fillRect(0, 0, w, h);
    ctx.font = '48px serif'; ctx.textAlign = 'center'; ctx.fillText('✅', w / 2, 70);
    ctx.font = '800 20px sans-serif'; ctx.fillStyle = '#22D67F'; ctx.fillText('Video is Crispy!', w / 2, 110);
    ctx.font = '600 14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('Tap to download', w / 2, 140);
    setTimeout(closePiP, 3000);
}

function closePiP() {
    if (document.pictureInPictureElement) { try { document.exitPictureInPicture(); } catch (e) {} }
    cleanupPiP();
}

function cleanupPiP() {
    if (state.pipUpdateTimer) { clearInterval(state.pipUpdateTimer); state.pipUpdateTimer = null; }
    if (state.pipVideo) {
        state.pipVideo.pause();
        if (state.pipVideo.srcObject) { state.pipVideo.srcObject.getTracks().forEach(function(t) { t.stop(); }); state.pipVideo.srcObject = null; }
        if (state.pipVideo.parentNode) state.pipVideo.parentNode.removeChild(state.pipVideo);
        state.pipVideo = null;
    }
    state.pipStream = null; state.pipCanvas = null; state.pipCtx = null; state.pipActive = false;
}

/* ========================================================
   SILENT AUDIO — Desktop anti-throttle
   ======================================================== */
function startSilentAudio() {
    try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        state.silentAudioCtx = new AudioCtx();
        var buffer = state.silentAudioCtx.createBuffer(1, state.silentAudioCtx.sampleRate * 2, state.silentAudioCtx.sampleRate);
        var channel = buffer.getChannelData(0);
        for (var i = 0; i < channel.length; i++) channel[i] = (Math.random() - 0.5) * 0.00001;
        var source = state.silentAudioCtx.createBufferSource();
        source.buffer = buffer; source.loop = true;
        var gain = state.silentAudioCtx.createGain(); gain.gain.value = 0.001;
        source.connect(gain); gain.connect(state.silentAudioCtx.destination); source.start();
        state.silentAudioSource = source;
        log('🔇 Silent audio active');
    } catch (e) {}
}

function stopSilentAudio() {
    if (state.silentAudioSource) { try { state.silentAudioSource.stop(); } catch (e) {} state.silentAudioSource = null; }
    if (state.silentAudioCtx) { try { state.silentAudioCtx.close(); } catch (e) {} state.silentAudioCtx = null; }
}

/* ========================================================
   BACKGROUND PROCESSING
   ======================================================== */
async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        state.wakeLock = await navigator.wakeLock.request('screen');
        state.wakeLock.addEventListener('release', function() { if (state.processing) acquireWakeLock(); });
    } catch (e) {}
}

async function releaseWakeLock() {
    if (state.wakeLock) { try { await state.wakeLock.release(); } catch (e) {} state.wakeLock = null; }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { state.notifPermission = 'granted'; return; }
    if (Notification.permission === 'denied') { state.notifPermission = 'denied'; return; }
    state.notifPermission = 'default';
}

async function askNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') { state.notifPermission = 'granted'; return; }
    if (Notification.permission === 'denied') return;
    try { state.notifPermission = await Notification.requestPermission(); } catch (e) {}
}

function sendNotification(title, body) {
    if (state.notifPermission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    try {
        var notif = new Notification(title, {
            body: body, tag: 'crispy-status', requireInteraction: true, vibrate: [200, 100, 200],
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="%230B0B1A"/><text x="50" y="68" font-size="52" text-anchor="middle">🔥</text></svg>',
        });
        notif.onclick = function() { window.focus(); notif.close(); };
    } catch (e) {}
}

function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            state.wasHidden = true;
            if (state.processing) acquireWakeLock();
        } else {
            if (state.wasHidden && state.processing) showToast('Still crisping… 🍳', 'info', 2000);
            if (state.wasHidden && !state.processing && state.outputUrl) showToast('Your video is ready! 🔥', 'success');
            state.wasHidden = false;
            if (state.processing) acquireWakeLock();
        }
    });
}

function setupFreezeHandler() {
    if ('onfreeze' in document) {
        document.addEventListener('freeze', function() { log('❄️ Frozen'); });
        document.addEventListener('resume', function() { if (state.processing) showToast('Resumed ▶️', 'info', 2000); });
    }
}

/* ======================== SCREENS ======================== */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active', 'screen-enter'); });
    $(id).classList.add('active', 'screen-enter');
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!history.state || history.state.screen !== id) history.pushState({ screen: id }, '', '');
}

/* ======================== TOAST ======================== */
function showToast(message, type, duration) {
    type = type || 'info'; duration = duration || 3000;
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
    var canvas = els.confettiCanvas, ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    var colors = ['#FF6B35','#FF3366','#8B5CF6','#22D67F','#FBBF24','#06B6D4','#fff'];
    var particles = [];
    for (var i = 0; i < 90; i++) {
        particles.push({
            x: canvas.width/2+(Math.random()-0.5)*100, y: canvas.height*0.35,
            vx: (Math.random()-0.5)*18, vy: Math.random()*-20-8,
            size: Math.random()*8+4, color: colors[Math.floor(Math.random()*colors.length)],
            rotation: Math.random()*360, rotSpeed: (Math.random()-0.5)*12,
            gravity: 0.4+Math.random()*0.2, opacity: 1,
            shape: Math.random()>0.5?'circle':'rect'
        });
    }
    var frame = 0;
    function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        particles.forEach(function(p) {
            p.x+=p.vx;p.y+=p.vy;p.vy+=p.gravity;p.vx*=0.99;p.rotation+=p.rotSpeed;
            p.opacity=Math.max(0,1-frame/150);
            ctx.save();ctx.globalAlpha=p.opacity;ctx.translate(p.x,p.y);ctx.rotate(p.rotation*Math.PI/180);ctx.fillStyle=p.color;
            if(p.shape==='circle'){ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}
            else{ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);}
            ctx.restore();
        });
        frame++;
        if(frame<150)requestAnimationFrame(draw);
        else ctx.clearRect(0,0,canvas.width,canvas.height);
    }
    requestAnimationFrame(draw);
}

function haptic(style) {
    if (!navigator.vibrate) return;
    var p = {light:[12],medium:[25],heavy:[50],success:[15,50,15]};
    navigator.vibrate(p[style||'light']||[12]);
}

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
        showError('Not a video', 'Please select a video file.'); return;
    }
    if (file.size > CONFIG.maxFileSize * 1024 * 1024) {
        showError('File too large', 'Please pick a video under ' + CONFIG.maxFileSize + ' MB.'); return;
    }
    if (file.size < 10000) {
        showError('File too small', 'This file seems too small to be a video.'); return;
    }

    cleanup();
    state.file = file; state.originalSize = file.size;
    state.objectUrl = URL.createObjectURL(file);
    setButtonLoading(els.uploadBtn, true);
    els.trimVideo.src = state.objectUrl;

    els.trimVideo.onloadedmetadata = function() {
        setButtonLoading(els.uploadBtn, false);
        state.duration = els.trimVideo.duration;
        state.videoWidth = els.trimVideo.videoWidth;
        state.videoHeight = els.trimVideo.videoHeight;
        state.isPortrait = state.videoHeight >= state.videoWidth;
        log('Video:', { dur: state.duration.toFixed(1)+'s', dim: state.videoWidth+'×'+state.videoHeight, orient: state.isPortrait?'portrait':'landscape' });
        if (isNaN(state.duration) || state.duration < 0.5) { showError('Invalid video', 'Could not read this video.'); return; }
        if (state.duration > CONFIG.maxDuration) { setupTrimmer(); showScreen('trim-screen'); }
        else { state.trimStart = 0; startProcessing(); }
    };
    els.trimVideo.onerror = function() { setButtonLoading(els.uploadBtn, false); showError('Unsupported format', 'Try MP4 or MOV format.'); };
}

function setButtonLoading(btn, loading) { if(loading) btn.classList.add('loading'); else btn.classList.remove('loading'); }

/* ======================== TRIMMER ======================== */
function setupTrimmer() {
    var maxStart = Math.max(0, state.duration - CONFIG.maxDuration);
    var clipDur = Math.min(CONFIG.maxDuration, state.duration);
    els.trimSlider.min=0; els.trimSlider.max=maxStart; els.trimSlider.value=0; els.trimSlider.step=0.1;
    state.trimStart = 0;
    els.trimFileName.textContent = truncateFilename(state.file.name, 25);
    els.trimFileDur.textContent = formatTime(state.duration) + ' total';
    els.trimDurLabel.textContent = Math.round(clipDur) + 's selected';
    updateTrimUI();
    els.playPreviewBtn.classList.remove('hide'); els.playPreviewBtn.textContent = '▶';
    els.trimVideo.pause(); els.trimVideo.currentTime = 0;
}

function updateTrimUI() {
    var start = parseFloat(els.trimSlider.value);
    var dur = state.duration, clipDur = Math.min(CONFIG.maxDuration, dur);
    els.trimWindow.style.width = (clipDur/dur)*100+'%';
    els.trimWindow.style.left = (start/dur)*100+'%';
    els.trimStartTime.textContent = formatTime(start);
    els.trimEndTime.textContent = formatTime(start + clipDur);
    state.trimStart = start;
}

/* ======================== FFMPEG ======================== */
async function loadFFmpeg() {
    if (state.ffmpegReady) return;
    if (typeof FFmpegWASM === 'undefined') throw new Error('SCRIPT_NOT_LOADED');
    state.ffmpeg = new FFmpegWASM.FFmpeg();
    state.ffmpeg.on('log', function(ev) { console.log('[FFmpeg]', ev.message); });
    state.ffmpeg.on('progress', function(ev) {
        var pct = Math.min(Math.round(ev.progress * 100), 100);
        if (pct > 0) setProgress(pct);
    });

    var loaded = false;
    for (var i = 0; i < CONFIG.cdnUrls.length; i++) {
        var base = CONFIG.cdnUrls[i];
        try {
            updateStatus('Loading Crispy engine… ⬇️');
            var coreURL = await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript');
            var wasmURL = await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm');
            updateStatus('Starting engine… 🔧');
            await state.ffmpeg.load({ coreURL: coreURL, wasmURL: wasmURL });
            loaded = true; log('FFmpeg loaded ✅'); break;
        } catch (err) { logError('CDN failed: ' + base, err.message); }
    }
    if (!loaded) throw new Error('ENGINE_LOAD_FAILED');
    state.ffmpegReady = true;
}

/* ======================== WATERMARK ======================== */
async function createWatermarkImage() {
    var wm = CONFIG.watermark;
    var canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    var ctx = canvas.getContext('2d');
    ctx.font = '600 ' + wm.fontSize + 'px sans-serif';
    var textWidth = Math.ceil(ctx.measureText(wm.text).width);
    var hPad = 10, vPad = 8;
    canvas.width = textWidth + hPad * 2;
    canvas.height = wm.fontSize + vPad * 2;
    ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    ctx.font = '600 ' + wm.fontSize + 'px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,' + wm.opacity + ')';
    ctx.textBaseline = 'middle';
    ctx.fillText(wm.text, hPad, canvas.height / 2);

    return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
            if (!blob) { reject(new Error('Watermark failed')); return; }
            blob.arrayBuffer().then(function(buf) { resolve(new Uint8Array(buf)); });
        }, 'image/png');
    });
}

/* ======================== SMART QUALITY ======================== */
function getSmartCRF(durationSec) {
    var q = CONFIG.quality;
    if (durationSec <= 5) return q.baseCRF - 4;   // Very short = max quality
    if (durationSec <= 10) return q.baseCRF - 2;   // Short
    if (durationSec <= 20) return q.baseCRF;        // Medium
    return q.baseCRF + 1;                           // Full 30s = optimize size
}

function buildScaleFilter() {
    var target = CONFIG.quality.shortSide;
    if (state.isPortrait) {
        if (state.videoWidth <= target) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
        return 'scale=' + target + ':-2';
    } else {
        if (state.videoHeight <= target) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
        return 'scale=-2:' + target;
    }
}

function buildFFmpegCommand(clipDuration, hasWatermark) {
    var q = CONFIG.quality;
    var smartCRF = getSmartCRF(clipDuration);
    var scaleExpr = buildScaleFilter();
    var pad = CONFIG.watermark.padding;

    log('Encoding config:', {
        resolution: q.shortSide + 'p',
        crf: smartCRF,
        preset: q.preset,
        profile: q.profile,
        maxBitrate: q.maxBitrate,
        targetMB: q.targetMaxMB + 'MB',
    });

    var cmd = ['-y', '-ss', String(state.trimStart), '-i', 'input'];

    if (hasWatermark) {
        cmd.push('-i', 'watermark.png', '-t', String(clipDuration));
        cmd.push('-filter_complex',
            '[0:v]' + scaleExpr + '[scaled];[scaled][1:v]overlay=' + pad + ':H-h-' + pad + '[outv]'
        );
        cmd.push('-map', '[outv]', '-map', '0:a?');
    } else {
        cmd.push('-t', String(clipDuration), '-vf', scaleExpr);
    }

    cmd.push(
        '-c:v', 'libx264',
        '-crf', String(smartCRF),
        '-preset', q.preset,
        '-profile:v', q.profile,
        '-level:v', q.level,
        '-maxrate', q.maxBitrate,
        '-bufsize', q.bufSize,
        '-g', String(q.keyint),
        '-keyint_min', String(q.keyint),
        '-r', String(q.fps),
        '-pix_fmt', 'yuv420p',
        '-x264-params', 'aq-mode=2:ref=3:bframes=3:rc-lookahead=20',
        '-c:a', 'aac',
        '-b:a', q.audioBitrate,
        '-ar', String(q.audioRate),
        '-ac', String(q.audioChannels),
        '-movflags', '+faststart',
        'output.mp4'
    );

    return cmd;
}

/* ======================== SIZE GUARD ======================== */
/* If output exceeds WhatsApp sweet spot, re-encode with higher CRF */
async function reEncodeIfTooLarge(clipDuration, hasWatermark) {
    var sizeMB = state.outputSize / (1024 * 1024);
    var maxMB = CONFIG.quality.targetMaxMB;

    if (sizeMB <= maxMB) {
        log('✅ Size check passed: ' + sizeMB.toFixed(2) + 'MB ≤ ' + maxMB + 'MB');
        return false; // No re-encode needed
    }

    log('⚠️ Output too large: ' + sizeMB.toFixed(2) + 'MB > ' + maxMB + 'MB — re-encoding…');
    updateStatus('Optimizing file size… 📦');
    updatePiP(90, 'Optimizing size…');

    // Calculate higher CRF to hit target size
    var ratio = maxMB / sizeMB;
    var currentCRF = getSmartCRF(clipDuration);
    // CRF +6 roughly halves file size, so we estimate:
    var crfBump = Math.ceil(-6 * Math.log2(ratio));
    var newCRF = Math.min(currentCRF + crfBump, 32); // Never go above 32

    log('Re-encode: CRF ' + currentCRF + ' → ' + newCRF + ' (target ' + maxMB + 'MB)');

    // Write the output back as input for re-encode
    var outputData = await state.ffmpeg.readFile('output.mp4');
    await state.ffmpeg.writeFile('input2', outputData);

    var q = CONFIG.quality;
    var reCmd = [
        '-y', '-i', 'input2',
        '-c:v', 'libx264',
        '-crf', String(newCRF),
        '-preset', q.preset,
        '-profile:v', q.profile,
        '-level:v', q.level,
        '-maxrate', q.maxBitrate,
        '-bufsize', q.bufSize,
        '-pix_fmt', 'yuv420p',
        '-c:a', 'copy',
        '-movflags', '+faststart',
        'output2.mp4'
    ];

    var exitCode = await state.ffmpeg.exec(reCmd);
    if (exitCode !== 0) {
        log('Re-encode failed — using original output');
        try { await state.ffmpeg.deleteFile('input2'); } catch(e) {}
        return false;
    }

    var reData = await state.ffmpeg.readFile('output2.mp4');
    if (reData && reData.byteLength > 1000) {
        // Replace output with smaller version
        if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
        state.outputBlob = new Blob([reData.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;
        log('✅ Re-encoded: ' + (state.outputSize / (1024 * 1024)).toFixed(2) + 'MB');
    }

    // Cleanup
    try { await state.ffmpeg.deleteFile('input2'); } catch(e) {}
    try { await state.ffmpeg.deleteFile('output2.mp4'); } catch(e) {}

    return true;
}

/* ======================== PROCESSING ======================== */
async function startProcessing() {
    if (state.processing) return;
    state.processing = true;
    state.cancelled = false;
    state.processStartTime = Date.now();

    showScreen('processing-screen');
    setProgress(0);
    startFunMessages();

    await acquireWakeLock();
    startSilentAudio();

    var pipStarted = false;
    if (isMobile() && isPiPSupported()) pipStarted = await startPiP();
    if (!pipStarted && isMobile()) showToast('⚠️ Keep this app open for fastest processing', 'info', 5000);

    if (state.notifPermission === 'default') await askNotificationPermission();
    showBgNotice();

    try {
        if (!state.ffmpegReady) {
            updateStatus('Loading Crispy engine… 🔧');
            updatePiP(0, 'Loading engine…');
            await loadFFmpeg();
        }
        if (state.cancelled) throw new Error('CANCELLED');

        updateStatus('Reading your video… 📖');
        updatePiP(0, 'Reading video…');
        var fileData = new Uint8Array(await state.file.arrayBuffer());
        await state.ffmpeg.writeFile('input', fileData);
        if (state.cancelled) throw new Error('CANCELLED');

        // Watermark
        state.hasWatermark = false;
        try {
            updatePiP(0, 'Adding watermark…');
            var wmData = await createWatermarkImage();
            await state.ffmpeg.writeFile('watermark.png', wmData);
            state.hasWatermark = true;
        } catch (e) { logError('Watermark failed', e); }
        if (state.cancelled) throw new Error('CANCELLED');

        // Process
        updateStatus('Making it crispy… 🍳');
        updatePiP(0, 'Making it crispy…');
        var clipDur = Math.min(CONFIG.maxDuration, state.duration);
        var cmd = buildFFmpegCommand(clipDur, state.hasWatermark);
        log('FFmpeg: ' + cmd.join(' '));

        var exitCode = await state.ffmpeg.exec(cmd);
        if (exitCode !== 0) throw new Error('FFMPEG_ERROR');
        if (state.cancelled) throw new Error('CANCELLED');

        // Read output
        updateStatus('Checking quality… 🔍');
        updatePiP(95, 'Checking quality…');
        var outputData;
        try { outputData = await state.ffmpeg.readFile('output.mp4'); }
        catch (e) { throw new Error('OUTPUT_READ_FAILED'); }
        if (!outputData || outputData.byteLength < 1000) throw new Error('OUTPUT_EMPTY');

        state.outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;

        // Size guard — re-encode if too large for WhatsApp
        await reEncodeIfTooLarge(clipDur, state.hasWatermark);

        var sizeMB = state.outputSize / (1024 * 1024);
        var elapsed = ((Date.now() - state.processStartTime) / 1000).toFixed(1);
        log('✅ Done in ' + elapsed + 's | ' + sizeMB.toFixed(2) + 'MB | WM: ' + (state.hasWatermark ? 'yes' : 'no'));

        if (sizeMB <= CONFIG.quality.targetMaxMB) log('✅ PERFECT — WhatsApp will barely touch this');
        else if (sizeMB <= CONFIG.quality.absoluteMaxMB) log('⚠️ GOOD — WhatsApp may lightly compress');
        else log('⚠️ LARGE — WhatsApp will re-compress');

        // Cleanup temp files
        try { await state.ffmpeg.deleteFile('input'); } catch(e) {}
        try { await state.ffmpeg.deleteFile('output.mp4'); } catch(e) {}
        try { if (state.hasWatermark) await state.ffmpeg.deleteFile('watermark.png'); } catch(e) {}

        await releaseWakeLock();
        stopSilentAudio();
        showPiPDone();

        sendNotification('🔥 Your video is crispy!', 'Optimized for WhatsApp in ' + elapsed + 's. Tap to download.');
        haptic('success');
        showDone();

    } catch (err) {
        stopFunMessages(); await releaseWakeLock(); stopSilentAudio(); closePiP();
        if (err.message === 'CANCELLED') { showToast('Cancelled', 'info'); showScreen('home-screen'); return; }
        logError('Failed', err);
        sendNotification('😬 Processing failed', 'Tap to try again.');
        var title = 'Processing Failed', msg = '';
        switch (err.message) {
            case 'SCRIPT_NOT_LOADED': title='Engine Not Loaded'; msg='Refresh and check internet.'; break;
            case 'ENGINE_LOAD_FAILED': title='Engine Download Failed'; msg='Check internet and retry.'; break;
            case 'FFMPEG_ERROR': title='Video Format Issue'; msg='Try a different MP4 video.'; break;
            case 'OUTPUT_READ_FAILED': case 'OUTPUT_EMPTY': title='Processing Error'; msg='Try a shorter/smaller video.'; break;
            default: msg='Something went wrong. Try another video or refresh.';
        }
        showError(title, msg); showScreen('home-screen');
    } finally {
        state.processing = false; stopFunMessages(); hideBgNotice();
    }
}

function cancelProcessing() {
    state.cancelled = true; releaseWakeLock(); stopSilentAudio(); closePiP();
    showToast('Cancelling…', 'info', 2000);
}

function showBgNotice() { if (els.bgNotice) els.bgNotice.classList.remove('hidden'); }
function hideBgNotice() { if (els.bgNotice) els.bgNotice.classList.add('hidden'); }

/* ======================== PROGRESS ======================== */
function setProgress(pct) {
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = pct + ' %';
    if (state.processing) document.title = pct + '% — Crispy Status';
    updatePiP(pct, pct < 95 ? 'Making it crispy…' : 'Almost done…');
}

function updateStatus(msg) {
    els.processingStatus.style.opacity = '0';
    setTimeout(function() { els.processingStatus.textContent = msg; els.processingStatus.style.opacity = '1'; }, 150);
}

var funTimer = null, funIdx = 0;
function startFunMessages() {
    funIdx = 0;
    funTimer = setInterval(function() { funIdx = (funIdx+1)%FUN_MESSAGES.length; els.funTip.textContent = FUN_MESSAGES[funIdx]; }, 3500);
}
function stopFunMessages() { clearInterval(funTimer); document.title = 'Crispy Status — Sharp WhatsApp Status. Every Time.'; }

/* ======================== DONE ======================== */
function showDone() {
    els.statBefore.textContent = formatBytes(state.originalSize);
    els.statAfter.textContent = formatBytes(state.outputSize);
    var saved = Math.max(0, Math.round((1 - state.outputSize / state.originalSize) * 100));
    els.statSaved.textContent = saved > 0 ? ('-' + saved + '%') : '✨ optimized';

    if (state.outputUrl) { els.donePreview.src = state.outputUrl; els.donePlayBtn.classList.remove('hide'); els.donePlayBtn.textContent = '▶'; }
    state.tipsShown = false; els.tipsSection.classList.add('hidden'); els.tipsList.innerHTML = '';
    showScreen('done-screen');
    setTimeout(fireConfetti, 300);
}

/* ======================== DOWNLOAD & SHARE ======================== */
function downloadVideo() {
    if (!state.outputUrl) return;
    haptic('medium');
    var a = document.createElement('a');
    a.href = state.outputUrl; a.download = 'crispy-status.mp4';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('Video saved! Post it to Status now 🔥', 'success');
    if (!state.tipsShown) { state.tipsShown = true; setTimeout(showTips, 600); }
}

function shareToWhatsApp() {
    if (!state.outputBlob) return;
    haptic('medium');
    if (navigator.canShare) {
        var file = new File([state.outputBlob], 'crispy-status.mp4', { type: 'video/mp4' });
        if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file] }).then(function() { showToast('Shared! 🚀', 'success'); }).catch(function() {});
            return;
        }
    }
    downloadVideo();
}

function showTips() {
    
