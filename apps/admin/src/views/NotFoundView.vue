<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="not-found">
    <h1 class="title">Page not found</h1>
    <p class="sub">
      No admin screen matches <code>{{ route.path }}</code>.
      If you just deployed, hard-refresh the browser (Ctrl+Shift+R) so the latest admin bundle loads.
    </p>
    <RouterLink to="/dashboard" class="btn">Back to dashboard</RouterLink>
  </div>
</template>

<style scoped>
.not-found {
  padding: 48px 24px;
  text-align: center;
  max-width: 520px;
  margin: 0 auto;
}
.title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 12px;
  color: var(--text-primary);
}
.sub {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0 0 20px;
}
code {
  font-size: 13px;
  background: var(--content-bg);
  padding: 2px 6px;
  border-radius: 4px;
}
.btn {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
}
</style>
