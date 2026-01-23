// ========== 维护横幗循环展示 ==========
const bannerMessages = [
  '系统正在升级维护，服务暂时不可用，敬请谅解！',
  '我们的 Cloudflare Worker 免费服务已达到请求上限，现在进行系统升级以优化性能。',
  '升级完成后，您将获得更快更稳定的访问体验。',
  '想及时了解恢复时间？欢迎加入 UNHub Wikipedia QQ 交流群：2158058819',
  '感谢您的耐心等待与支持！'
];

let currentMessageIndex = 0;

// ========== 彩带庆祝效果 ==========
let confettiTimeout;

function triggerConfetti() {
  // 防止频繁触发
  if (confettiTimeout) return;
  
  // 触发彩带效果
  if (typeof confetti !== 'undefined') {
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.2 },
      colors: ['#4f46e5', '#0891b2', '#06b6d4', '#0ea5e9', '#3b82f6']
    });
  }
  
  // 延迟后允许再次触发
  confettiTimeout = setTimeout(() => {
    confettiTimeout = null;
  }, 800);
}
const bannerTextElement = document.getElementById('banner-text');

function updateBannerText() {
  if (bannerTextElement) {
    // 移除旧的动画类
    bannerTextElement.style.animation = 'none';
    // 重新触发重排以重启动画
    void bannerTextElement.offsetHeight;
    bannerTextElement.textContent = bannerMessages[currentMessageIndex];
    bannerTextElement.style.animation = 'fadeInOut 6s ease-in-out';
    
    // 移动到下一条消息
    currentMessageIndex = (currentMessageIndex + 1) % bannerMessages.length;
  }
}

// 初始化并每6秒更新一次
updateBannerText();
setInterval(updateBannerText, 6000);

// ========== 系统维护标志 ==========
// 设置为 true 时显示维护弹窗，false 时恢复法律声明弹窗
let isUnderMaintenance = false;

// ========== 维护弹窗控制 ==========
const maintenanceModalBackdrop = document.getElementById('maintenance-modal-backdrop');

function openMaintenanceModal() {
  maintenanceModalBackdrop.classList.remove('hidden');
}

function closeMaintenanceModal() {
  // 维护中可以关闭弹窗
  maintenanceModalBackdrop.classList.add('hidden');
}

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
  // 根据 isUnderMaintenance 初始化 UI
  if (isUnderMaintenance) {
    window.enableMaintenance();
  } else {
    window.resumeService();
  }
  
  // 显示反馈弹窗
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
  // 如果系统在维护中，显示维护弹窗
  if (isUnderMaintenance) {
    openMaintenanceModal();
    return;
  }
  // 否则显示法律声明
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
  window.open('https://wikipedia.unhub.dpdns.org/', '_blank');
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

// ========== 系统维护控制函数 ==========
// 调用此函数来恢复系统（取消维护状态）
window.resumeService = function() {
  isUnderMaintenance = false;
  
  // 隐藏维护横幗
  const maintenanceBanner = document.getElementById('maintenance-banner');
  if (maintenanceBanner) {
    maintenanceBanner.style.display = 'none';
  }
  
  // 隐藏维护弹窗
  maintenanceModalBackdrop.classList.add('hidden');
  
  // 恢复按钮样式
  visitButton.className = 'tech-button bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold py-4 px-8 rounded-xl flex items-center shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300 group';
  
  // 更改按钮文字
  visitButton.innerHTML = '<svg class="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg><span class="text-lg">立即访问</span>';
  
  // 更新服务状态
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  if (statusIndicator) {
    statusIndicator.className = 'w-3 h-3 rounded-full bg-green-500 mr-3';
  }
  if (statusText) {
    statusText.textContent = '服务状态：正常运行中';
  }
};

// 调用此函数来启用维护状态
window.enableMaintenance = function() {
  isUnderMaintenance = true;
  
  // 显示维护横幗
  const maintenanceBanner = document.getElementById('maintenance-banner');
  if (maintenanceBanner) {
    maintenanceBanner.style.display = 'block';
  }
  
  // 显示维护弹窗
  openMaintenanceModal();
  
  // 更改按钮样式
  visitButton.className = 'tech-button bg-gradient-to-r from-gray-600 to-gray-500 text-white font-semibold py-4 px-8 rounded-xl flex items-center shadow-lg cursor-not-allowed opacity-60 transition-all duration-300';
  
  // 更改按钮文字
  visitButton.innerHTML = '<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span class="text-lg">系统维护中</span>';
  
  // 更新服务状态
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  if (statusIndicator) {
    statusIndicator.className = 'w-3 h-3 rounded-full bg-orange-500 mr-3';
  }
  if (statusText) {
    statusText.textContent = '服务状态：系统维护中';
  }
};
