export const TEMPLATES = Object.freeze(['default', 'wevu', 'react', 'tailwindcss', 'multi-platform-sfc'])

export const TEMPLATE_DETAILS = Object.freeze({
  'default': Object.freeze({
    zh: '原生小程序与 Vite，从熟悉的页面和组件起步。',
    en: 'Native mini-app pages and components, powered by Vite.',
  }),
  'wevu': Object.freeze({
    zh: 'Vue SFC 与 wevu 响应式运行时，使用组合式 API。',
    en: 'Vue SFCs and the wevu reactive runtime with Composition API.',
  }),
  'react': Object.freeze({
    zh: 'React 与 JSX，使用 React 组件开发小程序。',
    en: 'Build mini-app components with React and JSX.',
  }),
  'tailwindcss': Object.freeze({
    zh: '预置 Tailwind CSS，使用工具类编写小程序样式。',
    en: 'Tailwind CSS utilities configured for mini-app styles.',
  }),
  'multi-platform-sfc': Object.freeze({
    zh: '多平台 Vue SFC，一套工程面向多个小程序平台。',
    en: 'Vue SFCs in one project for multiple mini-app platforms.',
  }),
})
