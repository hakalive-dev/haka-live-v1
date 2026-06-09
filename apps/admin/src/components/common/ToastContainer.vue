<script setup lang="ts">
import { useToastStore } from '@/stores/toast'
import type { Toast } from '@/stores/toast'

const toast = useToastStore()

const ICONS: Record<Toast['type'], string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="t in toast.toasts"
          :key="t.id"
          :class="['toast', `toast-${t.type}`]"
        >
          <div class="toast-icon">{{ ICONS[t.type] }}</div>
          <div class="toast-body">
            <div class="toast-title">{{ t.title }}</div>
            <div v-if="t.message" class="toast-message">{{ t.message }}</div>
          </div>
          <button class="toast-close" @click="toast.remove(t.id)">✕</button>
          <div class="toast-progress">
            <div class="toast-progress-bar" :style="{ animationDuration: `${t.duration}ms` }"></div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
  width: 100%;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px 18px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.10);
  background: #fff;
  border: 1px solid #e2e8f0;
  position: relative;
  overflow: hidden;
  pointer-events: all;
}

.toast-success { border-left: 4px solid #22C97A; }
.toast-error   { border-left: 4px solid #FF4D4D; }
.toast-warning { border-left: 4px solid #F59E0B; }
.toast-info    { border-left: 4px solid #3B82F6; }

.toast-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.toast-success .toast-icon { background: #d1fae5; color: #065f46; }
.toast-error   .toast-icon { background: #fee2e2; color: #991b1b; }
.toast-warning .toast-icon { background: #fef3c7; color: #92400e; }
.toast-info    .toast-icon { background: #dbeafe; color: #1e40af; }

.toast-body {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.3;
}

.toast-message {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
  line-height: 1.4;
  word-break: break-word;
}

.toast-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: -2px;
  line-height: 1;
}
.toast-close:hover { color: #475569; background: #f1f5f9; }

/* Progress bar */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #f1f5f9;
}

.toast-progress-bar {
  height: 100%;
  animation: shrink linear forwards;
}

.toast-success .toast-progress-bar { background: #22C97A; }
.toast-error   .toast-progress-bar { background: #FF4D4D; }
.toast-warning .toast-progress-bar { background: #F59E0B; }
.toast-info    .toast-progress-bar { background: #3B82F6; }

@keyframes shrink {
  from { width: 100%; }
  to   { width: 0%; }
}

/* Transition */
.toast-enter-active { transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.toast-leave-active { transition: all 0.25s ease-in; }
.toast-enter-from   { transform: translateX(110%); opacity: 0; }
.toast-leave-to     { transform: translateX(110%); opacity: 0; }
</style>
