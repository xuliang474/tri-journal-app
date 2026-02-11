const state = {
  token: localStorage.getItem('tri_token') || '',
  userId: localStorage.getItem('tri_user_id') || '',
  mode: 'free',
  authMode: 'sms',
  entryId: '',
  rawText: '',
  spans: [],
  chooserIndex: -1,
  captchaId: '',
  captchaPrompt: '',
  captchaPhone: '',
  captchaTarget: 'sms',
  captchaToken: '',
  captchaTokenPhone: '',
  authFeedbackTimer: 0,
  smsVerifyFailCount: 0,
  resetVerifyFailCount: 0
};

class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const byId = (id) => document.getElementById(id);

const ui = {
  headerStatus: byId('headerStatus'),
  logoutBtn: byId('logoutBtn'),
  tabs: [...document.querySelectorAll('.tab')],
  views: {
    login: byId('view-login'),
    write: byId('view-write'),
    garden: byId('view-garden'),
    weekly: byId('view-weekly'),
    settings: byId('view-settings')
  },
  toast: byId('toast'),
  authFeedback: byId('authFeedback'),
  authModeButtons: [...document.querySelectorAll('.auth-mode')],
  authSmsPanel: byId('authSmsPanel'),
  authPasswordPanel: byId('authPasswordPanel'),
  phoneInput: byId('phoneInput'),
  codeInput: byId('codeInput'),
  sendCodeBtn: byId('sendCodeBtn'),
  sendCodeMeta: byId('sendCodeMeta'),
  verifyCodeBtn: byId('verifyCodeBtn'),
  debugCode: byId('debugCode'),
  captchaPanel: byId('captchaPanel'),
  captchaPrompt: byId('captchaPrompt'),
  captchaAnswerInput: byId('captchaAnswerInput'),
  captchaVerifyBtn: byId('captchaVerifyBtn'),
  passwordInput: byId('passwordInput'),
  setPasswordBtn: byId('setPasswordBtn'),
  passwordPhoneInput: byId('passwordPhoneInput'),
  passwordLoginInput: byId('passwordLoginInput'),
  passwordLoginBtn: byId('passwordLoginBtn'),
  resetPhoneInput: byId('resetPhoneInput'),
  sendResetCodeBtn: byId('sendResetCodeBtn'),
  resetCodeInput: byId('resetCodeInput'),
  resetPasswordInput: byId('resetPasswordInput'),
  resetPasswordBtn: byId('resetPasswordBtn'),
  resetDebugCode: byId('resetDebugCode'),
  modeButtons: [...document.querySelectorAll('.mode')],
  guidedBox: byId('guidedBox'),
  guidedThought: byId('guidedThought'),
  guidedEmotion: byId('guidedEmotion'),
  guidedBody: byId('guidedBody'),
  composeGuidedBtn: byId('composeGuidedBtn'),
  journalInput: byId('journalInput'),
  sourceSelect: byId('sourceSelect'),
  voiceBtn: byId('voiceBtn'),
  submitJournalBtn: byId('submitJournalBtn'),
  saveSpanBtn: byId('saveSpanBtn'),
  refreshReflectionBtn: byId('refreshReflectionBtn'),
  analysisResult: byId('analysisResult'),
  reflectionCard: byId('reflectionCard'),
  labelChooser: byId('labelChooser'),
  monthInput: byId('monthInput'),
  loadGardenBtn: byId('loadGardenBtn'),
  gardenGrid: byId('gardenGrid'),
  weekInput: byId('weekInput'),
  loadWeeklyBtn: byId('loadWeeklyBtn'),
  weeklyPanel: byId('weeklyPanel'),
  reminderTimeInput: byId('reminderTimeInput'),
  reminderEnabledInput: byId('reminderEnabledInput'),
  loadReminderBtn: byId('loadReminderBtn'),
  saveReminderBtn: byId('saveReminderBtn'),
  loadEntitlementBtn: byId('loadEntitlementBtn'),
  upgradeBtn: byId('upgradeBtn'),
  entitlementBox: byId('entitlementBox')
};

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  window.setTimeout(() => ui.toast.classList.remove('show'), 1800);
}

const ERROR_CODE_MESSAGE = {
  40001: '手机号格式不正确，仅支持中国大陆手机号',
  40002: '图形验证码错误或已过期',
  40003: '密码长度需为 6-20 位',
  40004: '密码过于简单，请更换',
  40101: '验证码错误或已过期',
  40102: '手机号或密码错误',
  40103: '登录状态失效，请重新登录',
  40331: '检测到异常请求，需要先完成图形验证码',
  42311: '密码错误次数过多，账号已临时锁定 15 分钟',
  42901: '发送过于频繁，请 60 秒后重试',
  42902: '该手机号今日验证码发送次数已达上限'
};

function getErrorMessage(error) {
  if (error instanceof ApiError) {
    return ERROR_CODE_MESSAGE[error.code] || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '请求失败，请稍后重试';
}

function setAuthFeedback(message = '') {
  ui.authFeedback.textContent = message;
}

function setPasswordLoginLockState(locked, remainingClock = '') {
  const defaultText = ui.passwordLoginBtn.dataset.defaultText || ui.passwordLoginBtn.textContent;
  ui.passwordLoginBtn.dataset.defaultText = defaultText;
  ui.passwordLoginBtn.disabled = locked;
  ui.passwordLoginBtn.textContent = locked ? `锁定中 ${remainingClock}` : defaultText;
}

function stopAuthFeedbackCountdown() {
  if (!state.authFeedbackTimer) {
    setPasswordLoginLockState(false);
    return;
  }
  window.clearInterval(state.authFeedbackTimer);
  state.authFeedbackTimer = 0;
  setPasswordLoginLockState(false);
}

function formatSecondsAsClock(seconds) {
  const sec = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function startAuthFeedbackCountdown(seconds) {
  stopAuthFeedbackCountdown();
  const endAt = Date.now() + seconds * 1000;

  const tick = () => {
    const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remaining === 0) {
      stopAuthFeedbackCountdown();
      setAuthFeedback('锁定已结束，请重新尝试登录。');
      return;
    }
    const clock = formatSecondsAsClock(remaining);
    setPasswordLoginLockState(true, clock);
    setAuthFeedback(`密码尝试次数过多，请在 ${clock} 后重试`);
  };

  tick();
  state.authFeedbackTimer = window.setInterval(tick, 1000);
}

function withFailureHint(baseMessage, count) {
  return `${baseMessage}（当前连续失败 ${count} 次，连续失败过多可能触发风控）`;
}

function handleAuthError(error) {
  const message = getErrorMessage(error);
  if (error instanceof ApiError && error.code === 42311) {
    const retryAfterSec = Number(error.details?.retry_after_sec || 0);
    if (retryAfterSec > 0) {
      startAuthFeedbackCountdown(retryAfterSec);
      return message;
    }
  }

  stopAuthFeedbackCountdown();
  setAuthFeedback(message);
  return message;
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!response.ok || data.code !== 0) {
    const error = new ApiError(
      data.message || `请求失败: ${response.status}`,
      response.status,
      data.code,
      data.details || null
    );
    if (error.code === 40103) {
      clearSession();
      setAuthFeedback('登录状态失效，请重新登录');
    }
    throw error;
  }
  return data.data;
}

function setAuthUI() {
  const authed = Boolean(state.token);
  ui.headerStatus.textContent = authed ? `已登录 ${state.userId.slice(0, 12)}...` : '未登录';
  ui.logoutBtn.classList.toggle('hidden', !authed);
  ui.tabs.forEach((tab) => {
    if (tab.dataset.view === 'login') {
      return;
    }
    tab.disabled = !authed;
    tab.style.opacity = authed ? '1' : '0.45';
  });
}

function clearSession() {
  stopAuthFeedbackCountdown();
  state.token = '';
  state.userId = '';
  localStorage.removeItem('tri_token');
  localStorage.removeItem('tri_user_id');
  setAuthUI();
  switchView('login');
}

function switchView(viewName) {
  ui.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === viewName));
  Object.entries(ui.views).forEach(([name, el]) =>
    el.classList.toggle('active', name === viewName)
  );
}

function setAuthMode(mode) {
  state.authMode = mode;
  stopAuthFeedbackCountdown();
  setAuthFeedback('');
  ui.authModeButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.authMode === mode);
  });
  ui.authSmsPanel.classList.toggle('hidden', mode !== 'sms');
  ui.authPasswordPanel.classList.toggle('hidden', mode !== 'password');
}

function seedPhoneInputs(phone) {
  const value = phone.trim();
  if (!value) {
    return;
  }
  [ui.phoneInput, ui.passwordPhoneInput, ui.resetPhoneInput].forEach((input) => {
    if (!input.value.trim()) {
      input.value = value;
    }
  });
}

function clearCaptchaChallenge() {
  state.captchaId = '';
  state.captchaPrompt = '';
  state.captchaPhone = '';
  state.captchaTarget = 'sms';
  ui.captchaPrompt.textContent = '';
  ui.captchaAnswerInput.value = '';
  ui.captchaPanel.classList.add('hidden');
}

function openCaptchaChallenge(phone, target, details) {
  stopAuthFeedbackCountdown();
  state.captchaPhone = phone;
  state.captchaTarget = target;
  state.captchaId = String(details?.captcha_id || '');
  state.captchaPrompt = String(details?.captcha_prompt || '请输入算式结果');

  ui.captchaPrompt.textContent = state.captchaPrompt;
  ui.captchaAnswerInput.value = '';
  ui.captchaPanel.classList.remove('hidden');
  ui.sendCodeMeta.textContent = '请先完成图形验证码';
  setAuthFeedback('当前请求触发风控，请完成图形验证码后继续');
}

function startButtonCooldown(button, seconds, metaEl) {
  const originalLabel = button.dataset.originalLabel || button.textContent || '发送验证码';
  button.dataset.originalLabel = originalLabel;

  const currentTimer = Number(button.dataset.cooldownTimer || 0);
  if (currentTimer) {
    window.clearInterval(currentTimer);
  }

  const endAt = Date.now() + seconds * 1000;
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remaining === 0) {
      button.disabled = false;
      button.textContent = originalLabel;
      if (metaEl) {
        metaEl.textContent = '如果还没收到验证码，请稍后再试';
      }
      window.clearInterval(Number(button.dataset.cooldownTimer || 0));
      button.dataset.cooldownTimer = '';
      return;
    }

    button.disabled = true;
    button.textContent = `重发(${remaining}s)`;
    if (metaEl) {
      metaEl.textContent = `短信已发送，${remaining} 秒后可重发`;
    }
  };

  tick();
  button.dataset.cooldownTimer = String(window.setInterval(tick, 1000));
}

function labelColor(label) {
  if (label === 'emotion') return 'emotion';
  if (label === 'body') return 'body';
  return 'thought';
}

function composeGuidedToRaw() {
  const parts = [
    ui.guidedThought.value.trim(),
    ui.guidedEmotion.value.trim(),
    ui.guidedBody.value.trim()
  ].filter(Boolean);

  if (parts.length === 0) {
    showToast('引导内容为空');
    return;
  }
  ui.journalInput.value = parts.join('\n');
  showToast('已合并到正文');
}

function renderSpans() {
  const text = state.rawText;
  const spans = [...state.spans].sort((a, b) => a.start - b.start);
  ui.analysisResult.innerHTML = '';

  if (!text || spans.length === 0) {
    ui.analysisResult.textContent = '提交后将在这里显示三色标注结果。';
    return;
  }

  let cursor = 0;
  spans.forEach((span, index) => {
    if (span.start > cursor) {
      const plain = document.createElement('span');
      plain.textContent = text.slice(cursor, span.start);
      ui.analysisResult.appendChild(plain);
    }

    const seg = document.createElement('span');
    seg.textContent = text.slice(span.start, span.end);
    seg.className = `segment ${labelColor(span.label)}`;
    seg.dataset.index = String(index);
    seg.title = '点击切换标签';
    ui.analysisResult.appendChild(seg);
    cursor = span.end;
  });

  if (cursor < text.length) {
    const tail = document.createElement('span');
    tail.textContent = text.slice(cursor);
    ui.analysisResult.appendChild(tail);
  }

  ui.saveSpanBtn.disabled = false;
  ui.refreshReflectionBtn.disabled = false;
}

function renderReflection(card, safetyPrompt) {
  if (!card) {
    ui.reflectionCard.innerHTML = '';
    return;
  }

  const ratio = (value) => `${Math.round(value * 100)}%`;
  ui.reflectionCard.innerHTML = `
    <h3>当次反思卡</h3>
    <p>想法 ${ratio(card.thoughtRatio)} · 情绪 ${ratio(card.emotionRatio)} · 身体 ${ratio(card.bodyRatio)}</p>
    <div>
      <div>想法</div>
      <div class="bar"><span class="thought" style="width:${ratio(card.thoughtRatio)}"></span></div>
    </div>
    <div>
      <div>情绪</div>
      <div class="bar"><span class="emotion" style="width:${ratio(card.emotionRatio)}"></span></div>
    </div>
    <div>
      <div>身体</div>
      <div class="bar"><span class="body" style="width:${ratio(card.bodyRatio)}"></span></div>
    </div>
    <p>提问：${(card.prompts || []).join(' / ') || '记录后继续观察你的体验。'}</p>
    ${
      safetyPrompt
        ? `<p class="hint">风险提示：${safetyPrompt.message}（${(safetyPrompt.resources || []).join('；')}）</p>`
        : ''
    }
  `;
}

function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    showToast('当前浏览器不支持语音识别');
    return;
  }

  const recog = new Recognition();
  recog.lang = 'zh-CN';
  recog.interimResults = false;
  recog.maxAlternatives = 1;
  ui.voiceBtn.disabled = true;
  ui.voiceBtn.textContent = '识别中...';

  recog.onresult = (event) => {
    const text = event.results[0][0].transcript;
    ui.journalInput.value = `${ui.journalInput.value}${ui.journalInput.value ? '\n' : ''}${text}`;
    showToast('语音已转写');
  };

  recog.onerror = () => showToast('语音识别失败');
  recog.onend = () => {
    ui.voiceBtn.disabled = false;
    ui.voiceBtn.textContent = '开始语音';
  };

  recog.start();
}

function applyLoginSuccess(data, phone) {
  state.token = data.session_token;
  state.userId = data.user_id;
  state.smsVerifyFailCount = 0;
  state.resetVerifyFailCount = 0;
  localStorage.setItem('tri_token', state.token);
  localStorage.setItem('tri_user_id', state.userId);
  stopAuthFeedbackCountdown();
  seedPhoneInputs(phone);
  setAuthFeedback('');
  setAuthUI();
  switchView('write');
  showToast(data.has_password === false ? '登录成功，建议设置密码' : '登录成功');
}

async function sendSmsCode({ phone, target, debugEl, triggerButton }) {
  if (!phone) {
    const msg = '请输入手机号';
    setAuthFeedback(msg);
    showToast(msg);
    return false;
  }

  const body = { phone };
  if (state.captchaToken && state.captchaTokenPhone === phone) {
    body.captcha_token = state.captchaToken;
  }

  try {
    const data = await api('/v1/auth/sms/send', {
      method: 'POST',
      auth: false,
      body
    });

    if (debugEl) {
      debugEl.textContent = data.debugCode ? `开发验证码：${data.debugCode}` : '验证码已发送';
    }

    if (triggerButton) {
      const metaEl = triggerButton === ui.sendCodeBtn ? ui.sendCodeMeta : null;
      startButtonCooldown(triggerButton, 60, metaEl);
    }

    if (target === 'sms') {
      ui.sendCodeMeta.textContent = '验证码有效期 5 分钟';
      state.smsVerifyFailCount = 0;
    } else if (target === 'reset') {
      state.resetVerifyFailCount = 0;
    }

    state.captchaToken = '';
    state.captchaTokenPhone = '';
    clearCaptchaChallenge();
    stopAuthFeedbackCountdown();
    setAuthFeedback('');
    showToast('验证码已发送');
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === 40331) {
      openCaptchaChallenge(phone, target, error.details);
      showToast('请先完成图形验证码');
      return false;
    }
    const message = handleAuthError(error);
    showToast(message);
    return false;
  }
}

async function handleSendCode() {
  const phone = ui.phoneInput.value.trim();
  seedPhoneInputs(phone);
  await sendSmsCode({
    phone,
    target: 'sms',
    debugEl: ui.debugCode,
    triggerButton: ui.sendCodeBtn
  });
}

async function handleSendResetCode() {
  const phone = ui.resetPhoneInput.value.trim() || ui.passwordPhoneInput.value.trim();
  seedPhoneInputs(phone);
  await sendSmsCode({
    phone,
    target: 'reset',
    debugEl: ui.resetDebugCode,
    triggerButton: ui.sendResetCodeBtn
  });
}

async function handleCaptchaVerify() {
  if (!state.captchaId || !state.captchaPhone) {
    const msg = '暂无待处理的图形验证码';
    setAuthFeedback(msg);
    showToast(msg);
    return;
  }

  const answer = ui.captchaAnswerInput.value.trim();
  if (!answer) {
    const msg = '请输入图形验证码结果';
    setAuthFeedback(msg);
    showToast(msg);
    return;
  }

  try {
    const data = await api('/v1/auth/captcha/verify', {
      method: 'POST',
      auth: false,
      body: {
        phone: state.captchaPhone,
        captcha_id: state.captchaId,
        answer
      }
    });

    state.captchaToken = data.captcha_token;
    state.captchaTokenPhone = state.captchaPhone;

    const target = state.captchaTarget;
    const phone = state.captchaPhone;
    state.captchaId = '';
    ui.captchaPanel.classList.add('hidden');
    setAuthFeedback('');
    showToast('图形验证码通过，正在发送短信');

    if (target === 'reset') {
      await sendSmsCode({
        phone,
        target: 'reset',
        debugEl: ui.resetDebugCode,
        triggerButton: ui.sendResetCodeBtn
      });
      return;
    }

    await sendSmsCode({
      phone,
      target: 'sms',
      debugEl: ui.debugCode,
      triggerButton: ui.sendCodeBtn
    });
  } catch (error) {
    const message = handleAuthError(error);
    showToast(message);
  }
}

async function handleVerifyCode() {
  const phone = ui.phoneInput.value.trim();
  const code = ui.codeInput.value.trim();
  if (!phone || !code) {
    const msg = '请填写手机号和验证码';
    setAuthFeedback(msg);
    showToast(msg);
    return;
  }

  try {
    const data = await api('/v1/auth/sms/verify', {
      method: 'POST',
      auth: false,
      body: { phone, code }
    });
    state.smsVerifyFailCount = 0;
    applyLoginSuccess(data, phone);
  } catch (error) {
    let message = handleAuthError(error);
    if (error instanceof ApiError && error.code === 40101) {
      state.smsVerifyFailCount += 1;
      message = withFailureHint(message, state.smsVerifyFailCount);
      setAuthFeedback(message);
    }
    showToast(message);
  }
}

async function handlePasswordLogin() {
  const phone = ui.passwordPhoneInput.value.trim();
  const password = ui.passwordLoginInput.value;
  if (!phone || !password) {
    const msg = '请填写手机号和密码';
    setAuthFeedback(msg);
    showToast(msg);
    return;
  }

  try {
    const data = await api('/v1/auth/password/login', {
      method: 'POST',
      auth: false,
      body: { phone, password }
    });
    stopAuthFeedbackCountdown();
    applyLoginSuccess(data, phone);
  } catch (error) {
    const message = handleAuthError(error);
    showToast(message);
  }
}

async function handleSetPassword() {
  if (!state.token) {
    const msg = '请先登录';
    setAuthFeedback(msg);
    showToast(msg);
    return;
  }

  try {
    await api('/v1/auth/password/set', {
      method: 'POST',
      body: { password: ui.passwordInput.value }
    });
    setAuthFeedback('');
    showToast('密码设置成功');
  } catch (error) {
    const message = handleAuthError(error);
    showToast(message);
  }
}

async function handleResetPassword() {
  const phone = ui.resetPhoneInput.value.trim();
  const code = ui.resetCodeInput.value.trim();
  const newPassword = ui.resetPasswordInput.value;
  if (!phone || !code || !newPassword) {
    const msg = '请填写重置所需信息';
    setAuthFeedback(msg);
    showToast(msg);
    return;
  }

  try {
    await api('/v1/auth/password/reset', {
      method: 'POST',
      auth: false,
      body: {
        phone,
        code,
        new_password: newPassword
      }
    });
    state.resetVerifyFailCount = 0;
    setAuthMode('password');
    ui.passwordPhoneInput.value = phone;
    ui.passwordLoginInput.value = '';
    setAuthFeedback('重置成功，请使用新密码登录');
    showToast('密码重置成功，请使用新密码登录');
  } catch (error) {
    let message = handleAuthError(error);
    if (error instanceof ApiError && error.code === 40101) {
      state.resetVerifyFailCount += 1;
      message = withFailureHint(message, state.resetVerifyFailCount);
      setAuthFeedback(message);
    }
    showToast(message);
  }
}

async function handleSubmitJournal() {
  if (!state.token) {
    showToast('请先登录');
    return;
  }

  const rawText = ui.journalInput.value.trim();
  if (!rawText) {
    showToast('请先填写正文');
    return;
  }

  try {
    const entry = await api('/v1/journals', {
      method: 'POST',
      body: {
        mode: state.mode,
        source: ui.sourceSelect.value,
        raw_text: rawText
      }
    });

    state.entryId = entry.id;
    state.rawText = rawText;

    const analyzed = await api(`/v1/journals/${state.entryId}/analyze`, {
      method: 'POST',
      body: {}
    });

    state.spans = analyzed.spans;
    renderSpans();
    renderReflection(analyzed.reflection, analyzed.safety_prompt);
    showToast('分析完成，可点击短语修改分类');
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function handleSaveSpans() {
  if (!state.entryId || state.spans.length === 0) {
    showToast('暂无可保存的分类');
    return;
  }
  try {
    state.spans = await api(`/v1/journals/${state.entryId}/spans`, {
      method: 'PATCH',
      body: {
        spans: state.spans.map((span) => ({
          start: span.start,
          end: span.end,
          label: span.label
        }))
      }
    });
    renderSpans();
    showToast('分类已保存');
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function handleRefreshReflection() {
  if (!state.entryId) {
    showToast('请先分析一篇日记');
    return;
  }
  try {
    const reflection = await api(`/v1/journals/${state.entryId}/reflection`);
    renderReflection(reflection, null);
    showToast('反思卡已更新');
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

function renderGarden(month, days) {
  const [year, monthNum] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNum - 1, 1).getDay();
  ui.gardenGrid.innerHTML = '';

  for (let i = 0; i < firstDay; i += 1) {
    const blank = document.createElement('div');
    blank.className = 'day-cell';
    blank.style.visibility = 'hidden';
    ui.gardenGrid.appendChild(blank);
  }

  days.forEach((day) => {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = day.date.slice(-2);
    cell.appendChild(date);

    if (day.hasEntry) {
      const bloom = document.createElement('div');
      bloom.className = `bloom ${labelColor(day.dominantLabel)}`;
      bloom.title = `想法 ${Math.round((day.ratioSnapshot?.thought || 0) * 100)}% · 情绪 ${Math.round((day.ratioSnapshot?.emotion || 0) * 100)}% · 身体 ${Math.round((day.ratioSnapshot?.body || 0) * 100)}%`;
      cell.appendChild(bloom);
    }
    ui.gardenGrid.appendChild(cell);
  });
}

async function handleLoadGarden() {
  try {
    const month = ui.monthInput.value;
    if (!month) {
      showToast('请选择月份');
      return;
    }
    const data = await api(`/v1/calendar/garden?month=${month}`);
    renderGarden(data.month, data.days || []);
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function handleLoadWeekly() {
  try {
    const weekStart = ui.weekInput.value;
    if (!weekStart) {
      showToast('请选择日期');
      return;
    }
    const data = await api(`/v1/reports/weekly?week_start=${weekStart}`);

    const ratio = data.ratios || { thought: 0, emotion: 0, body: 0 };
    const topics = (data.recurringTopics || [])
      .map((topic) => `<li>${topic.topic}：${topic.count} 次</li>`)
      .join('');

    ui.weeklyPanel.innerHTML = `
      <div>周起始：${data.weekStart}</div>
      <div>想法 ${Math.round(ratio.thought * 100)}%</div>
      <div class="bar"><span class="thought" style="width:${Math.round(ratio.thought * 100)}%"></span></div>
      <div>情绪 ${Math.round(ratio.emotion * 100)}%</div>
      <div class="bar"><span class="emotion" style="width:${Math.round(ratio.emotion * 100)}%"></span></div>
      <div>身体 ${Math.round(ratio.body * 100)}%</div>
      <div class="bar"><span class="body" style="width:${Math.round(ratio.body * 100)}%"></span></div>
      <div>重复主题：</div>
      <ul>${topics || '<li>暂无高频主题</li>'}</ul>
      <p>本周问题：${data.question || '继续记录，形成你的模式线索。'}</p>
    `;
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function handleLoadReminder() {
  try {
    const data = await api('/v1/reminders/settings');
    ui.reminderEnabledInput.checked = data.enabled;
    ui.reminderTimeInput.value = data.time;
    showToast('已读取提醒设置');
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function handleSaveReminder() {
  try {
    await api('/v1/reminders/settings', {
      method: 'PATCH',
      body: {
        enabled: ui.reminderEnabledInput.checked,
        time: ui.reminderTimeInput.value
      }
    });
    showToast('提醒设置已保存');
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function handleLoadEntitlement() {
  try {
    const data = await api('/v1/billing/entitlement');
    ui.entitlementBox.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

async function handleUpgrade() {
  try {
    const data = await api('/v1/billing/receipt/verify', {
      method: 'POST',
      body: { receipt_data: `receipt_${Date.now()}` }
    });
    ui.entitlementBox.textContent = JSON.stringify(data, null, 2);
    showToast('已模拟升级订阅');
  } catch (error) {
    showToast(getErrorMessage(error));
  }
}

function showChooser(index, x, y) {
  state.chooserIndex = index;
  ui.labelChooser.innerHTML = '';

  ['thought', 'emotion', 'body'].forEach((label) => {
    const btn = document.createElement('button');
    btn.className = labelColor(label);
    btn.textContent = label === 'thought' ? '想法' : label === 'emotion' ? '情绪' : '身体';
    btn.onclick = () => {
      state.spans[index].label = label;
      ui.labelChooser.classList.add('hidden');
      renderSpans();
    };
    ui.labelChooser.appendChild(btn);
  });

  ui.labelChooser.style.left = `${x}px`;
  ui.labelChooser.style.top = `${y}px`;
  ui.labelChooser.classList.remove('hidden');
}

function bindEnterSubmit(input, handler) {
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    handler();
  });
}

function bindEvents() {
  ui.logoutBtn.addEventListener('click', () => {
    clearSession();
    setAuthFeedback('');
    showToast('已退出登录');
  });

  ui.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      if (!state.token && view !== 'login') {
        showToast('请先登录');
        return;
      }
      switchView(view);
    });
  });

  ui.authModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setAuthMode(button.dataset.authMode || 'sms');
    });
  });

  [ui.phoneInput, ui.passwordPhoneInput, ui.resetPhoneInput].forEach((input) => {
    input.addEventListener('blur', () => seedPhoneInputs(input.value));
  });

  ui.modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      ui.modeButtons.forEach((item) => item.classList.toggle('active', item === btn));
      ui.guidedBox.classList.toggle('hidden', state.mode !== 'guided');
    });
  });

  ui.composeGuidedBtn.addEventListener('click', composeGuidedToRaw);
  ui.sendCodeBtn.addEventListener('click', handleSendCode);
  ui.verifyCodeBtn.addEventListener('click', handleVerifyCode);
  ui.captchaVerifyBtn.addEventListener('click', handleCaptchaVerify);
  ui.passwordLoginBtn.addEventListener('click', handlePasswordLogin);
  ui.sendResetCodeBtn.addEventListener('click', handleSendResetCode);
  ui.resetPasswordBtn.addEventListener('click', handleResetPassword);
  ui.setPasswordBtn.addEventListener('click', handleSetPassword);
  ui.voiceBtn.addEventListener('click', startVoice);
  ui.submitJournalBtn.addEventListener('click', handleSubmitJournal);
  ui.saveSpanBtn.addEventListener('click', handleSaveSpans);
  ui.refreshReflectionBtn.addEventListener('click', handleRefreshReflection);
  ui.loadGardenBtn.addEventListener('click', handleLoadGarden);
  ui.loadWeeklyBtn.addEventListener('click', handleLoadWeekly);
  ui.loadReminderBtn.addEventListener('click', handleLoadReminder);
  ui.saveReminderBtn.addEventListener('click', handleSaveReminder);
  ui.loadEntitlementBtn.addEventListener('click', handleLoadEntitlement);
  ui.upgradeBtn.addEventListener('click', handleUpgrade);

  bindEnterSubmit(ui.phoneInput, handleSendCode);
  bindEnterSubmit(ui.codeInput, handleVerifyCode);
  bindEnterSubmit(ui.captchaAnswerInput, handleCaptchaVerify);
  bindEnterSubmit(ui.passwordPhoneInput, handlePasswordLogin);
  bindEnterSubmit(ui.passwordLoginInput, handlePasswordLogin);
  bindEnterSubmit(ui.resetPhoneInput, handleSendResetCode);
  bindEnterSubmit(ui.resetCodeInput, handleResetPassword);
  bindEnterSubmit(ui.resetPasswordInput, handleResetPassword);
  bindEnterSubmit(ui.passwordInput, handleSetPassword);

  ui.analysisResult.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('segment')) {
      ui.labelChooser.classList.add('hidden');
      return;
    }

    const index = Number(target.dataset.index);
    const rect = target.getBoundingClientRect();
    showChooser(index, rect.left + window.scrollX, rect.bottom + window.scrollY + 8);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (!target.closest('.chooser') && !target.closest('.segment')) {
      ui.labelChooser.classList.add('hidden');
    }
  });
}

function initDefaults() {
  const now = new Date();
  ui.monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const day = now.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + offset);
  ui.weekInput.value = weekStart.toISOString().slice(0, 10);

  setAuthMode(state.authMode);
  setAuthFeedback('');
  setPasswordLoginLockState(false);
  setAuthUI();
  switchView(state.token ? 'write' : 'login');
  renderSpans();
}

bindEvents();
initDefaults();
