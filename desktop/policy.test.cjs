const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isTrustedNavigation } = require('./policy.cjs');

test('navigation stays on the HTTPS workbench, including its hash routes', () => {
  for (const url of ['https://www.ryh6666.xyz/huihui/', 'https://www.ryh6666.xyz/huihui/#/pages/index/index', 'https://www.ryh6666.xyz/huihui/?desktop=1', 'https://www.ryh6666.xyz/huihui']) {
    assert.equal(isTrustedNavigation(url), true, url);
  }
  for (const url of ['https://example.com/', 'http://www.ryh6666.xyz/huihui/', 'https://www.ryh6666.xyz.evil.com/huihui/', 'https://www.ryh6666.xyz/', 'https://www.ryh6666.xyz/huihui/../admin', 'https://www.ryh6666.xyz/huihui/other.html', 'https://user@www.ryh6666.xyz/huihui/', 'https://www.ryh6666.xyz:444/huihui/', 'file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,test', 'invalid']) {
    assert.equal(isTrustedNavigation(url), false, url);
  }
});
