# 辉辉客服 Android

独立客服应用：包名 `cn.huihui.support`，版本 `1.0.0`（100），最低 Android 8.0（API 26）。在线打开 `https://www.ryh6666.xyz/huihui/`，需要网络连接；客服账号及权限由服务器验证。与用户版使用不同包名和独立登录存储。

## 构建

Windows PowerShell 与 Java 17。SDK 目录应包含 `tools/android-14/` 下的 aapt、aapt2、d8、zipalign、apksigner，以及 `platform/android-34/android.jar`。

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-apk.ps1
# 或指定工具位置：
powershell -ExecutionPolicy Bypass -File tools/build-apk.ps1 -SdkRoot D:/android-sdk -JavaRoot 'C:/Program Files/Java/jdk-17'
```

SDK 参数默认取环境变量 `HUIHUI_ANDROID_SDK`，未设置时使用同级 `teacher/work/sdk`。脚本先运行独立 Java URL 安全测试，再编译、签名并检查 APK。无需 npm 或 H5 构建，页面直接来自线上部署。

输出：`releases/huihui-support-1.0.0.apk`。首次构建生成本地签名密钥 `work/huihui-local.keystore`（本地签名密码 `android`，别名 `huihui`）；后续安装更新必须保留同一密钥。可通过 `-KeyPath` 或 `HUIHUI_ANDROID_KEYSTORE` 指定已有的相同密码签名密钥。密钥必须私下备份，不提交 Git；构建输出也不提交 Git。

## 访问与验证

只允许 HTTPS `www.ryh6666.xyz` 默认端口或 443 的网络资源。主页面导航限制在 `/huihui/`，同站点 `/api/` 请求及静态资源正常放行。禁止文件访问、明文 HTTP、混合内容、第三方 Cookie 和 JavaScript 原生桥接；证书错误直接取消。开启 JavaScript、DOM storage 和同站点 Cookie。加载失败显示原生重试界面，返回键先返回网页历史，然后退出页面。

构建检查包括 URL 边界测试、APK 签名验证及包名/版本/权限检查。未连接 Android 设备时这些检查不等同于真机测试；安装后仍需验证客服登录、接待消息、断网重试和返回键。
