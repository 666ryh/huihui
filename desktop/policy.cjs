const WORKBENCH_URL = 'https://www.ryh6666.xyz/huihui/';

function isTrustedNavigation(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://www.ryh6666.xyz' && !url.username && !url.password &&
      (url.pathname === '/huihui/' || url.pathname === '/huihui');
  } catch {
    return false;
  }
}

module.exports = { WORKBENCH_URL, isTrustedNavigation };
