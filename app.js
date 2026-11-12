// Raha PWA v3 — safer IndexedDB handling, with existing data preserved.
const form = document.getElementById('chatForm');
const input = document.getElementById('prompt');
const messages = document.getElementById('messages');
const welcome = document.getElementById('welcome');
const statusEl = document.getElementById('memoryStatus');
const DB_NAME = 'raha_local_memory';
const DB_VERSION = 2;
const STORE_NAME = 'messages';

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('این مرورگر IndexedDB را پشتیبانی نمی‌کند.'));
      return;
    }

    let settled = false;
    let blockedTimer;
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(blockedTimer);
      fn(value);
    };

    const timeout = setTimeout(() => {
      finish(reject, new Error('بازکردن حافظه بیش از ۱۵ ثانیه طول کشید. همهٔ پنجره‌های رها را ببند و دوباره امتحان کن.'));
    }, 15000);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onblocked = () => {
      setStatus('یک نسخهٔ قدیمی رها هنوز حافظه را باز نگه داشته؛ همهٔ پنجره‌های رها را ببند.');
      blockedTimer = setTimeout(() => {
        finish(reject, new Error('درخواست حافظه توسط یک پنجرهٔ قدیمی مسدود شده است.'));
      }, 10000);
    };

    request.onerror = () => finish(reject, request.error || new Error('خطا در بازکردن حافظه.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        finish(reject, new Error('ساختار حافظه کامل نیست؛ جدول پیام‌ها پیدا نشد.'));
        return;
      }
      finish(resolve, db);
    };
  });
}

async function allMessages() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let result = [];
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => { result = request.result || []; };
    request.onerror = () => reject(request.error || new Error('خواندن پیام‌ها ناموفق بود.'));
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { const err = tx.error || new Error('تراکنش خواندن ناموفق بود.'); db.close(); reject(err); };
    tx.onabort = () => { const err = tx.error || new Error('تراکنش خواندن لغو شد.'); db.close(); reject(err); };
  });
}

async function saveMessage(role, text) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ role, text, createdAt: new Date().toISOString() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const err = tx.error || new Error('ذخیرهٔ پیام ناموفق بود.'); db.close(); reject(err); };
    tx.onabort = () => { const err = tx.error || new Error('ذخیرهٔ پیام لغو شد.'); db.close(); reject(err); };
  });
}

function bubble(text, role) {
  const el = document.createElement('div');
  el.className = 'bubble ' + role;
  el.textContent = text;
  messages.appendChild(el);
}

async function refresh() {
  setStatus('در حال خواندن حافظه...');
  const items = await allMessages();
  messages.innerHTML = '';
  welcome.style.display = items.length ? 'none' : 'block';
  items.forEach(item => bubble(item.text, item.role));
  setStatus(`${items.length} پیام در این مرورگر ذخیره شده`);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  input.disabled = true;
  try {
    await saveMessage('user', value);
    await saveMessage('assistant', 'پیامت را ذخیره کردم. اتصال مدل هوش مصنوعی هنوز در مرحلهٔ بعد اضافه می‌شود.');
    await refresh();
  } catch (error) {
    setStatus('خطای حافظه: ' + (error.message || 'خطای ناشناخته'));
    alert('پیام ذخیره نشد: ' + (error.message || 'خطای ناشناخته'));
  } finally {
    input.disabled = false;
    input.focus();
  }
});

input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    const data = {
      format: 'raha-backup-v1',
      exportedAt: new Date().toISOString(),
      messages: await allMessages()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'raha-backup.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${data.messages.length} پیام آمادهٔ پشتیبان‌گیری است`);
  } catch (error) {
    setStatus('خطای پشتیبان‌گیری: ' + (error.message || 'خطای ناشناخته'));
  }
});

document.getElementById('importFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== 'raha-backup-v1' || !Array.isArray(data.messages)) {
      throw new Error('ساختار فایل پشتیبان معتبر نیست.');
    }
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      data.messages.forEach(item => {
        if (item && typeof item.text === 'string' && ['user', 'assistant'].includes(item.role)) {
          store.add({
            role: item.role,
            text: item.text,
            createdAt: item.createdAt || new Date().toISOString()
          });
        }
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { const err = tx.error || new Error('بازیابی ناموفق بود.'); db.close(); reject(err); };
      tx.onabort = () => { const err = tx.error || new Error('بازیابی لغو شد.'); db.close(); reject(err); };
    });
    await refresh();
    alert('نسخهٔ پشتیبان بازیابی شد.');
  } catch (error) {
    setStatus('خطای بازیابی: ' + (error.message || 'خطای ناشناخته'));
    alert('بازیابی انجام نشد: ' + (error.message || 'خطای ناشناخته'));
  } finally {
    event.target.value = '';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      setStatus('حافظه فعال است؛ به‌روزرسانی برنامه ناموفق بود.');
    });
  });
}

refresh().catch(error => {
  setStatus('حافظه آماده نشد: ' + (error.message || 'خطای ناشناخته'));
});
