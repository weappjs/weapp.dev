// qrcode 1.5.4 has no exports map or declarations for these build-time entries.
// Keep this adapter narrow so the Node/PNG entry cannot enter the runtime bundle.
declare module 'qrcode/lib/core/qrcode.js' {
  import type { create } from 'qrcode'

  const core: { create: typeof create }
  export default core
}

declare module 'qrcode/lib/renderer/svg-tag.js' {
  import type { QRCode, QRCodeRenderersOptions } from 'qrcode'

  const svg: { render: (code: QRCode, options?: QRCodeRenderersOptions) => string }
  export default svg
}
