/* ==========================================================
   CRISPY STATUS — v13 — Consistent Quality Engine
   
   THE FIX: CRF → ABR (Average Bitrate)
   
   CRF = constant quality, VARIABLE file size
   → Some videos 2MB (fine), others 8MB (destroyed by WhatsApp)
   
   ABR = CONSTANT file size, variable quality
   → Every video ~2-3.5MB regardless of content
   → WhatsApp treats ALL videos the same → CONSISTENT
   ========================================================== */

/* ======================== CONFIG ======================== */
var CONFIG = {
    maxDuration: 30,
    maxFileSize: 500,

    quality: {
        shortSide: 640,
        audioBitrate: '80k',     // Lower to save bits for video
        audioRate: 44100,
        audioChannels: 2,
        fps: 30,
        preset: 'medium',
        profile: 'main',
        level: '3.1',
        keyint: 60,
    },

    // ABR tiers — fixed bitrate by duration
    // Every video of same duration = same file size = same WhatsApp treatment
    tiers: [
        // dur   video-br  maxrate   bufsize   audio  ~total MB
        { maxDur: 5,  vbr: '2200k', maxrate: '2800k', bufsize: '3500k', targetMB: 1.8 },
        { maxDur: 10, vbr: '1500k', maxrate: '2000k', bufsize: '2500k', targetMB: 2.2 },
        { maxDur: 15, vbr: '1100k', maxrate: '1500k', bufsize: '2000k', targetMB: 2.8 },
        { maxDur: 20, vbr: '900k',  maxrate: '1200k', bufsize: '1600k', targetMB: 3.0 },
        { maxDur: 25, vbr: '800k',  maxrate: '1100k', bufsize: '1400k', targetMB: 3.2 },
        { maxDur: 30, vbr: '700k',  maxrate: '1000k', bufsize: '1300k', targetMB: 3.5 },
    ],

    watermark: {
        text: 'crispystatus.com',
        fontSize: 28,
        opacity: 0.9,
        padding: 14,
        bgOpacity: 0.4,
        bgPadH: 14,
        bgPadV: 8,
        borderRadius: 6,
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
    '📱 Matching WhatsApp format…', '⚡ Locking in quality…',
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
    beforeFrameURL: null, afterFrameURL: null,
    etaSamples: [], wmAdTimer: null, compareDragging: false,
};

/* ======================== LOGGING ======================== */
function log(m, d) { var t = new Date().toISOString().substr(11, 12); if (d !== undefined) console.log('[Crispy ' + t + '] ' + m, d); else console.log('[Crispy ' + t + '] ' + m); }
function logError(m, e) { console.error('[Crispy ERROR] ' + m, e); }

/* ======================== DOM ======================== */
function $(id) { return document.getElementById(id); }
var els = {};
function initEls() {
    var ids = ['home-screen','trim-screen','processing-screen','done-screen','upload-btn','file-input','trim-back-btn','trim-video','play-preview-btn','trim-slider','trim-window','trim-start-time','trim-end-time','trim-file-name','trim-file-dur','trim-dur-label','trim-continue-btn','processing-status','progress-fill','progress-text','fun-tip','cancel-btn','bg-notice','done-preview','done-play-btn','stat-before','stat-after','stat-saved','download-btn','share-btn','tips-section','tips-list','new-video-btn','error-modal','error-msg','error-close-btn','install-prompt','install-yes','install-dismiss','confetti-canvas','processing-eta','wm-toggle-btn','wm-setting','wm-label','wm-ad-modal','wm-ad-done-btn','wm-ad-cancel-btn','wm-countdown-fill','wm-countdown-text','compare-section','compare-container','compare-before','compare-after','compare-handle','quality-score','quality-score-num','quality-score-desc','rating-modal','rating-love-btn','rating-improve-btn','rating-count','feedback-modal','feedback-text','feedback-send-btn','feedback-skip-btn'];
    ids.forEach(function(id) { els[id.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); })] = $(id); });
}

/* ======================== CACHE ======================== */
var CACHE_DB = 'crispy-cache', CACHE_STORE = 'files';
function openCacheDB() { return new Promise(function(res, rej) { var r = indexedDB.open(CACHE_DB, 1); r.onupgradeneeded = function(e) { if (!e.target.result.objectStoreNames.contains(CACHE_STORE)) e.target.result.createObjectStore(CACHE_STORE); }; r.onsuccess = function(e) { res(e.target.result); }; r.onerror = function() { rej(r.error); }; }); }
function getCached(k) { return openCacheDB().then(function(db) { return new Promise(function(res) { var r = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(k); r.onsuccess = function() { res(r.result || null); }; r.onerror = function() { res(null); }; }); }).catch(function() { return null; }); }
function setCache(k, d) { return openCacheDB().then(function(db) { return new Promise(function(res) { var tx = db.transaction(CACHE_STORE, 'readwrite'); tx.objectStore(CACHE_STORE).put(d, k); tx.oncomplete = function() { res(); }; tx.onerror = function() { res(); }; }); }).catch(function() {}); }
async function toBlobURL(url, mimeType) { var ck = url.split('/').pop(); try { var c = await getCached(ck); if (c) { log('⚡ Cached: ' + ck); return URL.createObjectURL(new Blob([c], { type: mimeType })); } } catch (e) {} log('⬇️ Download: ' + ck); var r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); var buf = await r.arrayBuffer(); try { await setCache(ck, buf); } catch (e) {} return URL.createObjectURL(new Blob([buf], { type: mimeType })); }

/* ======================== PIP ======================== */
function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
function isPiPSupported() { try { return !!(document.pictureInPictureEnabled && HTMLVideoElement.prototype.requestPictureInPicture); } catch (e) { return false; } }
function drawPipFrame() { var c = state.pipCanvas, x = state.pipCtx; if (!c || !x) return; var w = c.width, h = c.height, p = state.pipProgress; x.fillStyle = '#0B0B1A'; x.fillRect(0, 0, w, h); x.font = '36px serif'; x.textAlign = 'center'; x.fillText('🍳', w / 2, 42); x.font = '600 14px sans-serif'; x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillText(state.pipStatusText, w / 2, 68); var bx = 30, by = 90, bw = w - 60, bh = 16, br = 8; x.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(x, bx, by, bw, bh, br); x.fill(); if (p > 0) { var fw = Math.max(bh, (bw * p) / 100); var g = x.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#FF6B35'); g.addColorStop(1, '#FF3366'); x.fillStyle = g; roundRect(x, bx, by, fw, bh, br); x.fill(); } x.font = '800 28px sans-serif'; x.fillStyle = '#FFF'; x.fillText(p + '%', w / 2, 140); x.font = '500 10px sans-serif'; x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillText('crispystatus.com', w / 2, 170); }
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
async function startPiP() { if (!isPiPSupported()) return false; try { state.pipCanvas = document.createElement('canvas'); state.pipCanvas.width = 320; state.pipCanvas.height = 180; state.pipCtx = state.pipCanvas.getContext('2d'); state.pipProgress = 0; state.pipStatusText = 'Starting…'; drawPipFrame(); if (typeof state.pipCanvas.captureStream !== 'function') return false; state.pipStream = state.pipCanvas.captureStream(10); state.pipVideo = document.createElement('video'); state.pipVideo.srcObject = state.pipStream; state.pipVideo.muted = true; state.pipVideo.playsInline = true; state.pipVideo.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;bottom:0;left:0;z-index:-1'; document.body.appendChild(state.pipVideo); await state.pipVideo.play(); await state.pipVideo.requestPictureInPicture(); state.pipActive = true; state.pipUpdateTimer = setInterval(drawPipFrame, 500); state.pipVideo.addEventListener('leavepictureinpicture', function() { state.pipActive = false; }); return true; } catch (e) { cleanupPiP(); return false; } }
function updatePiP(p, t) { state.pipProgress = p; if (t) state.pipStatusText = t; if (state.pipActive) drawPipFrame(); }
function showPiPDone() { if (!state.pipActive || !state.pipCtx) return; var x = state.pipCtx, w = state.pipCanvas.width; x.fillStyle = '#0B0B1A'; x.fillRect(0, 0, w, state.pipCanvas.height); x.font = '48px serif'; x.textAlign = 'center'; x.fillText('✅', w / 2, 70); x.font = '800 20px sans-serif'; x.fillStyle = '#22D67F'; x.fillText('Video is Crispy!', w / 2, 110); setTimeout(closePiP, 3000); }
function closePiP() { try { if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch (e) {} cleanupPiP(); }
function cleanupPiP() { if (state.pipUpdateTimer) { clearInterval(state.pipUpdateTimer); state.pipUpdateTimer = null; } if (state.pipVideo) { try { state.pipVideo.pause(); } catch (e) {} if (state.pipVideo.srcObject) { try { state.pipVideo.srcObject.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {} state.pipVideo.srcObject = null; } if (state.pipVideo.parentNode) state.pipVideo.parentNode.removeChild(state.pipVideo); state.pipVideo = null; } state.pipStream = null; state.pipCanvas = null; state.pipCtx = null; state.pipActive = false; }

/* ======================== BACKGROUND ======================== */
function startSilentAudio() { try { var A = window.AudioContext || window.webkitAudioContext; if (!A) return; state.silentAudioCtx = new A(); var b = state.silentAudioCtx.createBuffer(1, state.silentAudioCtx.sampleRate * 2, state.silentAudioCtx.sampleRate); var c = b.getChannelData(0); for (var i = 0; i < c.length; i++) c[i] = (Math.random() - 0.5) * 0.00001; var s = state.silentAudioCtx.createBufferSource(); s.buffer = b; s.loop = true; var g = state.silentAudioCtx.createGain(); g.gain.value = 0.001; s.connect(g); g.connect(state.silentAudioCtx.destination); s.start(); state.silentAudioSource = s; } catch (e) {} }
function stopSilentAudio() { try { if (state.silentAudioSource) state.silentAudioSource.stop(); } catch (e) {} try { if (state.silentAudioCtx) state.silentAudioCtx.close(); } catch (e) {} state.silentAudioSource = null; state.silentAudioCtx = null; }
async function acquireWakeLock() { if (!('wakeLock' in navigator)) return; try { state.wakeLock = await navigator.wakeLock.request('screen'); state.wakeLock.addEventListener('release', function() { if (state.processing) acquireWakeLock(); }); } catch (e) {} }
async function releaseWakeLock() { if (state.wakeLock) { try { await state.wakeLock.release(); } catch (e) {} state.wakeLock = null; } }
async function requestNotificationPermission() { if (!('Notification' in window)) return; state.notifPermission = Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'default'; }
async function askNotificationPermission() { if (!('Notification' in window)) return; if (Notification.permission !== 'default') { state.notifPermission = Notification.permission; return; } try { state.notifPermission = await Notification.requestPermission(); } catch (e) {} }
function sendNotification(t, b) { if (state.notifPermission !== 'granted' || document.visibilityState === 'visible') return; try { var n = new Notification(t, { body: b, tag: 'crispy-status', vibrate: [200, 100, 200] }); n.onclick = function() { window.focus(); n.close(); }; } catch (e) {} }
function setupVisibilityHandler() { document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden') { state.wasHidden = true; if (state.processing) acquireWakeLock(); } else { if (state.wasHidden && state.processing) showToast('Still crisping… 🍳', 'info', 2000); if (state.wasHidden && !state.processing && state.outputUrl) showToast('Your video is ready! 🔥', 'success'); state.wasHidden = false; } }); }
function setupFreezeHandler() { try { document.addEventListener('freeze', function() {}); document.addEventListener('resume', function() { if (state.processing) showToast('Resumed ▶️', 'info', 2000); }); } catch (e) {} }

/* ======================== UI ======================== */
function showScreen(id) { document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active', 'screen-enter'); }); var e = $(id); if (e) e.classList.add('active', 'screen-enter'); window.scrollTo({ top: 0, behavior: 'instant' }); if (!history.state || history.state.screen !== id) history.pushState({ screen: id }, '', ''); }
function showToast(m, t, d) { t = t || 'info'; d = d || 3000; var c = $('toast-container'); if (!c) return; var el = document.createElement('div'); el.className = 'toast ' + t; var ic = { success: '✅', error: '❌', info: '💡' }; el.innerHTML = '<span class="toast-icon">' + (ic[t] || '💡') + '</span><span>' + m + '</span>'; c.appendChild(el); setTimeout(function() { el.classList.add('toast-out'); el.addEventListener('animationend', function() { el.remove(); }); }, d); }
function haptic(s) { try { if (navigator.vibrate) navigator.vibrate({ light: [12], medium: [25], heavy: [50], success: [15, 50, 15] }[s || 'light'] || [12]); } catch (e) {} }
function showError(t, m) { try { var h = $('error-heading'); if (h) h.textContent = t; if (els.errorMsg) els.errorMsg.textContent = m; if (els.errorModal) els.errorModal.classList.remove('hidden'); haptic('heavy'); } catch (e) { alert(t + ': ' + m); } }
function hideError() { if (els.errorModal) els.errorModal.classList.add('hidden'); }
function fireConfetti() { if (!els.confettiCanvas) return; var cv = els.confettiCanvas, cx = cv.getContext('2d'); cv.width = window.innerWidth; cv.height = window.innerHeight; var cl = ['#FF6B35', '#FF3366', '#8B5CF6', '#22D67F', '#FBBF24', '#06B6D4', '#fff'], ps = []; for (var i = 0; i < 90; i++) ps.push({ x: cv.width / 2 + (Math.random() - 0.5) * 100, y: cv.height * 0.35, vx: (Math.random() - 0.5) * 18, vy: Math.random() * -20 - 8, sz: Math.random() * 8 + 4, c: cl[Math.floor(Math.random() * cl.length)], r: Math.random() * 360, rs: (Math.random() - 0.5) * 12, g: 0.4 + Math.random() * 0.2, o: 1, sh: Math.random() > 0.5 ? 'c' : 'r' }); var f = 0; function d() { cx.clearRect(0, 0, cv.width, cv.height); ps.forEach(function(p) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99; p.r += p.rs; p.o = Math.max(0, 1 - f / 150); cx.save(); cx.globalAlpha = p.o; cx.translate(p.x, p.y); cx.rotate(p.r * Math.PI / 180); cx.fillStyle = p.c; if (p.sh === 'c') { cx.beginPath(); cx.arc(0, 0, p.sz / 2, 0, Math.PI * 2); cx.fill(); } else cx.fillRect(-p.sz / 2, -p.sz / 2, p.sz, p.sz); cx.restore(); }); f++; if (f < 150) requestAnimationFrame(d); else cx.clearRect(0, 0, cv.width, cv.height); } requestAnimationFrame(d); }

/* ======================== SPRINT 1 FEATURES ======================== */
function captureFrame(v) { var c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); return c.toDataURL('image/jpeg', 0.92); }
function simulateWhatsAppCompression(dataURL) { return new Promise(function(resolve) { var img = new Image(); img.onload = function() { var c1 = document.createElement('canvas'); c1.width = Math.round(img.width * 0.35); c1.height = Math.round(img.height * 0.35); c1.getContext('2d').drawImage(img, 0, 0, c1.width, c1.height); var compressed = c1.toDataURL('image/jpeg', 0.12); var img2 = new Image(); img2.onload = function() { var c2 = document.createElement('canvas'); c2.width = img.width; c2.height = img.height; c2.getContext('2d').drawImage(img2, 0, 0, c2.width, c2.height); resolve(c2.toDataURL('image/jpeg', 0.9)); }; img2.src = compressed; }; img.src = dataURL; }); }
function captureBeforeFrame() { var v = els.trimVideo; if (!v || !v.videoWidth) return; v.currentTime = Math.min(state.duration * 0.25, 2); v.onseeked = function() { var orig = captureFrame(v); simulateWhatsAppCompression(orig).then(function(d) { state.beforeFrameURL = d; }).catch(function() { state.beforeFrameURL = orig; }); v.onseeked = null; }; }
function captureAfterFrame() { var v = els.donePreview; if (!v || !v.videoWidth) return; v.currentTime = Math.min(v.duration * 0.25, 2); v.onseeked = function() { state.afterFrameURL = captureFrame(v); showComparison(); v.onseeked = null; }; }
function showComparison() { if (!state.beforeFrameURL || !state.afterFrameURL) return; if (els.compareSection) els.compareSection.style.display = 'block'; if (els.compareBefore) els.compareBefore.src = state.beforeFrameURL; if (els.compareAfter) els.compareAfter.src = state.afterFrameURL; updateComparePosition(50); }
function updateComparePosition(pct) { pct = Math.max(5, Math.min(95, pct)); if (els.compareBefore) els.compareBefore.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)'; if (els.compareHandle) els.compareHandle.style.left = pct + '%'; }
function setupComparisonDrag() { var c = els.compareContainer; if (!c) return; function gp(e) { var r = c.getBoundingClientRect(); var cx = e.touches ? e.touches[0].clientX : e.clientX; return ((cx - r.left) / r.width) * 100; } c.addEventListener('mousedown', function(e) { e.preventDefault(); state.compareDragging = true; updateComparePosition(gp(e)); }); document.addEventListener('mousemove', function(e) { if (state.compareDragging) { e.preventDefault(); updateComparePosition(gp(e)); } }); document.addEventListener('mouseup', function() { state.compareDragging = false; }); c.addEventListener('touchstart', function(e) { e.preventDefault(); state.compareDragging = true; updateComparePosition(gp(e)); }, { passive: false }); c.addEventListener('touchmove', function(e) { if (state.compareDragging) { e.preventDefault(); updateComparePosition(gp(e)); } }, { passive: false }); c.addEventListener('touchend', function() { state.compareDragging = false; }); }

function updateETA(pct) { if (!els.processingEta || pct < 3) { if (els.processingEta) els.processingEta.textContent = ''; return; } var elapsed = (Date.now() - state.processStartTime) / 1000; var remaining = Math.max(0, (elapsed / (pct / 100)) - elapsed); state.etaSamples.push(remaining); if (state.etaSamples.length > 5) state.etaSamples.shift(); var avg = Math.ceil(state.etaSamples.reduce(function(a, b) { return a + b; }, 0) / state.etaSamples.length); if (avg <= 0 || pct >= 98) els.processingEta.textContent = 'Almost done…'; else if (avg < 60) els.processingEta.textContent = 'About ' + avg + ' second' + (avg > 1 ? 's' : '') + ' remaining'; else els.processingEta.textContent = 'About ' + Math.ceil(avg / 60) + ' min remaining'; if (state.pipActive && avg > 0 && pct < 98) state.pipStatusText = pct + '% — ' + avg + 's'; }
function clearETA() { state.etaSamples = []; if (els.processingEta) els.processingEta.textContent = ''; }

function isWatermarkFree() { var u = localStorage.getItem('crispy_wm_free_until'); return u && Date.now() < parseInt(u, 10); }
function grantWatermarkFree() { localStorage.setItem('crispy_wm_free_until', String(Date.now() + CONFIG.wmFreeHours * 3600000)); state.hasWatermark = false; updateWatermarkUI(); }
function updateWatermarkUI() { if (!els.wmToggleBtn) return; els.wmToggleBtn.textContent = state.hasWatermark ? 'ON' : 'OFF'; els.wmToggleBtn.className = 'wm-toggle ' + (state.hasWatermark ? 'on' : 'off'); }
function showWatermarkAdModal() { if (!els.wmAdModal) return; els.wmAdModal.classList.remove('hidden'); var db = els.wmAdDoneBtn; if (db) { db.classList.remove('ready'); db.disabled = true; } if (els.wmCountdownFill) els.wmCountdownFill.style.width = '0%'; if (els.wmCountdownText) els.wmCountdownText.textContent = CONFIG.adCountdownSeconds + 's remaining'; var secs = CONFIG.adCountdownSeconds, elapsed = 0; if (state.wmAdTimer) clearInterval(state.wmAdTimer); state.wmAdTimer = setInterval(function() { elapsed++; if (els.wmCountdownFill) els.wmCountdownFill.style.width = (elapsed / secs * 100) + '%'; var rem = secs - elapsed; if (els.wmCountdownText) els.wmCountdownText.textContent = rem > 0 ? rem + 's remaining' : 'Ready!'; if (elapsed >= secs) { clearInterval(state.wmAdTimer); if (db) { db.classList.add('ready'); db.disabled = false; } } }, 1000); }
function hideWatermarkAdModal() { if (els.wmAdModal) els.wmAdModal.classList.add('hidden'); if (state.wmAdTimer) { clearInterval(state.wmAdTimer); state.wmAdTimer = null; } }

function getDownloadCount() { return parseInt(localStorage.getItem('crispy_downloads') || '0', 10); }
function incrementDownloadCount() { var c = getDownloadCount() + 1; localStorage.setItem('crispy_downloads', String(c)); return c; }
function shouldShowRatingPrompt(c) { return !localStorage.getItem('crispy_rated') && c === CONFIG.ratingPromptAfter; }
function showRatingPrompt(c) { if (els.ratingCount) els.ratingCount.textContent = String(c); if (els.ratingModal) els.ratingModal.classList.remove('hidden'); }
function hideRatingPrompt() { if (els.ratingModal) els.ratingModal.classList.add('hidden'); }
function showFeedbackModal() { hideRatingPrompt(); if (els.feedbackModal) els.feedbackModal.classList.remove('hidden'); }
function hideFeedbackModal() { if (els.feedbackModal) els.feedbackModal.classList.add('hidden'); }

function calculateQualityScore() { var s = 55, mb = state.outputSize / (1024 * 1024); if (mb <= 2) s += 30; else if (mb <= 3) s += 25; else if (mb <= 4) s += 20; else if (mb <= 5) s += 12; else s += 5; var r = state.outputSize / state.originalSize; if (r < 0.15) s += 15; else if (r < 0.3) s += 12; else if (r < 0.5) s += 8; else s += 4; s = Math.min(99, Math.max(70, s)); var d = s >= 92 ? 'WhatsApp won\'t re-compress 🎯' : s >= 82 ? 'Excellent for Status ✨' : s >= 72 ? 'Great quality 👍' : 'Good for Status'; return { score: s, desc: d }; }
function showQualityScore() { var qs = calculateQualityScore(); if (els.qualityScore) els.qualityScore.style.display = 'flex'; if (els.qualityScoreNum) els.qualityScoreNum.textContent = qs.score + '/100'; if (els.qualityScoreDesc) els.qualityScoreDesc.textContent = qs.desc; }

/* ======================== FILE HANDLING ======================== */
function handleFileSelect(file) {
    log('File:', { name: file.name, size: formatBytes(file.size), type: file.type });
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|avi|mkv|webm|3gp)$/i)) { showError('Not a video', 'Please select a video file.'); return; }
    if (file.size > CONFIG.maxFileSize * 1024 * 1024) { showError('File too large', 'Max ' + CONFIG.maxFileSize + ' MB.'); return; }
    if (file.size < 10000) { showError('File too small', 'Too small.'); return; }
    cleanup(); state.file = file; state.originalSize = file.size; state.objectUrl = URL.createObjectURL(file);
    setButtonLoading(els.uploadBtn, true); els.trimVideo.src = state.objectUrl;
    els.trimVideo.onloadedmetadata = function() {
        setButtonLoading(els.uploadBtn, false); state.duration = els.trimVideo.duration;
        state.videoWidth = els.trimVideo.videoWidth; state.videoHeight = els.trimVideo.videoHeight;
        state.isPortrait = state.videoHeight >= state.videoWidth; captureBeforeFrame();
        if (isNaN(state.duration) || state.duration < 0.5) { showError('Invalid video', 'Could not read.'); return; }
        if (state.duration > CONFIG.maxDuration) { setupTrimmer(); showScreen('trim-screen'); }
        else { state.trimStart = 0; startProcessing(); }
    };
    els.trimVideo.onerror = function() { setButtonLoading(els.uploadBtn, false); showError('Unsupported format', 'Try MP4 or MOV.'); };
}
function setButtonLoading(b, l) { if (!b) return; if (l) b.classList.add('loading'); else b.classList.remove('loading'); }

/* ======================== TRIMMER ======================== */
function setupTrimmer() { var ms = Math.max(0, state.duration - CONFIG.maxDuration), cd = Math.min(CONFIG.maxDuration, state.duration); els.trimSlider.min = 0; els.trimSlider.max = ms; els.trimSlider.value = 0; els.trimSlider.step = 0.1; state.trimStart = 0; els.trimFileName.textContent = truncateFilename(state.file.name, 25); els.trimFileDur.textContent = formatTime(state.duration) + ' total'; els.trimDurLabel.textContent = Math.round(cd) + 's selected'; updateTrimUI(); els.playPreviewBtn.classList.remove('hide'); els.playPreviewBtn.textContent = '▶'; els.trimVideo.pause(); els.trimVideo.currentTime = 0; }
function updateTrimUI() { var s = parseFloat(els.trimSlider.value), d = state.duration, cd = Math.min(CONFIG.maxDuration, d); els.trimWindow.style.width = (cd / d) * 100 + '%'; els.trimWindow.style.left = (s / d) * 100 + '%'; els.trimStartTime.textContent = formatTime(s); els.trimEndTime.textContent = formatTime(s + cd); state.trimStart = s; }

/* ======================== FFMPEG ======================== */
async function loadFFmpeg() { if (state.ffmpegReady) return; if (typeof FFmpegWASM === 'undefined') throw new Error('SCRIPT_NOT_LOADED'); state.ffmpeg = new FFmpegWASM.FFmpeg(); state.ffmpeg.on('log', function(e) { console.log('[FFmpeg]', e.message); }); state.ffmpeg.on('progress', function(e) { var p = Math.min(Math.round(e.progress * 100), 100); if (p > 0) setProgress(p); }); var loaded = false; for (var i = 0; i < CONFIG.cdnUrls.length; i++) { try { updateStatus('Loading Crispy engine… ⬇️'); var core = await toBlobURL(CONFIG.cdnUrls[i] + '/ffmpeg-core.js', 'text/javascript'); var wasm = await toBlobURL(CONFIG.cdnUrls[i] + '/ffmpeg-core.wasm', 'application/wasm'); updateStatus('Starting engine… 🔧'); await state.ffmpeg.load({ coreURL: core, wasmURL: wasm }); loaded = true; break; } catch (e) { logError('CDN fail', e.message); } } if (!loaded) throw new Error('ENGINE_LOAD_FAILED'); state.ffmpegReady = true; }

/* ======================== WATERMARK ======================== */
async function createWatermarkImage() {
    var wm = CONFIG.watermark;
    var canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    var ctx = canvas.getContext('2d');
    ctx.font = '700 ' + wm.fontSize + 'px sans-serif';
    var textWidth = Math.ceil(ctx.measureText(wm.text).width);
    var totalW = textWidth + wm.bgPadH * 2;
    var totalH = wm.fontSize + wm.bgPadV * 2 + 4;
    canvas.width = totalW; canvas.height = totalH;
    ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark background pill
    ctx.fillStyle = 'rgba(0, 0, 0, ' + wm.bgOpacity + ')';
    var r = wm.borderRadius;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(totalW - r, 0);
    ctx.quadraticCurveTo(totalW, 0, totalW, r);
    ctx.lineTo(totalW, totalH - r);
    ctx.quadraticCurveTo(totalW, totalH, totalW - r, totalH);
    ctx.lineTo(r, totalH);
    ctx.quadraticCurveTo(0, totalH, 0, totalH - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill();

    // Bold white text with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    ctx.font = '700 ' + wm.fontSize + 'px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, ' + wm.opacity + ')';
    ctx.textBaseline = 'middle';
    ctx.fillText(wm.text, wm.bgPadH, totalH / 2 + 1);

    return new Promise(function(res, rej) {
        canvas.toBlob(function(blob) {
            if (!blob) { rej(new Error('WM fail')); return; }
            blob.arrayBuffer().then(function(buf) { res(new Uint8Array(buf)); });
        }, 'image/png');
    });
}

/* ============================================================
   CONSISTENT QUALITY ENGINE — ABR Mode
   
   The key change: -b:v (target bitrate) instead of -crf (target quality)
   
   CRF = same quality, DIFFERENT file sizes per video = INCONSISTENT
   ABR = same bitrate, SAME file size per video = CONSISTENT
   ============================================================ */

function getEncodingTier(duration) {
    var tiers = CONFIG.tiers;
    for (var i = 0; i < tiers.length; i++) {
        if (duration <= tiers[i].maxDur) {
            log('Tier: ≤' + tiers[i].maxDur + 's → ' + tiers[i].vbr + ' target, ~' + tiers[i].targetMB + 'MB');
            return tiers[i];
        }
    }
    return tiers[tiers.length - 1];
}

function buildScaleFilter() {
    var target = CONFIG.quality.shortSide;
    if (state.isPortrait) {
        if (state.videoWidth <= target) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos';
        return 'scale=' + target + ':-2:flags=lanczos';
    } else {
        if (state.videoHeight <= target) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos';
        return 'scale=-2:' + target + ':flags=lanczos';
    }
}

function buildVideoFilters() {
    var scale = buildScaleFilter();
    // Very light sharpen — just enough edge definition
    return scale + ',unsharp=3:3:0.3:3:3:0.1';
}

function buildFFmpegCommand(dur, hasWM) {
    var q = CONFIG.quality;
    var tier = getEncodingTier(dur);
    var filters = buildVideoFilters();
    var pad = CONFIG.watermark.padding;

    log('');
    log('╔══════════════════════════════════════════╗');
    log('║   CONSISTENT QUALITY ENGINE (ABR)        ║');
    log('╠══════════════════════════════════════════╣');
    log('║ Mode: ABR (Average Bitrate) — NOT CRF    ║');
    log('║ Video: -b:v ' + tier.vbr + ' (fixed target)');
    log('║ Max: ' + tier.maxrate + ' | Buffer: ' + tier.bufsize);
    log('║ Audio: ' + q.audioBitrate + ' | Res: ' + q.shortSide + 'p');
    log('║ Target file: ~' + tier.targetMB + 'MB');
    log('║ Result: SAME size for ANY video content   ║');
    log('╚══════════════════════════════════════════╝');

    var cmd = ['-y', '-ss', String(state.trimStart), '-i', 'input'];

    if (hasWM) {
        cmd.push('-i', 'watermark.png', '-t', String(dur));
        cmd.push('-filter_complex',
            '[0:v]' + filters + '[enhanced];[enhanced][1:v]overlay=' + pad + ':H-h-' + pad + '[outv]'
        );
        cmd.push('-map', '[outv]', '-map', '0:a?');
    } else {
        cmd.push('-t', String(dur), '-vf', filters);
    }

    cmd.push(
        '-c:v', 'libx264',

        // === THE KEY CHANGE: ABR instead of CRF ===
        '-b:v', tier.vbr,           // Target average bitrate (FIXED output size)
        '-maxrate', tier.maxrate,    // Peak bitrate cap
        '-bufsize', tier.bufsize,    // Rate control buffer

        '-preset', q.preset,
        '-profile:v', q.profile,
        '-level:v', q.level,
        '-g', String(q.keyint),
        '-keyint_min', '30',
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
    if (state.processing) return;
    state.processing = true; state.cancelled = false;
    state.processStartTime = Date.now(); state.etaSamples = [];
    state.hasWatermark = !isWatermarkFree();

    showScreen('processing-screen'); setProgress(0); clearETA(); startFunMessages();
    await acquireWakeLock(); startSilentAudio();
    var pip = false;
    if (isMobile() && isPiPSupported()) try { pip = await startPiP(); } catch (e) {}
    if (!pip && isMobile()) showToast('⚠️ Keep app open', 'info', 5000);
    if (state.notifPermission === 'default') try { await askNotificationPermission(); } catch (e) {}
    showBgNotice();

    try {
        if (!state.ffmpegReady) { updateStatus('Loading Crispy engine… 🔧'); updatePiP(0, 'Loading…'); await loadFFmpeg(); }
        if (state.cancelled) throw new Error('CANCELLED');

        updateStatus('Reading your video… 📖'); updatePiP(0, 'Reading…');
        var fd = new Uint8Array(await state.file.arrayBuffer());
        await state.ffmpeg.writeFile('input', fd);
        if (state.cancelled) throw new Error('CANCELLED');

        var useWM = state.hasWatermark;
        if (useWM) {
            try { var wd = await createWatermarkImage(); await state.ffmpeg.writeFile('watermark.png', wd); }
            catch (e) { logError('WM fail', e); useWM = false; }
        }
        if (state.cancelled) throw new Error('CANCELLED');

        updateStatus('Making it crispy… 🍳'); updatePiP(0, 'Encoding…');
        var cd = Math.min(CONFIG.maxDuration, state.duration);
        var tier = getEncodingTier(cd);
        var cmd = buildFFmpegCommand(cd, useWM);
        log('CMD: ffmpeg ' + cmd.join(' '));

        var exit = await state.ffmpeg.exec(cmd);

        // Fallback 1: no watermark
        if (exit !== 0 && useWM) { log('Retry no WM…'); useWM = false; exit = await state.ffmpeg.exec(buildFFmpegCommand(cd, false)); }
        // Fallback 2: simple encode
        if (exit !== 0) { log('Retry simple…'); exit = await state.ffmpeg.exec(['-y', '-ss', String(state.trimStart), '-i', 'input', '-t', String(cd), '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos', '-c:v', 'libx264', '-b:v', '800k', '-maxrate', '1200k', '-bufsize', '1600k', '-preset', 'fast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', 'output.mp4']); }
        // Fallback 3: minimum
        if (exit !== 0) { log('Retry min…'); exit = await state.ffmpeg.exec(['-y', '-ss', String(state.trimStart), '-i', 'input', '-t', String(cd), '-c:v', 'libx264', '-b:v', '600k', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', 'output.mp4']); }

        if (exit !== 0) throw new Error('FFMPEG_ERROR');
        if (state.cancelled) throw new Error('CANCELLED');

        updateStatus('Wrapping up… 🎁'); updatePiP(100, 'Done!');
        var od; try { od = await state.ffmpeg.readFile('output.mp4'); } catch (e) { throw new Error('OUTPUT_READ_FAILED'); }
        if (!od || od.byteLength < 1000) throw new Error('OUTPUT_EMPTY');

        state.outputBlob = new Blob([od.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;
        state.hasWatermark = useWM;

        var sizeMB = state.outputSize / (1024 * 1024);
        var elapsed = ((Date.now() - state.processStartTime) / 1000).toFixed(1);
        var avgBitrate = ((state.outputSize * 8) / (cd * 1000)).toFixed(0);

        log('');
        log('╔══════════════════════════════════════╗');
        log('║              RESULTS                 ║');
        log('╠══════════════════════════════════════╣');
        log('║ Time: ' + elapsed + 's');
        log('║ Size: ' + sizeMB.toFixed(2) + 'MB (target: ~' + tier.targetMB + 'MB)');
        log('║ Bitrate: ' + avgBitrate + ' kbps (target: ' + tier.vbr + ')');
        log('║ Watermark: ' + (useWM ? 'yes' : 'no'));
        var diff = Math.abs(sizeMB - tier.targetMB);
        if (diff < 0.5) log('║ ✅ PERFECT — right on target');
        else if (diff < 1.0) log('║ ✅ GOOD — close to target');
        else log('║ ⚠️ Off target by ' + diff.toFixed(1) + 'MB');
        log('╚══════════════════════════════════════╝');

        try { await state.ffmpeg.deleteFile('input'); } catch (e) {}
        try { await state.ffmpeg.deleteFile('output.mp4'); } catch (e) {}
        try { if (useWM) await state.ffmpeg.deleteFile('watermark.png'); } catch (e) {}

        await releaseWakeLock(); stopSilentAudio(); showPiPDone();
        sendNotification('🔥 Video is crispy!', 'Done in ' + elapsed + 's.');
        haptic('success'); showDone();

    } catch (err) {
        stopFunMessages(); clearETA(); await releaseWakeLock(); stopSilentAudio(); closePiP();
        if (err.message === 'CANCELLED') { showToast('Cancelled', 'info'); showScreen('home-screen'); return; }
        logError('Failed', err); sendNotification('😬 Failed', 'Tap to retry.');
        var t = 'Processing Failed', m = '';
        switch (err.message) {
            case 'SCRIPT_NOT_LOADED': t = 'Engine Not Loaded'; m = 'Refresh and check internet.'; break;
            case 'ENGINE_LOAD_FAILED': t = 'Download Failed'; m = 'Check internet.'; break;
            case 'FFMPEG_ERROR': t = 'Video Issue'; m = 'Try a different MP4.'; break;
            case 'OUTPUT_READ_FAILED': case 'OUTPUT_EMPTY': t = 'Processing Error'; m = 'Try shorter video.'; break;
            default: m = 'Try a different video.';
        }
        showError(t, m); showScreen('home-screen');
    } finally { state.processing = false; stopFunMessages(); clearETA(); hideBgNotice(); }
}

function cancelProcessing() { state.cancelled = true; releaseWakeLock(); stopSilentAudio(); closePiP(); showToast('Cancelling…', 'info', 2000); }
function showBgNotice() { if (els.bgNotice) els.bgNotice.classList.remove('hidden'); }
function hideBgNotice() { if (els.bgNotice) els.bgNotice.classList.add('hidden'); }

/* ======================== PROGRESS ======================== */
function setProgress(pct) { if (els.progressFill) els.progressFill.style.width = pct + '%'; if (els.progressText) els.progressText.textContent = pct + ' %'; if (state.processing) document.title = pct + '% — Crispy Status'; updatePiP(pct, pct < 95 ? 'Encoding…' : 'Almost done…'); updateETA(pct); }
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
    if (state.outputUrl && els.donePreview) { els.donePreview.src = state.outputUrl; if (els.donePlayBtn) { els.donePlayBtn.classList.remove('hide'); els.donePlayBtn.textContent = '▶'; } els.donePreview.onloadeddata = function() { setTimeout(captureAfterFrame, 300); els.donePreview.onloadeddata = null; }; }
    showQualityScore();
    if (els.compareSection) els.compareSection.style.display = 'none';
    state.tipsShown = false; if (els.tipsSection) els.tipsSection.classList.add('hidden'); if (els.tipsList) els.tipsList.innerHTML = '';
    showScreen('done-screen'); setTimeout(fireConfetti, 300);
}

/* ======================== DOWNLOAD & SHARE ======================== */
function downloadVideo() { if (!state.outputUrl) return; haptic('medium'); var a = document.createElement('a'); a.href = state.outputUrl; a.download = 'crispy-status.mp4'; document.body.appendChild(a); a.click(); document.body.removeChild(a); showToast('Video saved! Post it to Status now 🔥', 'success'); var c = incrementDownloadCount(); if (shouldShowRatingPrompt(c)) setTimeout(function() { showRatingPrompt(c); }, 2500); if (!state.tipsShown) { state.tipsShown = true; setTimeout(showTips, 600); } }
function shareToWhatsApp() { if (!state.outputBlob) return; haptic('medium'); if (navigator.canShare) { var f = new File([state.outputBlob], 'crispy-status.mp4', { type: 'video/mp4' }); if (navigator.canShare({ files: [f] })) { navigator.share({ files: [f] }).then(function() { showToast('Shared! 🚀', 'success'); var c = incrementDownloadCount(); if (shouldShowRatingPrompt(c)) setTimeout(function() { showRatingPrompt(c); }, 2500); }).catch(function() {}); return; } } downloadVideo(); }
function showTips() { if (!els.tipsSection || !els.tipsList) return; els.tipsSection.classList.remove('hidden'); els.tipsList.innerHTML = ''; QUALITY_TIPS.forEach(function(t) { var c = document.createElement('div'); c.className = 'tip-card'; c.innerHTML = '<span class="tip-icon">' + t.icon + '</span><div class="tip-content"><strong>' + t.title + '</strong><p>' + t.text + '</p></div>'; els.tipsList.appendChild(c); }); setTimeout(function() { els.tipsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 350); }

/* ======================== PWA ======================== */
function setupInstallPrompt() { window.addEventListener('beforeinstallprompt', function(e) { e.preventDefault(); state.installPrompt = e; if (!localStorage.getItem('crispy_install_dismissed')) setTimeout(function() { if (els.installPrompt) els.installPrompt.classList.remove('hidden'); }, 5000); }); if (els.installYes) els.installYes.addEventListener('click', async function() { if (!state.installPrompt) return; await state.installPrompt.prompt(); state.installPrompt = null; if (els.installPrompt) els.installPrompt.classList.add('hidden'); showToast('Installed! 📲', 'success'); }); if (els.installDismiss) els.installDismiss.addEventListener('click', function() { if (els.installPrompt) els.installPrompt.classList.add('hidden'); localStorage.setItem('crispy_install_dismissed', 'true'); }); }

/* ======================== UTILITIES ======================== */
function formatBytes(b) { if (b < 1024) return b + ' B'; if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'; return (b / (1024 * 1024)).toFixed(1) + ' MB'; }
function formatTime(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
function truncateFilename(n, mx) { if (n.length <= mx) return n; var e = n.split('.').pop(); return n.substring(0, mx - e.length - 3) + '….' + e; }
function cleanup() { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); if (state.outputUrl) URL.revokeObjectURL(state.outputUrl); state.objectUrl = null; state.outputUrl = null; state.outputBlob = null; state.file = null; state.tipsShown = false; state.videoWidth = 0; state.videoHeight = 0; state.hasWatermark = !isWatermarkFree(); state.beforeFrameURL = null; state.afterFrameURL = null; if (els.fileInput) els.fileInput.value = ''; if (els.donePreview) els.donePreview.src = ''; if (els.trimVideo) els.trimVideo.src = ''; if (els.compareSection) els.compareSection.style.display = 'none'; if (els.qualityScore) els.qualityScore.style.display = 'none'; }
function setupBackButton() { window.addEventListener('popstate', function() { if (state.processing) { history.pushState({ screen: 'processing-screen' }, '', ''); showToast('Cancel first.', 'info'); return; } var c = document.querySelector('.screen.active'); if (c) { if (c.id === 'trim-screen') { if (els.trimVideo) els.trimVideo.pause(); showScreen('home-screen'); } else if (c.id === 'done-screen') { cleanup(); showScreen('home-screen'); } else showScreen('home-screen'); } }); }
function setupBeforeUnload() { window.addEventListener('beforeunload', function(e) { if (state.processing) { e.preventDefault(); e.returnValue = ''; } }); }

/* ======================== EVENTS ======================== */
function bindEvents() {
    if (els.uploadBtn) els.uploadBtn.addEventListener('click', function() { haptic('light'); if (els.fileInput) els.fileInput.click(); });
    if (els.fileInput) els.fileInput.addEventListener('change', function(e) { var f = e.target.files && e.target.files[0]; if (f) handleFileSelect(f); });
    if (els.trimBackBtn) els.trimBackBtn.addEventListener('click', function() { haptic('light'); if (els.trimVideo) els.trimVideo.pause(); showScreen('home-screen'); });
    if (els.trimSlider) { var sd; els.trimSlider.addEventListener('input', function() { updateTrimUI(); clearTimeout(sd); sd = setTimeout(function() { if (els.trimVideo) els.trimVideo.currentTime = state.trimStart; }, 60); }); }
    if (els.playPreviewBtn) els.playPreviewBtn.addEventListener('click', function() { haptic('light'); var v = els.trimVideo; if (!v) return; if (v.paused) { v.currentTime = state.trimStart; v.muted = false; v.play(); els.playPreviewBtn.textContent = '⏸'; els.playPreviewBtn.classList.add('hide'); var sa = state.trimStart + CONFIG.maxDuration, stop = function() { if (v.currentTime >= sa) { v.pause(); v.removeEventListener('timeupdate', stop); els.playPreviewBtn.textContent = '▶'; els.playPreviewBtn.classList.remove('hide'); } }; v.addEventListener('timeupdate', stop); } else { v.pause(); els.playPreviewBtn.textContent = '▶'; els.playPreviewBtn.classList.remove('hide'); } });
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

    if (els.wmToggleBtn) els.wmToggleBtn.addEventListener('click', function() { haptic('light'); if (state.hasWatermark) showWatermarkAdModal(); else { state.hasWatermark = true; localStorage.removeItem('crispy_wm_free_until'); updateWatermarkUI(); showToast('Watermark enabled 🏷️', 'info', 2000); } });
    if (els.wmAdDoneBtn) els.wmAdDoneBtn.addEventListener('click', function() { haptic('success'); grantWatermarkFree(); hideWatermarkAdModal(); showToast('Watermark removed for 24h! ✨', 'success'); });
    if (els.wmAdCancelBtn) els.wmAdCancelBtn.addEventListener('click', function() { haptic('light'); hideWatermarkAdModal(); });
    if (els.wmAdModal) els.wmAdModal.addEventListener('click', function(e) { if (e.target === els.wmAdModal) hideWatermarkAdModal(); });

    if (els.ratingLoveBtn) els.ratingLoveBtn.addEventListener('click', function() { haptic('success'); localStorage.setItem('crispy_rated', 'love'); hideRatingPrompt(); showToast('Thank you! ❤️🔥', 'success', 4000); });
    if (els.ratingImproveBtn) els.ratingImproveBtn.addEventListener('click', function() { haptic('light'); localStorage.setItem('crispy_rated', 'improve'); showFeedbackModal(); });
    if (els.ratingModal) els.ratingModal.addEventListener('click', function(e) { if (e.target === els.ratingModal) { localStorage.setItem('crispy_rated', 'dismissed'); hideRatingPrompt(); } });
    if (els.feedbackSendBtn) els.feedbackSendBtn.addEventListener('click', function() { haptic('success'); hideFeedbackModal(); showToast('Thanks! 🙏', 'success'); });
    if (els.feedbackSkipBtn) els.feedbackSkipBtn.addEventListener('click', function() { haptic('light'); hideFeedbackModal(); });
    if (els.feedbackModal) els.feedbackModal.addEventListener('click', function(e) { if (e.target === els.feedbackModal) hideFeedbackModal(); });

    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') { if (els.errorModal && !els.errorModal.classList.contains('hidden')) hideError(); if (els.wmAdModal && !els.wmAdModal.classList.contains('hidden')) hideWatermarkAdModal(); if (els.ratingModal && !els.ratingModal.classList.contains('hidden')) { localStorage.setItem('crispy_rated', 'dismissed'); hideRatingPrompt(); } if (els.feedbackModal && !els.feedbackModal.classList.contains('hidden')) hideFeedbackModal(); } });
    window.addEventListener('resize', function() { if (els.confettiCanvas) { els.confettiCanvas.width = window.innerWidth; els.confettiCanvas.height = window.innerHeight; } });
    setupComparisonDrag();
}

function registerSW() { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function() {}); }
function preloadFFmpeg() { setTimeout(function() { if (!state.ffmpegReady) { log('Preloading…'); loadFFmpeg().then(function() { log('Preload ✅'); }).catch(function(e) { log('Preload fail: ' + e.message); }); } }, 3000); }

/* ======================== INIT ======================== */
function init() {
    log('');
    log('╔══════════════════════════════════════════╗');
    log('║  CRISPY STATUS v13                       ║');
    log('║  Consistent Quality (ABR Engine)         ║');
    log('╠══════════════════════════════════════════╣');
    log('║ FIX: CRF → ABR (Average Bitrate)        ║');
    log('║                                          ║');
    log('║ CRF = same quality, random file sizes    ║');
    log('║ ABR = same file size, consistent results ║');
    log('║                                          ║');
    log('║ Every video comes out ~2-3.5MB           ║');
    log('║ WhatsApp treats all of them the same     ║');
    log('║ = CONSISTENT quality after posting       ║');
    log('╚══════════════════════════════════════════╝');

    if (typeof WebAssembly === 'undefined') { alert('Browser not supported.'); return; }
    initEls();
    try { bindEvents(); } catch (e) { logError('bindEvents', e); return; }
    state.hasWatermark = !isWatermarkFree(); updateWatermarkUI();
    registerSW(); setupInstallPrompt(); setupBackButton(); setupBeforeUnload();
    setupVisibilityHandler(); setupFreezeHandler(); requestNotificationPermission();
    showScreen('home-screen'); preloadFFmpeg();
    if (els.confettiCanvas) { els.confettiCanvas.width = window.innerWidth; els.confettiCanvas.height = window.innerHeight; }
    log('✅ Ready');
}

init();
