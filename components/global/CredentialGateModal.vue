<script setup lang="ts">
import useCredentialGate from '~/composables/useCredentialGate';

const {
  open,
  targetBiz,
  reason,
  state,
  configuring,
  certificateBlocked,
  actionError,
  serviceStatus,
  statusError,
  wsConnected,
  enableProxy,
  closeGate,
  refreshServiceStatus,
} = useCredentialGate();

const modalOpen = computed({
  get: () => open.value,
  set: value => {
    if (value) open.value = true;
    else closeGate();
  },
});

const stateText = computed(() => {
  const labels = {
    checking: '正在检查运行环境',
    needsConsent: '需要配置抓包链路',
    configuring: '正在配置系统代理',
    waitingCredential: '等待微信文章流量',
    ready: 'Credential 已就绪',
    error: '初始化遇到问题',
  };
  return labels[state.value];
});

const upstreamLabel = computed(
  () => serviceStatus.value.systemProxy?.upstreamProxy || serviceStatus.value.upstreamProxy || '未检测到'
);

const certificate = computed(() => serviceStatus.value.systemProxy?.certificate);
const certificateLabel = computed(() => {
  const labels = {
    trusted: '已信任',
    untrusted: '未信任',
    missing: '未生成',
    error: '检测失败',
    unsupported: '需手动确认',
  };
  return certificate.value ? labels[certificate.value.state] : '等待检测';
});
const installCertificateCommand =
  'sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$HOME/.mitmproxy/mitmproxy-ca-cert.pem"';
const verifyCertificateCommand = 'security verify-cert -c "$HOME/.mitmproxy/mitmproxy-ca-cert.pem" -p basic';

const modalDescription = computed(() =>
  targetBiz.value
    ? `当前操作需要公众号 ${targetBiz.value} 的有效 Credential。`
    : '只需在微信中打开目标公众号文章，系统会自动完成捕获。'
);
</script>

<template>
  <UModal v-model="modalOpen" prevent-close :ui="{ width: 'sm:max-w-2xl' }">
    <UCard>
      <template #header>
        <BaseModalHeader
          eyebrow="Credential 初始化"
          :title="stateText"
          :description="modalDescription"
          @close="closeGate"
        />
      </template>

      <div class="space-y-6">
        <div class="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-sm">
          <div class="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-3">
            <p class="text-xs text-slate-400">系统流量</p>
            <p class="mt-1 font-mono font-medium">macOS</p>
          </div>
          <UIcon name="i-lucide:arrow-right" class="text-slate-300" />
          <div class="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-3">
            <p class="text-xs text-slate-400">仅解密微信文章</p>
            <p class="mt-1 truncate font-mono font-medium">
              {{
                serviceStatus.systemProxy?.mitmProxy || serviceStatus.proxyAddress || `127.0.0.1:${serviceStatus.port}`
              }}
            </p>
          </div>
          <UIcon name="i-lucide:arrow-right" class="text-slate-300" />
          <div class="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-3">
            <p class="text-xs text-slate-400">原系统代理</p>
            <p class="mt-1 truncate font-mono font-medium">{{ upstreamLabel }}</p>
          </div>
        </div>

        <div
          class="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700"
        >
          <div class="flex items-center justify-between px-4 py-3">
            <span class="text-sm text-slate-600 dark:text-slate-300">mitmproxy 抓包服务</span>
            <span class="flex items-center gap-2 text-xs font-medium">
              <span
                class="size-2 rounded-full"
                :class="serviceStatus.running ? 'bg-emerald-500' : 'bg-rose-400'"
              ></span>
              {{ serviceStatus.running ? '已启动' : '未启动' }}
            </span>
          </div>
          <div class="flex items-center justify-between px-4 py-3">
            <span class="text-sm text-slate-600 dark:text-slate-300">本机 CA 证书信任</span>
            <span class="text-xs font-medium" :class="certificateBlocked ? 'text-amber-600' : 'text-slate-500'">
              {{ certificateLabel }}
            </span>
          </div>
          <div class="flex items-center justify-between px-4 py-3">
            <span class="text-sm text-slate-600 dark:text-slate-300">系统代理托管</span>
            <span class="flex items-center gap-2 text-xs font-medium">
              <span
                class="size-2 rounded-full"
                :class="serviceStatus.systemProxy?.managed ? 'bg-emerald-500' : 'bg-slate-300'"
              ></span>
              {{ serviceStatus.systemProxy?.managed ? '已接管' : '等待确认' }}
            </span>
          </div>
          <div class="flex items-center justify-between px-4 py-3">
            <span class="text-sm text-slate-600 dark:text-slate-300">Credential 实时通道</span>
            <span class="flex items-center gap-2 text-xs font-medium">
              <span class="size-2 rounded-full" :class="wsConnected ? 'bg-emerald-500' : 'bg-slate-300'"></span>
              {{ wsConnected ? '已连接' : '连接中' }}
            </span>
          </div>
        </div>

        <div
          v-if="actionError || statusError || serviceStatus.systemProxy?.error || reason"
          class="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <UIcon name="i-lucide:circle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>{{ actionError || statusError || serviceStatus.systemProxy?.error || reason }}</span>
        </div>

        <div
          v-if="certificateBlocked"
          class="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <p>{{ certificate?.message || '等待本机 CA 检测通过后才能启用代理。' }}</p>
          <template v-if="certificate?.state === 'untrusted'">
            <p>若同意信任本机抓包 CA，请用运行项目的同一 macOS 用户，在终端执行以下单行命令：</p>
            <pre
              class="overflow-x-auto rounded bg-black/5 p-3 text-xs"
            ><code>{{ installCertificateCommand }}</code></pre>
            <p>需要管理员密码。这是系统级根证书信任，允许持有对应私钥的代理解密 HTTPS；项目不会自动执行 sudo。</p>
            <p>只信任自己控制的 CA，不要复制其他电脑的 CA，也不要分享包含私钥的 mitmproxy-ca.pem。</p>
          </template>
          <template v-if="certificate?.state === 'untrusted' || certificate?.state === 'error'">
            <p>手动验证命令：</p>
            <pre
              class="overflow-x-auto rounded bg-black/5 p-3 text-xs"
            ><code>{{ verifyCertificateCommand }}</code></pre>
            <p>验证成功后，⌘Q 完全退出微信和 Chrome 再打开，点击「重新检测」，最后确认开启抓取。</p>
          </template>
          <p v-if="serviceStatus.systemProxy?.managed">
            代理已处于托管状态；若文章加载异常，请先停止抓取或退出项目以恢复代理。
          </p>
        </div>

        <ol class="grid gap-4 sm:grid-cols-3">
          <li class="flex gap-3">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-mono text-white dark:bg-slate-100 dark:text-slate-900"
              >1</span
            >
            <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">确认一次，由项目安全托管系统代理</p>
          </li>
          <li class="flex gap-3">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-mono text-white dark:bg-slate-100 dark:text-slate-900"
              >2</span
            >
            <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">在手机或电脑微信中打开目标文章</p>
          </li>
          <li class="flex gap-3">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-mono text-white dark:bg-slate-100 dark:text-slate-900"
              >3</span
            >
            <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">捕获成功后自动进入，无需手动刷新</p>
          </li>
        </ol>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-4">
          <p class="text-xs text-slate-400">退出项目时会恢复原系统代理设置。</p>
          <div class="flex items-center gap-2">
            <UButton
              v-if="state === 'error'"
              color="gray"
              variant="soft"
              icon="i-lucide:refresh-cw"
              @click="refreshServiceStatus"
            >
              重新检测
            </UButton>
            <UButton
              v-if="state === 'needsConsent' || (state === 'error' && serviceStatus.running)"
              color="black"
              icon="i-lucide:shield-check"
              :loading="configuring"
              :disabled="certificateBlocked"
              class="active:scale-[0.98]"
              @click="enableProxy"
            >
              确认并开始抓取
            </UButton>
            <div
              v-if="state === 'waitingCredential' || state === 'configuring' || state === 'checking'"
              class="flex items-center gap-2 text-sm text-slate-500"
            >
              <UIcon name="i-lucide:loader-circle" class="size-4 animate-spin" />
              {{ stateText }}
            </div>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
