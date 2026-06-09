<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as supportApi from '@/api/support'

const props = defineProps<{
  ticketId: string
  index?: number
  /** Signed URL from list API — tried first; proxy fetch on error */
  screenshotUrl?: string
  large?: boolean
}>()

const src = ref('')
const failed = ref(false)
let objectUrl: string | null = null

function revoke() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

async function loadProxy() {
  revoke()
  failed.value = false
  try {
    objectUrl = await supportApi.fetchTicketScreenshotObjectUrl(
      props.ticketId,
      props.index ?? 0,
    )
    src.value = objectUrl
  } catch {
    src.value = ''
    failed.value = true
  }
}

async function load() {
  if (!props.ticketId) return
  failed.value = false
  if (props.screenshotUrl) {
    src.value = props.screenshotUrl
    return
  }
  await loadProxy()
}

function onImgError() {
  if (props.screenshotUrl && !objectUrl) {
    void loadProxy()
    return
  }
  failed.value = true
  src.value = ''
}

onMounted(load)
watch(() => [props.ticketId, props.index, props.screenshotUrl], load)
onUnmounted(revoke)
</script>

<template>
  <a
    v-if="src && !failed"
    :href="src"
    target="_blank"
    rel="noopener noreferrer"
    class="screenshot-link"
  >
    <img
      :src="src"
      :class="large ? 'screenshot-preview' : 'screenshot-thumb'"
      alt="Screenshot"
      @error="onImgError"
    />
  </a>
  <span v-else-if="failed" class="no-data">Unavailable</span>
  <span v-else class="no-data">…</span>
</template>

<style scoped>
.screenshot-link { display: inline-block; }
.screenshot-thumb {
  width: 48px; height: 48px; border-radius: 6px;
  object-fit: cover; border: 1px solid #eee;
}
.screenshot-preview {
  max-width: 100%; max-height: 240px; border-radius: 8px;
  object-fit: contain; border: 1px solid #eee; background: #f5f5f5;
}
.no-data { color: #ccc; font-size: 12px; }
</style>
