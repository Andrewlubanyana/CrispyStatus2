/* ==========================================================
   CRISPY STATUS — v10 Sprint 1
   
   NEW FEATURES:
   1. Before/After comparison slider (simulated WhatsApp vs Crispy)
   2. Time estimate + ETA during processing
   3. Watermark choice (ON by default, watch ad to remove)
   4. Smart rating prompt (after 3rd download)
   5. Quality score display
   ========================================================== */

/* ======================== CONFIG ======================== */
var CONFIG = {
    maxDuration: 30,
    maxFileSize: 500,

    quality: {
        shortSide: 720,
        baseCRF: 16,
        audioBitrate: '128k',
        audioRate: 44100,
        audioChannels: 2,
        fps: 30,
        preset: 'medium',
        profile: 'high',
        level: '4.0',
        keyint: 30,
        targetMaxMB: 8,
        absoluteMaxMB: 16,
    },

    watermark: {
        text: 'crispystatus.com',
        fontSize: 18,
        opacity: 0.7,
        padding: 16,
    },

    cdnUrls: [
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
        'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
    ],

    ratingPromptAfter: 3,
    wmFreeHours: 24,
    adCountdownSeconds: 5,
};

var FUN_MESSAGES = [
    '🍳 Frying up the pixels…', '✨ Sharpening every frame…',
    '🧹 Sweeping away the blur…', '👨‍🍳 Almost gourmet quality…',
    '🧂 Adding a pinch of clarity…', '🎨 Painting in HD…',
    '🔥 Turning up the crispness…', '💎 Polishing your masterpiece…',
    '🎯 Fine-tuning the details…', '🚀 Almost there…',
    '📐 Optimizing every pixel…', '🏆 Making it Status-worthy…',
    '🏷️ Stamping the crispy seal…', '🔬 Enhancing micro-details…',
];

var QUALITY_TIPS = [
    { icon: '📱', title: 'Post directly to Status', text: 'Open WhatsApp → Status → pick the crispy video. Don\'t use any other app or editor to open it first.' },
    { icon: '🚫', title: 'Never re-edit after download', text: 'Any trimming, filtering, or editing will re-compress your video and destroy the quality.' },
    { icon: '📂', title: 'Use the actual downloaded file', text: 'Don\'t screen-record, screenshot, or forward the video. Always use the original downloaded MP4.' },
    { icon: '⚡', title: 'Post immediately after download', text: 'Some phones re-compress gallery videos over time. Post to Status right after downloading.' },
    { icon: '🔄', title: 'Don\'t forward the Status', text: 'When someone forwards your Status, WhatsApp compresses it again. Share the original file instead.' },
    { icon: '📶', title: 'Use Wi-Fi when posting', text: 'WhatsApp may compress more aggressively on mobile data. Use Wi-Fi for best upload quality.' },
];

/* ======================== STATE ======================== */
var state = {
    file: null, objectUrl: null, duration: 0, trimStart: 0,
    originalSize: 0, videoWidth: 0, videoHeight: 0, isPortrait: true,
    outputBlob: null, outputUrl: null, outputSize: 0,
    ffmpeg: null, ffmpegReady: false, processing: false,
    cancelled: false, tipsShown: false, installPrompt: null,
    hasWatermark: true,
    wakeLock: null, notifPermission: 'default', wasHidden: false,
    processStartTime: 0,
    silentAudioCtx: null, silentAudioSource: null,
    pipCanvas: null, pipCtx: null, pipVideo: null, pipStream: null,
    pipActive: false, pipUpdateTimer: null, pipProgress: 0, pipStatusText: 'Starting…',
    // Sprint 1
    beforeFrameURL: null,
    afterFrameURL: null,
    etaSamples: [],
    wmAdTimer: null,
    compareDragging: false,
};

/* ======================== LOGGING ======================== */
function log(m, d) { var t = new Date().toISOString().substr(11, 12); if (d !== undefined) console.log('[Crispy ' + t + '] ' + m, d); else console.log('[Crispy ' + t + '] ' + m); }
function logError(m, e) { console.error('[Crispy ERROR] ' + m, e); }

/* ======================== DOM ======================== */
function $(id) { return document.getElementById(id); }
var els = {};

function initEls() {
    var ids = [
        'home-screen', 'trim-screen', 'processing-screen', 'done-screen',
        'upload-btn', 'file-input', 'trim-back-btn', 'trim-video', 'play-preview-btn',
        'trim-slider', 'trim-window', 'trim-start-time', 'trim-end-time',
        'trim-file-name', 'trim-file-dur', 'trim-dur-label', 'trim-continue-btn',
        'processing-status', 'progress-fill', 'progress-text', 'fun-tip',
        'cancel-btn', 'bg-notice', 'done-preview', 'done-play-btn',
        'stat-before', 'stat-after', 'stat-saved',
        'download-btn', 'share-btn', 'tips-section', 'tips-list', 'new-video-btn',
        'error-modal', 'error-msg', 'error-close-btn',
        'install-prompt', 'install-yes', 'install-dismiss', 'confetti-canvas',
        // Sprint 1 elements
        'processing-eta', 'wm-toggle-btn', 'wm-setting', 'wm-label',
        'wm-ad-modal', 'wm-ad-done-btn', 'wm-ad-cancel-btn',
        'wm-countdown-fill', 'wm-countdown-text',
        'compare-section', 'compare-container', 'compare-before', 'compare-after', 'compare-handle',
        'quality-score', 'quality-score-num', 'quality-score-desc',
        'rating-modal', 'rating-love-btn', 'rating-improve-btn', 'rating-count',
        'feedback-modal', 'feedback-text', 'feedback-send-btn', 'feedback-skip-btn',
    ];
    ids.forEach(function(id) {
        var key = id.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
        els[key] = $(id);
    });
    var missing = ids.filter(function(id) { return !$(id); });
    if (missing.length) log('⚠️ Missing: ' + missing.join(', '));
    else log('✅ All DOM elements found');
}

/* ========================================================
   INDEXEDDB CACHE
   ======================================================== */
var CACHE_DB = 'crispy-cache', CACHE_STORE = 'files';

function openCacheDB() {
    return new Promise(function(res, rej) {
        var r = indexedDB.open(CACHE_DB, 1);
        r.onupgradeneeded = function(e) { if (!e.target.result.objectStoreNames.contains(CACHE_STORE)) e.target.result.createObjectStore(CACHE_STORE); };
        r.onsuccess = function(e) { res(e.target.result); };
        r.onerror = function() { rej(r.error); };
    });
}

function getCached(k) { return openCacheDB().then(function(db) { return new Promise(function(res) { var r = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(k); r.onsuccess = function() { res(r.result || null); }; r.onerror = function() { res(null); }; }); }).catch(function() { return null; }); }
function setCache(k, d) { return openCacheDB().then(function(db) { return new Promise(function(res) { var tx = db.transaction(CACHE_STORE, 'readwrite'); tx.objectStore(CACHE_STORE).put(d, k); tx.oncomplete = function() { res(); }; tx.onerror = function() { res(); }; }); }).catch(function() {}); }

async function toBlobURL(url, mimeType) {
    var ck = url.split('/').pop();
    try { var c = await getCached(ck); if (c) { log('⚡ Cached: ' + ck); return URL.createObjectURL(new Blob([c], { type: mimeType })); } } catch (e) {}
    log('⬇️ Download: ' + ck);
    var r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
    var buf = await r.arrayBuffer();
    try { await setCache(ck, buf); } catch (e) {}
    return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

/* ========================================================
   PIP PROGRESS
   ======================================================== */
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
function isPiPSupported() { try { return !!(document.pictureInPictureEnabled && HTMLVideoElement.prototype.requestPictureInPicture); } catch (e) { return false; } }

function drawPipFrame() {
    var c = state.pipCanvas, x = state.pipCtx; if (!c || !x) return;
    var w = c.width, h = c.height, p = state.pipProgress;
    x.fillStyle = '#0B0B1A'; x.fillRect(0, 0, w, h);
    x.font = '36px serif'; x.textAlign = 'center'; x.fillText('🍳', w / 2, 42);
    x.font = '600 14px sans-serif'; x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillText(state.pipStatusText, w / 2, 68);
    var bx = 30, by = 90, bw = w - 60, bh = 16, br = 8;
    x.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(x, bx, by, bw, bh, br); x.fill();
    if (p > 0) { var fw = Math.max(bh, (bw * p) / 100); var g = x.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#FF6B35'); g.addColorStop(1, '#FF3366'); x.fillStyle = g; roundRect(x, bx, by, fw, bh, br); x.fill(); }
    x.font = '800 28px sans-serif'; x.fillStyle = '#FFF'; x.fillText(p + '%', w / 2, 140);
    x.font = '500 10px sans-serif'; x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillText('crispystatus.com', w / 2, 170);
}

function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }

async function startPiP() {
    if (!isPiPSupported()) return false;
    try {
        state.pipCanvas = document.createElement('canvas'); state.pipCanvas.width = 320; state.pipCanvas.height = 180;
        state.pipCtx = state.pipCanvas.getContext('2d'); state.pipProgress = 0; state.pipStatusText = 'Starting…'; drawPipFrame();
        if (typeof state.pipCanvas.captureStream !== 'function') return false;
        state.pipStream = state.pipCanvas.captureStream(10);
        state.pipVideo = document.createElement('video'); state.pipVideo.srcObject = state.pipStream;
        state.pipVideo.muted = true; state.pipVideo.playsInline = true;
        state.pipVideo.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;bottom:0;left:0;z-index:-1';
        document.body.appendChild(state.pipVideo); await state.pipVideo.play();
        await state.pipVideo.requestPictureInPicture(); state.pipActive = true;
        state.pipUpdateTimer = setInterval(drawPipFrame, 500);
        state.pipVideo.addEventListener('leavepictureinpicture', function() { state.pipActive = false; if (state.processing) showToast('⚠️ Keep app open for fastest processing', 'info', 4000); });
        return true;
    } catch (e) { cleanupPiP(); return false; }
}

function updatePiP(p, t) { state.pipProgress = p; if (t) state.pipStatusText = t; if (state.pipActive) drawPipFrame(); }
function showPiPDone() { if (!state.pipActive || !state.pipCtx) return; var x = state.pipCtx, w = state.pipCanvas.width, h = state.pipCanvas.height; x.fillStyle = '#0B0B1A'; x.fillRect(0, 0, w, h); x.font = '48px serif'; x.textAlign = 'center'; x.fillText('✅', w / 2, 70); x.font = '800 20px sans-serif'; x.fillStyle = '#22D67F'; x.fillText('Video is Crispy!', w / 2, 110); setTimeout(closePiP, 3000); }
function closePiP() { try { if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch (e) {} cleanupPiP(); }
function cleanupPiP() { if (state.pipUpdateTimer) { clearInterval(state.pipUpdateTimer); state.pipUpdateTimer = null; } if (state.pipVideo) { try { state.pipVideo.pause(); } catch (e) {} if (state.pipVideo.srcObject) { try { state.pipVideo.srcObject.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {} state.pipVideo.srcObject = null; } if (state.pipVideo.parentNode) state.pipVideo.parentNode.removeChild(state.pipVideo); state.pipVideo = null; } state.pipStream = null; state.pipCanvas = null; state.pipCtx = null; state.pipActive = false; }

/* ========================================================
   SILENT AUDIO + BACKGROUND
   ======================================================== */
function startSilentAudio() { try { var A = window.AudioContext || window.webkitAudioContext; if (!A) return; state.silentAudioCtx = new A(); var b = state.silentAudioCtx.createBuffer(1, state.silentAudioCtx.sampleRate * 2, state.silentAudioCtx.sampleRate); var c = b.getChannelData(0); for (var i = 0; i < c.length; i++) c[i] = (Math.random() - 0.5) * 0.00001; var s = state.silentAudioCtx.createBufferSource(); s.buffer = b; s.loop = true; var g = state.silentAudioCtx.createGain(); g.gain.value = 0.001; s.connect(g); g.connect(state.silentAudioCtx.destination); s.start(); state.silentAudioSource = s; } catch (e) {} }
function stopSilentAudio() { try { if (state.silentAudioSource) state.silentAudioSource.stop(); } catch (e) {} try { if (state.silentAudioCtx) state.silentAudioCtx.close(); } catch (e) {} state.silentAudioSource = null; state.silentAudioCtx = null; }

async function acquireWakeLock() { if (!('wakeLock' in navigator)) return; try { state.wakeLock = await navigator.wakeLock.request('screen'); state.wakeLock.addEventListener('release', function() { if (state.processing) acquireWakeLock(); }); } catch (e) {} }
async function releaseWakeLock() { if (state.wakeLock) { try { await state.wakeLock.release(); } catch (e) {} state.wakeLock = null; } }

async function requestNotificationPermission() { if (!('Notification' in window)) return; state.notifPermission = Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default'; }
async function askNotificationPermission() { if (!('Notification' in window)) return; if (Notification.permission !== 'default') { state.notifPermission = Notification.permission; return; } try { state.notifPermission = await Notification.requestPermission(); } catch (e) {} }
function sendNotification(t, b) { if (state.notifPermission !== 'granted' || document.visibilityState === 'visible') return; try { var n = new Notification(t, { body: b, tag: 'crispy-status', vibrate: [200, 100, 200] }); n.onclick = function() { window.focus(); n.close(); }; } catch (e) {} }

function setupVisibilityHandler() { document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden') { state.wasHidden = true; if (state.processing) acquireWakeLock(); } else { if (state.wasHidden && state.processing) showToast('Still crisping… 🍳', 'info', 2000); if (state.wasHidden && !state.processing && state.outputUrl) showToast('Your video is ready! 🔥', 'success'); state.wasHidden = false; } }); }
function setupFreezeHandler() { try { document.addEventListener('freeze', function() {}); document.addEventListener('resume', function() { if (state.processing) showToast('Resumed ▶️', 'info', 2000); }); } catch (e) {} }

/* ======================== SCREENS / UI ======================== */
function showScreen(id) { document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active', 'screen-enter'); }); var e = $(id); if (e) e.classList.add('active', 'screen-enter'); window.scrollTo({ top: 0, behavior: 'instant' }); if (!history.state || history.state.screen !== id) history.pushState({ screen: id }, '', ''); }
function showToast(m, t, d) { t = t || 'info'; d = d || 3000; var c = $('toast-container'); if (!c) return; var el = document.createElement('div'); el.className = 'toast ' + t; var ic = { success: '✅', error: '❌', info: '💡' }; el.innerHTML = '<span class="toast-icon">' + (ic[t] || '💡') + '</span><span>' + m + '</span>'; c.appendChild(el); setTimeout(function() { el.classList.add('toast-out'); el.addEventListener('animationend', function() { el.remove(); }); }, d); }
function haptic(s) { try { if (navigator.vibrate) navigator.vibrate({ light: [12], medium: [25], heavy: [50], success: [15, 50, 15] }[s || 'light'] || [12]); } catch (e) {} }
function showError(t, m) { try { var h = $('error-heading'); if (h) h.textContent = t; if (els.errorMsg) els.errorMsg.textContent = m; if (els.errorModal) els.errorModal.classList.remove('hidden'); haptic('heavy'); } catch (e) { alert(t + ': ' + m); } }
function hideError() { if (els.errorModal) els.errorModal.classList.add('hidden'); }

function fireConfetti() { if (!els.confettiCanvas) return; var cv = els.confettiCanvas, cx = cv.getContext('2d'); cv.width = window.innerWidth; cv.height = window.innerHeight; var cl = ['#FF6B35', '#FF3366', '#8B5CF6', '#22D67F', '#FBBF24', '#06B6D4', '#fff'], ps = []; for (var i = 0; i < 90; i++) ps.push({ x: cv.width / 2 + (Math.random() - 0.5) * 100, y: cv.height * 0.35, vx: (Math.random() - 0.5) * 18, vy: Math.random() * -20 - 8, sz: Math.random() * 8 + 4, c: cl[Math.floor(Math.random() * cl.length)], r: Math.random() * 360, rs: (Math.random() - 0.5) * 12, g: 0.4 + Math.random() * 0.2, o: 1, sh: Math.random() > 0.5 ? 'c' : 'r' }); var f = 0; function d() { cx.clearRect(0, 0, cv.width, cv.height); ps.forEach(function(p) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99; p.r += p.rs; p.o = Math.max(0, 1 - f / 150); cx.save(); cx.globalAlpha = p.o; cx.translate(p.x, p.y); cx.rotate(p.r * Math.PI / 180); cx.fillStyle = p.c; if (p.sh === 'c') { cx.beginPath(); cx.arc(0, 0, p.sz / 2, 0, Math.PI * 2); cx.fill(); } else cx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz); cx.restore(); }); f++; if (f < 150) requestAnimationFrame(d); else cx.clearRect(0, 0, cv.width, cv.height); } requestAnimationFrame(d); }

/* ========================================================
   FEATURE 1: BEFORE/AFTER COMPARISON
   ======================================================== */

/* Capture a frame from a video element */
function captureFrame(videoEl) {
    var c = document.createElement('canvas');
    c.width = videoEl.videoWidth;
    c.height = videoEl.videoHeight;
    var x = c.getContext('2d');
    x.drawImage(videoEl, 0, 0);
    return c.toDataURL('image/jpeg', 0.92);
}

/* Simulate what WhatsApp compression would do to the original */
function simulateWhatsAppCompression(dataURL) {
    return new Promise(function(resolve) {
        var img = new Image();
        img.onload = function() {
            // Step 1: Downscale to ~40% (WhatsApp reduces resolution)
            var c1 = document.createElement('canvas');
            var scale = 0.35;
            c1.width = Math.round(img.width * scale);
            c1.height = Math.round(img.height * scale);
            var x1 = c1.getContext('2d');
            x1.drawImage(img, 0, 0, c1.width, c1.height);

            // Step 2: Heavy JPEG compression (quality 0.12)
            var compressed = c1.toDataURL('image/jpeg', 0.12);

            // Step 3: Scale back up to original size (blocky, blurry result)
            var img2 = new Image();
            img2.onload = function() {
                var c2 = document.createElement('canvas');
                c2.width = img.width;
                c2.height = img.height;
                var x2 = c2.getContext('2d');
                // Use default (bilinear) scaling — this makes it blurry
                x2.drawImage(img2, 0, 0, c2.width, c2.height);
                resolve(c2.toDataURL('image/jpeg', 0.9));
            };
            img2.src = compressed;
        };
        img.src = dataURL;
    });
}

/* Capture the "before" frame when original video loads */
function captureBeforeFrame() {
    var v = els.trimVideo;
    if (!v || !v.videoWidth) return;

    // Seek to 25% for an interesting frame
    var seekTime = Math.min(state.duration * 0.25, 2);
    v.currentTime = seekTime;

    v.onseeked = function() {
        var originalFrame = captureFrame(v);
        log('Captured original frame');

        // Simulate WhatsApp compression
        simulateWhatsAppCompression(originalFrame).then(function(degraded) {
            state.beforeFrameURL = degraded;
            log('Simulated WhatsApp compression ✅');
        }).catch(function() {
            state.beforeFrameURL = originalFrame;
        });

        v.onseeked = null; // Remove handler
    };
}

/* Capture the "after" frame from processed video */
function captureAfterFrame() {
    var v = els.donePreview;
    if (!v || !v.videoWidth) return;

    var seekTime = Math.min(v.duration * 0.25, 2);
    v.currentTime = seekTime;

    v.onseeked = function() {
        state.afterFrameURL = captureFrame(v);
        log('Captured crispy frame ✅');
        showComparison();
        v.onseeked = null;
    };
}

/* Display the comparison slider */
function showComparison() {
    if (!state.beforeFrameURL || !state.afterFrameURL) {
        log('Missing frames for comparison');
        return;
    }

    if (els.compareSection) els.compareSection.style.display = 'block';
    if (els.compareBefore) els.compareBefore.src = state.beforeFrameURL;
    if (els.compareAfter) els.compareAfter.src = state.afterFrameURL;

    // Reset slider to 50%
    updateComparePosition(50);
    log('Comparison slider ready ✅');
}

function updateComparePosition(pct) {
    pct = Math.max(5, Math.min(95, pct));
    if (els.compareBefore) els.compareBefore.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
    if (els.compareHandle) els.compareHandle.style.left = pct + '%';
}

function setupComparisonDrag() {
    var container = els.compareContainer;
    if (!container) return;

    function getPosition(e) {
        var rect = container.getBoundingClientRect();
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        return ((clientX - rect.left) / rect.width) * 100;
    }

    container.addEventListener('mousedown', function(e) {
        e.preventDefault();
        state.compareDragging = true;
        updateComparePosition(getPosition(e));
    });

    document.addEventListener('mousemove', function(e) {
        if (state.compareDragging) {
            e.preventDefault();
            updateComparePosition(getPosition(e));
        }
    });

    document.addEventListener('mouseup', function() {
        state.compareDragging = false;
    });

    container.addEventListener('touchstart', function(e) {
        e.preventDefault();
        state.compareDragging = true;
        updateComparePosition(getPosition(e));
    }, { passive: false });

    container.addEventListener('touchmove', function(e) {
        if (state.compareDragging) {
            e.preventDefault();
            updateComparePosition(getPosition(e));
        }
    }, { passive: false });

    container.addEventListener('touchend', function() {
        state.compareDragging = false;
    });

    log('Comparison drag handlers ready');
}

/* ========================================================
   FEATURE 2: TIME ESTIMATE + ETA
   ======================================================== */

function updateETA(pct) {
    if (!els.processingEta) return;
    if (pct < 3) {
        els.processingEta.textContent = '';
        return;
    }

    var elapsed = (Date.now() - state.processStartTime) / 1000;
    var totalEstimate = elapsed / (pct / 100);
    var remaining = Math.max(0, totalEstimate - elapsed);

    // Smooth the estimate with running average
    state.etaSamples.push(remaining);
    if (state.etaSamples.length > 5) state.etaSamples.shift();

    var avg = state.etaSamples.reduce(function(a, b) { return a + b; }, 0) / state.etaSamples.length;
    var rounded = Math.ceil(avg);

    if (rounded <= 0 || pct >= 98) {
        els.processingEta.textContent = 'Almost done…';
    } else if (rounded === 1) {
        els.processingEta.textContent = 'About 1 second remaining';
    } else if (rounded < 60) {
        els.processingEta.textContent = 'About ' + rounded + ' seconds remaining';
    } else {
        var mins = Math.ceil(rounded / 60);
        els.processingEta.textContent = 'About ' + mins + ' minute' + (mins > 1 ? 's' : '') + ' remaining';
    }

    // Update PiP with ETA
    if (state.pipActive && rounded > 0 && pct < 98) {
        state.pipStatusText = pct + '% — ' + rounded + 's left';
    }
}

function clearETA() {
    state.etaSamples = [];
    if (els.processingEta) els.processingEta.textContent = '';
}

/* ========================================================
   FEATURE 3: WATERMARK CHOICE
   ======================================================== */

function isWatermarkFree() {
    var until = localStorage.getItem('crispy_wm_free_until');
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
}

function grantWatermarkFree() {
    var until = Date.now() + (CONFIG.wmFreeHours * 60 * 60 * 1000);
    localStorage.setItem('crispy_wm_free_until', String(until));
    state.hasWatermark = false;
    updateWatermarkUI();
    log('Watermark free until: ' + new Date(until).toLocaleString());
}

function updateWatermarkUI() {
    if (!els.wmToggleBtn) return;
    if (state.hasWatermark) {
        els.wmToggleBtn.textContent = 'ON';
        els.wmToggleBtn.className = 'wm-toggle on';
    } else {
        els.wmToggleBtn.textContent = 'OFF';
        els.wmToggleBtn.className = 'wm-toggle off';
    }
}

function showWatermarkAdModal() {
    if (!els.wmAdModal) return;
    els.wmAdModal.classList.remove('hidden');

    // Reset
    var doneBtn = els.wmAdDoneBtn;
    if (doneBtn) { doneBtn.classList.remove('ready'); doneBtn.disabled = true; }
    if (els.wmCountdownFill) els.wmCountdownFill.style.width = '0%';
    if (els.wmCountdownText) els.wmCountdownText.textContent = CONFIG.adCountdownSeconds + 's remaining';

    // Countdown
    var seconds = CONFIG.adCountdownSeconds;
    var elapsed = 0;

    if (state.wmAdTimer) clearInterval(state.wmAdTimer);

    state.wmAdTimer = setInterval(function() {
        elapsed++;
        var pct = (elapsed / seconds) * 100;
        if (els.wmCountdownFill) els.wmCountdownFill.style.width = pct + '%';

        var remaining = seconds - elapsed;
        if (els.wmCountdownText) {
            if (remaining > 0) els.wmCountdownText.textContent = remaining + 's remaining';
            else els.wmCountdownText.textContent = 'Ready!';
        }

        if (elapsed >= seconds) {
            clearInterval(state.wmAdTimer);
            if (doneBtn) { doneBtn.classList.add('ready'); doneBtn.disabled = false; }
        }
    }, 1000);

    haptic('medium');
}

function hideWatermarkAdModal() {
    if (els.wmAdModal) els.wmAdModal.classList.add('hidden');
    if (state.wmAdTimer) { clearInterval(state.wmAdTimer); state.wmAdTimer = null; }
}

/* ========================================================
   FEATURE 4: SMART RATING PROMPT
   ======================================================== */

function getDownloadCount() {
    return parseInt(localStorage.getItem('crispy_downloads') || '0', 10);
}

function incrementDownloadCount() {
    var count = getDownloadCount() + 1;
    localStorage.setItem('crispy_downloads', String(count));
    return count;
}

function shouldShowRatingPrompt(count) {
    if (localStorage.getItem('crispy_rated')) return false;
    return count === CONFIG.ratingPromptAfter;
}

function showRatingPrompt(count) {
    if (els.ratingCount) els.ratingCount.textContent = String(count);
    if (els.ratingModal) els.ratingModal.classList.remove('hidden');
    haptic('light');
    log('Rating prompt shown (download #' + count + ')');
}

function hideRatingPrompt() {
    if (els.ratingModal) els.ratingModal.classList.add('hidden');
}

function showFeedbackModal() {
    hideRatingPrompt();
    if (els.feedbackModal) els.feedbackModal.classList.remove('hidden');
}

function hideFeedbackModal() {
    if (els.feedbackModal) els.feedbackModal.classList.add('hidden');
}

/* ========================================================
   QUALITY SCORE
   ======================================================== */

function calculateQualityScore() {
    var score = 50; // base
    var sizeMB = state.outputSize / (1024 * 1024);

    // Size factor (smaller is better for WhatsApp)
    if (sizeMB <= 3) score += 25;
    else if (sizeMB <= 5) score += 20;
    else if (sizeMB <= 8) score += 15;
    else if (sizeMB <= 12) score += 8;
    else score += 0;

    // Compression ratio factor
    var ratio = state.outputSize / state.originalSize;
    if (ratio < 0.3) score += 15;
    else if (ratio < 0.5) score += 12;
    else if (ratio < 0.7) score += 8;
    else score += 5;

    // Resolution factor (720p is ideal)
    var shortSide = state.isPortrait ? state.videoWidth : state.videoHeight;
    if (shortSide >= 640 && shortSide <= 1080) score += 10;
    else if (shortSide >= 480) score += 5;

    score = Math.min(99, Math.max(60, score));

    var desc;
    if (score >= 90) desc = 'WhatsApp won\'t touch this 🎯';
    else if (score >= 80) desc = 'Excellent for Status ✨';
    else if (score >= 70) desc = 'Great quality 👍';
    else desc = 'Good enough for Status';

    return { score: score, desc: desc };
}

function showQualityScore() {
    var qs = calculateQualityScore();
    if (els.qualityScore) els.qualityScore.style.display = 'flex';
    if (els.qualityScoreNum) els.qualityScoreNum.textContent = qs.score + '/100';
    if (els.qualityScoreDesc) els.qualityScoreDesc.textContent = qs.desc;
    log('Quality score: ' + qs.score + '/100 — ' + qs.desc);
}

/* ======================== FILE HANDLING ======================== */
function handleFileSelect(file) {
    log('File:', { name: file.name, size: formatBytes(file.size), type: file.type });
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|avi|mkv|webm|3gp)$/i)) { showError('Not a video', 'Please select a video file.'); return; }
    if (file.size > CONFIG.maxFileSize * 1024 * 1024) { showError('File too large', 'Max ' + CONFIG.maxFileSize + ' MB.'); return; }
    if (file.size < 10000) { showError('File too small', 'This file seems too small.'); return; }

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

        // Capture before frame for comparison
        captureBeforeFrame();

        if (isNaN(state.duration) || state.duration < 0.5) { showError('Invalid video', 'Could not read this video.'); return; }
        if (state.duration > CONFIG.maxDuration) { setupTrimmer(); showScreen('trim-screen'); }
        else { state.trimStart = 0; startProcessing(); }
    };
    els.trimVideo.onerror = function() { setButtonLoading(els.uploadBtn, false); showError('Unsupported format', 'Try MP4 or MOV format.'); };
}

function setButtonLoading(b, l) { if (!b) return; if (l) b.classList.add('loading'); else b.classList.remove('loading'); }

/* ======================== TRIMMER ======================== */
function setupTrimmer() {
    var ms = Math.max(0, state.duration - CONFIG.maxDuration), cd = Math.min(CONFIG.maxDuration, state.duration);
    els.trimSlider.min = 0; els.trimSlider.max = ms; els.trimSlider.value = 0; els.trimSlider.step = 0.1;
    state.trimStart = 0;
    els.trimFileName.textContent = truncateFilename(state.file.name, 25);
    els.trimFileDur.textContent = formatTime(state.duration) + ' total';
    els.trimDurLabel.textContent = Math.round(cd) + 's selected';
    updateTrimUI();
    els.playPreviewBtn.classList.remove('hide'); els.playPreviewBtn.textContent = '▶';
    els.trimVideo.pause(); els.trimVideo.currentTime = 0;
}

function updateTrimUI() {
    var s = parseFloat(els.trimSlider.value), d = state.duration, cd = Math.min(CONFIG.maxDuration, d);
    els.trimWindow.style.width = (cd / d) * 100 + '%'; els.trimWindow.style.left = (s / d) * 100 + '%';
    els.trimStartTime.textContent = formatTime(s); els.trimEndTime.textContent = formatTime(s + cd);
    state.trimStart = s;
}

/* ======================== FFMPEG ======================== */
async function loadFFmpeg() {
    if (state.ffmpegReady) return;
    if (typeof FFmpegWASM === 'undefined') throw new Error('SCRIPT_NOT_LOADED');
    state.ffmpeg = new FFmpegWASM.FFmpeg();
    state.ffmpeg.on('log', function(e) { console.log('[FFmpeg]', e.message); });
    state.ffmpeg.on('progress', function(e) { var p = Math.min(Math.round(e.progress * 100), 100); if (p > 0) setProgress(p); });
    var loaded = false;
    for (var i = 0; i < CONFIG.cdnUrls.length; i++) {
        try {
            updateStatus('Loading Crispy engine… ⬇️');
            var core = await toBlobURL(CONFIG.cdnUrls[i] + '/ffmpeg-core.js', 'text/javascript');
            var wasm = await toBlobURL(CONFIG.cdnUrls[i] + '/ffmpeg-core.wasm', 'application/wasm');
            updateStatus('Starting engine… 🔧'); await state.ffmpeg.load({ coreURL: core, wasmURL: wasm });
            loaded = true; break;
        } catch (e) { logError('CDN failed', e.message); }
    }
    if (!loaded) throw new Error('ENGINE_LOAD_FAILED');
    state.ffmpegReady = true;
}

/* ======================== WATERMARK IMAGE ======================== */
async function createWatermarkImage() {
    var wm = CONFIG.watermark, cv = document.createElement('canvas');
    cv.width = 1; cv.height = 1; var x = cv.getContext('2d');
    x.font = '600 ' + wm.fontSize + 'px sans-serif';
    var tw = Math.ceil(x.measureText(wm.text).width), hp = 10, vp = 8;
    cv.width = tw + hp * 2; cv.height = wm.fontSize + vp * 2;
    x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height);
    x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = 4; x.shadowOffsetX = 1; x.shadowOffsetY = 1;
    x.font = '600 ' + wm.fontSize + 'px sans-serif';
    x.fillStyle = 'rgba(255,255,255,' + wm.opacity + ')'; x.textBaseline = 'middle';
    x.fillText(wm.text, hp, cv.height / 2);
    return new Promise(function(res, rej) { cv.toBlob(function(b) { if (!b) { rej(new Error('WM fail')); return; } b.arrayBuffer().then(function(buf) { res(new Uint8Array(buf)); }); }, 'image/png'); });
}

/* ======================== QUALITY ENGINE ======================== */
function getSmartCRF(d) { var b = CONFIG.quality.baseCRF; if (d <= 5) return b - 2; if (d <= 10) return b; if (d <= 20) return b + 2; return b + 4; }
function getSmartBitrate(d) { if (d <= 5) return { r: '5000k', b: '10000k' }; if (d <= 10) return { r: '4000k', b: '8000k' }; if (d <= 20) return { r: '3000k', b: '6000k' }; return { r: '2500k', b: '5000k' }; }
function buildScaleFilter() { var t = CONFIG.quality.shortSide; if (state.isPortrait) { if (state.videoWidth <= t) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos'; return 'scale=' + t + ':-2:flags=lanczos'; } else { if (state.videoHeight <= t) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos'; return 'scale=-2:' + t + ':flags=lanczos'; } }

function buildFFmpegCommand(dur, hasWM) {
    var q = CONFIG.quality, crf = getSmartCRF(dur), br = getSmartBitrate(dur), sc = buildScaleFilter(), pad = CONFIG.watermark.padding;
    var cmd = ['-y', '-ss', String(state.trimStart), '-i', 'input'];
    if (hasWM) {
        cmd.push('-i', 'watermark.png', '-t', String(dur));
        cmd.push('-filter_complex', '[0:v]' + sc + '[scaled];[scaled][1:v]overlay=' + pad + ':H-h-' + pad + '[outv]');
        cmd.push('-map', '[outv]', '-map', '0:a?');
    } else { cmd.push('-t', String(dur), '-vf', sc); }
    cmd.push('-c:v', 'libx264', '-crf', String(crf), '-preset', q.preset, '-profile:v', q.profile, '-level:v', q.level, '-maxrate', br.r, '-bufsize', br.b, '-g', String(q.keyint), '-keyint_min', String(q.keyint), '-r', String(q.fps), '-pix_fmt', 'yuv420p', '-x264-params', 'aq-mode=2', '-c:a', 'aac', '-b:a', q.audioBitrate, '-ar', String(q.audioRate), '-ac', String(q.audioChannels), '-movflags', '+faststart', 'output.mp4');
    return cmd;
}

/* ======================== PROCESSING ======================== */
async function startProcessing() {
    if (state.processing) return;
    state.processing = true; state.cancelled = false;
    state.processStartTime = Date.now();
    state.etaSamples = [];

    // Check watermark preference
    state.hasWatermark = !isWatermarkFree();
    log('Watermark: ' + (state.hasWatermark ? 'YES' : 'NO (user removed)'));

    showScreen('processing-screen'); setProgress(0); clearETA(); startFunMessages();
    await acquireWakeLock(); startSilentAudio();
    var pip = false;
    if (isMobile() && isPiPSupported()) try { pip = await startPiP(); } catch (e) {}
    if (!pip && isMobile()) showToast('⚠️ Keep app open for fastest processing', 'info', 5000);
    if (state.notifPermission === 'default') try { await askNotificationPermission(); } catch (e) {}
    showBgNotice();

    try {
        if (!state.ffmpegReady) { updateStatus('Loading Crispy engine… 🔧'); updatePiP(0, 'Loading engine…'); await loadFFmpeg(); }
        if (state.cancelled) throw new Error('CANCELLED');

        updateStatus('Reading your video… 📖'); updatePiP(0, 'Reading…');
        var fd = new Uint8Array(await state.file.arrayBuffer());
        await state.ffmpeg.writeFile('input', fd);
        if (state.cancelled) throw new Error('CANCELLED');

        // Watermark
        var useWM = state.hasWatermark;
        if (useWM) {
            try { var wd = await createWatermarkImage(); await state.ffmpeg.writeFile('watermark.png', wd); }
            catch (e) { logError('WM fail', e); useWM = false; }
        }
        if (state.cancelled) throw new Error('CANCELLED');

        updateStatus('Making it crispy… 🍳'); updatePiP(0, 'Encoding HD…');
        var cd = Math.min(CONFIG.maxDuration, state.duration);
        var cmd = buildFFmpegCommand(cd, useWM);
        log('CMD: ' + cmd.join(' '));

        var exit = await state.ffmpeg.exec(cmd);
        if (exit !== 0 && useWM) { log('Retry without WM…'); useWM = false; exit = await state.ffmpeg.exec(buildFFmpegCommand(cd, false)); }
        if (exit !== 0) { log('Retry safe mode…'); exit = await state.ffmpeg.exec(['-y', '-ss', String(state.trimStart), '-i', 'input', '-t', String(cd), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '20', '-preset', 'fast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'output.mp4']); }
        if (exit !== 0) throw new Error('FFMPEG_ERROR');
        if (state.cancelled) throw new Error('CANCELLED');

        updateStatus('Wrapping up… 🎁'); updatePiP(100, 'Done!');
        var od; try { od = await state.ffmpeg.readFile('output.mp4'); } catch (e) { throw new Error('OUTPUT_READ_FAILED'); }
        if (!od || od.byteLength < 1000) throw new Error('OUTPUT_EMPTY');

        state.outputBlob = new Blob([od.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;
        state.hasWatermark = useWM;

        var elapsed = ((Date.now() - state.processStartTime) / 1000).toFixed(1);
        log('✅ Done in ' + elapsed + 's | ' + formatBytes(state.outputSize));

        try { await state.ffmpeg.deleteFile('input'); } catch (e) {}
        try { await state.ffmpeg.deleteFile('output.mp4'); } catch (e) {}
        try { if (useWM) await state.ffmpeg.deleteFile('watermark.png'); } catch (e) {}

        await releaseWakeLock(); stopSilentAudio(); showPiPDone();
        sendNotification('🔥 Your video is crispy!', 'Done in ' + elapsed + 's. Tap to download.');
        haptic('success'); showDone();

    } catch (err) {
        stopFunMessages(); clearETA(); await releaseWakeLock(); stopSilentAudio(); closePiP();
        if (err.message === 'CANCELLED') { showToast('Cancelled', 'info'); showScreen('home-screen'); return; }
        logError('Failed', err); sendNotification('😬 Failed', 'Tap to try again.');
        var t = 'Processing Failed', m = '';
        switch (err.message) {
            case 'SCRIPT_NOT_LOADED': t = 'Engine Not Loaded'; m = 'Refresh and check internet.'; break;
            case 'ENGINE_LOAD_FAILED': t = 'Download Failed'; m = 'Check internet.'; break;
            case 'FFMPEG_ERROR': t = 'Video Format Issue'; m = 'Try a different MP4.'; break;
            case 'OUTPUT_READ_FAILED': case 'OUTPUT_EMPTY': t = 'Processing Error'; m = 'Try shorter video.'; break;
            default: m = 'Something went wrong. Try again.';
        }
        showError(t, m); showScreen('home-screen');
    } finally { state.processing = false; stopFunMessages(); clearETA(); hideBgNotice(); }
}

function cancelProcessing() { state.cancelled = true; releaseWakeLock(); stopSilentAudio(); closePiP(); showToast('Cancelling…', 'info', 2000); }
function showBgNotice() { if (els.bgNotice) els.bgNotice.classList.remove('hidden'); }
function hideBgNotice() { if (els.bgNotice) els.bgNotice.classList.add('hidden'); }

/* ======================== PROGRESS ======================== */
function setProgress(pct) {
    if (els.progressFill) els.progressFill.style.width = pct + '%';
    if (els.progressText) els.progressText.textContent = pct + ' %';
    if (state.processing) document.title = pct + '% — Crispy Status';
    updatePiP(pct, pct < 95 ? 'Encoding HD…' : 'Almost done…');
    updateETA(pct);
}

function updateStatus(m) { if (!els.processingStatus) return; els.processingStatus.style.opacity = '0'; setTimeout(function() { els.processingStatus.textContent = m; els.processingStatus.style.opacity = '1'; }, 150); }

var funTimer = null, funIdx = 0;
function startFunMessages() { funIdx = 0; funTimer = setInterval(function() { funIdx = (funIdx + 1) % FUN_MESSAGES.length; if (els.funTip) els.funTip.textContent = FUN_MESSAGES[funIdx]; }, 3500); }
function stopFunMessages() { clearInterval(funTimer); document.title = 'Crispy Status — Sharp WhatsApp Status. Every Time.'; }

/* ======================== DONE ======================== */
function showDone() {
    if (els.statBefore) els.statBefore.textContent = formatBytes(state.originalSize);
    if (els.statAfter) els.statAfter.textContent = formatBytes(state.outputSize);
    var saved = Math.max(0, Math.round((1 - state.outputSize / state.originalSize) * 100));
    if (els.statSaved) els.statSaved.textContent = saved > 0 ? ('-' + saved + '%') : '✨ optimized';

    if (state.outputUrl && els.donePreview) {
        els.donePreview.src = state.outputUrl;
        if (els.donePlayBtn) { els.donePlayBtn.classList.remove('hide'); els.donePlayBtn.textContent = '▶'; }

        // Capture after frame for comparison when video loads
        els.donePreview.onloadeddata = function() {
            setTimeout(function() { captureAfterFrame(); }, 300);
            els.donePreview.onloadeddata = null;
        };
    }

    // Quality score
    showQualityScore();

    // Hide comparison initially (shows when frames are ready)
    if (els.compareSection) els.compareSection.style.display = 'none';

    state.tipsShown = false;
    if (els.tipsSection) els.tipsSection.classList.add('hidden');
    if (els.tipsList) els.tipsList.innerHTML = '';
    showScreen('done-screen');
    setTimeout(fireConfetti, 300);
}

/* ======================== DOWNLOAD & SHARE ======================== */
function downloadVideo() {
    if (!state.outputUrl) return;
    haptic('medium');
    var a = document.createElement('a'); a.href = state.outputUrl; a.download = 'crispy-status.mp4';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('Video saved! Post it to Status now 🔥', 'success');

    // Track downloads for rating prompt
    var count = incrementDownloadCount();
    log('Downloads total: ' + count);

    // Show rating prompt at the right moment
    if (shouldShowRatingPrompt(count)) {
        setTimeout(function() { showRatingPrompt(count); }, 2500);
    }

    if (!state.tipsShown) { state.tipsShown = true; setTimeout(showTips, 600); }
}

function shareToWhatsApp() {
    if (!state.outputBlob) return; haptic('medium');
    if (navigator.canShare) {
        var f = new File([state.outputBlob], 'crispy-status.mp4', { type: 'video/mp4' });
        if (navigator.canShare({ files: [f] })) {
            navigator.share({ files: [f] }).then(function() {
                showToast('Shared! 🚀', 'success');
                var count = incrementDownloadCount();
                if (shouldShowRatingPrompt(count)) setTimeout(function() { showRatingPrompt(count); }, 2500);
            }).catch(function() {}); return;
        }
    }
    downloadVideo();
}

function showTips() {
    if (!els.tipsSection || !els.tipsList) return;
    els.tipsSection.classList.remove('hidden'); els.tipsList.innerHTML = '';
    QUALITY_TIPS.forEach(function(t) { var c = document.createElement('div'); c.className = 'tip-card'; c.innerHTML = '<span class="tip-icon">' + t.icon + '</span><div class="tip-content"><strong>' + t.title + '</strong><p>' + t.text + '</p></div>'; els.tipsList.appendChild(c); });
    setTimeout(function() { els.tipsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 350);
}

/* ======================== PWA ======================== */
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); state.installPrompt = e; if (!localStorage.getItem('crispy_install_dismissed')) setTimeout(function() { if (els.installPrompt) els.installPrompt.classList.remove('hidden'); }, 5000); });
    if (els.installYes) els.installYes.addEventListener('click', async function() { if (!state.installPrompt) return; await state.installPrompt.prompt(); state.installPrompt = null; if (els.installPrompt) els.installPrompt.classList.add('hidden'); showToast('Installed! 📲', 'success'); });
    if (els.installDismiss) els.installDismiss.addEventListener('click', function() { if (els.installPrompt) els.installPrompt.classList.add('hidden'); localStorage.setItem('crispy_install_dismissed', 'true'); });
}

/* ======================== UTILITIES ======================== */
function formatBytes(b) { if (b < 1024) return b + ' B'; if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'; return (b / (1024 * 1024)).toFixed(1) + ' MB'; }
function formatTime(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
function truncateFilename(n, mx) { if (n.length <= mx) return n; var e = n.split('.').pop(); return n.substring(0, mx - e.length - 3) + '….' + e; }
function cleanup() {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
    state.objectUrl = null; state.outputUrl = null; state.outputBlob = null; state.file = null;
    state.tipsShown = false; state.videoWidth = 0; state.videoHeight = 0;
    state.hasWatermark = !isWatermarkFree();
    state.beforeFrameURL = null; state.afterFrameURL = null;
    if (els.fileInput) els.fileInput.value = '';
    if (els.donePreview) els.donePreview.src = '';
    if (els.trimVideo) els.trimVideo.src = '';
    if (els.compareSection) els.compareSection.style.display = 'none';
    if (els.qualityScore) els.qualityScore.style.display = 'none';
}

function setupBackButton() { window.addEventListener('popstate', function() { if (state.processing) { history.pushState({ screen: 'processing-screen' }, '', ''); showToast('Cancel first.', 'info'); return; } var c = document.querySelector('.screen.active'); if (c) { if (c.id === 'trim-screen') { if (els.trimVideo) els.trimVideo.pause(); showScreen('home-screen'); } else if (c.id === 'done-screen') { cleanup(); showScreen('home-screen'); } else showScreen('home-screen'); } }); }
function setupBeforeUnload() { window.addEventListener('beforeunload', function(e) { if (state.processing) { e.preventDefault(); e.returnValue = ''; } }); }

/* ======================== EVENTS ======================== */
function bindEvents() {
    if (els.uploadBtn) els.uploadBtn.addEventListener('click', function() { haptic('light'); if (els.fileInput) els.fileInput.click(); });
    if (els.fileInput) els.fileInput.addEventListener('change', function(e) { var f = e.target.files && e.target.files[0]; if (f) handleFileSelect(f); });
    if (els.trimBackBtn) els.trimBackBtn.addEventListener('click', function() { haptic('light'); if (els.trimVideo) els.trimVideo.pause(); showScreen('home-screen'); });

    if (els.trimSlider) { var sd; els.trimSlider.addEventListener('input', function() { updateTrimUI(); clearTimeout(sd); sd = setTimeout(function() { if (els.trimVideo) els.trimVideo.currentTime = state.trimStart; }, 60); }); }

    if (els.playPreviewBtn) els.playPreviewBtn.addEventListener('click', function() {
        haptic('light'); var v = els.trimVideo; if (!v) return;
        if (v.paused) { v.currentTime = state.trimStart; v.muted = false; v.play(); els.playPreviewBtn.textContent = '⏸'; els.playPreviewBtn.classList.add('hide');
            var sa = state.trimStart + CONFIG.maxDuration, stop = function() { if (v.currentTime >= sa) { v.pause(); v.removeEventListener('timeupdate', stop); els.playPreviewBtn.textContent = '▶'; els.playPreviewBtn.classList.remove('hide'); } }; v.addEventListener('timeupdate', stop);
        } else { v.pause(); els.playPreviewBtn.textContent = '▶'; els.playPreviewBtn.classList.remove('hide'); }
    });

    if (els.trimVideo) els.trimVideo.addEventListener('click', function() { if (els.playPreviewBtn) els.playPreviewBtn.click(); });
    if (els.trimContinueBtn) els.trimContinueBtn.addEventListener('click', function() { haptic('medium'); if (els.trimVideo) els.trimVideo.pause(); startProcessing(); });
    if (els.cancelBtn) els.cancelBtn.addEventListener('click', function() { haptic('light'); cancelProcessing(); });

    if (els.donePlayBtn) els.donePlayBtn.addEventListener('click', function() { haptic('light'); var v = els.donePreview; if (!v) return; if (v.paused) { v.play(); els.donePlayBtn.classList.add('hide'); } else { v.pause(); els.donePlayBtn.classList.remove('hide'); } });
    if (els.donePreview) { els.donePreview.addEventListener('click', function() { if (els.donePlayBtn) els.donePlayBtn.click(); }); els.donePreview.addEventListener('ended', function() { if (els.donePlayBtn) { els.donePlayBtn.classList.remove('hide'); els.donePlayBtn.textContent = '▶'; } }); }

    if (els.downloadBtn) els.downloadBtn.addEventListener('click', downloadVideo);
    if (els.shareBtn) els.shareBtn.addEventListener('click', shareToWhatsApp);
    if (els.newVideoBtn) els.newVideoBtn.addEventListener('click', function() { haptic('light'); cleanup(); showScreen('home-screen'); });

    if (els.errorCloseBtn) els.errorCloseBtn.addEventListener('click', function() { haptic('light'); hideError(); showScreen('home-screen'); });
    if (els.errorModal) els.errorModal.addEventListener('click', function(e) { if (e.target === els.errorModal) hideError(); });

    // ===== WATERMARK TOGGLE =====
    if (els.wmToggleBtn) els.wmToggleBtn.addEventListener('click', function() {
        haptic('light');
        if (state.hasWatermark) {
            // User wants to turn OFF watermark → show ad
            showWatermarkAdModal();
        } else {
            // User wants to turn ON watermark
            state.hasWatermark = true;
            localStorage.removeItem('crispy_wm_free_until');
            updateWatermarkUI();
            showToast('Watermark enabled 🏷️', 'info', 2000);
        }
    });

    if (els.wmAdDoneBtn) els.wmAdDoneBtn.addEventListener('click', function() {
        haptic('success');
        grantWatermarkFree();
        hideWatermarkAdModal();
        showToast('Watermark removed for 24 hours! ✨', 'success');
    });

    if (els.wmAdCancelBtn) els.wmAdCancelBtn.addEventListener('click', function() {
        haptic('light');
        hideWatermarkAdModal();
    });

    if (els.wmAdModal) els.wmAdModal.addEventListener('click', function(e) {
        if (e.target === els.wmAdModal) hideWatermarkAdModal();
    });

    // ===== RATING PROMPT =====
    if (els.ratingLoveBtn) els.ratingLoveBtn.addEventListener('click', function() {
        haptic('success');
        localStorage.setItem('crispy_rated', 'love');
        hideRatingPrompt();
        showToast('Thank you so much! ❤️🔥', 'success', 4000);
        // Try to open app store review (placeholder URL — update with your actual store link)
        // window.open('https://play.google.com/store/apps/details?id=YOUR_APP_ID', '_blank');
    });

    if (els.ratingImproveBtn) els.ratingImproveBtn.addEventListener('click', function() {
        haptic('light');
        localStorage.setItem('crispy_rated', 'improve');
        showFeedbackModal();
    });

    if (els.ratingModal) els.ratingModal.addEventListener('click', function(e) {
        if (e.target === els.ratingModal) { localStorage.setItem('crispy_rated', 'dismissed'); hideRatingPrompt(); }
    });

    // ===== FEEDBACK =====
    if (els.feedbackSendBtn) els.feedbackSendBtn.addEventListener('click', function() {
        haptic('success');
        var text = els.feedbackText ? els.feedbackText.value.trim() : '';
        if (text) {
            log('USER FEEDBACK: ' + text);
            // In production, send this to your backend/analytics
            // fetch('/api/feedback', { method: 'POST', body: JSON.stringify({ text: text }) });
        }
        hideFeedbackModal();
        showToast('Thanks for your feedback! 🙏', 'success');
    });

    if (els.feedbackSkipBtn) els.feedbackSkipBtn.addEventListener('click', function() {
        haptic('light');
        hideFeedbackModal();
    });

    if (els.feedbackModal) els.feedbackModal.addEventListener('click', function(e) {
        if (e.target === els.feedbackModal) hideFeedbackModal();
    });

    // ===== KEYBOARD =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (els.errorModal && !els.errorModal.classList.contains('hidden')) hideError();
            if (els.wmAdModal && !els.wmAdModal.classList.contains('hidden')) hideWatermarkAdModal();
            if (els.ratingModal && !els.ratingModal.classList.contains('hidden')) { localStorage.setItem('crispy_rated', 'dismissed'); hideRatingPrompt(); }
            if (els.feedbackModal && !els.feedbackModal.classList.contains('hidden')) hideFeedbackModal();
        }
    });

    window.addEventListener('resize', function() { if (els.confettiCanvas) { els.confettiCanvas.width = window.innerWidth; els.confettiCanvas.height = window.innerHeight; } });

    // Setup comparison slider drag
    setupComparisonDrag();

    log('✅ All events bound');
}

function registerSW() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function() {}); }
function preloadFFmpeg() { setTimeout(function() { if (!state.ffmpegReady) { log('Preloading…'); loadFFmpeg().then(function() { log('Preload ✅'); }).catch(function(e) { log('Preload fail: ' + e.message); }); } }, 3000); }

/* ======================== INIT ======================== */
function init() {
    log('========================================');
    log('Crispy Status v10 — Sprint 1');
    log('========================================');
    log('Features: Before/After + ETA + Watermark Choice + Rating');

    if (typeof WebAssembly === 'undefined') { alert('Browser not supported.'); return; }

    initEls();
    try { bindEvents(); } catch (e) { logError('bindEvents', e); alert('App failed: ' + e.message); return; }

    // Initialize watermark state
    state.hasWatermark = !isWatermarkFree();
    updateWatermarkUI();
    if (isWatermarkFree()) log('Watermark FREE (user previously watched ad)');

    registerSW(); setupInstallPrompt(); setupBackButton(); setupBeforeUnload();
    setupVisibilityHandler(); setupFreezeHandler(); requestNotificationPermission();
    showScreen('home-screen'); preloadFFmpeg();

    if (els.confettiCanvas) { els.confettiCanvas.width = window.innerWidth; els.confettiCanvas.height = window.innerHeight; }
    log('✅ Ready — Downloads so far: ' + getDownloadCount());
}

init();
