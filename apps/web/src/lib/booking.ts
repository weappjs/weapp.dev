import type { Locale } from '../types/project'
import { localizePath } from '../i18n/ui'

// Public product facts only. Implementation and delivery assets live in the private product repository.
export const bookingProductPath = '/products/weapp-booking/'
export const bookingContactPath = '/pricing/#contact'

export const bookingCopy = {
  'zh-CN': {
    title: 'weapp-booking 预约与活动报名',
    description: '面向门店与活动主办方的预约、报名、订单与核销产品。支持独立私有部署，可沟通品牌定制与源码授权；外部联调待验收，尚未正式商业发布。',
    heading: '把预约、报名和到店服务，接在一起。',
    lead: 'weapp-booking 为按时间、资源和名额经营的业务准备。从客户选择体验，到门店处理订单与核销，让一条服务流程有清楚的记录。',
    status: '已实现，外部联调待验收',
    statusDetail: '可预约人工演示，尚未正式商业发布。微信真实身份、支付退款和消息投递需在实际账号与部署环境中完成验收。',
    action: '预约演示与咨询',
    scopeAction: '查看交付范围',
    entryTitle: '预约与报名，从一个产品开始',
    entryBody: 'weapp-booking 已实现预约、活动报名、订单、核销与基础客户管理，可沟通私有部署、品牌定制和源码授权。',
    entryAction: '了解 weapp-booking',
    workflowTitle: '围绕一次真实到店，完成业务闭环',
    workflowLead: '适合摄影工作室、手作体验、按时段提供服务的门店，以及需要票种、名额和签到的线下活动。',
    workflow: [
      { title: '预约或报名', body: '选择门店、服务资源和可约时段，或按票种填写多位参与人的资料。' },
      { title: '确认订单', body: '按服务端价格与容量生成订单，保留待付款名额并记录付款结果。' },
      { title: '到店核销', body: '每位参与人使用独立凭证，员工按门店权限完成核销与纠错。' },
      { title: '售后与客户', body: '处理改期、取消和退款申请，查看订单记录与基础客户资料。' },
    ],
    scopeTitle: '交付围绕完整应用，而非单张页面',
    scopeLead: '客户入口、经营后台和服务端围绕同一套订单数据协作。具体交付版本、模块与验收清单在沟通后书面确认。',
    capabilities: [
      { title: '客户小程序与 H5', body: '服务与活动展示、登录、动态报名表单、预约与多人报名、订单详情、改期、退款申请和到店凭证。微信消费者端采用 Wevu、weapp-vite 与 weapp-tailwindcss。' },
      { title: '门店经营后台', body: '门店、资源、服务、活动和票种管理，订单、退款及核销，员工角色与门店权限。可完整翻阅客户、审计、通知与历史退款记录，按门店、处理状态和订单关键词定位退款；重试原退款任务后保留浏览位置，到账结果仍需核实。可导出当前筛选下的全部订单；所有者、管理员及授权店长可为未开始的预约人工改期，并记录原因。' },
      { title: '支付待核实跟进', body: '所有者、管理员、授权店长及财务可按门店权限查看支付待核实列表，填写原因请求重新核对。受理只表示核对请求已接收，不代表款项到账。缺少支付配置，或渠道返回退款、撤销等仍需核实的结果时，保留记录供人工核对，不标为支付成功。' },
      { title: '临时停约与跟进', body: '员工请假或场地维修时，可为单个人员或场地设置指定日期内的停约时段。所有者、管理员及授权店长按门店权限创建和撤销；已确认和待付款预约保持原状，可查看重叠预约并人工跟进。' },
      { title: '复制服务与活动草稿', body: '在同一门店，将服务或活动复制为未发布草稿，复用介绍、图片、表单和业务配置。复制活动时需重新填写开始、结束及报名截止时间，并一并复制全部票种配置；检查草稿并发布后才向顾客开放。' },
      { title: '新实例配置模板', body: '所有者和管理员可将已保存的品牌、业务规则及所选目录导出为配置模板，复用于新的独立实例。图片在目标实例补充，活动时间按目标时区重设；导入前核对配置变化，导入后门店与资源停用、服务与活动为草稿。客户交易、员工账号和渠道密钥不随模板迁移，公开联系信息与文案需在分发前检查。' },
      { title: '服务端与数据', body: '预约容量、临时占位、幂等下单、支付与退款状态、后台任务、审计记录和持久化数据。金额与权限由服务端校验。' },
      { title: '品牌与表单配置', body: '调整品牌名称、主题色、介绍、联系方式、服务与活动内容，以及报名字段。多人编辑设置时，过期保存会被拒绝并保留本地草稿，可核对服务器设置后明确重新载入。基础会员能力以客户资料和订单记录为主。' },
    ],
    deliveryTitle: '按你的团队，约定交付方式',
    delivery: [
      { title: '源码授权', body: '适合有开发能力的团队。沟通交付模块、源码范围、二次开发权利和版本维护方式，按照书面授权使用。' },
      { title: '私有部署', body: '适合需要独立运行环境的业务。评估服务器、域名、数据库、备份和外部服务配置，约定部署、联调与交接范围。' },
      { title: '品牌与业务定制', body: '在现有预约和报名流程上评估品牌、表单、业务规则及系统对接。普通设置保存可保留已有品牌顶层扩展字段，以及标识不变的表单字段扩展；无法安全合并的定制结构会明确拒绝。具体扩展与升级边界见交付文档，新增能力单独确认范围、费用与验收标准。' },
    ],
    deploymentTitle: '部署之前，先准备好业务环境',
    deployment: [
      { title: '你的运行环境', body: '准备独立服务器、HTTPS 域名、数据库与备份策略，明确日常运维负责人。可用性和数据恢复要求在部署方案中确认。' },
      { title: '你的微信与支付账号', body: '小程序 AppID、合法域名、隐私声明及微信支付商户能力需按实际业务开通。短信和订阅消息使用客户自己的服务配置。' },
      { title: '共同完成外部验收', body: '在客户环境验证真实登录、支付取消与查单、退款到账、二维码核销和消息投递，再按约定清单确认上线。' },
    ],
    acceptanceTitle: '当前已验证什么',
    acceptanceBody: '已完成构建、类型检查、消费者 API 联调，以及分页、筛选导出、人工改期、临时停约、复制草稿、配置模板、设置并发保存、支付待核实跟进和历史退款安全重试的真实数据库业务测试；包含既有扩展字段保留，以及模板的实例与图片隔离、过期预览和重复导入请求。后台关键流程通过桌面与移动浏览器验证，包含设置冲突后的草稿保留、核对与明确重新载入，以及支付重新核对的受理、丢失响应重试和过期操作冲突。历史退款流程验证分页、筛选、失败读取恢复和切换页面后的操作结果归属。生产账号与供应商链路的外部验收仍待完成，小程序真机验收单独跟踪，开发模拟支付不代表真实扣款验证。',
    licenseTitle: '授权和服务范围，提前说清楚',
    license: [
      { title: '独立商业产品', body: 'weapp-booking 的产品源码在独立私有仓库维护。官网展示产品说明；源码和部署材料的交付以书面约定为准。' },
      { title: '明确使用范围', body: '部署主体、实例数量、客户项目交付、二次开发、再分发与转售范围，以及升级维护期限，均需在授权与服务协议中确认。' },
      { title: '分别确认费用', body: '当前没有公开标准售价。源码授权、部署实施、定制开发和持续维护按实际范围沟通；服务器、域名、短信及支付等第三方费用另行确认。' },
    ],
    futureTitle: '先做好独立部署，再评估托管服务',
    futureBody: '当前以独立部署和人工交付为主。多租户 SaaS、在线自助订阅与自动开通仍是后续方向，尚未开放，也没有承诺上线日期。',
    contactTitle: '带着你的业务，来聊一次具体方案',
    contactBody: '请准备业务类型、门店与员工规模、预约或报名流程、需要的小程序/H5 入口，以及已有账号和部署环境。我们据此安排演示、确认适配范围和下一步。',
  },
  'en': {
    title: 'weapp-booking appointments and event registration',
    description: 'Appointments, event registration, orders, and check-in for local businesses. Discuss private deployment, brand customization, and source licensing. External integration acceptance is pending; not commercially released.',
    heading: 'Connect bookings, registration, and the visit itself.',
    lead: 'weapp-booking is built for businesses that manage time, resources, and capacity. From choosing an experience to handling orders and check-in, each step of the visit has a clear record.',
    status: 'Implemented; external integration acceptance pending',
    statusDetail: 'Guided demos can be arranged. Not yet commercially released. Real WeChat identity, payments, refunds, and message delivery still require acceptance with actual accounts and deployment environments.',
    action: 'Arrange a demo and consultation',
    scopeAction: 'Explore delivery scope',
    entryTitle: 'A product for appointments and registration',
    entryBody: 'weapp-booking implements bookings, event registration, orders, check-in, and basic customer management. Discuss private deployment, brand customization, and source licensing.',
    entryAction: 'Explore weapp-booking',
    workflowTitle: 'Follow the whole journey of a visit',
    workflowLead: 'For photography studios, craft workshops, businesses that offer timed services, and in-person events that need ticket types, capacity limits, and check-in.',
    workflow: [
      { title: 'Book or register', body: 'Choose a location, service resource, and available time, or select a ticket type and enter details for multiple attendees.' },
      { title: 'Confirm the order', body: 'Create an order with server-controlled pricing and capacity, hold unpaid places temporarily, and record the payment outcome.' },
      { title: 'Check in', body: 'Each attendee has a separate credential. Staff check visitors in and correct mistakes within their location permissions.' },
      { title: 'Handle follow-up', body: 'Manage rescheduling, cancellation, and refund requests, with order history and basic customer records.' },
    ],
    scopeTitle: 'Delivery covers a complete application',
    scopeLead: 'Customer interfaces, the management console, and the API share one order system. The delivery version, modules, and acceptance checklist are agreed in writing after assessment.',
    capabilities: [
      { title: 'Customer mini-program and H5', body: 'Services and events, sign-in, configurable forms, bookings and group registration, order details, rescheduling, refund requests, and check-in credentials. The WeChat app uses Wevu, weapp-vite, and weapp-tailwindcss.' },
      { title: 'Business management', body: 'Manage locations, resources, services, events, tickets, orders, refunds, check-in, staff roles, and location permissions. Browse all customer, audit, notification, and historical refund records. Find refunds by location, handling status, or order keywords, and keep the browsing context after retrying the original refund task; settlement still needs verification. Export every order matching the current filters. Owners, administrators, and authorized managers can reschedule appointments that have not started, with a recorded reason.' },
      { title: 'Payments awaiting verification', body: 'Owners, administrators, authorized location managers, and finance staff can review payments awaiting verification within their location permissions and request another check with a required reason. Acceptance confirms receipt of the request, not receipt of funds. Missing payment configuration or channel results that still need verification, including refunds or reversals, leave records for manual review without marking payment as successful.' },
      { title: 'Temporary unavailability', body: 'Set a period of unavailability within a day for one staff member or venue when someone is away or a space needs maintenance. Owners, administrators, and authorized managers create or revoke these periods within their location permissions. Existing confirmed and unpaid bookings stay in place and can be reviewed for manual follow-up.' },
      { title: 'Copy services and events as drafts', body: 'Within the same location, copy a service or event into an unpublished draft, reusing its description, image, form, and business settings. For events, enter new start, end, and registration deadline times; all ticket configurations are copied too. Review and publish the draft before customers can book.' },
      { title: 'Configuration templates for new instances', body: 'Owners and administrators can export saved branding, business rules, and selected catalog entries for a new independent instance. Add images in the target instance and set new event times in its timezone. Review changes before importing; locations and resources remain disabled, and services and events remain drafts. Customer transactions, staff accounts, and provider secrets are excluded. Review retained public contact details and text before sharing.' },
      { title: 'API and persistent data', body: 'Capacity, temporary holds, idempotent orders, payment and refund states, background jobs, audit records, and persistent storage. The server validates amounts and permissions.' },
      { title: 'Brand and form settings', body: 'Configure the brand name, color, introduction, contact details, services, events, and registration fields. When settings are edited concurrently, stale saves are rejected and the local draft is kept for review before an explicit reload. Basic membership covers customer profiles and order history.' },
    ],
    deliveryTitle: 'Agree the delivery model with your team',
    delivery: [
      { title: 'Source licensing', body: 'For teams with development capacity. Agree the modules, source scope, modification rights, and version maintenance, then use the product under the written license.' },
      { title: 'Private deployment', body: 'For businesses that need an independent environment. Review the server, domain, database, backups, and provider configuration, then agree deployment, integration, and handover.' },
      { title: 'Brand and workflow customization', body: 'Assess branding, forms, business rules, and integrations against the existing booking and registration flow. Ordinary settings saves preserve existing top-level brand extension fields and extensions on form fields whose identifiers stay unchanged. Custom structures that cannot be merged safely are rejected. Delivery documentation defines extension and upgrade boundaries; additional capabilities need their own scope, cost, and acceptance criteria.' },
    ],
    deploymentTitle: 'Prepare the environment before deployment',
    deployment: [
      { title: 'Your runtime environment', body: 'Prepare an independent server, HTTPS domain, database, and backup strategy, with a named operations owner. Availability and recovery requirements belong in the deployment agreement.' },
      { title: 'Your WeChat and payment accounts', body: 'The mini-program AppID, permitted domains, privacy disclosures, and merchant payment capabilities must match the business. SMS and subscription messages use the customer’s provider configuration.' },
      { title: 'Joint integration acceptance', body: 'Verify real sign-in, payment cancellation and reconciliation, refund settlement, QR check-in, and message delivery in the customer environment before accepting the launch checklist.' },
    ],
    acceptanceTitle: 'What has been verified',
    acceptanceBody: 'Builds, type checks, consumer API integration, and real database tests for pagination, filtered exports, staff rescheduling, temporary unavailability, copying drafts, configuration templates, concurrent settings saves, payment verification follow-up, and safe retries of historical refunds have passed. Checks include preserving existing extension fields, plus instance and image isolation, stale previews, and repeated template imports. Key admin workflows have passed desktop and mobile browser checks, including keeping a draft after a settings conflict, reviewing server values, explicitly reloading, and accepting payment checks, retrying lost responses, and rejecting stale actions. Historical refund checks cover pagination, filters, read recovery, and operation results after navigating away. Production accounts and provider integrations still need external acceptance, and mini-program device acceptance is tracked separately. Simulated development payments do not verify real charges.',
    licenseTitle: 'Clarify licensing and service scope first',
    license: [
      { title: 'An independent commercial product', body: 'The weapp-booking source is maintained in a separate private repository. This website describes the product; source and deployment materials are delivered under a written agreement.' },
      { title: 'Defined rights of use', body: 'The operating entity, instance count, client-project delivery, modifications, redistribution, resale rights, and update or maintenance period must be confirmed in the license and service agreement.' },
      { title: 'Costs agreed separately', body: 'There is no public standard price yet. Source licensing, deployment, customization, and ongoing maintenance are scoped individually. Server, domain, SMS, payment, and other provider costs are confirmed separately.' },
    ],
    futureTitle: 'Independent deployment first; hosted services later',
    futureBody: 'The current focus is independent deployment with a guided handover. Multi-tenant SaaS, self-service subscriptions, and automatic provisioning are future directions. They are not available, and no launch date is promised.',
    contactTitle: 'Start with a concrete discussion of your business',
    contactBody: 'Share your business type, location and staff count, booking or registration workflow, required mini-program/H5 interfaces, and existing accounts and infrastructure. These help us arrange a demo and agree the next step.',
  },
} as const

export function bookingPage(locale: Locale) {
  return { ...bookingCopy[locale], path: localizePath(locale, bookingProductPath), contactPath: localizePath(locale, bookingContactPath) }
}
