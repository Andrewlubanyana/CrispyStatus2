/* ==========================================================
   CRISPY STATUS — Polished App Logic
   All video processing happens on the user's device.
   No data leaves their phone.
   ========================================================== */

/* ======================== CONFIG ======================== */
const CONFIG = {
    maxDuration   : 30,
    maxFileSize   : 500,     // MB
    dailyFreeUses : 1,
    outputWidth   : 720,
    videoBitrate  : '4M',
    audioBitrate  : '128k',
    fps           : 30,
    ffCoreBase    : 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
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

/* ======================== DOM REFS ======================== */
const $ = (id) => document.getElementById(id);

const els = {
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

/* ======================== SCREEN NAV ======================== */
function showScreen(id) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach((s) => s.classList.remove('active', 'screen-enter'));
    const target = $(id);
    target.classList.add('active', 'screen-enter');
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Update history for back button
    if (history.state?.screen !== id) {
        history.pushState({ screen: id }, '', '');
    }
}

/* ======================== TOAST SYSTEM ======================== */
function showToast(message, type = 'info', duration = 3000) {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', info: '💡' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

/* ======================== CONFETTI ======================== */
function fireConfetti() {
    const canvas = els.confettiCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#FF6B35', '#FF3366', '#8B5CF6', '#22D67F', '#FBBF24', '#06B6D4', '#fff'];
    const particles = [];
    const count = 90;

    for (let i = 0; i < count; i++) {
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

    let frame = 0;
    const maxFrames = 150;

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.99;
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
        if (frame < maxFrames) {
            requestAnimationFrame(draw);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    requestAnimationFrame(draw);
}

/* ======================== HAPTIC ======================== */
function haptic(style = 'light') {
    if (!navigator.vibrate) return;
    const patterns = { light: [12], medium: [25], heavy: [50], success: [15, 50, 15] };
    navigator.vibrate(patterns[style] || patterns.light);
}

/* ======================== DAILY LIMIT ======================== */
function canUseToday() {
    const today = new Date().toDateString();
    const saved = localStorage.getItem('crispy_date');
    const count = parseInt(localStorage.getItem('crispy_count') || '0', 10);
    if (saved !== today) return true;
    return count < CONFIG.dailyFreeUses;
}

function markUsed() {
    const today = new Date().toDateString();
    const saved = localStorage.getItem('crispy_date');
    let count = 0;
    if (saved === today) {
        count = parseInt(localStorage.getItem('crispy_count') || '0', 10);
    }
    localStorage.setItem('crispy_date', today);
    localStorage.setItem('crispy_count', String(count + 1));
}

/* ======================== MODALS ======================== */
function showPremium() {
    els.premiumModal.classList.remove('hidden');
    const card = els.premiumModal.querySelector('.modal-card');
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    haptic('medium');
}
function hidePremium() { els.premiumModal.classList.add('hidden') }

function showError(title, msg) {
    $('error-heading').textContent = title;
    els.errorMsg.textContent = msg;
    els.errorModal.classList.remove('hidden');
    haptic('heavy');
}
function hideError() { els.errorModal.classList.add('hidden') }

/* ======================== FILE HANDLING ======================== */
function handleFileSelect(file) {
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|avi|mkv|webm|3gp)$/i)) {
        showError('Not a video', 'Please select a video file to continue.');
        return;
    }

    if (file.size > CONFIG.maxFileSize * 1024 * 1024) {
        showError('File too large', `Please pick a video under ${CONFIG.maxFileSize} MB.`);
        return;
    }

    if (file.size < 10000) {
        showError('File too small', 'This file seems too small to be a video. Please try another.');
        return;
    }

    cleanup();

    state.file = file;
    state.originalSize = file.size;
    state.objectUrl = URL.createObjectURL(file);

    // Show loading state on button
    setButtonLoading(els.uploadBtn, true);

    els.trimVideo.src = state.objectUrl;

    els.trimVideo.onloadedmetadata = () => {
        setButtonLoading(els.uploadBtn, false);
        state.duration = els.trimVideo.duration;

        if (isNaN(state.duration) || state.duration < 0.5) {
            showError('Invalid video', 'Could not read this video. Please try a different file.');
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

    els.trimVideo.onerror = () => {
        setButtonLoading(els.uploadBtn, false);
        showError('Unsupported format', 'This video format is not supported. Try an MP4 or MOV file.');
    };
}

/* ======================== BUTTON LOADING ======================== */
function setButtonLoading(btn, loading) {
    if (loading) {
        btn.classList.add('loading');
    } else {
        btn.classList.remove('loading');
    }
}

/* ======================== TRIMMER ======================== */
function setupTrimmer() {
    const maxStart = Math.max(0, state.duration - CONFIG.maxDuration);
    const clipDur = Math.min(CONFIG.maxDuration, state.duration);

    els.trimSlider.min = 0;
    els.trimSlider.max = maxStart;
    els.trimSlider.value = 0;
    els.trimSlider.step = 0.1;
    state.trimStart = 0;

    // Show file info
    els.trimFileName.textContent = truncateFilename(state.file.name, 25);
    els.trimFileDur.textContent = formatTime(state.duration) + ' total';
    els.trimDurLabel.textContent = clipDur + 's selected';

    updateTrimUI();

    els.playPreviewBtn.classList.remove('hide');
    els.playPreviewBtn.textContent = '▶';
    els.trimVideo.pause();
    els.trimVideo.currentTime = 0;
}

function updateTrimUI() {
    const start = parseFloat(els.trimSlider.value);
    const dur = state.duration;
    const clipDur = Math.min(CONFIG.maxDuration, dur);
    const windowPct = (clipDur / dur) * 100;
    const leftPct = (start / dur) * 100;

    els.trimWindow.style.width = windowPct + '%';
    els.trimWindow.style.left = leftPct + '%';

    els.trimStartTime.textContent = formatTime(start);
    els.trimEndTime.textContent = formatTime(start + clipDur);

    state.trimStart = start;
}

/* ======================== FFMPEG ======================== */
async function loadFFmpeg() {
    if (state.ffmpegReady) return;

    const { FFmpeg } = FFmpegWASM;
    const { toBlobURL } = FFmpegUtil;
    state.ffmpeg = new FFmpeg();

    state.ffmpeg.on('progress', ({ progress }) => {
        const pct = Math.min(Math.round(progress * 100), 100);
        if (pct > 0) setProgress(pct);
    });

    const base = CONFIG.ffCoreBase;
    await state.ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    state.ffmpegReady = true;
}

// Pre-load FFmpeg in background after page loads
function preloadFFmpeg() {
    if (state.ffmpegReady) return;
    // Wait a few seconds then start loading silently
    setTimeout(() => {
        loadFFmpeg().catch(() => {
            // Silent fail on preload — will retry on actual use
        });
    }, 3000);
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
        // 1. Load engine
        if (!state.ffmpegReady) {
            updateStatus('Loading Crispy engine… 🔧');
            await loadFFmpeg();
        }

        if (state.cancelled) throw new Error('CANCELLED');

        // 2. Write input file
        updateStatus('Reading your video… 📖');
        const { fetchFile } = FFmpegUtil;
        await state.ffmpeg.writeFile('input', await fetchFile(state.file));

        if (state.cancelled) throw new Error('CANCELLED');

        // 3. Build command
        updateStatus('Making it crispy… 🍳');
        const clipDur = Math.min(CONFIG.maxDuration, state.duration);
        const cmd = [
            '-i', 'input',
            '-ss', String(state.trimStart),
            '-t', String(clipDur),
            '-vf', `scale=${CONFIG.outputWidth}:-2`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-b:v', CONFIG.videoBitrate,
            '-maxrate', '5M',
            '-bufsize', '8M',
            '-c:a', 'aac',
            '-b:a', CONFIG.audioBitrate,
            '-r', String(CONFIG.fps),
            '-movflags', '+faststart',
            '-y', 'output.mp4',
        ];
        await state.ffmpeg.exec(cmd);

        if (state.cancelled) throw new Error('CANCELLED');

        // 4. Read output
        updateStatus('Wrapping up… 🎁');
        const data = await state.ffmpeg.readFile('output.mp4');
        state.outputBlob = new Blob([data.buffer], { type: 'video/mp4' });
        state.outputUrl = URL.createObjectURL(state.outputBlob);
        state.outputSize = state.outputBlob.size;

        // 5. Done!
        haptic('success');
        showDone();

    } catch (err) {
        if (err.message === 'CANCELLED') {
            showToast('Processing cancelled', 'info');
            showScreen('home-screen');
        } else {
            console.error(err);
            showError('Processing failed',
                'Something went wrong while optimizing your video. Try a different file or refresh the page.');
            showScreen('home-screen');
        }
    } finally {
        state.processing = false;
        stopFunMessages();
    }
}

function cancelProcessing() {
    state.cancelled = true;
    showToast('Cancelling…', 'info', 2000);
}

/* ======================== PROGRESS HELPERS ======================== */
function setProgress(pct) {
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = pct + ' %';
}

function updateStatus(msg) {
    els.processingStatus.style.opacity = '0';
    setTimeout(() => {
        els.processingStatus.textContent = msg;
        els.processingStatus.style.opacity = '1';
    }, 150);
}

let funTimer = null;
let funIdx = 0;
function startFunMessages() {
    funIdx = 0;
    funTimer = setInterval(() => {
        funIdx = (funIdx + 1) % FUN_MESSAGES.length;
        els.funTip.textContent = FUN_MESSAGES[funIdx];
    }, 3500);
}
function stopFunMessages() { clearInterval(funTimer) }

/* ======================== DONE SCREEN ======================== */
function showDone() {
    // Stats
    els.statBefore.textContent = formatBytes(state.originalSize);
    els.statAfter.textContent = formatBytes(state.outputSize);

    const saved = Math.max(0, Math.round((1 - state.outputSize / state.originalSize) * 100));
    els.statSaved.textContent = saved > 0 ? `-${saved}%` : '✨ optimized';

    // Video preview
    if (state.outputUrl) {
        els.donePreview.src = state.outputUrl;
        els.donePlayBtn.classList.remove('hide');
        els.donePlayBtn.textContent = '▶';
    }

    // Reset tips
    state.tipsShown = false;
    els.tipsSection.classList.add('hidden');
    els.tipsList.innerHTML = '';

    showScreen('done-screen');

    // Fire confetti after a tiny delay for impact
    setTimeout(() => fireConfetti(), 300);
}

/* ======================== DOWNLOAD & SHARE ======================== */
function downloadVideo() {
    if (!state.outputUrl) return;

    haptic('medium');

    const a = document.createElement('a');
    a.href = state.outputUrl;
    a.download = 'crispy-status.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    markUsed();

    showToast('Video saved! Post it to Status 🔥', 'success');

    if (!state.tipsShown) {
        state.tipsShown = true;
        setTimeout(() => showTips(), 600);
    }
}

function shareToWhatsApp() {
    if (!state.outputBlob) return;

    haptic('medium');

    if (navigator.canShare) {
        const file = new File([state.outputBlob], 'crispy-status.mp4', { type: 'video/mp4' });
        const data = { files: [file] };
        if (navigator.canShare(data)) {
            navigator.share(data).then(() => {
                markUsed();
                showToast('Shared! 🚀', 'success');
            }).catch(() => {});
            return;
        }
    }
    // Fallback
    downloadVideo();
}

/* ======================== TIPS ======================== */
function showTips() {
    els.tipsSection.classList.remove('hidden');
    els.tipsList.innerHTML = '';

    QUALITY_TIPS.forEach((tip) => {
        const card = document.createElement('div');
        card.className = 'tip-card';
        card.innerHTML = `
            <span class="tip-icon">${tip.icon}</span>
            <div class="tip-content">
                <strong>${tip.title}</strong>
                <p>${tip.text}</p>
            </div>`;
        els.tipsList.appendChild(card);
    });

    setTimeout(() => {
        els.tipsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
}

/* ======================== PWA INSTALL ======================== */
function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.installPrompt = e;

        // Show install banner after a short delay
        const dismissed = localStorage.getItem('crispy_install_dismissed');
        if (!dismissed) {
            setTimeout(() => {
                els.installPrompt.classList.remove('hidden');
            }, 5000);
        }
    });

    els.installYes.addEventListener('click', async () => {
        if (!state.installPrompt) return;
        const result = await state.installPrompt.prompt();
        if (result.outcome === 'accepted') {
            showToast('Installed! Find Crispy on your home screen 📲', 'success');
        }
        state.installPrompt = null;
        els.installPrompt.classList.add('hidden');
    });

    els.installDismiss.addEventListener('click', () => {
        els.installPrompt.classList.add('hidden');
        localStorage.setItem('crispy_install_dismissed', 'true');
    });
}

/* ======================== UTILITIES ======================== */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
}

function truncateFilename(name, maxLen) {
    if (name.length <= maxLen) return name;
    const ext = name.split('.').pop();
    return name.substring(0, maxLen - ext.length - 3) + '….' + ext;
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
    window.addEventListener('popstate', (e) => {
        if (state.processing) {
            // Don't navigate away during processing
            history.pushState({ screen: 'processing-screen' }, '', '');
            showToast('Processing in progress… Cancel first.', 'info');
            return;
        }

        const current = document.querySelector('.screen.active');
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
    window.addEventListener('beforeunload', (e) => {
        if (state.processing) {
            e.preventDefault();
            e.returnValue = 'Video is still processing. Are you sure you want to leave?';
        }
    });
}

/* ======================== EVENT LISTENERS ======================== */
function bindEvents() {

    /* --- Home --- */
    els.uploadBtn.addEventListener('click', () => {
        if (!canUseToday()) { showPremium(); return; }
        haptic('light');
        els.fileInput.click();
    });

    els.fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleFileSelect(file);
    });

    /* --- Trim --- */
    els.trimBackBtn.addEventListener('click', () => {
        haptic('light');
        els.trimVideo.pause();
        showScreen('home-screen');
    });

    let seekDebounce;
    els.trimSlider.addEventListener('input', () => {
        updateTrimUI();
        clearTimeout(seekDebounce);
        seekDebounce = setTimeout(() => {
            els.trimVideo.currentTime = state.trimStart;
        }, 60);
    });

    els.playPreviewBtn.addEventListener('click', () => {
        haptic('light');
        const v = els.trimVideo;

        if (v.paused) {
            v.currentTime = state.trimStart;
            v.muted = false;
            v.play();
            els.playPreviewBtn.textContent = '⏸';
            els.playPreviewBtn.classList.add('hide');

            const stopAt = state.trimStart + CONFIG.maxDuration;
            const stop = () => {
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

    els.trimVideo.addEventListener('click', () => {
        els.playPreviewBtn.click();
    });

    els.trimContinueBtn.addEventListener('click', () => {
        haptic('medium');
        els.trimVideo.pause();
        startProcessing();
    });

    /* --- Processing --- */
    els.cancelBtn.addEventListener('click', () => {
        haptic('light');
        cancelProcessing();
    });

    /* --- Done --- */
    els.donePlayBtn.addEventListener('click', () => {
        haptic('light');
        const v = els.donePreview;
        if (v.paused) {
            v.play();
            els.donePlayBtn.classList.add('hide');
        } else {
            v.pause();
            els.donePlayBtn.classList.remove('hide');
        }
    });

    els.donePreview.addEventListener('click', () => {
        els.donePlayBtn.click();
    });

    els.donePreview.addEventListener('ended', () => {
        els.donePlayBtn.classList.remove('hide');
        els.donePlayBtn.textContent = '▶';
    });

    els.downloadBtn.addEventListener('click', downloadVideo);
    els.shareBtn.addEventListener('click', shareToWhatsApp);

    els.newVideoBtn.addEventListener('click', () => {
        haptic('light');
        if (!canUseToday()) { showPremium(); return; }
        cleanup();
        showScreen('home-screen');
    });

    /* --- Modals --- */
    els.premiumCloseBtn.addEventListener('click', () => {
        haptic('light');
        hidePremium();
    });

    els.upgradeBtn.addEventListener('click', () => {
        haptic('medium');
        showToast('Premium coming soon! 🚀', 'info');
    });

    els.errorCloseBtn.addEventListener('click', () => {
        haptic('light');
        hideError();
        showScreen('home-screen');
    });

    els.premiumModal.addEventListener('click', (e) => {
        if (e.target === els.premiumModal) hidePremium();
    });
    els.errorModal.addEventListener('click', (e) => {
        if (e.target === els.errorModal) hideError();
    });

    /* --- Keyboard escape for modals --- */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!els.premiumModal.classList.contains('hidden')) hidePremium();
            if (!els.errorModal.classList.contains('hidden')) hideError();
        }
    });

    /* --- Resize confetti canvas --- */
    window.addEventListener('resize', () => {
        els.confettiCanvas.width = window.innerWidth;
        els.confettiCanvas.height = window.innerHeight;
    });
}

/* ======================== SERVICE WORKER ======================== */
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
}

/* ======================== INIT ======================== */
function init() {
    bindEvents();
    registerSW();
    setupInstallPrompt();
    setupBackButton();
    setupBeforeUnload();
    showScreen('home-screen');
    preloadFFmpeg();

    // Size confetti canvas
    els.confettiCanvas.width = window.innerWidth;
    els.confettiCanvas.height = window.innerHeight;
}

init();
