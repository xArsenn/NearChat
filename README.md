# NearChat

[中文说明](README.zh-CN.md) · [English documentation](README.en.md)

## 中文介绍

NearChat 是一个无需账号、无需云服务器的开源局域网协作工具。电脑创建临时房间后，其他电脑可以自动发现并加入；手机扫描二维码即可直接在浏览器中聊天和传文件，无需安装应用。

消息和文件使用房间口令派生的 AES-256-GCM 密钥加密，只在当前 Wi-Fi、手机热点或有线局域网内传输。NearChat 支持中文和英文界面，并可在软件中随时切换。

### 亮点

- 手机扫码免安装加入
- Windows 桌面端中英文切换
- 局域网自动发现，无需手填地址和端口
- 多人聊天、成员列表和可信设备标记
- 最大 50 MB 文件直传、进度、重试及 SHA-256 校验
- 无账号、无广告、无追踪、无中心服务器
- GitHub Release 自动更新

## English introduction

NearChat is an open-source local collaboration app that needs no account and no cloud server. A computer creates a temporary room, nearby computers can discover it automatically, and phones can scan a QR code to chat and transfer files directly in the browser—without installing an app.

Messages and files are encrypted with an AES-256-GCM key derived from the room code and stay on the current Wi-Fi, mobile hotspot, or wired LAN. Both the desktop app and the no-install phone guest support Chinese and English.

### Highlights

- Join from a phone browser by scanning a QR code
- Chinese and English desktop interface
- Automatic LAN discovery with no address or port entry
- Group chat, live member list, and trusted-device labels
- Direct file transfer up to 50 MB with progress, retry, and SHA-256 verification
- No account, ads, tracking, or central server
- In-app updates through GitHub Releases

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run desktop
```

Build the web assets with `npm run build`, or create a Windows release installer with `npm run package:release`.

## Security

NearChat has not yet received an independent security audit. Do not use it for highly sensitive information. Room traffic is application-layer encrypted, but local message history is not currently encrypted at rest.

## License

MIT
