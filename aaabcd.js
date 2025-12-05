// ========== 反馈弹窗（自动弹出） ==========
const feedbackBackdrop = document.getElementById('feedback-modal-backdrop');
const feedbackModal = document.getElementById('feedback-modal');

function openFeedbackModal() {
  feedbackBackdrop.classList.remove('hidden');
  setTimeout(() => {
    feedbackModal.classList.remove('scale-95', 'opacity-0');
    feedbackModal.classList.add('scale-100', 'opacity-100');
  }, 50);
}

function closeFeedbackModal() {
  feedbackModal.classList.remove('scale-100', 'opacity-100');
  feedbackModal.classList.add('scale-95', 'opacity-0');
  setTimeout(() => {
    feedbackBackdrop.classList.add('hidden');
  }, 300);
}

window.addEventListener('load', () => {
  setTimeout(() => {
    if (feedbackBackdrop.classList.contains('hidden')) {
      openFeedbackModal();
    }
  }, 1000);
});

// ========== 法律声明 + Turnstile 验证弹窗 ==========
const visitButton = document.getElementById('visit-btn');
const disclaimerBackdrop = document.getElementById('disclaimer-modal-backdrop');
const disclaimerInput = document.getElementById('disclaimer-input');
const confirmButton = document.getElementById('confirm-btn');
const turnstileContainer = document.getElementById('turnstile-container');

// 你的 Turnstile Site Key
const TURNSTILE_SITE_KEY = "0x4AAAAAACE3oo6ALuG1WHSf";

visitButton.addEventListener('click', () => {
  disclaimerBackdrop.classList.remove('hidden');
});

disclaimerInput.addEventListener('input', () => {
  confirmButton.disabled = disclaimerInput.value.trim() !== '我明白法律风险，我自愿承担一切后果';
});

// 显示 Turnstile 验证器
function showTurnstile() {
  if (disclaimerInput.value.trim() !== '我明白法律风险，我自愿承担一切后果') return;

  // 显示 Turnstile 容器
  turnstileContainer.classList.remove('hidden');

  // 渲染 Turnstile 验证器
  turnstile.render('#cf-turnstile', {
    sitekey: TURNSTILE_SITE_KEY,
    theme: 'light',
    callback: function(token) {
      // 验证成功，执行跳转
      proceedToWikipedia(token);
    },
    'error-callback': function(error) {
      console.error("Turnstile 验证失败:", error);
      alert("人机验证失败，请重试。");
      // 可选：重置 Turnstile
      turnstile.reset('#cf-turnstile');
    }
  });

  // 隐藏“继续访问”按钮，避免重复点击
  confirmButton.style.display = 'none';
}

// 执行跳转（带验证 Token）
function proceedToWikipedia(token) {
  // 这里你可以选择将 token 发送到后端进行二次验证（更安全）
  // 但作为个人项目，前端验证通常已足够
  window.open('https://wikipedia.zyhorg.ac.cn/', '_blank');
  closeDisclaimerModal();
}

function closeDisclaimerModal() {
  disclaimerBackdrop.classList.add('hidden');
  disclaimerInput.value = '';
  confirmButton.disabled = true;
  confirmButton.style.display = 'block'; // 重新显示按钮
  turnstileContainer.classList.add('hidden'); // 隐藏验证器
  // 重置 Turnstile
  try {
    turnstile.reset('#cf-turnstile');
  } catch(e) {}
}
