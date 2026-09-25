# 辉辉 · 客服工作台

独立的 UniApp + Vue 3 客服项目。网页路径为 `/huihui/`，采用 hash 路由；提供 Windows 64 位免安装客户端及 Android 客服 APK，共享现有云端后端。

## 下载客户端

从 [GitHub Releases](https://github.com/666ryh/huihui/releases) 下载。Windows ZIP 解压全部文件后运行 `Huihui.exe`；安卓安装 `huihui-support-1.0.0.apk`。两端都需要联网，并使用已授权的客服邮箱登录。客户端不会授予额外服务端权限。

Android 包名 `cn.huihui.support`，可与用户端 `cn.kejian.teacher` 同时安装，登录独立。Windows 客户端独立保存登录 Cookie。Windows 便携版未做商业代码签名；Android 包使用专用本地密钥签名，后续升级需保留该密钥。

构建命令：`npm run build:apk`、`npm run build:windows`。详细要求见 `docs/android-build.md` 及 `docs/windows-build.md`（Windows 文档以实际文件名为准）。

## 本地开发

需要 Node.js 20+、npm。执行：

```sh
npm ci
npm run dev:h5
```

打开 `http://127.0.0.1:4175/huihui/`。本地 Vite 将 `/api` 转发到 `https://www.ryh6666.xyz`，仅改写来自本机 4175 端口的 Origin。项目与主应用使用相同 UniApp/Vite 版本；`.npmrc` 的 `legacy-peer-deps` 用于兼容 UniApp 上游 Vite peer 声明。

## 验证与构建

```sh
npm test
npm run build:h5
```

发布 `dist/build/h5/` 的内容到 HTTPS 站点的 `/huihui/`。`/api` 必须保留同源后端路由。共享登录 Cookie 为站点根路径；服务端配置 `SUPPORT_STAFF_EMAILS` 授权客服邮箱。前端不包含授权邮箱白名单，接口仍须在服务端逐次验证权限。

## 功能

- 邮箱验证码登录；无权限账号显示切换账号入口。
- 按用户邮箱搜索，会话分为接待中和已结束，显示未读数。
- 人工消息增量分页、发送重试、结束会话；桌面与手机布局。
- 页面可见时每 2 秒刷新；切换会话/账号丢弃迟到响应。
- 发送失败保留原消息及请求 ID。草稿仅驻留当前页面内存，刷新页面会丢失未发送草稿；已成功发送的消息从服务端恢复。

接口契约见主项目 `docs/human-support-plan.md`。此仓库只消费 `/api/session`、`/api/auth/*`、`/api/staff/threads*`。
