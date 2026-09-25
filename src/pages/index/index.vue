<script setup>
import {computed, nextTick, onMounted, onUnmounted, onUpdated, reactive, ref, watch} from 'vue';
import {createState, createWorkbench} from '../../workbench.js';

const state = reactive(createState());
const user = ref(null), supportStaff = ref(false), ready = ref(false), sessionError = ref(''), mode = ref('');
const email = ref(''), code = ref(''), authError = ref(''), authHint = ref(''), authBusy = ref(false), remaining = ref(0);
const query = ref(''), status = ref('open'), mobileDetail = ref(false), messageEnd = ref('');
let pollTimer, countdown, searchTimer, sessionVersion = 0, polling = false, lastSessionCheck = 0, disposed = false;
const isVisible = () => document.visibilityState === 'visible';
const workbench = createWorkbench(api, state, isVisible, nextTick);
const selectedId = computed(() => state.selected?.id);
const draft = computed({get: () => state.drafts[selectedId.value] || '', set: value => { if (selectedId.value) state.drafts[selectedId.value] = value; }});
const pending = computed(() => state.pending[selectedId.value]);
const canSend = computed(() => state.selected?.status === 'open' && draft.value.trim() && draft.value.trim().length <= 2000 && !pending.value?.busy);
const connection = computed(() => state.error || state.listError ? '连接需重试' : '会话自动更新');

async function api(path, body, account) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...(account ? {'X-Sync-Account': account} : {})},
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data;
    try { data = await response.json(); }
    catch { throw Error('服务暂时不可用，请稍后重试。'); }
    if (!response.ok) {
      if (account && account === state.account && [401, 403].includes(response.status)) {
        workbench.setAccount(''); supportStaff.value = false; void loadSession();
      }
      throw Error(data.error || '请求失败，请重试');
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw Error('连接超时，请重试。未发送的内容已保留。');
    if (error instanceof TypeError) throw Error('网络未连接，正在等待恢复。');
    throw error;
  } finally { clearTimeout(timeout); }
}
async function loadSession() {
  const version = ++sessionVersion;
  try {
    const data = await api('/api/session');
    if (version !== sessionVersion || disposed) return;
    user.value = data.user; supportStaff.value = data.supportStaff === true; mode.value = data.mode;
    const account = supportStaff.value ? data.user?.email || '' : '';
    if (state.account !== account) { workbench.setAccount(account); mobileDetail.value = false; }
    sessionError.value = ''; lastSessionCheck = Date.now();
  } catch (error) {
    if (version === sessionVersion) sessionError.value = error.message;
  } finally { if (version === sessionVersion) ready.value = true; }
}
async function requestCode() {
  const destination = email.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) { authError.value = '请填写有效的邮箱地址'; return; }
  authBusy.value = true; authError.value = '';
  try {
    const data = await api('/api/auth/request', {email: destination});
    authHint.value = data.devCode ? `开发验证码：${data.devCode}（未发送邮件）` : `验证码已发送至 ${destination}，5 分钟内有效。`;
    remaining.value = 60; clearInterval(countdown);
    countdown = setInterval(() => { if (--remaining.value <= 0) clearInterval(countdown); }, 1000);
  } catch (error) { authError.value = error.message; }
  finally { authBusy.value = false; }
}
async function login() {
  if (!/^[0-9]{6}$/.test(code.value)) { authError.value = '请输入 6 位验证码'; return; }
  authBusy.value = true; authError.value = '';
  try {
    await api('/api/auth/verify', {email: email.value.trim().toLowerCase(), code: code.value});
    code.value = ''; await loadSession(); await poll();
  } catch (error) { authError.value = error.message; }
  finally { authBusy.value = false; }
}
async function logout() {
  authBusy.value = true; sessionVersion++; workbench.setAccount(''); supportStaff.value = false;
  try { await api('/api/auth/logout', {}); user.value = null; authHint.value = ''; localStorage.setItem('huihui-session-changed', String(Date.now())); }
  catch (error) { sessionError.value = error.message; await loadSession(); }
  finally { authBusy.value = false; }
}
async function poll() {
  if (polling || !isVisible() || disposed) return;
  polling = true;
  try {
    if (Date.now() - lastSessionCheck > 30000) await loadSession();
    if (supportStaff.value && state.account) await Promise.all([workbench.refreshThreads(query.value, status.value), workbench.refreshMessages()]);
  } finally { polling = false; }
}
async function openThread(thread) { mobileDetail.value = true; await workbench.select({...thread}); }
function backToList() { mobileDetail.value = false; void workbench.select(null); }
async function send() { await workbench.send(); if (supportStaff.value) await workbench.refreshThreads(query.value, status.value); }
function closeThread() {
  uni.showModal({title: '结束本次会话？', content: '结束后暂不能回复。用户再次转人工时，会话将重新开启。', confirmText: '结束会话', cancelText: '继续接待', confirmColor: '#70508f', success: async result => {
    if (result.confirm) { await workbench.close(); await workbench.refreshThreads(query.value, status.value); }
  }});
}
function onComposerKey(event) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); if (canSend.value) void send(); } }
function formatTime(value, full = false) {
  if (!value) return '';
  const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', full ? {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'} : {hour: '2-digit', minute: '2-digit'});
}
const initials = address => (address || '?').slice(0, 1).toUpperCase();
function labelNativeInputs() {
  document.querySelectorAll('uni-input[aria-label], uni-textarea[aria-label]').forEach(wrapper => {
    const input = wrapper.querySelector('input, textarea');
    if (input) input.setAttribute('aria-label', wrapper.getAttribute('aria-label'));
  });
  document.querySelectorAll('uni-button[role="button"]').forEach(button => {
    button.setAttribute('aria-disabled', String(button.hasAttribute('disabled')));
  });
}
onUpdated(labelNativeInputs);
function visibilityChanged() { if (isVisible()) { lastSessionCheck = 0; void poll(); } }
function accountChanged(event) { if (event.key === 'huihui-session-changed') { workbench.setAccount(''); supportStaff.value = false; void loadSession().then(poll); } }
watch([query, status], () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { if (supportStaff.value) void workbench.refreshThreads(query.value, status.value); }, 250); });
watch(email, () => { code.value = ''; authError.value = ''; authHint.value = ''; });
watch(() => state.messages.at(-1)?.id, async () => { messageEnd.value = ''; await nextTick(); messageEnd.value = 'message-end'; });
onMounted(async () => {
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('storage', accountChanged);
  await loadSession(); await poll();
  pollTimer = setInterval(poll, 2000);
});
onUnmounted(() => {
  disposed = true; sessionVersion++; workbench.setAccount('');
  clearInterval(pollTimer); clearInterval(countdown); clearTimeout(searchTimer);
  document.removeEventListener('visibilitychange', visibilityChanged); window.removeEventListener('storage', accountChanged);
});
</script>

<template>
  <view v-if="!ready" class="loading-screen"><view class="brand-mark">辉</view><text>正在连接客服工作台…</text></view>
  <view v-else-if="!user" class="auth-screen">
    <view class="auth-story">
      <view class="brand"><view class="brand-mark">辉</view><view><text class="brand-name">辉辉</text><text class="brand-caption">客服工作台</text></view></view>
      <view class="story-copy"><text class="story-title">让每一个问题，<br/>都有回应。</text><text class="story-description">从一声你好开始。<br/>在这里，接住用户的疑问与期待。</text></view>
      <view class="story-bottom"><view class="tiny-line"></view><text>艳の辉 · 人工客服</text></view>
    </view>
    <view class="auth-main"><view class="auth-form">
      <text class="section-title">登录工作台</text><text class="muted auth-description">使用已授权的客服邮箱，继续接待会话。</text>
      <text class="field-label">邮箱地址</text><input v-model="email" class="field" :maxlength="254" placeholder="请输入客服邮箱" aria-label="邮箱地址" :disabled="authBusy"/>
      <text class="field-label">验证码</text><view class="code-row"><input v-model="code" class="field" type="text" inputmode="numeric" :maxlength="6" placeholder="6 位验证码" aria-label="验证码" @confirm="login"/><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="secondary code-button" :disabled="authBusy || remaining > 0 || mode === 'unavailable'" @click="requestCode">{{ remaining ? `${remaining} 秒后重发` : '获取验证码' }}</button></view>
      <text v-if="authHint" class="hint">{{ authHint }}</text><text v-else class="hint">验证码有效期为 5 分钟，请勿向他人透露。</text>
      <text v-if="authError || sessionError || mode === 'unavailable'" class="error" role="alert">{{ authError || sessionError || '邮箱服务暂不可用，请稍后重试。' }}</text>
      <button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="primary login-button" :disabled="authBusy || mode === 'unavailable'" @click="login">{{ authBusy ? '正在处理…' : '登录工作台' }}</button>
      <text class="auth-note">仅供客服人员使用。会话内容请妥善保管。</text>
    </view></view>
  </view>
  <view v-else-if="!supportStaff" class="access-screen"><view class="access-panel"><view class="brand-mark">辉</view><text class="section-title">当前账号没有客服权限</text><text class="muted">{{ user.email }}</text><text class="access-description">请使用已授权的客服邮箱登录。需要开通权限时，请联系管理员。</text><text v-if="sessionError" class="error" role="alert">{{ sessionError }}</text><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="primary" :disabled="authBusy" @click="logout">退出并切换账号</button><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="text-button" @click="loadSession">重新检查权限</button></view></view>
  <view v-else class="workbench" :class="{'show-detail': mobileDetail}">
    <view class="topbar"><view class="brand"><view class="brand-mark">辉</view><view><text class="brand-name">辉辉</text><text class="brand-caption">客服工作台</text></view></view><view class="account"><view class="connection"><view class="status-dot" :class="{'is-offline': state.error || state.listError}"></view><text>{{ connection }}</text></view><text class="account-email">{{ user.email }}</text><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="text-button logout" :disabled="authBusy" @click="logout">退出</button></view></view>
    <view class="workspace">
      <view class="inbox">
        <view class="inbox-heading"><view><text class="section-title">会话</text><text class="muted">每一条消息，都值得认真回应</text></view><view class="inbox-count">{{ state.threads.length }}</view></view>
        <view class="search-wrap"><text class="search-icon" aria-hidden="true"></text><input v-model="query" class="search-input" placeholder="搜索用户邮箱" aria-label="搜索用户邮箱" :maxlength="254"/><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" v-if="query" class="search-clear" aria-label="清空搜索" @click="query = ''">×</button></view>
        <view class="tabs"><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="tab" :class="{active: status === 'open'}" :aria-pressed="status === 'open'" @click="status = 'open'">接待中</button><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="tab" :class="{active: status === 'closed'}" :aria-pressed="status === 'closed'" @click="status = 'closed'">已结束</button></view>
        <view v-if="state.listError" class="list-error" role="alert"><text>{{ state.listError }}</text><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="text-button" @click="poll">重试</button></view>
        <scroll-view scroll-y class="thread-list">
          <button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" v-for="thread in state.threads" :key="thread.id" class="thread" :class="{selected: selectedId === thread.id}" :aria-pressed="selectedId === thread.id" @click="openThread(thread)">
            <view class="avatar">{{ initials(thread.email) }}</view><view class="thread-content"><view class="thread-top"><text class="thread-email">{{ thread.email }}</text><text class="thread-time">{{ formatTime(thread.updatedAt) }}</text></view><view class="thread-preview"><text>{{ thread.lastText || '用户已转人工，等待你的回复' }}</text><view v-if="thread.unread" class="unread">{{ thread.unread > 99 ? '99+' : thread.unread }}</view></view></view>
          </button>
          <view v-if="!state.threads.length" class="empty-list"><text class="empty-title">{{ state.listLoading ? '正在获取会话…' : query ? '没有找到相关会话' : status === 'open' ? '暂时没有待接待的会话' : '还没有已结束的会话' }}</text><text class="muted">{{ query ? '试试完整邮箱或其他关键词' : '用户发起人工咨询后，会话会出现在这里。' }}</text></view>
        </scroll-view>
        <view class="inbox-footer"><text>显示最近 200 个会话，更早记录请搜索邮箱。</text></view>
      </view>
      <view class="conversation">
        <template v-if="state.selected">
          <view class="conversation-header"><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="back-button text-button" @click="backToList">‹ 会话</button><view class="avatar header-avatar">{{ initials(state.selected.email) }}</view><view class="conversation-person"><text class="person-email">{{ state.selected.email }}</text><text class="conversation-status">{{ state.selected.status === 'open' ? '接待中' : '会话已结束' }}<text class="status-separator">·</text>人工客服</text></view><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" v-if="state.selected.status === 'open'" class="secondary close-button" :disabled="state.closing || pending?.busy" @click="closeThread">{{ state.closing ? '正在结束…' : '结束会话' }}</button></view>
          <scroll-view scroll-y class="messages" :scroll-into-view="messageEnd" :scroll-with-animation="false"><view class="conversation-intro"><text>与 {{ state.selected.email }} 的人工会话</text><text>仅展示人工客服消息</text></view><view v-if="state.loading && !state.messages.length" class="message-hint">正在加载消息…</view><view v-else-if="!state.messages.length" class="message-hint">用户已进入会话，发一句问候吧。</view>
            <view v-for="message in state.messages" :id="`message-${message.id}`" :key="message.id" class="message-row" :class="{'from-staff': message.role === 'staff'}"><view class="message-avatar" :class="{'staff-avatar': message.role === 'staff'}">{{ message.role === 'staff' ? '辉' : initials(state.selected.email) }}</view><view class="message-content"><view class="message-meta"><text>{{ message.role === 'staff' ? '客服' : '用户' }}</text><text>{{ formatTime(message.createdAt, true) }}</text></view><view class="message-bubble"><text selectable>{{ message.text }}</text></view></view></view><view id="message-end" class="message-end"></view>
          </scroll-view>
          <view v-if="state.error || sessionError" class="conversation-error" role="alert"><text>{{ state.error || sessionError }}{{ pending && !pending.busy ? ' 点击“重试发送”继续发送原消息。' : '' }}</text><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="text-button" @click="poll">刷新</button></view>
          <view v-if="state.selected.status === 'closed'" class="closed-note"><text>本次会话已结束</text><text class="muted">用户再次转人工后，你可以继续回复。</text></view>
          <view v-else class="composer"><view class="composer-label"><text>回复用户</text><text class="muted">{{ pending ? '原消息确认前暂不可修改' : '清晰、耐心地回答每一个问题' }}</text></view><textarea v-model="draft" class="composer-input" :maxlength="2000" :disabled="!!pending" placeholder="输入回复内容…" aria-label="回复内容" :auto-height="false" :show-confirm-bar="false" @keydown="onComposerKey"/><view class="composer-bottom"><text class="composer-tip">Ctrl / ⌘ + Enter 发送</text><view class="send-actions"><text class="character-count">{{ draft.length }} / 2000</text><button role="button" tabindex="0" @keydown.enter="$event.currentTarget.click()" @keydown.space.prevent="$event.currentTarget.click()" class="primary send-button" :disabled="!canSend" @click="send">{{ pending?.busy ? '正在发送…' : pending ? '重试发送' : '发送回复' }}<text v-if="!pending" class="send-arrow" aria-hidden="true">↗</text></button></view></view></view>
        </template>
        <view v-else class="empty-conversation"><view class="empty-art" aria-hidden="true"><view class="art-bubble"><view></view><view></view><view></view></view><view class="art-reply"></view></view><text class="empty-heading">准备好，开始一段对话</text><text class="muted">从左侧选择会话，查看消息并回复用户。</text><view class="empty-divider"></view><text class="empty-footnote">好的服务，始于认真倾听。</text></view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.workbench{--primary:#70508f;--primary-dark:#593d74;--muted:#766d80;--line:#e9e2ef;--soft:#f5f0f9;height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;padding-top:env(safe-area-inset-top)}
.brand{display:flex;align-items:center;gap:12px;flex-shrink:0}.brand-mark{width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:#70508f;color:white;border-radius:14px 14px 14px 5px;font-size:23px;font-weight:600}.brand-name{font-size:23px;font-weight:650;letter-spacing:2px;display:block;line-height:1.2}.brand-caption{display:block;font-size:11px;letter-spacing:2px;color:#766d80;margin-top:4px}.topbar{height:88px;padding:0 32px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#fff;border-bottom:1px solid var(--line)}.account{display:flex;align-items:center;gap:24px}.account-email{font-size:13px;color:var(--muted)}.connection{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}.status-dot{height:7px;width:7px;border-radius:50%;background:#759178;flex-shrink:0}.status-dot.is-offline{background:#b57938}.workspace{display:flex;flex:1;min-height:0;margin:20px 24px 24px;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}.inbox{width:350px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--line)}.inbox-heading{display:flex;align-items:center;justify-content:space-between;padding:26px 24px 20px}.section-title{display:block;font-size:25px;font-weight:650;line-height:1.4;letter-spacing:.5px}.inbox-heading .muted{display:block;font-size:12px;margin-top:5px}.muted{color:#766d80}.inbox-count{padding:2px 9px;font-size:12px;background:var(--soft);color:var(--primary);border-radius:7px}.search-wrap{display:flex;align-items:center;background:#f7f5f9;border:1px solid #eee8f3;border-radius:9px;margin:0 20px;position:relative;padding:0 12px;min-height:44px;gap:12px}.search-icon{height:13px;width:13px;border:1.5px solid #928699;border-radius:50%;position:relative;flex-shrink:0}.search-icon::after{content:'';width:5px;height:1.5px;background:#928699;position:absolute;right:-4px;bottom:-2px;transform:rotate(45deg)}.search-input{height:44px;flex:1;font-size:13px;min-width:0}.search-clear{width:34px;height:44px;line-height:44px;background:transparent;color:#766d80;padding:0;font-size:20px}.tabs{display:flex;margin:18px 20px 0;border-bottom:1px solid var(--line);gap:20px}.tab{background:none;padding:0 8px;height:44px;line-height:44px;font-size:14px;color:var(--muted);border-radius:0;border-bottom:2px solid transparent}.tab.active{color:var(--primary);font-weight:600;border-bottom-color:var(--primary)}.thread-list{flex:1;min-height:0;height:0;padding-top:12px}.thread{display:flex;width:calc(100% - 20px);margin:2px 10px;gap:12px;text-align:left;padding:16px 12px;line-height:1.5;background:transparent;border-radius:10px;border:1px solid transparent}.thread:hover{background:#faf7fc}.thread.selected{background:#f3edf8;border-color:#e9ddf1}.avatar{display:flex;align-items:center;justify-content:center;width:40px;height:40px;background:#eee7f4;color:#77528f;font-size:17px;border-radius:13px;flex-shrink:0}.thread:nth-child(3n+2) .avatar{background:#eaf0ee;color:#58766c}.thread:nth-child(3n) .avatar{background:#f3ebe4;color:#966c4e}.thread-content{flex:1;min-width:0}.thread-top,.thread-preview{display:flex;align-items:center;justify-content:space-between;gap:8px}.thread-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;min-width:0}.thread-time{font-size:11px;color:#76667f;flex-shrink:0}.thread-preview{margin-top:8px}.thread-preview>text{color:#6c5d76;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.unread{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#70508f;color:#fff;font-size:10px;line-height:18px;text-align:center;flex-shrink:0}.inbox-footer{display:flex;align-items:center;gap:8px;margin:0 24px;padding:17px 0;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}.conversation{display:flex;flex:1;min-width:0;flex-direction:column;background:#fcfafd}.conversation-header{height:90px;display:flex;align-items:center;padding:16px 28px;gap:13px;border-bottom:1px solid var(--line);background:white;flex-shrink:0}.conversation-person{flex:1;min-width:0}.person-email{display:block;font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.conversation-status{font-size:12px;color:var(--muted);display:block;margin-top:4px}.status-separator{margin:0 8px;color:#b3a6bf}.primary,.secondary,.text-button{font-size:13px;border-radius:8px;min-height:44px;line-height:44px;padding:0 16px}.primary{background:#70508f;color:#fff}.primary:hover:not([disabled]){background:#593d74}.secondary{background:#fff;border:1px solid #ddd2e7;color:#70508f}.secondary:hover:not([disabled]){background:#f5f0f9}.text-button{background:transparent;color:#70508f;padding:0 10px}.text-button:hover{background:#f5f0f9}.close-button{font-size:12px;flex-shrink:0}.back-button{display:none}.messages{flex:1;height:0;min-height:0;padding:0 28px}.conversation-intro{text-align:center;color:#76667f;font-size:11px;margin:25px 0 28px}.conversation-intro text{display:block}.conversation-intro text+text{font-size:10px;margin-top:4px;color:#76667f}.message-row{display:flex;align-items:flex-start;gap:10px;margin-bottom:24px}.message-avatar{width:32px;height:32px;flex-shrink:0;display:flex;justify-content:center;align-items:center;border-radius:10px;background:#eee7f4;color:#77528f;font-size:13px;margin-top:22px}.staff-avatar{background:#70508f;color:#fff;border-bottom-right-radius:3px}.message-content{max-width:min(78%,640px);min-width:0}.message-meta{display:flex;gap:12px;font-size:10px;color:#76667f;margin-bottom:5px}.message-bubble{background:#fff;border:1px solid #e9e2ef;padding:11px 16px;border-radius:2px 13px 13px 13px;font-size:14px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;color:#44374f}.from-staff{flex-direction:row-reverse}.from-staff .message-meta{justify-content:flex-end}.from-staff .message-bubble{background:#eee5f5;border-color:#e7dbef;border-radius:13px 2px 13px 13px;color:#503463}.message-end{height:12px}.composer{background:#fff;padding:18px 28px 20px;border-top:1px solid var(--line);flex-shrink:0}.composer-label{display:flex;justify-content:space-between;font-size:12px;font-weight:500;margin-bottom:12px}.composer-label .muted{font-size:11px;font-weight:400}.composer-input{width:100%;height:95px;font-size:14px;line-height:1.7;color:#44374f}.composer-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:12px}.composer-tip,.character-count{font-size:11px;color:#76667f}.send-actions{display:flex;align-items:center;gap:16px}.send-button{min-width:116px;height:42px;line-height:42px}.send-arrow{font-size:18px;margin-left:14px}.closed-note{background:#fff;text-align:center;padding:22px;border-top:1px solid var(--line);font-size:13px}.closed-note text{display:block}.closed-note .muted{font-size:12px;margin-top:3px}.empty-conversation{display:flex;flex:1;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:32px}.empty-art{position:relative;width:120px;height:100px;margin-bottom:28px}.art-bubble{height:63px;width:91px;border:2px solid #cdb9de;border-radius:21px 21px 21px 4px;display:flex;align-items:center;justify-content:center;gap:8px;background:#f4edf9;position:relative;z-index:1}.art-bubble>view{width:6px;height:6px;border-radius:50%;background:#bda4d0}.art-reply{position:absolute;right:0;bottom:0;width:65px;height:51px;border:2px solid #e1d5eb;border-radius:18px 18px 4px 18px;background:#faf6fd}.empty-heading{font-size:22px;font-weight:600;color:#584265;margin-bottom:12px}.empty-conversation>.muted{font-size:13px}.empty-divider{width:32px;height:1px;background:#d9cbdf;margin:28px 0 18px}.empty-footnote{font-size:12px;color:#76667f}.empty-list{padding:48px 24px;text-align:center}.empty-title{font-size:13px;display:block;margin-bottom:10px}.empty-list .muted{font-size:12px}.message-hint{text-align:center;font-size:13px;color:#877990;padding:28px}.list-error,.conversation-error{font-size:12px;color:#9a522d;background:#fff5ed;padding:10px 16px;display:flex;gap:8px;align-items:center;justify-content:space-between}.conversation-error .text-button,.list-error .text-button{flex-shrink:0}.auth-screen{min-height:100vh;min-height:100dvh;display:flex;background:#fff}.auth-story{background:#eee6f5;width:43%;min-height:100vh;display:flex;flex-direction:column;padding:48px 56px}.story-copy{margin:auto 0;padding:80px 0}.story-title{display:block;font-size:clamp(30px,3.2vw,48px);font-weight:600;line-height:1.65;letter-spacing:2px;color:#604078}.story-description{display:block;font-size:15px;line-height:2.2;color:#76667f;margin-top:24px}.story-bottom{display:flex;gap:12px;align-items:center;color:#76667f;font-size:12px}.tiny-line{width:25px;height:1px;background:#b6a0c4}.auth-main{flex:1;display:flex;align-items:center;justify-content:center;padding:48px}.auth-form{width:100%;max-width:375px}.auth-form .section-title{font-size:28px}.auth-description{display:block;font-size:14px;margin:12px 0 36px}.field-label{display:block;font-size:13px;font-weight:500;margin:20px 0 8px}.field{background:#faf8fc;border:1px solid #e6deed;border-radius:8px;height:48px;padding:0 14px;font-size:14px;width:100%}.code-row{display:flex;gap:10px}.code-row .field{flex:1;min-width:0}.code-button{font-size:12px;padding:0 12px;white-space:nowrap;height:48px;line-height:46px;min-width:115px}.hint{display:block;color:#76667f;font-size:12px;margin-top:15px;line-height:1.8}.error{display:block;color:#a84935;font-size:12px;margin-top:14px}.login-button{margin-top:26px;width:100%;height:48px;line-height:48px;font-size:15px}.auth-note{display:block;font-size:11px;color:#76667f;text-align:center;margin-top:26px}.loading-screen,.access-screen{min-height:100vh;display:flex;justify-content:center;align-items:center;gap:20px}.loading-screen{flex-direction:column;color:#766d80}.access-panel{max-width:440px;padding:40px;text-align:center}.access-panel .brand-mark{margin:0 auto 24px}.access-panel .section-title{font-size:23px;margin-bottom:12px}.access-description{display:block;margin:20px 0 28px;font-size:14px;color:#766d80}.access-panel .text-button{margin:12px auto 0}.access-panel .primary{width:100%}
@media(min-width:1600px){.workspace{width:calc(100% - 64px);max-width:1700px;margin:24px auto 32px}.inbox{width:390px}.topbar{padding:0 42px}.messages{padding:0 40px}.composer{padding:20px 40px 24px}}
@media(max-width:1000px){.inbox{width:310px}.workspace{margin:12px}.account{gap:16px}.account-email{display:none}.conversation-header{padding:16px 20px}.messages{padding:0 20px}.composer{padding:16px 20px}.composer-label .muted{display:none}.auth-story{padding:36px;width:42%}.auth-main{padding:36px}}
@media(max-width:700px){.topbar{height:72px;padding:0 18px}.brand-mark{width:38px;height:38px;font-size:20px;border-radius:12px 12px 12px 4px}.brand-name{font-size:20px}.brand-caption{font-size:10px;letter-spacing:1px}.connection{display:none}.workspace{margin:0;border:none;border-radius:0}.inbox{width:100%;border:none}.inbox-heading{padding:24px 24px 18px}.inbox-footer{padding-bottom:calc(16px + env(safe-area-inset-bottom))}.conversation{display:none}.show-detail .inbox,.show-detail .topbar{display:none}.show-detail .conversation{display:flex}.conversation-header{height:82px;padding:12px;gap:8px}.back-button{display:block;font-size:12px;padding:0 7px;flex-shrink:0}.header-avatar{display:none}.person-email{font-size:13px}.conversation-status{font-size:11px}.close-button{font-size:11px;padding:0 10px}.messages{padding:0 16px}.message-content{max-width:80%}.message-bubble{font-size:14px;padding:10px 13px}.composer{padding:14px 16px calc(14px + env(safe-area-inset-bottom))}.composer-input{height:80px}.composer-tip{display:none}.composer-bottom{justify-content:flex-end}.composer-label{margin-bottom:8px}.send-button{min-width:108px}.auth-screen{display:block}.auth-story{width:100%;min-height:auto;padding:24px}.story-copy,.story-bottom{display:none}.auth-main{padding:44px 26px}.auth-form{max-width:420px}.auth-description{margin-bottom:30px}.access-panel{padding:28px}.auth-note{font-size:12px}.closed-note{padding-bottom:calc(22px + env(safe-area-inset-bottom))}}
@media(max-height:620px) and (min-width:701px){.topbar{height:70px}.workspace{margin-top:12px;margin-bottom:12px}.conversation-header{height:72px}.composer-input{height:60px}.inbox-heading{padding-top:18px}.empty-art{margin-bottom:16px}}
</style>
