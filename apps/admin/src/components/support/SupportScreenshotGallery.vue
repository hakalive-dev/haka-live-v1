<script setup lang="ts">
import SupportScreenshotThumb from './SupportScreenshotThumb.vue'

defineProps<{
  ticketId: string
  screenshotUrls?: string[]
  large?: boolean
}>()
</script>

<template>
  <div v-if="screenshotUrls?.length" class="screenshot-gallery" :class="{ large }">
    <SupportScreenshotThumb
      v-for="(url, index) in screenshotUrls"
      :key="`${ticketId}-${index}`"
      :ticket-id="ticketId"
      :index="index"
      :screenshot-url="url"
      :large="large"
    />
  </div>
</template>

<style scoped>
.screenshot-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}
.screenshot-gallery.large {
  margin-top: 8px;
}
</style>
