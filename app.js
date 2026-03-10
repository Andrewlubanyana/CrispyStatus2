/* ==========================================================
   CRISPY STATUS — App Logic
   All video processing happens on the user's device.
   ========================================================== */

/* ======================== CONFIG ======================== */
const CONFIG = {
  maxDuration  : 30,          // seconds
  maxFileSize  : 500,         // MB
  dailyFreeUses: 1,
  outputWidth  : 720,
  videoBitrate : '4M',
  audioBitrate : '128k',
  fps          : 30,
  ffCoreBase   : 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
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
];

const QUALITY_TIPS = [
  { icon:'📱', title:'Post directly to Status',
    text:'Open WhatsApp → Status tab → pick the crispy video from your gallery.' },
  { icon:'🚫', title:"Don't re-edit the video",
    text:'Any editing after download may re-compress and kill the quality.' },
  { icon:'📂', title:'Use the original file',
    text:'Never screenshot or screen-record — always use the downloaded file.' },
  { icon:'⚡', title:'Post it right away',
    text:'Upload to Status soon after downloading for best results.' },
  { icon:'📐', title:'Film vertical next time',
    text:'9:16 vertical videos look best on WhatsApp Status.' },
];

/* ======================== STATE ======================== */
const state = {
  file        : null,
  objectUrl   : null,
  duration    : 0,
  trimStart   : 0,
  originalSize: 0,
  outputBlob  : null,
  outputUrl   : null,
  outputSize  : 0,
  ffmpeg      : null,
  ffmpegReady : false,
  processing  : false,
  tipsShown   : false,
};

/* ======================== DOM REFS ======================== */
const $ = (id) => document.getElementById(id);

const els = {
  // screens
  homeScreen      : $('home-screen'),
  trimScreen      : $('trim-screen'),
  processingScreen: $('processing-screen'),
  doneScreen      : $('done-screen'),
  // home
  uploadBtn       : $('upload-btn'),
  fileInput       : $('file-input'),
  // trim
  trimBackBtn     : $('trim-back-btn'),
  trimVideo       : $('trim-video'),
  playPreviewBtn  : $('play-preview-btn'),
  trimSlider      : $('trim-slider'),
  trimWindow      : $('trim-window'),
  trimStartTime   : $('trim-start-time'),
  trimEndTime     : $('trim-end-time'),
  trimContinueBtn : $('trim-continue-btn'),
  // processing
  processingStatus: $('processing-status'),
  progressFill    : $('progress-fill'),
  progressText    : $('progress-text'),
  funTip          : $('fun-tip'),
  // done
  statBefore      : $('stat-before'),
  statAfter       : $('stat-after'),
  statSaved       : $('stat-saved'),
  downloadBtn     : $('download-btn'),
  shareBtn        : $('share-btn'),
  tipsSection     : $('tips-section'),
  tipsList        : $('tips-list'),
  newVideoBtn     : $('new-video-btn'),
  // modals
  premiumModal    : $('premium-modal'),
  upgradeBtn      : $('upgrade-btn'),
  premiumCloseBtn : $('premium-close-btn'),
  errorModal      : $('error-modal'),
  errorMsg        : $('error-msg'),
  errorCloseBtn   : $('error-close-btn'),
};

/* ======================== SCREEN NAV ======================== */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

/* ======================== DAILY LIMIT ======================== */
function canUseToday() {
  const today = new Date().toDateString();
  const saved = localStorage.getItem('crispy_date');
  const count = parseInt(localStorage.getItem('crispy_count') || '0', 10);
  if (saved !== today) return true;           // new day
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

/* ======================== PREMIUM ======================== */
function showPremium() {
  els.premiumModal.classList.remove('hidden');
  // re-trigger bounce animation
  const card = els.premiumModal.querySelector('.modal-card');
  card.style.animation = 'none';
  // force reflow
  void card.offsetWidth;
  card.style.animation = '';
}
function hidePremium() {
  els.premiumModal.classList.add('hidden');
}

/* ======================== ERRORS ======================== */
function showError(title, msg) {
  $('error-heading').textContent = title;
  els.errorMsg.textContent       = msg;
  els.errorModal.classList.remove('hidden');
}
function hideError() {
  els.errorModal.classList.add('hidden');
}

/* ======================== FILE HANDLING ======================== */
function handleFileSelect(file) {
  // Validate type
  if (!file.type.startsWith('video/')) {
    showError('Not a video', 'Please select a video file to continue.');
    return;
  }
  // Validate size
  if (file.size > CONFIG.maxFileSize * 1024 * 1024) {
    showError('File too large', `Please pick a video under ${CONFIG.maxFileSize} MB.`);
    return;
  }

  // Clean previous
  cleanup();

  state.file         = file;
  state.originalSize = file.size;
  state.objectUrl    = URL.createObjectURL(file);

  // Load into preview video to get duration
  els.trimVideo.src = state.objectUrl;

  els.trimVideo.onloadedmetadata = () => {
    state.duration = els.trimVideo.duration;

    if (state.duration > CONFIG.maxDuration) {
      setupTrimmer();
      showScreen('trim-screen');
    } else {
      // Short video — process immediately
      state.trimStart = 0;
      startProcessing();
    }
  };

  els.trimVideo.onerror = () => {
    showError('Unsupported format', 'This video could not be read. Please try a different file.');
  };
}

/* ======================== TRIMMER ======================== */
function setupTrimmer() {
  const maxStart = Math.max(0, state.duration - CONFIG.maxDuration);
  els.trimSlider.min   = 0;
  els.trimSlider.max   = maxStart;
  els.trimSlider.value = 0;
  els.trimSlider.step  = 0.1;
  state.trimStart      = 0;

  updateTrimUI();

  // Reset play button
  els.playPreviewBtn.classList.remove('hide');
  els.trimVideo.pause();
  els.trimVideo.currentTime = 0;
}

function updateTrimUI() {
  const start      = parseFloat(els.trimSlider.value);
  const duration   = state.duration;
  const windowPct  = (CONFIG.maxDuration / duration) * 100;
  const leftPct    = (start / duration) * 100;

  els.trimWindow.style.width = windowPct + '%';
  els.trimWindow.style.left  = leftPct + '%';

  els.trimStartTime.textContent = formatTime(start);
  els.trimEndTime.textContent   = formatTime(start + CONFIG.maxDuration);

  state.trimStart = start;
}

/* ======================== FFMPEG ======================== */
async function loadFFmpeg() {
  const { FFmpeg }                 = FFmpegWASM;
  const { toBlobURL }             = FFmpegUtil;
  state.ffmpeg                     = new FFmpeg();

  // Progress callback
  state.ffmpeg.on('progress', ({ progress }) => {
    const pct = Math.min(Math.round(progress * 100), 100);
    setProgress(pct);
  });

  const base = CONFIG.ffCoreBase;
  await state.ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  state.ffmpegReady = true;
}

/* ======================== PROCESSING ======================== */
async function startProcessing() {
  if (state.processing) return;
  state.processing = true;

  showScreen('processing-screen');
  setProgress(0);
  startFunMessages();

  try {
    // 1. Load engine (first time downloads ~30 MB)
    if (!state.ffmpegReady) {
      updateStatus('Loading Crispy engine… 🔧');
      await loadFFmpeg();
    }

    // 2. Write input file
    updateStatus('Reading your video… 📖');
    const { fetchFile } = FFmpegUtil;
    await state.ffmpeg.writeFile('input', await fetchFile(state.file));

    // 3. Build command
    updateStatus('Making it crispy… 🍳');
    const cmd = [
      '-i',  'input',
      '-ss', String(state.trimStart),
      '-t',  String(CONFIG.maxDuration),
      '-vf', `scale=${CONFIG.outputWidth}:-2`,
      '-c:v','libx264',
      '-preset','fast',
      '-b:v', CONFIG.videoBitrate,
      '-maxrate','5M',
      '-bufsize','8M',
      '-c:a','aac',
      '-b:a', CONFIG.audioBitrate,
      '-r',   String(CONFIG.fps),
      '-movflags','+faststart',
      '-y',  'output.mp4',
    ];
    await state.ffmpeg.exec(cmd);

    // 4. Read output
    const data = await state.ffmpeg.readFile('output.mp4');
    state.outputBlob = new Blob([data.buffer], { type: 'video/mp4' });
    state.outputUrl  = URL.createObjectURL(state.outputBlob);
    state.outputSize = state.outputBlob.size;

    // 5. Show results
    showDone();

  } catch (err) {
    console.error(err);
    showError('Processing failed',
      'Something went wrong while optimizing your video. Try a different file or refresh the page.');
    showScreen('home-screen');
  } finally {
    state.processing = false;
    stopFunMessages();
  }
}

/* ======================== PROGRESS HELPERS ======================== */
function setProgress(pct) {
  els.progressFill.style.width = pct + '%';
  els.progressText.textContent = pct + ' %';
}
function updateStatus(msg) {
  els.processingStatus.textContent = msg;
}

let funTimer = null;
function startFunMessages() {
  let idx = 0;
  funTimer = setInterval(() => {
    idx = (idx + 1) % FUN_MESSAGES.length;
    els.funTip.textContent = FUN_MESSAGES[idx];
  }, 3500);
}
function stopFunMessages() {
  clearInterval(funTimer);
}

/* ======================== DONE SCREEN ======================== */
function showDone() {
  // Stats
  els.statBefore.textContent = formatBytes(state.originalSize);
  els.statAfter.textContent  = formatBytes(state.outputSize);

  const saved = Math.max(0, Math.round((1 - state.outputSize / state.originalSize) * 100));
  els.statSaved.textContent = saved > 0 ? `-${saved}%` : 'optimized';

  // Reset tips
  state.tipsShown = false;
  els.tipsSection.classList.add('hidden');
  els.tipsList.innerHTML = '';

  showScreen('done-screen');
}

/* ======================== DOWNLOAD & SHARE ======================== */
function downloadVideo() {
  if (!state.outputUrl) return;

  const a       = document.createElement('a');
  a.href        = state.outputUrl;
  a.download    = 'crispy-status.mp4';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Mark daily use
  markUsed();

  // Show tips (once)
  if (!state.tipsShown) {
    state.tipsShown = true;
    showTips();
  }
}

function shareToWhatsApp() {
  if (!state.outputBlob) return;

  // Try native Web Share API with file
  if (navigator.canShare) {
    const file = new File([state.outputBlob], 'crispy-status.mp4', { type:'video/mp4' });
    const data = { files: [file] };
    if (navigator.canShare(data)) {
      navigator.share(data).catch(() => {});
      return;
    }
  }
  // Fallback: just download
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

  // Scroll tips into view
  setTimeout(() => {
    els.tipsSection.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 300);
}

/* ======================== UTILITIES ======================== */
function formatBytes(bytes) {
  if (bytes < 1024)              return bytes + ' B';
  if (bytes < 1024 * 1024)      return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function cleanup() {
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.objectUrl = null;
  state.outputUrl = null;
  state.outputBlob = null;
  state.tipsShown  = false;
  els.fileInput.value = '';
}

/* ======================== PWA ======================== */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ======================== EVENT LISTENERS ======================== */
function bindEvents() {

  /* --- Home --- */
  els.uploadBtn.addEventListener('click', () => {
    if (!canUseToday()) { showPremium(); return; }
    els.fileInput.click();
  });

  els.fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFileSelect(file);
  });

  /* --- Trim --- */
  els.trimBackBtn.addEventListener('click', () => {
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
    const v = els.trimVideo;
    if (v.paused) {
      v.currentTime = state.trimStart;
      v.play();
      els.playPreviewBtn.textContent = '⏸';
      els.playPreviewBtn.classList.add('hide');

      // Stop after 30 s
      const stop = () => {
        if (v.currentTime >= state.trimStart + CONFIG.maxDuration) {
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

  els.trimContinueBtn.addEventListener('click', () => {
    els.trimVideo.pause();
    startProcessing();
  });

  /* --- Done --- */
  els.downloadBtn.addEventListener('click', downloadVideo);
  els.shareBtn.addEventListener('click', shareToWhatsApp);

  els.newVideoBtn.addEventListener('click', () => {
    if (!canUseToday()) { showPremium(); return; }
    cleanup();
    showScreen('home-screen');
  });

  /* --- Modals --- */
  els.premiumCloseBtn.addEventListener('click', hidePremium);
  els.upgradeBtn.addEventListener('click', () => {
    alert('Premium coming soon! 🚀');
  });
  els.errorCloseBtn.addEventListener('click', () => {
    hideError();
    showScreen('home-screen');
  });

  // Close modals on overlay click
  els.premiumModal.addEventListener('click', (e) => {
    if (e.target === els.premiumModal) hidePremium();
  });
  els.errorModal.addEventListener('click', (e) => {
    if (e.target === els.errorModal) hideError();
  });
}

/* ======================== INIT ======================== */
function init() {
  bindEvents();
  registerSW();
  showScreen('home-screen');
}

init();
