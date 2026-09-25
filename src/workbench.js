export function createState() {
  return {account: '', threads: [], selected: null, messages: [], drafts: {}, pending: {}, error: '', listError: '', loading: false, listLoading: false, closing: false};
}

export function createWorkbench(api, state, visible = () => true, rendered = () => Promise.resolve()) {
  let accountVersion = 0, selectionVersion = 0, listVersion = 0, cursor = 0, acknowledged = 0, loadingSelection = -1;
  const current = (account, selection) => account === accountVersion && selection === selectionVersion;
  const merge = messages => {
    state.messages = [...new Map([...state.messages, ...messages].map(message => [String(message.id), message])).values()]
      .sort((a, b) => Number(a.id) - Number(b.id));
  };
  function setAccount(email) {
    accountVersion++; selectionVersion++; listVersion++; cursor = 0; acknowledged = 0;
    Object.assign(state, createState(), {account: email || ''});
  }
  async function refreshThreads(q = '', status = 'open') {
    if (!state.account) return;
    const version = ++listVersion, account = accountVersion, email = state.account;
    state.listLoading = true;
    try {
      const data = await api(`/api/staff/threads?q=${encodeURIComponent(q)}&status=${status}`, undefined, email);
      if (account !== accountVersion || version !== listVersion) return;
      state.threads = data.threads; state.listError = '';
    } catch (error) {
      if (account === accountVersion && version === listVersion) state.listError = error.message;
    } finally {
      if (account === accountVersion && version === listVersion) state.listLoading = false;
    }
  }
  async function select(thread) {
    selectionVersion++; cursor = 0; acknowledged = 0;
    state.selected = thread; state.messages = []; state.error = ''; state.loading = false;
    if (thread) await refreshMessages();
  }
  async function refreshMessages() {
    if (!state.selected || !state.account || loadingSelection === selectionVersion) return;
    const selection = selectionVersion, account = accountVersion, id = state.selected.id, email = state.account;
    loadingSelection = selection; state.loading = true;
    try {
      let more;
      do {
        const data = await api(`/api/staff/threads/${id}?after=${cursor}`, undefined, email);
        if (!current(account, selection)) return;
        state.selected = data.thread;
        merge(data.messages);
        if (data.messages.length) cursor = Math.max(cursor, ...data.messages.map(message => Number(message.id)));
        more = data.hasMore && data.messages.length > 0;
      } while (more);
      await rendered();
      if (!current(account, selection)) return;
      if (visible() && cursor > acknowledged) {
        const lastId = cursor;
        await api(`/api/staff/threads/${id}/read`, {lastId}, email);
        if (!current(account, selection)) return;
        acknowledged = lastId;
      }
      // Keep a failed send visible while polling reconnects.
      if (!state.pending[id]) state.error = '';
    } catch (error) {
      if (current(account, selection)) state.error = error.message;
    } finally {
      if (loadingSelection === selection) loadingSelection = -1;
      if (current(account, selection)) state.loading = false;
    }
  }
  async function send() {
    if (!state.selected || state.selected.status !== 'open' || !state.account) return;
    const id = state.selected.id, email = state.account, account = accountVersion, selection = selectionVersion;
    const text = (state.drafts[id] || '').trim();
    if (!text || text.length > 2000 || state.pending[id]?.busy) return;
    if (!state.pending[id]) state.pending[id] = {requestId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, text, busy: false};
    const pending = state.pending[id];
    pending.busy = true; state.error = '';
    try {
      const data = await api(`/api/staff/threads/${id}/send`, {requestId: pending.requestId, text: pending.text}, email);
      if (account !== accountVersion) return;
      if ((state.drafts[id] || '').trim() === pending.text) state.drafts[id] = '';
      delete state.pending[id];
      if (current(account, selection)) { merge([data.message]); state.error = ''; }
      // Sending does not move the receive cursor: a concurrent user message may precede this reply.
    } catch (error) {
      if (current(account, selection)) state.error = error.message;
    } finally {
      if (account === accountVersion && state.pending[id] === pending) pending.busy = false;
    }
  }
  async function close() {
    if (!state.selected || state.closing) return;
    const id = state.selected.id, account = accountVersion, selection = selectionVersion, email = state.account;
    state.closing = true;
    try {
      await api(`/api/staff/threads/${id}/close`, {}, email);
      if (current(account, selection)) { state.selected.status = 'closed'; state.error = ''; }
    } catch (error) {
      if (current(account, selection)) state.error = error.message;
    } finally {
      if (account === accountVersion) state.closing = false;
    }
  }
  return {setAccount, refreshThreads, select, refreshMessages, send, close};
}
