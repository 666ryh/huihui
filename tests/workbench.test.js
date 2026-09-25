import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, createWorkbench} from '../src/workbench.js';

const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
const thread = id => ({id, email: `${id}@example.com`, status: 'open'});
const page = (id, messages = [], hasMore = false) => ({thread: thread(id), messages, hasMore});
function setup(api, visible = () => true) {
  const state = createState();
  const workbench = createWorkbench(api, state, visible);
  workbench.setAccount('staff@example.com');
  return {state, workbench};
}

test('a late response cannot cross conversations or accounts', async () => {
  const old = deferred();
  const {state, workbench} = setup(path => path.includes('/1?') ? old.promise : Promise.resolve(page(2, [{id: 2, text: 'new'}])));
  const pending = workbench.select(thread(1));
  await workbench.select(thread(2));
  old.resolve(page(1, [{id: 1, text: 'old'}]));
  await pending;
  assert.equal(state.selected.id, 2);
  assert.deepEqual(state.messages.map(m => m.text), ['new']);
  const next = deferred();
  const other = setup(() => next.promise);
  const loading = other.workbench.select(thread(1));
  other.workbench.setAccount('other@example.com');
  next.resolve(page(1, [{id: 1, text: 'private'}]));
  await loading;
  assert.deepEqual(other.state.messages, []);
  assert.equal(other.state.selected, null);
});

test('failed send keeps draft and request ID until the same send succeeds', async () => {
  const attempts = [];
  const {state, workbench} = setup(async (path, body) => {
    if (path.endsWith('/send')) {
      attempts.push(body);
      if (attempts.length === 1) throw Error('network lost');
      return {message: {id: 7, role: 'staff', text: body.text}};
    }
    return page(1);
  });
  await workbench.select(thread(1));
  state.drafts[1] = 'hello';
  await workbench.send();
  assert.equal(state.drafts[1], 'hello');
  assert.match(state.error, /network lost/);
  await workbench.send();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].requestId, attempts[1].requestId);
  assert.equal(state.drafts[1], '');
  assert.equal(state.messages.length, 1);
});

test('pagination catches every message and sent IDs do not advance the receive cursor', async () => {
  const after = [];
  let reads = [];
  const {state, workbench} = setup(async (path, body) => {
    if (path.endsWith('/send')) return {message: {id: 20, role: 'staff', text: 'reply'}};
    if (path.endsWith('/read')) { reads.push(body.lastId); return {ok: true}; }
    const cursor = Number(new URL(path, 'http://test').searchParams.get('after'));
    after.push(cursor);
    if (cursor === 0) return page(1, [{id: 1, role: 'user', text: 'a'}], true);
    if (cursor === 1) return page(1, [{id: 2, role: 'user', text: 'b'}]);
    return page(1, [{id: 3, role: 'user', text: 'concurrent'}, {id: 20, role: 'staff', text: 'reply'}]);
  });
  await workbench.select(thread(1));
  state.drafts[1] = 'reply';
  await workbench.send();
  await workbench.refreshMessages();
  assert.deepEqual(after, [0, 1, 2]);
  assert.deepEqual(state.messages.map(m => m.id), [1, 2, 3, 20]);
  assert.equal(reads.at(-1), 20);
});

test('hidden conversation is not acknowledged; refresh failure preserves messages and draft', async () => {
  let fail = false;
  let reads = 0;
  const {state, workbench} = setup(async path => {
    if (path.endsWith('/read')) reads++;
    if (fail) throw Error('offline');
    return page(1, [{id: 1, text: 'keep'}]);
  }, () => false);
  await workbench.select(thread(1));
  state.drafts[1] = 'unfinished';
  fail = true;
  await workbench.refreshMessages();
  assert.equal(reads, 0);
  assert.equal(state.messages[0].text, 'keep');
  assert.equal(state.drafts[1], 'unfinished');
});
