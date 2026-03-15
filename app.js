/* ==========================================================
   CRISPY STATUS — App Logic
   v8 — Upload Fix + WhatsApp Quality
   
   Fixed: FFmpeg crash from heavy x264 params on mobile
   Strategy: 720p + smart CRF + light encoding = fast, small,
   WhatsApp won't re-compress
   ========================================================== */

/* ======================== CONFIG ======================== */
var CONFIG = {
    maxDuration   : 30,
    maxFileSize   : 500,

    quality: {
        shortSide    : 720,
        baseCRF      : 20,
        maxBitrate   : '2500k',
        bufSize      : '5000k',
        audioBitrate : '128k',
        audioRate    : 44100,
        audioChannels: 2,
        fps          : 30,
        preset       : 'fast',
        profile      : 'high',
        level        : '4.0',
        keyint       : 30,
        targetMaxMB  : 5.5,
        absoluteMaxMB: 8,
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
    file: null, objectUrl: null, duration: 0, trimStart: 0,
    originalSize: 0, videoWidth: 0, videoHeight: 0, isPortrait: true,
    outputBlob: null, outputUrl: null, outputSize: 0,
    ffmpeg: null, ffmpegReady: false, processing: false,
    cancelled: false, tipsShown: false, installPrompt: null,
    hasWatermark: false,
    wakeLock: null, notifPermission: 'default', wasHidden: false,
    processStartTime: 0,
    silentAudioCtx: null, silentAudioSource: null,
    pipCanvas: null, pipCtx: null, pipVideo: null, pipStream: null,
    pipActive: false, pipUpdateTimer: null, pipProgress: 0,
    pipStatusText: 'Starting…',
};

/* ======================== LOGGING ======================== */
function log(msg, data) {
    var ts = new Date().toISOString().substr(11, 12);
    if (data !== undefined) console.log('[Crispy ' + ts + '] ' + msg, data);
    else console.log('[Crispy ' + ts + '] ' + msg);
}
function logError(msg, err) { console.error('[Crispy ERROR] ' + msg, err); }

/* ======================== DOM ======================== */
function $(id) { return document.getElementById(id); }

var els = {};

function initEls() {
    els.homeScreen       = $('home-screen');
    els.trimScreen       = $('trim-screen');
    els.processingScreen = $('processing-screen');
    els.doneScreen       = $('done-screen');
    els.uploadBtn        = $('upload-btn');
    els.fileInput        = $('file-input');
    els.trimBackBtn      = $('trim-back-btn');
    els.trimVideo        = $('trim-video');
    els.playPreviewBtn   = $('play-preview-btn');
    els.trimSlider       = $('trim-slider');
    els.trimWindow       = $('trim-window');
    els.trimStartTime    = $('trim-start-time');
    els.trimEndTime      = $('trim-end-time');
    els.trimFileName     = $('trim-file-name');
    els.trimFileDur      = $('trim-file-dur');
    els.trimDurLabel     = $('trim-dur-label');
    els.trimContinueBtn  = $('trim-continue-btn');
    els.processingStatus = $('processing-status');
    els.progressFill     = $('progress-fill');
    els.progressText     = $('progress-text');
    els.funTip           = $('fun-tip');
    els.cancelBtn        = $('cancel-btn');
    els.bgNotice         = $('bg-notice');
    els.donePreview      = $('done-preview');
    els.donePlayBtn      = $('done-play-btn');
    els.statBefore       = $('stat-before');
    els.statAfter        = $('stat-after');
    els.statSaved        = $('stat-saved');
    els.downloadBtn      = $('download-btn');
    els.shareBtn         = $('share-btn');
    els.tipsSection      = $('tips-section');
    els.tipsList         = $('tips-list');
    els.newVideoBtn      = $('new-video-btn');
    els.errorModal       = $('error-modal');
    els.errorMsg         = $('error-msg');
    els.errorCloseBtn    = $('error-close-btn');
    els.installPrompt    = $('install-prompt');
    els.installYes       = $('install-yes');
    els.installDismiss   = $('install-dismiss');
    els.confettiCanvas   = $('confetti-canvas');

    // Log any missing elements
    var missing = [];
    for (var key in els) {
        if (!els[key]) missing.push(key);
    }
    if (missing.length > 0) {
        log('⚠️ Missing DOM elements: ' + missing.join(', '));
    } else {
        log('✅ All DOM elements found');
    }
}

/* ========================================================
   INDEXEDDB CACHE
   ======================================================== */
var CACHE_DB = 'crispy-cache';
var CACHE_STORE = 'files';

function openCacheDB() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(CACHE_DB, 1);
        req.onupgradeneeded = function(e) {
            if (!e.target.result.objectStoreNames.contains(CACHE_STORE))
                e.target.result.createObjectStore(CACHE_STORE);
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
            log('⚡ Cache hit: ' + cacheKey);
            return URL.createObjectURL(new Blob([cached], { type: mimeType }));
        }
    } catch (e) {}

    log('⬇️ Downloading: ' + cacheKey);
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
    try {
        return !!(document.pictureInPictureEnabled &&
                  HTMLVideoElement.prototype.requestPictureInPicture);
    } catch (e) { return false; }
}

function drawPipFrame() {
    var canvas = state.pipCanvas, ctx = state.pipCtx;
    if (!canvas || !ctx) return;
    var w = canvas.width, h = canvas.height, pct = state.pipProgress;

    ctx.fillStyle = '#0B0B1A'; ctx.fillRect(0, 0, w, h);

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
        var gr = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        gr.addColorStop(0, '#FF6B35'); gr.addColorStop(1, '#FF3366');
        ctx.fillStyle = gr;
        roundRect(ctx, barX, barY, fillW, barH, barR); ctx.fill();
    }

    ctx.font = '800 28px sans-serif'; ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center'; ctx.fillText(pct + '%', w / 2, 140);
    ctx.font = '500 10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('crispystatus.com', w / 2, 170);
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
    ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

async function startPiP() {
    if (!isPiPSupported()) { log('PiP not supported'); return false; }
    try {
        state.pipCanvas = document.createElement('canvas');
        state.pipCanvas.width = 320; state.pipCanvas.height = 180;
        state.pipCtx = state.pipCanvas.getContext('2d');
        state.pipProgress = 0; state.pipStatusText = 'Starting…';
        drawPipFrame();

        if (typeof state.pipCanvas.captureStream !== 'function') {
            log('captureStream not supported'); return false;
        }
        state.pipStream = state.pipCanvas.captureStream(10);

        state.pipVideo = document.createElement('video');
        state.pipVideo.srcObject = state.pipStream;
        state.pipVideo.muted = true; state.pipVideo.playsInline = true;
        state.pipVideo.setAttribute('playsinline', '');
        state.pipVideo.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;bottom:0;left:0;z-index:-1';
        document.body.appendChild(state.pipVideo);

        await state.pipVideo.play();
        await state.pipVideo.requestPictureInPicture();
        state.pipActive = true;

        state.pipUpdateTimer = setInterval(drawPipFrame, 500);
        state.pipVideo.addEventListener('leavepictureinpicture', function() {
            state.pipActive = false;
            if (state.processing) showToast('⚠️ Keep app open for fastest processing', 'info', 4000);
        });
        log('📺 PiP started'); return true;
    } catch (err) {
        log('PiP failed: ' + err.message);
        cleanupPiP(); return false;
    }
}

function updatePiP(pct, statusText) {
    state.pipProgress = pct;
    if (statusText) state.pipStatusText = statusText;
    if (state.pipActive) drawPipFrame();
}

function showPiPDone() {
    if (!state.pipActive || !state.pipCtx) return;
    var ctx = state.pipCtx, w = state.pipCanvas.width, h = state.pipCanvas.height;
    ctx.fillStyle = '#0B0B1A'; ctx.fillRect(0, 0, w, h);
    ctx.font = '48px serif'; ctx.textAlign = 'center'; ctx.fillText('✅', w/2, 70);
    ctx.font = '800 20px sans-serif'; ctx.fillStyle = '#22D67F'; ctx.fillText('Video is Crispy!', w/2, 110);
    ctx.font = '600 14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText('Tap to download', w/2, 140);
    setTimeout(closePiP, 3000);
}

function closePiP() {
    try { if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch (e) {}
    cleanupPiP();
}

function cleanupPiP() {
    if (state.pipUpdateTimer) { clearInterval(state.pipUpdateTimer); state.pipUpdateTimer = null; }
    if (state.pipVideo) {
        try { state.pipVideo.pause(); } catch(e) {}
        if (state.pipVideo.srcObject) {
            try { state.pipVideo.srcObject.getTracks().forEach(function(t) { t.stop(); }); } catch(e) {}
            state.pipVideo.srcObject = null;
        }
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
        var buf = state.silentAudioCtx.createBuffer(1, state.silentAudioCtx.sampleRate * 2, state.silentAudioCtx.sampleRate);
        var ch = buf.getChannelData(0);
        for (var i = 0; i < ch.length; i++) ch[i] = (Math.random() - 0.5) * 0.00001;
        var src = state.silentAudioCtx.createBufferSource();
        src.buffer = buf; src.loop = true;
        var gain = state.silentAudioCtx.createGain(); gain.gain.value = 0.001;
        src.connect(gain); gain.connect(state.silentAudioCtx.destination); src.start();
        state.silentAudioSource = src;
        log('🔇 Silent audio active');
    } catch (e) { log('Silent audio failed: ' + e.message); }
}

function stopSilentAudio() {
    try { if (state.silentAudioSource) state.silentAudioSource.stop(); } catch(e) {}
    try { if (state.silentAudioCtx) state.silentAudioCtx.close(); } catch(e) {}
    state.silentAudioSource = null; state.silentAudioCtx = null;
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
    if (state.wakeLock) { try { await state.wakeLock.release(); } catch(e) {} state.wakeLock = null; }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    state.notifPermission = Notification.permission === 'granted' ? 'granted' :
                            Notification.permission === 'denied' ? 'denied' : 'default';
}

async function askNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') { state.notifPermission = Notification.permission; return; }
    try { state.notifPermission = await Notification.requestPermission(); } catch(e) {}
}

function sendNotification(title, body) {
    if (state.notifPermission !== 'granted' || document.visibilityState === 'visible') return;
    try {
        var n = new Notification(title, { body: body, tag: 'crispy-status', vibrate: [200,100,200] });
        n.onclick = function() { window.focus(); n.close(); };
    } catch(e) {}
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
        }
    });
}

function setupFreezeHandler() {
    try {
        document.addEventListener('freeze', function() { log('❄️ Frozen'); });
        document.addEventListener('resume', function() { if (state.processing) showToast('Resumed ▶️', 'info', 2000); });
    } catch(e) {}
}

/* ======================== SCREENS ======================== */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active','screen-enter'); });
    var el = $(id);
    if (el) { el.classList.add('active','screen-enter'); }
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!history.state || history.state.screen !== id) history.pushState({ screen: id }, '', '');
}

/* ======================== TOAST ======================== */
function showToast(msg, type, dur) {
    type = type || 'info'; dur = dur || 3000;
    var c = $('toast-container'); if (!c) return;
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    var icons = { success:'✅', error:'❌', info:'💡' };
    t.innerHTML = '<span class="toast-icon">'+(icons[type]||'💡')+'</span><span>'+msg+'</span>';
    c.appendChild(t);
    setTimeout(function() { t.classList.add('toast-out'); t.addEventListener('animationend', function() { t.remove(); }); }, dur);
}

/* ======================== CONFETTI ======================== */
function fireConfetti() {
    if (!els.confettiCanvas) return;
    var canvas = els.confettiCanvas, ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    var colors = ['#FF6B35','#FF3366','#8B5CF6','#22D67F','#FBBF24','#06B6D4','#fff'];
    var particles = [];
    for (var i = 0; i < 90; i++) {
        particles.push({
            x:canvas.width/2+(Math.random()-0.5)*100, y:canvas.height*0.35,
            vx:(Math.random()-0.5)*18, vy:Math.random()*-20-8,
            size:Math.random()*8+4, color:colors[Math.floor(Math.random()*colors.length)],
            rotation:Math.random()*360, rotSpeed:(Math.random()-0.5)*12,
            gravity:0.4+Math.random()*0.2, opacity:1,
            shape:Math.random()>0.5?'circle':'rect'
        });
    }
    var frame = 0;
    function draw() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        particles.forEach(function(p) {
            p.x+=p.vx;p.y+=p.vy;p.vy+=p.gravity;p.vx*=0.99;p.rotation+=p.rotSpeed;
            p.opacity=Math.max(0,1-frame/150);
            ctx.save();ctx.globalAlpha=p.opacity;ctx.translate(p.x,p.y);
            ctx.rotate(p.rotation*Math.PI/180);ctx.fillStyle=p.color;
            if(p.shape==='circle'){ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}
            else ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
            ctx.restore();
        });
        frame++;
        if(frame<150)requestAnimationFrame(draw); else ctx.clearRect(0,0,canvas.width,canvas.height);
    }
    requestAnimationFrame(draw);
}

function haptic(style) {
    try { if(navigator.vibrate) navigator.vibrate({light:[12],medium:[25],heavy:[50],success:[15,50,15]}[style||'light']||[12]); } catch(e){}
}

function showError(title, msg) {
    try {
        var h = $('error-heading'); if(h) h.textContent = title;
        if(els.errorMsg) els.errorMsg.textContent = msg;
        if(els.errorModal) els.errorModal.classList.remove('hidden');
        haptic('heavy');
    } catch(e) { alert(title + ': ' + msg); }
}
function hideError() { if(els.errorModal) els.errorModal.classList.add('hidden'); }

/* ======================== FILE HANDLING ======================== */
function handleFileSelect(file) {
    log('File selected:', { name: file.name, size: formatBytes(file.size), type: file.type });

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
    state.file = file;
    state.originalSize = file.size;
    state.objectUrl = URL.createObjectURL(file);

    log('Object URL created: ' + state.objectUrl);
    setButtonLoading(els.uploadBtn, true);

    els.trimVideo.src = state.objectUrl;

    els.trimVideo.onloadedmetadata = function() {
        log('✅ Video metadata loaded');
        setButtonLoading(els.uploadBtn, false);
        state.duration = els.trimVideo.duration;
        state.videoWidth = els.trimVideo.videoWidth;
        state.videoHeight = els.trimVideo.videoHeight;
        state.isPortrait = state.videoHeight >= state.videoWidth;

        log('Video info:', {
            duration: state.duration.toFixed(1) + 's',
            dimensions: state.videoWidth + '×' + state.videoHeight,
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

    els.trimVideo.onerror = function(e) {
        log('❌ Video load error', e);
        setButtonLoading(els.uploadBtn, false);
        showError('Unsupported format', 'Try MP4 or MOV format.');
    };
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

/* ======================== TRIMMER ======================== */
function setupTrimmer() {
    var maxStart = Math.max(0, state.duration - CONFIG.maxDuration);
    var clipDur = Math.min(CONFIG.maxDuration, state.duration);
    els.trimSlider.min = 0; els.trimSlider.max = maxStart;
    els.trimSlider.value = 0; els.trimSlider.step = 0.1;
    state.trimStart = 0;
    els.trimFileName.textContent = truncateFilename(state.file.name, 25);
    els.trimFileDur.textContent = formatTime(state.duration) + ' total';
    els.trimDurLabel.textContent = Math.round(clipDur) + 's selected';
    updateTrimUI();
    els.playPreviewBtn.classList.remove('hide');
    els.playPreviewBtn.textContent = '▶';
    els.trimVideo.pause(); els.trimVideo.currentTime = 0;
}

function updateTrimUI() {
    var start = parseFloat(els.trimSlider.value);
    var dur = state.duration, clipDur = Math.min(CONFIG.maxDuration, dur);
    els.trimWindow.style.width = (clipDur / dur) * 100 + '%';
    els.trimWindow.style.left = (start / dur) * 100 + '%';
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
    var tw = Math.ceil(ctx.measureText(wm.text).width);
    var hp = 10, vp = 8;
    canvas.width = tw + hp * 2;
    canvas.height = wm.fontSize + vp * 2;
    ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    ctx.font = '600 ' + wm.fontSize + 'px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,' + wm.opacity + ')';
    ctx.textBaseline = 'middle';
    ctx.fillText(wm.text, hp, canvas.height / 2);
    log('Watermark canvas: ' + canvas.width + '×' + canvas.height);

    return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
            if (!blob) { reject(new Error('Watermark blob failed')); return; }
            blob.arrayBuffer().then(function(buf) { resolve(new Uint8Array(buf)); });
        }, 'image/png');
    });
}

/* ======================== SMART QUALITY ======================== */
function getSmartCRF(durationSec) {
    var base = CONFIG.quality.baseCRF;
    if (durationSec <= 5) return base - 4;
    if (durationSec <= 10) return base - 2;
    if (durationSec <= 20) return base;
    return base + 2;
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
    var crf = getSmartCRF(clipDuration);
    var scale = buildScaleFilter();
    var pad = CONFIG.watermark.padding;

    log('Encoding:', { res: q.shortSide+'p', crf: crf, preset: q.preset, maxBR: q.maxBitrate });

    var cmd = ['-y', '-ss', String(state.trimStart), '-i', 'input'];

    if (hasWatermark) {
        cmd.push('-i', 'watermark.png');
        cmd.push('-t', String(clipDuration));
        cmd.push('-filter_complex',
            '[0:v]' + scale + '[scaled];[scaled][1:v]overlay=' + pad + ':H-h-' + pad + '[outv]'
        );
        cmd.push('-map', '[outv]');
        cmd.push('-map', '0:a?');
    } else {
        cmd.push('-t', String(clipDuration));
        cmd.push('-vf', scale);
    }

    cmd.push(
        '-c:v', 'libx264',
        '-crf', String(crf),
        '-preset', q.preset,
        '-profile:v', q.profile,
        '-level:v', q.level,
        '-maxrate', q.maxBitrate,
        '-bufsize', q.bufSize,
        '-g', String(q.keyint),
        '-keyint_min', String(q.keyint),
        '-r', String(q.fps),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', q.audioBitrate,
        '-ar', String(q.audioRate),
        '-ac', String(q.audioChannels),
        '-movflags', '+faststart',
        'output.mp4'
    );

    return cmd;
}

/* ======================== PROCESSING ======================== */
async function startProcessing() {
    if (state.processing) { log('Already processing — ignoring'); return; }
    state.processing = true;
    state.cancelled = false;
    state.processStartTime = Date.now();

    log('=== STARTING PROCESSING ===');
    showScreen('processing-screen');
    setProgress(0);
    startFunMessages();

    // Background defenses
    await acquireWakeLock();
    startSilentAudio();

    var pipStarted = false;
    if (isMobile() && isPiPSupported()) {
        try { pipStarted = await startPiP(); } catch(e) { log('PiP error: ' + e.message); }
    }
    if (!pipStarted && isMobile()) {
        showToast('⚠️ Keep this app open for fastest processing', 'info', 5000);
    }

    if (state.notifPermission === 'default') {
        try { await askNotificationPermission(); } catch(e) {}
    }
    showBgNotice();

    try {
        // STEP 1: Load engine
        if (!state.ffmpegReady) {
            updateStatus('Loading Crispy engine… 🔧');
            updatePiP(0, 'Loading engine…');
            await loadFFmpeg();
        }
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 2: Read file into FFmpeg
        updateStatus('Reading your video… 📖');
        updatePiP(0, 'Reading video…');
        log('Reading file into memory…');
        var fileData = new Uint8Array(await state.file.arrayBuffer());
        log('File in memory: ' + formatBytes(fileData.byteLength));
        await state.ffmpeg.writeFile('input', fileData);
        log('File written to FFmpeg VFS');
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 3: Watermark
        state.hasWatermark = false;
        try {
            updatePiP(0, 'Adding watermark…');
            log('Creating watermark…');
            var wmData = await createWatermarkImage();
            await state.ffmpeg.writeFile('watermark.png', wmData);
            state.hasWatermark = true;
            log('Watermark ready ✅');
        } catch (wmErr) {
            logError('Watermark failed — continuing without', wmErr);
        }
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 4: Encode
        updateStatus('Making it crispy… 🍳');
        updatePiP(0, 'Making it crispy…');
        var clipDur = Math.min(CONFIG.maxDuration, state.duration);
        var cmd = buildFFmpegCommand(clipDur, state.hasWatermark);
        log('FFmpeg command: ffmpeg ' + cmd.join(' '));

        var exitCode = await state.ffmpeg.exec(cmd);
        log('FFmpeg exit code: ' + exitCode);

        if (exitCode !== 0) {
            // Try fallback without watermark
            if (state.hasWatermark) {
                log('⚠️ Retrying without watermark…');
                updateStatus('Retrying… 🔄');
                state.hasWatermark = false;
                var fallbackCmd = buildFFmpegCommand(clipDur, false);
                log('Fallback: ffmpeg ' + fallbackCmd.join(' '));
                exitCode = await state.ffmpeg.exec(fallbackCmd);
                log('Fallback exit code: ' + exitCode);
            }
            if (exitCode !== 0) throw new Error('FFMPEG_ERROR');
        }
        if (state.cancelled) throw new Error('CANCELLED');

        // STEP 5: Read output
        updateStatus('Wrapping up… 🎁');
        updatePiP(100, 'Almost done…');
        var outputData;
        try { outputData = await state.ffmpeg.readFile('output.mp4'); }
        catch (e) { throw new Error('OUTPUT_READ_FAILED'); }

        if (!outputData || outputData.byteLength < 1000) throw new Error('OUTPUT_EMPTY');

        state.outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;

        var sizeMB = state.outputSize / (1024 * 1024);
        var elapsed = ((Date.now() - state.processStartTime) / 1000).toFixed(1);
        log('✅ DONE in ' + elapsed + 's | Size: ' + sizeMB.toFixed(2) + 'MB | Watermark: ' + state.hasWatermark);

        if (sizeMB <= CONFIG.quality.targetMaxMB) log('✅ WhatsApp will NOT re-compress this');
        else log('⚠️ File may be re-compressed by WhatsApp');

        // Cleanup FFmpeg VFS
        try { await state.ffmpeg.deleteFile('input'); } catch(e) {}
        try { await state.ffmpeg.deleteFile('output.mp4'); } catch(e) {}
        try { if (state.hasWatermark) await state.ffmpeg.deleteFile('watermark.png'); } catch(e) {}

        await releaseWakeLock(); stopSilentAudio(); showPiPDone();
        sendNotification('🔥 Your video is crispy!', 'Optimized in ' + elapsed + 's. Tap to download.');
        haptic('success');
        showDone();

    } catch (err) {
        stopFunMessages(); await releaseWakeLock(); stopSilentAudio(); closePiP();
        if (err.message === 'CANCELLED') { showToast('Cancelled', 'info'); showScreen('home-screen'); return; }
        logError('Processing failed', err);
        sendNotification('😬 Processing failed', 'Tap to try again.');

        var title = 'Processing Failed', msg = '';
        switch (err.message) {
            case 'SCRIPT_NOT_LOADED': title='Engine Not Loaded'; msg='Refresh and check internet.'; break;
            case 'ENGINE_LOAD_FAILED': title='Engine Download Failed'; msg='Check internet and retry.'; break;
            case 'FFMPEG_ERROR': title='Video Format Issue'; msg='Try a different MP4 or shorter video.'; break;
            case 'OUTPUT_READ_FAILED': case 'OUTPUT_EMPTY': title='Processing Error'; msg='Try a shorter or smaller video.'; break;
            default: msg='Something went wrong. Try a different video or refresh.';
        }
        showError(title, msg);
        showScreen('home-screen');
    } finally {
        state.processing = false;
        stopFunMessages();
        hideBgNotice();
    }
}

function cancelProcessing() {
    state.cancelled = true;
    releaseWakeLock(); stopSilentAudio(); closePiP();
    showToast('Cancelling…', 'info', 2000);
}

function showBgNotice() { if (els.bgNotice) els.bgNotice.classList.remove('hidden'); }
function hideBgNotice() { if (els.bgNotice) els.bgNotice.classList.add('hidden'); }

/* ======================== PROGRESS ======================== */
function setProgress(pct) {
    if (els.progressFill) els.progressFill.style.width = pct + '%';
    if (els.progressText) els.progressText.textContent = pct + ' %';
    if (state.processing) document.title = pct + '% — Crispy Status';
    updatePiP(pct, pct < 95 ? 'Making it crispy…' : 'Almost done…');
}

function updateStatus(msg) {
    if (!els.processingStatus) return;
    els.processingStatus.style.opacity = '0';
    setTimeout(function() { els.processingStatus.textContent = msg; els.processingStatus.style.opacity = '1'; }, 150);
}

var funTimer = null, funIdx = 0;
function startFunMessages() {
    funIdx = 0;
    funTimer = setInterval(function() { funIdx=(funIdx+1)%FUN_MESSAGES.length; if(els.funTip) els.funTip.textContent=FUN_MESSAGES[funIdx]; }, 3500);
}
function stopFunMessages() { clearInterval(funTimer); document.title='Crispy Status — Sharp WhatsApp Status. Every Time.'; }

/* ======================== DONE ======================== */
function showDone() {
    if(els.statBefore) els.statBefore.textContent = formatBytes(state.originalSize);
    if(els.statAfter) els.statAfter.textContent = formatBytes(state.outputSize);
    var saved = Math.max(0, Math.round((1-state.outputSize/state.originalSize)*100));
    if(els.statSaved) els.statSaved.textContent = saved>0 ? ('-'+saved+'%') : '✨ optimized';
    if (state.outputUrl && els.donePreview) {
        els.donePreview.src = state.outputUrl;
        if(els.donePlayBtn) { els.donePlayBtn.classList.remove('hide'); els.donePlayBtn.textContent='▶'; }
    }
    state.tipsShown = false;
    if(els.tipsSection) els.tipsSection.classList.add('hidden');
    if(els.tipsList) els.tipsList.innerHTML = '';
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
            navigator.share({ files: [file] }).then(function() { showToast('Shared! 🚀', 'success'); }).catch(function(){});
            return;
        }
    }
    downloadVideo();
}

function showTips() {
    if(!els.tipsSection || !els.tipsList) return;
    els.tipsSection.classList.remove('hidden'); els.tipsList.innerHTML = '';
    QUALITY_TIPS.forEach(function(tip) {
        var card = document.createElement('div'); card.className = 'tip-card';
        card.innerHTML = '<span class="tip-icon">'+tip.icon+'</span><div class="tip-content"><strong>'+tip.title+'</strong><p>'+tip.text+'</p></div>';
        els.tipsList.appendChild(card);
    });
    setTimeout(function() { els.tipsSection.scrollIntoView({ behavior:'smooth', block:'start' }); }, 350);
}

/* ======================== PWA ======================== */
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault(); state.installPrompt = e;
        if (!localStorage.getItem('crispy_install_dismissed'))
            setTimeout(function() { if(els.installPrompt) els.installPrompt.classList.remove('hidden'); }, 5000);
    });
    if(els.installYes) els.installYes.addEventListener('click', async function() {
        if (!state.installPrompt) return;
        await state.installPrompt.prompt(); state.installPrompt = null;
        if(els.installPrompt) els.installPrompt.classList.add('hidden');
        showToast('Installed! 📲', 'success');
    });
    if(els.installDismiss) els.installDismiss.addEventListener('click', function() {
        if(els.installPrompt) els.installPrompt.classList.add('hidden');
        localStorage.setItem('crispy_install_dismissed', 'true');
    });
}

/* ======================== UTILITIES ======================== */
function formatBytes(b) {
    if(b<1024) return b+' B';
    if(b<1024*1024) return (b/1024).toFixed(1)+' KB';
    return (b/(1024*1024)).toFixed(1)+' MB';
}
function formatTime(s) { return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function truncateFilename(n, max) {
    if(n.length<=max) return n;
    var ext=n.split('.').pop();
    return n.substring(0,max-ext.length-3)+'….'+ext;
}
function cleanup() {
    if(state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    if(state.outputUrl) URL.revokeObjectURL(state.outputUrl);
    state.objectUrl=null;state.outputUrl=null;state.outputBlob=null;state.file=null;
    state.tipsShown=false;state.videoWidth=0;state.videoHeight=0;state.hasWatermark=false;
    if(els.fileInput) els.fileInput.value='';
    if(els.donePreview) els.donePreview.src='';
    if(els.trimVideo) els.trimVideo.src='';
}

function setupBackButton() {
    window.addEventListener('popstate', function() {
        if(state.processing){history.pushState({screen:'processing-screen'},'','');showToast('Cancel processing first.','info');return;}
        var c=document.querySelector('.screen.active');
        if(c){
            if(c.id==='trim-screen'){if(els.trimVideo)els.trimVideo.pause();showScreen('home-screen');}
            else if(c.id==='done-screen'){cleanup();showScreen('home-screen');}
            else showScreen('home-screen');
        }
    });
}
function setupBeforeUnload() {
    window.addEventListener('beforeunload', function(e) { if(state.processing){e.preventDefault();e.returnValue='';} });
}

/* ======================== EVENTS ======================== */
function bindEvents() {
    log('Binding events…');

    if(els.uploadBtn) {
        els.uploadBtn.addEventListener('click', function() {
            log('Upload button clicked');
            haptic('light');
            if(els.fileInput) els.fileInput.click();
        });
    }

    if(els.fileInput) {
        els.fileInput.addEventListener('change', function(e) {
            log('File input changed');
            var f = e.target.files && e.target.files[0];
            if (f) {
                log('File: ' + f.name + ' (' + formatBytes(f.size) + ')');
                handleFileSelect(f);
            } else {
                log('No file selected');
            }
        });
    }

    if(els.trimBackBtn) els.trimBackBtn.addEventListener('click', function() {
        haptic('light'); if(els.trimVideo) els.trimVideo.pause(); showScreen('home-screen');
    });

    if(els.trimSlider) {
        var seekDebounce;
        els.trimSlider.addEventListener('input', function() {
            updateTrimUI(); clearTimeout(seekDebounce);
            seekDebounce=setTimeout(function(){if(els.trimVideo) els.trimVideo.currentTime=state.trimStart;},60);
        });
    }

    if(els.playPreviewBtn) els.playPreviewBtn.addEventListener('click', function() {
        haptic('light'); var v=els.trimVideo; if(!v) return;
        if(v.paused){
            v.currentTime=state.trimStart;v.muted=false;v.play();
            els.playPreviewBtn.textContent='⏸';els.playPreviewBtn.classList.add('hide');
            var stopAt=state.trimStart+CONFIG.maxDuration;
            var stop=function(){if(v.currentTime>=stopAt){v.pause();v.removeEventListener('timeupdate',stop);els.playPreviewBtn.textContent='▶';els.playPreviewBtn.classList.remove('hide');}};
            v.addEventListener('timeupdate',stop);
        } else {v.pause();els.playPreviewBtn.textContent='▶';els.playPreviewBtn.classList.remove('hide');}
    });

    if(els.trimVideo) els.trimVideo.addEventListener('click', function() { if(els.playPreviewBtn) els.playPreviewBtn.click(); });

    if(els.trimContinueBtn) els.trimContinueBtn.addEventListener('click', function() {
        haptic('medium'); if(els.trimVideo) els.trimVideo.pause(); startProcessing();
    });

    if(els.cancelBtn) els.cancelBtn.addEventListener('click', function() { haptic('light'); cancelProcessing(); });

    if(els.donePlayBtn) els.donePlayBtn.addEventListener('click', function() {
        haptic('light'); var v=els.donePreview; if(!v) return;
        if(v.paused){v.play();els.donePlayBtn.classList.add('hide');}
        else{v.pause();els.donePlayBtn.classList.remove('hide');}
    });

    if(els.donePreview) {
        els.donePreview.addEventListener('click', function() { if(els.donePlayBtn) els.donePlayBtn.click(); });
        els.donePreview.addEventListener('ended', function() { if(els.donePlayBtn){els.donePlayBtn.classList.remove('hide');els.donePlayBtn.textContent='▶';} });
    }

    if(els.downloadBtn) els.downloadBtn.addEventListener('click', downloadVideo);
    if(els.shareBtn) els.shareBtn.addEventListener('click', shareToWhatsApp);
    if(els.newVideoBtn) els.newVideoBtn.addEventListener('click', function() { haptic('light'); cleanup(); showScreen('home-screen'); });

    if(els.errorCloseBtn) els.errorCloseBtn.addEventListener('click', function() { haptic('light'); hideError(); showScreen('home-screen'); });
    if(els.errorModal) els.errorModal.addEventListener('click', function(e) { if(e.target===els.errorModal) hideError(); });

    document.addEventListener('keydown', function(e) {
        if(e.key==='Escape' && els.errorModal && !els.errorModal.classList.contains('hidden')) hideError();
    });

    window.addEventListener('resize', function() {
        if(els.confettiCanvas){els.confettiCanvas.width=window.innerWidth;els.confettiCanvas.height=window.innerHeight;}
    });

    log('✅ Events bound');
}

function registerSW() { if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){}); }

function preloadFFmpeg() {
    setTimeout(function() {
        if (!state.ffmpegReady) {
            log('Preloading FFmpeg…');
            loadFFmpeg().then(function(){log('Preload done ✅');}).catch(function(e){log('Preload failed: '+e.message);});
        }
    }, 3000);
}

/* ======================== INIT ======================== */
function init() {
    log('========================================');
    log('Crispy Status v8 — Upload Fix + Quality');
    log('========================================');

    if (typeof WebAssembly === 'undefined') {
        alert('Your browser does not support this app. Please use Chrome, Firefox, Safari, or Edge.');
        return;
    }

    // Init DOM references
    initEls();

    // Bind events
    try {
        bindEvents();
    } catch (e) {
        logError('bindEvents failed', e);
        alert('App failed to start: ' + e.message);
        return;
    }

    registerSW();
    setupInstallPrompt();
    setupBackButton();
    setupBeforeUnload();
    setupVisibilityHandler();
    setupFreezeHandler();
    requestNotificationPermission();
    showScreen('home-screen');
    preloadFFmpeg();

    if (els.confettiCanvas) {
        els.confettiCanvas.width = window.innerWidth;
        els.confettiCanvas.height = window.innerHeight;
    }

    log('✅ Init complete — app ready');
}

init();
