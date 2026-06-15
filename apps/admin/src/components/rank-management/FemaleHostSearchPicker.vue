<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as usersApi from '@/api/users'

export type FemaleHostOption = {
  id: string
  displayName: string
  hakaId: string | null
  state?: string | null
  country?: string | null
}

const props = defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [host: FemaleHostOption | null]
}>()

const root = ref<HTMLElement | null>(null)
const query = ref('')
const results = ref<FemaleHostOption[]>([])
const open = ref(false)
const searching = ref(false)
const selected = ref<FemaleHostOption | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function formatLabel(host: FemaleHostOption): string {
  const id = host.hakaId ?? host.id.slice(0, 8)
  const state = host.state?.trim()
  return state ? `${host.displayName} (${id}) · ${state}` : `${host.displayName} (${id})`
}

function hostValue(host: FemaleHostOption): string {
  return host.hakaId ?? host.id
}

async function searchHosts(term: string) {
  searching.value = true
  open.value = true
  try {
    const res = await usersApi.listUsers({
      search: term,
      role: 'host',
      gender: 'female',
      limit: 10,
    })
    results.value = (res.users ?? []) as FemaleHostOption[]
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

watch(query, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (selected.value && q !== formatLabel(selected.value)) {
    selected.value = null
    emit('update:modelValue', '')
    emit('select', null)
  }
  const term = q.trim()
  if (term.length < 2) {
    results.value = []
    open.value = false
    return
  }
  debounceTimer = setTimeout(() => searchHosts(term), 300)
})

function pick(host: FemaleHostOption) {
  selected.value = host
  query.value = formatLabel(host)
  emit('update:modelValue', hostValue(host))
  emit('select', host)
  open.value = false
}

function clear() {
  selected.value = null
  query.value = ''
  results.value = []
  open.value = false
  emit('update:modelValue', '')
  emit('select', null)
}

function onFocus() {
  if (query.value.trim().length >= 2 && results.value.length) open.value = true
}

function onDocClick(e: MouseEvent) {
  if (!root.value?.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  if (debounceTimer) clearTimeout(debounceTimer)
})

watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      if (!selected.value) return
      selected.value = null
      query.value = ''
      return
    }
    if (selected.value && hostValue(selected.value) === value) return
    query.value = value
  },
  { immediate: true },
)
</script>

<template>
  <div ref="root" class="host-picker">
    <div class="host-picker-input-wrap">
      <input
        class="form-input"
        type="search"
        :value="query"
        :disabled="disabled"
        placeholder="Search by name or Haka ID…"
        autocomplete="off"
        @input="query = ($event.target as HTMLInputElement).value"
        @focus="onFocus"
      />
      <button
        v-if="query"
        type="button"
        class="host-picker-clear"
        :disabled="disabled"
        aria-label="Clear selection"
        @click="clear"
      >
        ×
      </button>
    </div>
    <p class="host-picker-hint">Female hosts only — type at least 2 characters.</p>
    <div v-if="open" class="host-picker-dropdown">
      <p v-if="searching" class="host-picker-empty">Searching…</p>
      <p v-else-if="!results.length" class="host-picker-empty">No female hosts found.</p>
      <button
        v-for="host in results"
        :key="host.id"
        type="button"
        class="host-picker-item"
        @click="pick(host)"
      >
        <span class="host-picker-name">{{ host.displayName }}</span>
        <span class="host-picker-meta">
          Haka {{ host.hakaId ?? '—' }}
          <template v-if="host.state?.trim()"> · {{ host.state }}</template>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.host-picker {
  position: relative;
}
.host-picker-input-wrap {
  position: relative;
}
.host-picker-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.host-picker-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}
.host-picker-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  max-height: 240px;
  overflow-y: auto;
  z-index: 20;
}
.host-picker-empty {
  padding: 10px 12px;
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}
.host-picker-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 1px solid var(--card-border, #e2e8f0);
}
.host-picker-item:last-child {
  border-bottom: none;
}
.host-picker-item:hover {
  background: var(--row-hover, rgba(0, 0, 0, 0.04));
}
.host-picker-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.host-picker-meta {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-muted);
}
</style>
