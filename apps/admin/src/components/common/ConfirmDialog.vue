<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  confirmColor?: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="dialog-overlay" @click.self="emit('cancel')">
      <div class="dialog-box">
        <h3 class="dialog-title">{{ title }}</h3>
        <p class="dialog-message">{{ message }}</p>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="emit('cancel')">Cancel</button>
          <button
            class="btn btn-primary"
            :style="confirmColor ? { background: confirmColor } : {}"
            @click="emit('confirm')"
          >
            {{ confirmText || 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-box {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 24px;
  min-width: 380px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.dialog-title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog-message {
  margin: 0 0 20px;
  font-size: 14px;
  color: var(--text-muted);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn:hover { opacity: 0.85; }

.btn-primary {
  background: var(--primary);
  color: #fff;
}

.btn-secondary {
  background: var(--content-bg);
  color: var(--text-primary);
  border: 1px solid var(--card-border);
}
</style>
