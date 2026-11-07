let workers = [];
let running = false;
let wakeLock = null;
let startTime = null;
let CORES = navigator.hardwareConcurrency || 4; // 自動偵測核心數（僅供參考，不一定準確）
const BATCH_MS = 200; // 每批次緊密運算的時間片段（可調整）

function log(msg) {
  const el = document.getElementById('log');
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + el.textContent;
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      log('Wake Lock 已啟用');
    } else {
      log('此瀏覽器不支援 Wake Lock API');
    }
  } catch (err) {
    log(`Wake Lock 請求失敗: ${err.message}`);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (running && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
});

function start() {
  if (running) return;

  // 讀取使用者手動指定的 Worker 數量（如果有填的話）
  const manualInput = document.getElementById('workerCount');
  const manualValue = parseInt(manualInput.value, 10);
  if (manualValue && manualValue > 0) {
    CORES = manualValue;
  }

  running = true;
  startTime = Date.now();

  const workerCode = `
    let running = true;
    let ops = 0;
    self.onmessage = (e) => { if (e.data === 'stop') running = false; };

    function isPrime(n) {
      if (n < 2) return false;
      for (let i = 2; i * i <= n; i++) {
        if (n % i === 0) return false;
      }
      return true;
    }

    function burnBatch() {
      const batchEnd = Date.now() + ${BATCH_MS};
      while (Date.now() < batchEnd) {
        const n = Math.floor(Math.random() * 2000000) + 2;
        isPrime(n);
        ops++;
      }
      if (running) {
        setTimeout(burnBatch, 0);
      }
    }

    setInterval(() => {
      self.postMessage({ ops });
      ops = 0;
    }, 1000);

    burnBatch();
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);

  let opsPerCore = new Array(CORES).fill(0);

  for (let i = 0; i < CORES; i++) {
    const w = new Worker(workerUrl);
    const idx = i;
    w.onmessage = (e) => {
      opsPerCore[idx] = e.data.ops;
      updateStats(opsPerCore);
    };
    workers.push(w);
  }

  requestWakeLock();
  log(`壓力測試開始，使用 ${CORES} 個 Worker，批次時間 ${BATCH_MS}ms`);
}

function updateStats(opsPerCore) {
  const totalOps = opsPerCore.reduce((a, b) => a + b, 0);
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
  document.getElementById('stats').textContent =
    `執行時間: ${elapsedSec}s | 總運算次數/秒: ${totalOps} | Worker 數: ${CORES}`;
}

async function stop() {
  running = false;
  workers.forEach(w => { w.postMessage('stop'); w.terminate(); });
  workers = [];
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
  log('壓力測試已手動停止');
}

window.addEventListener('beforeunload', (e) => {
  if (running) {
    e.preventDefault();
    e.returnValue = '';
  }
});