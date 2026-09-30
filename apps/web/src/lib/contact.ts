export const contactMethods = {
  wechat: { account: 'SonOfMagic', qr: '/contact/wechat-qr.webp', original: '/contact/wechat-original.jpg', size: 680 },
  qq: { account: '1324318532', qr: '/contact/qq-qr.webp', original: '/contact/qq-original.jpg', size: 900 },
  email: 'icebreaker@weapp.dev',
} as const

export const contactCopy = {
  'zh-CN': {
    label: '联系方式',
    wechat: '微信',
    qq: 'QQ',
    email: '发送邮件',
    open: '查看账号与加好友二维码',
    copy: '复制账号',
    copied: '已复制账号',
    failed: '复制失败，请手动复制已选中的账号。',
    scan: '扫描二维码添加好友；也可以保存原图，在应用内从相册识别。',
    view: '查看原图',
    save: '保存原图',
    qr: '加好友二维码',
  },
  'en': {
    label: 'Contact methods',
    wechat: 'WeChat',
    qq: 'QQ',
    email: 'Send an email',
    open: 'View account and add-friend QR code',
    copy: 'Copy account',
    copied: 'Account copied',
    failed: 'Copy failed. Please copy the selected account manually.',
    scan: 'Scan to add me, or save the original image and scan it from your photos in the app.',
    view: 'View original',
    save: 'Save original',
    qr: 'add-friend QR code',
  },
} as const
