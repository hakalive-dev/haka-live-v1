<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as usersApi from '@/api/users'

export type FemaleHostOption = {
  id: string
  displayName: string
  hakaId: string | null
  state?: string | null
  country?: string | null
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    /** User ids already added as house entries — hidden from results. */
    excludeUserIds?: string[]
  }>(),
  {
    disabled: false,
    excludeUserIds: () => [],
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [host: FemaleHostOption | null]
}>()

const root = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const results = ref<FemaleHostOption[]>([])
const open = ref(false)
const searching = ref(false)
const selected = ref<FemaleHostOption | null>(null)
const activeIndex = ref(-1)
const dropdownStyle = ref<Record<string, string>>({})

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let suppressQueryWatch = false
let requestSeq = 0

const excluded = computed(() => new Set(props.excludeUserIds))
const visibleResults = computed(() =>
  results.value.filter((host) => !excluded.value.has(host.id)),
)

function formatLabel(host: FemaleHostOption): string {
  const id = host.hakaId ?? host.id.slice(0, 8)
  const state = host.state?.trim()
  return state ? `${host.displayName} (${id}) · ${state}` : `${host.displayName} (${id})`
}

function hostValue(host: FemaleHostOption): string {
  return host.hakaId ?? host.id
}

function minSearchLength(term: string): number {
  return /^\d+$/.test(term) ? 1 : 2
}

function updateDropdownPosition() {
  const el = inputRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  dropdownStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${Math.max(rect.width, 280)}px`,
  }
}

async function fetchHosts(term: string) {
  const seq = ++requestSeq
  searching.value = true
  open.value = true
  updateDropdownPosition()
  try {
    const params: Record<string, string | number> = {
      role: 'host',
      gender: 'female',
      limit: 15,
      sort: 'displayName',
      order: 'asc',
    }
    if (term) params.search = term
    const res = await usersApi.listUsers(params)
    if (seq !== requestSeq) return
    results.value = (res.users ?? []) as FemaleHostOption[]
    activeIndex.value = visibleResults.value.length ? 0 : -1
  } catch {
    if (seq !== requestSeq) return
    results.value = []
    activeIndex.value = -1
  } finally {
    if (seq === requestSeq) searching.value = false
  }
}

function scheduleSearch(term: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = term.trim()
  if (trimmed.length < minSearchLength(trimmed)) {
    if (!selected.value) {
      results.value = []
      open.value = false
      activeIndex.value = -1
    }
    return
  }
  debounceTimer = setTimeout(() => {
    void fetchHosts(trimmed)
  }, 250)
}

function onQueryInput(value: string) {
  if (suppressQueryWatch) return
  if (selected.value && value !== formatLabel(selected.value)) {
    selected.value = null
    emit('update:modelValue', '')
    emit('select', null)
  }
  query.value = value
  scheduleSearch(value)
}

function pick(host: FemaleHostOption) {
  suppressQueryWatch = true
  selected.value = host
  query.value = formatLabel(host)
  emit('update:modelValue', hostValue(host))
  emit('select', host)
  open.value = false
  activeIndex.value = -1
  void nextTick(() => {
    suppressQueryWatch = false
  })
}

function clear() {
  suppressQueryWatch = true
  selected.value = null
  query.value = ''
  results.value = []
  open.value = false
  activeIndex.value = -1
  emit('update:modelValue', '')
  emit('select', null)
  void nextTick(() => {
    suppressQueryWatch = false
    inputRef.value?.focus()
  })
}

async function onFocus() {
  updateDropdownPosition()
  if (selected.value) {
    open.value = false
    return
  }
  const trimmed = query.value.trim()
  if (trimmed.length >= minSearchLength(trimmed)) {
    if (!results.value.length) await fetchHosts(trimmed)
    else open.value = true
    return
  }
  await fetchHosts('')
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value && (e.key === 'ArrowDown' || e.key === 'Enter')) {
    void onFocus()
    e.preventDefault()
    return
  }
  if (!open.value) return

  const items = visibleResults.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!items.length) return
    activeIndex.value = (activeIndex.value + 1) % items.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!items.length) return
    activeIndex.value = activeIndex.value <= 0 ? items.length - 1 : activeIndex.value - 1
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const host = items[activeIndex.value]
    if (host) pick(host)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    open.value = false
    activeIndex.value = -1
  }
}

function onDocPointerDown(e: PointerEvent) {
  const target = e.target as Node
  if (root.value?.contains(target)) return
  const menu = document.getElementById('female-host-picker-menu')
  if (menu?.contains(target)) return
  open.value = false
  activeIndex.value = -1
}

function onScrollOrResize() {
  if (open.value) updateDropdownPosition()
}

watch(
  () => props.modelValue,
  (value) => {
    if (!value) {
      if (!selected.value && !query.value) return
      suppressQueryWatch = true
      selected.value = null
      query.value = ''
      results.value = []
      open.value = false
      activeIndex.value = -1
      void nextTick(() => {
        suppressQueryWatch = false
      })
      return
    }
    if (selected.value && hostValue(selected.value) === value) return
    query.value = value
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
  if (debounceTimer) clearTimeout(debounceTimer)
})

defineExpose({ clear })
</script>

<template>
  <div ref="root" class="host-picker">
    <div class="host-picker-input-wrap" :class="{ 'host-picker-input-wrap--selected': !!selected }">
      <span class="host-picker-icon" aria-hidden="true">⌕</span>
      <input
        ref="inputRef"
        class="host-picker-input"
        type="text"
        :value="query"
        :disabled="disabled"
        placeholder="Search female host by name or Haka ID"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        @input="onQueryInput(($event.target as HTMLInputElement).value)"
        @focus="onFocus"
        @keydown="onKeydown"
      />
      <button
        v-if="query && !disabled"
        type="button"
        class="host-picker-clear"
        aria-label="Clear selection"
        @mousedown.prevent
        @click="clear"
      >
        ×
      </button>
    </div>
    <p class="host-picker-hint">
      Female hosts only. Type to search, or focus to browse recent hosts.
    </p>

    <Teleport to="body">
      <div
        v-if="open"
        id="female-host-picker-menu"
        class="host-picker-dropdown"
        :style="dropdownStyle"
        role="listbox"
        @mousedown.prevent
      >
        <p v-if="searching" class="host-picker-empty">Searching…</p>
        <p v-else-if="!visibleResults.length" class="host-picker-empty">
          {{ query.trim() ? 'No female hosts match that search.' : 'No female hosts found.' }}
        </p>
        <button
          v-for="(host, index) in visibleResults"
          :key="host.id"
          type="button"
          class="host-picker-item"
          :class="{ 'host-picker-item--active': index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          @mouseenter="activeIndex = index"
          @click="pick(host)"
        >
          <span class="host-picker-name">{{ host.displayName }}</span>
          <span class="host-picker-meta">
            Haka {{ host.hakaId ?? '—' }}
            <template v-if="host.state?.trim()"> · {{ host.state }}</template>
          </span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.host-picker {
  position: relative;
  width: 100%;
  min-width: 0;
}

.host-picker-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.host-picker-input-wrap--selected .host-picker-input {
  border-color: #10b981;
  background: #10b98108;
}

.host-picker-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  pointer-events: none;
  z-index: 1;
}

.host-picker-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 32px 8px 30px;
  border-radius: 8px;
  border: 1px solid var(--card-border, #e2e8f0);
  background: var(--card-bg, #fff);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.host-picker-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft, rgba(255, 85, 0, 0.12));
}

.host-picker-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.host-picker-clear:hover {
  color: var(--text-primary);
}

.host-picker-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}
</style>

<style>
/* Teleported menu — unscoped so it renders correctly on document.body */
.host-picker-dropdown {
  position: fixed;
  z-index: 4000;
  background: var(--card-bg, #fff);
  border: 1px solid var(--card-border, #e2e8f0);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  max-height: min(280px, 40vh);
  overflow-y: auto;
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
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 1px solid var(--card-border, #e2e8f0);
}

.host-picker-item:last-child {
  border-bottom: none;
}

.host-picker-item:hover,
.host-picker-item--active {
  background: var(--row-hover, #fafafc);
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
