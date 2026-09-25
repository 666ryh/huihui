# Windows 客服端

客户端版本 **1.0.0**，目标为 **Windows 10/11 x64**。这是包含 Electron 运行时的便携程序，无需安装 Node.js、Python 或浏览器。解压 `huihui-windows-x64-v1.0.0.zip` 的整个文件夹，再双击 `Huihui.exe`，不要在压缩包中直接运行。

客户端连接 `https://www.ryh6666.xyz/huihui/` 的既有客服工作台，需要联网和已授权的客服邮箱。消息保存在服务器；页面更新随服务端部署生效。此包未经代码签名，Windows 可能显示未知发布者提示。首次发布未提供自动升级器，后续桌面运行时更新通过发布页下载。

## 构建

构建机需要 Python 3.11+ 和网络连接，安全测试需要 Node.js 18+。在仓库根目录运行：

```powershell
node --test desktop/policy.test.cjs
py -3.11 tools/build-windows.py
```

脚本从 Electron 官方 GitHub Release API 获取固定版本 **44.4.5** 的 Windows x64 运行时和 `SHASUMS256.txt`，核验运行时 SHA-256 后打包。版本记录在 `desktop/package.json`，无需执行 npm 下载脚本。下载缓存保存在 `work/windows-build/`，便携包及 SHA-256 文件输出到 `releases/`。压缩条目的时间、顺序固定，同一 Python/zlib 环境重复构建结果一致。

官方运行时 SHA-256：

```text
11c395820a5aaa8ebcc0686b476d0ac98a730274ebfbdc8cf5538a7c2815cb5d
```

包内保留 Electron 的 `LICENSE`、`LICENSES.chromium.html` 和官方校验文件。

## 安全边界

- 保持 `contextIsolation`、`sandbox`、`webSecurity` 开启，禁用 `nodeIntegration` 和 webview，不向网页暴露 preload/IPC 本机桥接。
- 窗口、子框架和重定向只允许既定 HTTPS 工作台页面（包含其 hash 路由）；外部弹窗被拒绝，受信页面弹窗在当前窗口打开。
- 默认拒绝网页权限请求。下载包正常启动时不开放调试端口。
- 连接失败显示本地静态错误页，可点击“重新连接”或从菜单使用 Ctrl+R 重试。

## 已验证

2026-09-25 在 Windows 上从最终 ZIP 解压并启动其中的 `Huihui.exe`，使用独立临时资料目录和仅监听 `127.0.0.1` 的 CDP 端口完成以下检查：

- 官方运行时校验通过；ZIP 完整性检查通过。
- 登录页面可见邮箱、验证码、获取验证码和登录按钮。没有发送验证码或登录实际账号。
- 页面中的 `require` 和 `process` 均为 `undefined`。
- 页面尝试跳转外部网址被阻止；外部 `window.open` 返回 `null`，没有新窗口。
- 模拟离线并刷新后显示错误页；恢复网络点击重试后重新出现登录表单。
- 导航白名单测试通过，覆盖 HTTP、伪装域名、不同端口、带凭据 URL、路径逃逸、其他页面和非 HTTP 协议。

测试截图保存在本机构建目录 `work/windows-smoke/windows-login.png`。未进行真实客服账号登录后的业务端到端操作。
