export type Language = 'zh' | 'en'

const zh = {
  device: '设备-{number}', anonymous: '匿名设备', temporaryRoom: '临时协作房间', roomFallback: '局域网房间', hostFallback: 'NearChat 房间',
  verified: '校验通过', verifying: '正在校验…', transferFailed: '传输失败', verifyFailed: '校验失败', percent: '{value}%',
  disconnected: '连接已断开', networkError: '网络发生错误', decryptError: '收到无法解密的数据，可能使用了错误的房间口令', updateFailed: '检查更新失败', upToDate: '当前已经是最新版本', keyMissing: '房间密钥尚未建立',
  createFailed: '创建房间失败', scanning: '正在扫描局域网…', roomsFound: '发现 {count} 个房间，点击房间即可加入', noRooms: '暂时没有发现房间，请让创建者复制一键邀请给你',
  roomId: '房间 ID', roomCode: '房间口令', hostAddress: '主机地址', port: '端口', missingFields: '还需要填写：{fields}', autoSearching: '正在自动查找房间…', connecting: '正在连接房间…', autoNotFound: '没有自动找到这个房间。请确认两台设备连接同一 Wi-Fi，或读取创建者发来的一键邀请。', joined: '已加入局域网房间', joinFailed: '加入房间失败',
  sendFailed: '发送失败', fileTooLarge: '当前版本单个文件上限为 50 MB', fileSendFailed: '文件发送失败', originalUnavailable: '原文件已不可用，请重新选择文件', inviteInvalid: '剪贴板中没有有效的 NearChat 邀请', inviteReady: '邀请读取成功，不用填写地址和端口，直接加入即可', inviteReadFailed: '无法读取邀请', updateActionFailed: '更新操作失败',
  checkingUpdate: '正在检查更新…', downloadVersion: '下载 v{version}', downloading: '正在下载 {percent}%', restartInstall: '重启并安装更新', checkUpdate: '检查软件更新',
  brandSubtitle: '离线局域网协作', createOrJoin: '创建或加入房间', currentRoom: '当前房间', notConnected: '尚未连接', host: '房主', member: '成员', devices: '{count} 台设备', waitingRoom: '等待加入局域网房间', roomMembers: '房间成员', currentDevice: '当前设备', cancelTrust: '点击取消信任', trustDevice: '点击信任', trustedDevice: '可信设备', newDevice: '新设备', setRemark: '设置备注', remarkTitle: '成员备注', remarkIntro: '备注只保存在你的电脑，用来更容易识别聊天对象。', remarkName: '备注名称', remarkPlaceholder: '例如：张三、设计部电脑', originalName: '对方名称', deviceFingerprint: '设备指纹', saveRemark: '保存备注', removeRemark: '删除备注', remarkSaved: '成员备注已保存', remarkRemoved: '成员备注已删除',
  encryptedTitle: '消息与文件已加密', encryptedBody: '内容使用房间口令派生的 AES-256 密钥加密，只在局域网设备间传输。', myName: '我的名称', onlineDevices: '{count} 台设备在线 · {address}', showQr: '显示邀请二维码', disconnect: '断开连接', connectDevice: '连接设备',
  emptyTitle: '离线也能连接', emptyBody: '创建一个局域网房间，或扫描同一 Wi-Fi 下的附近房间。无需账号，也不需要云服务器。', startConnect: '开始连接', directFile: '文件直传', offlineReady: '断网可用', saveFile: '保存文件', retry: '重试', sendFile: '发送文件', messagePlaceholder: '输入消息…', joinToMessage: '加入房间后即可发送消息', send: '发送',
  lanConnect: '局域网连接', lanIntro: '两台设备连接同一个 Wi-Fi，即可自动发现并加入，无需填写地址和端口。', roomName: '房间名称', createRoom: '创建房间', orNearby: '或者加入附近房间', scanNearby: '扫描附近房间', join: '加入', readInvite: '读取一键邀请', manualHint: '没有发现？输入房间 ID 和口令',
  roomCreated: '房间已经创建', createdIntro: '让另一台电脑扫描附近房间并输入口令，或让手机扫描二维码免安装加入。', qrAlt: 'NearChat 房间邀请二维码', qrCaption: '手机扫码，无需安装即可加入', address: '地址', copyInvite: '复制一键加入邀请', enterRoom: '进入房间',
  joinRoom: '加入房间', selectedIntro: '正在加入“{name}”，无需填写地址和端口。', manualIntro: '只需填写房间 ID 和口令，软件会自动查找主机。', required: '必填', roomIdPlaceholder: '请输入房主显示的房间 ID', codePlaceholder: '请输入 8 位口令', collapseAdvanced: '收起高级设置', showAdvanced: '高级设置：手动填写地址和端口', addressExample: '例如 192.168.1.20', portExample: '例如 45678', advancedHelp: '仅在自动查找失败时使用，也可以把“地址:端口”直接粘贴到地址框。', autoFindJoin: '自动查找并加入',
  languageName: 'EN', languageTitle: 'Switch to English',
} as const

type TextKey = keyof typeof zh

const en: Record<TextKey, string> = {
  device: 'Device-{number}', anonymous: 'Anonymous device', temporaryRoom: 'Temporary workspace', roomFallback: 'Local room', hostFallback: 'NearChat Room',
  verified: 'Verified', verifying: 'Verifying…', transferFailed: 'Transfer failed', verifyFailed: 'Verification failed', percent: '{value}%',
  disconnected: 'Disconnected', networkError: 'A network error occurred', decryptError: 'Could not decrypt incoming data. The room code may be incorrect.', updateFailed: 'Could not check for updates', upToDate: 'You already have the latest version', keyMissing: 'The room key is not ready',
  createFailed: 'Could not create the room', scanning: 'Scanning the local network…', roomsFound: 'Found {count} room(s). Select one to join.', noRooms: 'No rooms found yet. Ask the host to send you a one-tap invite.',
  roomId: 'Room ID', roomCode: 'Room code', hostAddress: 'Host address', port: 'Port', missingFields: 'Please fill in: {fields}', autoSearching: 'Finding the room automatically…', connecting: 'Connecting to the room…', autoNotFound: 'Could not find this room automatically. Make sure both devices use the same Wi-Fi, or read a one-tap invite from the host.', joined: 'Joined the local room', joinFailed: 'Could not join the room',
  sendFailed: 'Could not send the message', fileTooLarge: 'Files are limited to 50 MB in this version', fileSendFailed: 'Could not send the file', originalUnavailable: 'The original file is no longer available. Please choose it again.', inviteInvalid: 'The clipboard does not contain a valid NearChat invite', inviteReady: 'Invite loaded. No address or port needed—just join.', inviteReadFailed: 'Could not read the invite', updateActionFailed: 'Update action failed',
  checkingUpdate: 'Checking for updates…', downloadVersion: 'Download v{version}', downloading: 'Downloading {percent}%', restartInstall: 'Restart and install update', checkUpdate: 'Check for updates',
  brandSubtitle: 'Offline local collaboration', createOrJoin: 'Create or join a room', currentRoom: 'Current room', notConnected: 'Not connected', host: 'Host', member: 'Member', devices: '{count} devices', waitingRoom: 'Waiting to join a local room', roomMembers: 'Room members', currentDevice: 'This device', cancelTrust: 'Click to remove trust', trustDevice: 'Click to trust', trustedDevice: 'Trusted device', newDevice: 'New device', setRemark: 'Set a local name', remarkTitle: 'Member name', remarkIntro: 'This name is stored only on your computer and helps you recognize the person or device.', remarkName: 'Local name', remarkPlaceholder: 'e.g. Alex, Design laptop', originalName: 'Original name', deviceFingerprint: 'Device fingerprint', saveRemark: 'Save name', removeRemark: 'Remove name', remarkSaved: 'Member name saved', remarkRemoved: 'Member name removed',
  encryptedTitle: 'Messages and files are encrypted', encryptedBody: 'Content is encrypted with an AES-256 key derived from the room code and only travels across the local network.', myName: 'My name', onlineDevices: '{count} online · {address}', showQr: 'Show invitation QR code', disconnect: 'Disconnect', connectDevice: 'Connect a device',
  emptyTitle: 'Connect even when offline', emptyBody: 'Create a local room or scan for nearby rooms on the same Wi-Fi. No account or cloud server required.', startConnect: 'Start connecting', directFile: 'Direct file transfer', offlineReady: 'Works offline', saveFile: 'Save file', retry: 'Retry', sendFile: 'Send file', messagePlaceholder: 'Type a message…', joinToMessage: 'Join a room to send messages', send: 'Send',
  lanConnect: 'Local network connection', lanIntro: 'Devices on the same Wi-Fi can find and join each other automatically—no address or port required.', roomName: 'Room name', createRoom: 'Create room', orNearby: 'or join a nearby room', scanNearby: 'Scan for nearby rooms', join: 'Join', readInvite: 'Read one-tap invite', manualHint: 'Not found? Enter the room ID and code',
  roomCreated: 'Room created', createdIntro: 'Other computers can scan and enter the code, while phones can scan the QR code and join without installing.', qrAlt: 'NearChat room invitation QR code', qrCaption: 'Scan on a phone to join without installing', address: 'Address', copyInvite: 'Copy one-tap invite', enterRoom: 'Enter room',
  joinRoom: 'Join room', selectedIntro: 'Joining “{name}”. No address or port required.', manualIntro: 'Enter only the room ID and code. NearChat will find the host automatically.', required: 'required', roomIdPlaceholder: 'Enter the room ID shown by the host', codePlaceholder: 'Enter the 8-character code', collapseAdvanced: 'Hide advanced settings', showAdvanced: 'Advanced: enter address and port manually', addressExample: 'e.g. 192.168.1.20', portExample: 'e.g. 45678', advancedHelp: 'Use this only when automatic discovery fails. You can also paste “address:port” into the address field.', autoFindJoin: 'Find and join automatically',
  languageName: '中文', languageTitle: '切换到中文',
}

const dictionaries: Record<Language, Record<TextKey, string>> = { zh, en }

export function getText(language: Language, key: TextKey, values: Record<string, string | number> = {}) {
  let value = dictionaries[language][key]
  for (const [name, replacement] of Object.entries(values)) value = value.replaceAll(`{${name}}`, String(replacement))
  return value
}
