# NearChat English Documentation

[Bilingual overview](README.md) · [中文](README.zh-CN.md)

NearChat is an open-source local chat and file collaboration tool that requires no account and no cloud server.

The computer that creates a room temporarily acts as the host on the local network. Other computers can discover the room automatically. Phones can scan the QR code and join directly from a browser without downloading or installing NearChat. Quitting NearChat stops the temporary web service and room connections; closing the window keeps them available from the system tray.

## Features

- One-click Chinese and English interface with a remembered language preference
- No-install phone access through a QR code
- Send and receive messages, images, and files from a phone browser
- Automatic room discovery on the local network
- Find a host from only the room ID and code—no address or port entry
- Manual address and port available only as an advanced fallback
- Multi-user local chat and a live member list
- Device fingerprints and local trusted-device labels
- Confirmation before receiving from new devices, with automatic receiving for trusted devices
- System-tray background mode so closing the window does not interrupt rooms or transfers
- Optional launch at login plus native notifications for messages and file transfers
- Private local names shown on member entries, messages, and files
- Encrypted shared clipboard for text and clipboard images, with one-click copy
- Drag files into the chat to send up to 20 at a time
- A file inbox with sender names, verification status, and save actions
- Stream large files directly to disk on desktop without the old 50 MB app limit or loading the whole file into memory
- Send entire folders while preserving nested directory structure; received files are saved under Downloads/NearChat
- Live progress, speed, ETA, sender backpressure, retry, and SHA-256 integrity verification
- AES-256-GCM application-layer encryption
- Windows installer and in-app updates

## Recommended connection flow

1. Connect every device to the same Wi-Fi, mobile hotspot, or wired LAN.
2. Open NearChat on one computer and create a room.
3. On another computer, scan for nearby rooms, select the room, and enter its code.
4. On a phone, scan the QR code shown by the host, enter a display name, and join in the browser.
5. Use the clipboard button to send text or a screenshot. Drag files into the chat, or use the folder button to select an entire folder.
6. If discovery is blocked, read a one-tap invite. Use the advanced address and port fields only as a fallback.
7. When Windows asks for network access, allow NearChat on private networks.
8. Optionally enable launch at login in Settings. To stop NearChat completely, choose Quit from its system-tray menu.

The shared clipboard is read only after a user clicks. NearChat never syncs passwords, verification codes, or other clipboard content in the background.

Desktop devices can transfer large files. No-install phone guests remain limited to 50 MB per file. If desktops and phone guests share a room, files over 50 MB are delivered only to desktop recipients to protect browser memory.

## Local development

Node.js 20 or newer is required.

```bash
npm install
npm run desktop
```

Build web assets with `npm run build`. Create the Windows release installer with `npm run package:release`.

## Updates and releases

Production builds use a Windows NSIS installer. Users can check for updates inside the app, download a release, and restart to install it. To publish, update the version, commit the changes, and push a matching tag. GitHub Actions builds the installer and Release automatically.

## Security notice

Messages and files use AES-256-GCM encryption. PBKDF2 derives the key from the random room code. Device fingerprints and trusted labels help recognize returning devices, but they are not certificate-grade identity verification.

NearChat has not received an independent security audit and should not be used for highly sensitive information. Text chat history is stored locally and is not currently encrypted at rest.

## License

MIT
