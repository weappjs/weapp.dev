/** Shared donation policy. These are instructions, not transaction records. */
export const donationCopy = {
  'zh-CN': {
    title: '支持日常维护，也可以指定项目',
    instruction: '如果想支持其他开源项目，请在捐赠时备注「捐给 XXX 项目」，也可以在捐赠后私信我，补充项目名称。',
    policy: '指定项目的捐赠经我确认后按指定用途单独处理；未指定项目的赞助，按公开的默认比例分配。',
    allocationTitle: '未指定项目的赞助如何分配',
    allocation: '已确认到账且未指定项目的赞助，扣除支付手续费后，净额的 60% 用于核心维护、25% 进入贡献者基金、15% 支持上游和周边开源项目。指定项目捐赠经确认后单独处理，不纳入这三项默认分配。',
    action: '了解赞助与指定项目捐赠',
    steps: [
      { title: '了解赞助方式', body: '通过现有 GitHub 入口了解方式，确认后再捐赠。本站目前没有在线支付后台。' },
      { title: '备注想支持的项目', body: '填写「捐给 XXX 项目」。名称容易混淆时，可附上项目仓库链接。' },
      { title: '事后也可以补充', body: '忘记备注也可以后续私信我，补充项目名称和捐赠信息，便于核对并确认用途。' },
    ],
    faq: [
      { question: '可以捐给其他开源项目吗？', answer: '可以。捐赠时备注「捐给 XXX 项目」，也可以后续私信我。指定项目的捐赠经我确认后按指定用途单独处理，不纳入默认的 60%／25%／15% 分配。' },
      { question: '捐赠时忘记备注项目怎么办？', answer: '可以在捐赠后私信我，补充项目名称和捐赠信息，便于核对。具体用途在确认后按指定项目单独处理。' },
      { question: '如何出现在公开致谢名单中？', answer: '需要先确认 GitHub 身份或企业信息，并经过维护者审核和明确授权。公开展示遵循对应档位的规则；捐赠备注和私信内容不会作为公开致谢信息自动发布。' },
    ],
  },
  'en': {
    title: 'Support maintenance or choose a project',
    instruction: 'To support another open-source project, add “Donate to XXX project” to your donation note. You can also message me privately afterwards with the project name.',
    policy: 'After I confirm the details, donations for a named project are handled separately for that purpose. Donations without a designated project follow the published default allocation.',
    allocationTitle: 'Default allocation without a designated project',
    allocation: 'For confirmed donations without a designated project, the net amount after payment fees is allocated 60% to core maintenance, 25% to the contributors fund, and 15% to upstream and adjacent open source. Confirmed project-specific donations are handled separately and excluded from this default split.',
    action: 'Explore donations and project choices',
    steps: [
      { title: 'Check how to donate', body: 'Use the existing GitHub contact link to confirm the details before donating. This site has no online payment backend.' },
      { title: 'Name your project', body: 'Write “Donate to XXX project” in the note. Include a repository link if the name could be ambiguous.' },
      { title: 'Follow up afterwards', body: 'Forgot the note? Message me privately with the project name and donation details so I can match the donation and confirm its purpose.' },
    ],
    faq: [
      { question: 'Can I donate to another open-source project?', answer: 'Yes. Add “Donate to XXX project” to your donation note, or message me privately afterwards. Once I confirm the details, the donation is handled separately for that project and excluded from the default 60% / 25% / 15% split.' },
      { question: 'What if I forgot to name a project?', answer: 'Message me privately afterwards with the project name and donation details so I can match the donation. Once confirmed, it will be handled separately for the designated project.' },
      { question: 'How can I appear in the public acknowledgements?', answer: 'Public recognition requires confirmed GitHub or business details, maintainer review, and explicit authorization, following the relevant tier rules. Donation notes and private messages are not automatically published as acknowledgements.' },
    ],
  },
} as const
