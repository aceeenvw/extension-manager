// ⊹ EXTENSION MANAGER ⊹ — enhances SillyTavern's Manage Extensions popup.
// Author: aceenvw.

import {
    extension_settings,
    renderExtensionTemplateAsync,
    extensionTypes,
    enableExtension,
    disableExtension,
} from '../../../extensions.js';
import { saveSettingsDebounced, getRequestHeaders } from '../../../../script.js';

// Namespace prefix for every key, marker class and dataset flag — keeps our
// hooks collision-free and idempotent.
const NS = (() => {
    const deltas = [2, 2, 0, 9, 8, 1]; // diffs between consecutive author bytes
    let code = 97; // 'a'
    let s = String.fromCharCode(code);
    for (const d of deltas) { code += d; s += String.fromCharCode(code); }
    return s.slice(0, 3) + 'exm'; // e.g. "aceexm" — short, collision-resistant
})();

const MODULE_SETTINGS_KEY = 'aevExtensionsManager';
const MARKER = NS + '-on';            // marks already-enhanced popups
const CACHE_KEY = NS + '-vcache';     // version cache slot in settings

// Quiet logger — warns only on real failures, one tagged line.
const TAG = 'EXM';
const warn = (step, err) => console.warn(`[${TAG}] ${step}`, err);

function getContext() {
    return SillyTavern.getContext();
}

// ── i18n ──────────────────────────────────────────────────────────────────
const I18N = {
    en: {
        'settings.intro': 'Enhances the native Manage Extensions panel: your installed extensions on top, built-ins tucked away, faster, with a few handy buttons.',
        'settings.behaviorHeading': 'Behavior',
        'settings.enabled': 'Enable enhancements',
        'settings.enabledDesc': 'Post-process the Manage Extensions popup when it opens.',
        'settings.collapseBuiltin': 'Collapse built-in extensions',
        'settings.collapseBuiltinDesc': "Group SillyTavern's built-in extensions into a dropdown, collapsed by default.",
        'settings.bulkEdit': 'Bulk editing',
        'settings.bulkEditDesc': 'Replace the native "Toggle extensions" control with a Select mode for bulk enable, disable and delete.',
        'settings.autoCheck': 'Check updates on open',
        'settings.autoCheckDesc': 'Show the update progress when the panel opens. Turn off to keep the panel idle — use the Refresh button to check on demand.',
        'settings.buttonsHeading': 'Buttons',
        'settings.btnSearch': 'Search box',
        'settings.btnSearchDesc': 'Filter the list by name or author.',
        'settings.btnRefresh': 'Refresh updates button',
        'settings.btnRefreshDesc': 'Manually re-check for extension updates.',
        'settings.btnCopy': 'Copy install URL',
        'settings.btnCopyDesc': 'Per-extension button to copy its repository URL.',

        'ui.installedHeading': 'Installed Extensions:',
        'ui.builtinHeading': 'Built-in Extensions',
        'ui.search': 'Search extensions…',
        'ui.refresh': 'Refresh updates',
        'ui.copyUrl': 'Copy install URL',
        'ui.copied': 'Install URL copied',
        'ui.copyFailed': 'No URL available to copy',

        'ui.select': 'Select',
        'ui.cancel': 'Cancel',
        'ui.selectAll': 'Select all',
        'ui.selectNone': 'Select none',
        'ui.bulkEnable': 'Enable',
        'ui.bulkDisable': 'Disable',
        'ui.bulkDelete': 'Delete',
        'ui.selectedCount': '{n} selected',
        'ui.confirmDeleteTitle': 'Delete extensions',
        'ui.confirmDelete': 'Delete {n} selected extension(s)? This cannot be undone.',
        'ui.nothingSelected': 'No extensions selected',
        'ui.bulkDone': 'Done. Reloading…',
    },
    ru: {
        'settings.intro': 'Улучшает стандартную панель управления расширениями: ваши установленные расширения сверху, встроенные — свёрнуты, быстрее и с парой удобных кнопок.',
        'settings.behaviorHeading': 'Поведение',
        'settings.enabled': 'Включить улучшения',
        'settings.enabledDesc': 'Обрабатывать окно управления расширениями при открытии.',
        'settings.collapseBuiltin': 'Сворачивать встроенные расширения',
        'settings.collapseBuiltinDesc': 'Сгруппировать встроенные расширения SillyTavern в выпадающий список, свёрнутый по умолчанию.',
        'settings.bulkEdit': 'Массовое редактирование',
        'settings.bulkEditDesc': 'Заменить стандартную кнопку «Toggle extensions» режимом выбора для массового включения, отключения и удаления.',
        'settings.autoCheck': 'Проверять обновления при открытии',
        'settings.autoCheckDesc': 'Показывать прогресс проверки при открытии панели. Отключите, чтобы панель не нагружалась — используйте кнопку «Обновить» для проверки вручную.',
        'settings.buttonsHeading': 'Кнопки',
        'settings.btnSearch': 'Поле поиска',
        'settings.btnSearchDesc': 'Фильтровать список по названию или автору.',
        'settings.btnRefresh': 'Кнопка проверки обновлений',
        'settings.btnRefreshDesc': 'Вручную проверить обновления расширений.',
        'settings.btnCopy': 'Копировать ссылку установки',
        'settings.btnCopyDesc': 'Кнопка для копирования ссылки на репозиторий расширения.',

        'ui.installedHeading': 'Установленные расширения:',
        'ui.builtinHeading': 'Встроенные расширения',
        'ui.search': 'Поиск расширений…',
        'ui.refresh': 'Проверить обновления',
        'ui.copyUrl': 'Копировать ссылку установки',
        'ui.copied': 'Ссылка установки скопирована',
        'ui.copyFailed': 'Нет ссылки для копирования',

        'ui.select': 'Выбрать',
        'ui.cancel': 'Отмена',
        'ui.selectAll': 'Выбрать все',
        'ui.selectNone': 'Снять выбор',
        'ui.bulkEnable': 'Включить',
        'ui.bulkDisable': 'Отключить',
        'ui.bulkDelete': 'Удалить',
        'ui.selectedCount': 'Выбрано: {n}',
        'ui.confirmDeleteTitle': 'Удаление расширений',
        'ui.confirmDelete': 'Удалить выбранные расширения ({n})? Это действие необратимо.',
        'ui.nothingSelected': 'Расширения не выбраны',
        'ui.bulkDone': 'Готово. Перезагрузка…',
    },
};
let LANG = 'en';

function detectLang() {
    const candidates = [];
    try {
        const c = getContext();
        if (c && typeof c.getCurrentLocale === 'function') candidates.push(c.getCurrentLocale());
        candidates.push(c?.powerUserSettings?.locale);
    } catch (_) { /* ignore */ }
    try { candidates.push(localStorage.getItem('language')); } catch (_) { /* ignore */ }
    for (const raw of candidates) {
        if (typeof raw !== 'string' || !raw) continue;
        if (raw.toLowerCase().split(/[-_]/)[0] === 'ru') return 'ru';
    }
    return 'en';
}

function t(key, params) {
    let str = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
    if (params) {
        str = str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
    }
    return str;
}

function i18nApplyDom(root) {
    if (!root) return;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const v = t(el.getAttribute('data-i18n'));
        if (v) el.textContent = v;
    });
    const attrs = [['data-i18n-title', 'title'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label']];
    for (const [dataAttr, realAttr] of attrs) {
        root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
            el.setAttribute(realAttr, t(el.getAttribute(dataAttr)));
        });
    }
}

// ── Settings ────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
    enabled: true,
    collapseBuiltin: true,
    bulkEdit: true,
    autoCheckOnOpen: true,
    btnSearch: true,
    btnRefresh: true,
    btnCopy: true,
    schemaVersion: 1,
};

function getSettings() {
    if (!extension_settings[MODULE_SETTINGS_KEY] || typeof extension_settings[MODULE_SETTINGS_KEY] !== 'object') {
        extension_settings[MODULE_SETTINGS_KEY] = structuredClone(DEFAULT_SETTINGS);
    }
    const s = extension_settings[MODULE_SETTINGS_KEY];
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        if (!(k in s)) s[k] = structuredClone(v);
    }
    return s;
}

function saveSettings() {
    saveSettingsDebounced();
}

async function injectSettingsPanel() {
    const html = await renderExtensionTemplateAsync(getExtensionName(), 'settings');
    const $node = $(html);
    $('#extensions_settings').append($node);
    if ($node[0]) i18nApplyDom($node[0]);
    bindSettingsUI();
}

const TOGGLE_KEYS = ['enabled', 'collapseBuiltin', 'bulkEdit', 'autoCheckOnOpen', 'btnSearch', 'btnRefresh', 'btnCopy'];
const TOGGLE_IDS = {
    enabled: 'exm_enabled',
    collapseBuiltin: 'exm_collapse_builtin',
    bulkEdit: 'exm_bulk_edit',
    autoCheckOnOpen: 'exm_auto_check',
    btnSearch: 'exm_btn_search',
    btnRefresh: 'exm_btn_refresh',
    btnCopy: 'exm_btn_copy',
};

function bindSettingsUI() {
    const s = getSettings();
    for (const key of TOGGLE_KEYS) {
        const $el = $('#' + TOGGLE_IDS[key]);
        if (!$el.length) continue;
        $el.prop('checked', !!s[key]);
        $el.off('change.exm').on('change.exm', function () {
            s[key] = $(this).prop('checked');
            saveSettings();
        });
    }
}

/** Resolve the extension folder name from the module URL. */
function getExtensionName() {
    const m = String(import.meta.url).match(/\/scripts\/extensions\/(.+)\/[^/]+$/);
    return m ? m[1] : 'third-party/extensions-manager';
}

// ── Popup detection ───────────────────────────────────────────────────────
// Watch for the native popup (`.extensions_info`) and enhance it in place; the
// MARKER class keeps each render enhanced exactly once.

/** Not-yet-enhanced manage-extensions popups in the DOM. */
function findManagePopups() {
    return Array.from(document.querySelectorAll('.extensions_info'))
        .filter((el) => !el.classList.contains(MARKER));
}

function handleManagePopup(popup) {
    if (!popup || popup.classList.contains(MARKER)) return;
    if (!getSettings().enabled) return;
    popup.classList.add(MARKER);
    try {
        enhanceManagePopup(popup);
    } catch (err) {
        warn('enhance', err);
    }
}

// Phones: full-screen the dialog (class beats ST's wide/large sizing).
const PHONE_MQ = '(max-width: 600px)';
function applyFullscreen(popup) {
    const dlg = popup.closest('dialog.popup');
    if (!dlg) return;
    const cls = NS + '-fullscreen';
    const sync = () => dlg.classList.toggle(cls, window.matchMedia(PHONE_MQ).matches);
    sync();
    if (!dlg.dataset[NS + 'Fs']) {
        dlg.dataset[NS + 'Fs'] = '1';
        const mq = window.matchMedia(PHONE_MQ);
        const onChange = () => { if (dlg.isConnected) sync(); else mq.removeEventListener('change', onChange); };
        mq.addEventListener('change', onChange);
    }
}

// ── Regroup ─────────────────────────────────────────────────────────────────

/** Locate the built-in and installed container divs (null if not found). */
function findContainers(popup) {
    const divs = Array.from(popup.querySelectorAll(':scope > div.marginBot10'));
    let builtin = null;
    let installed = null;
    for (const div of divs) {
        // Installed = the container with the third-party toolbar.
        if (div.querySelector('.third_party_toolbar')) {
            installed = div;
            continue;
        }
        // Built-in = container with a heading and actual extension blocks.
        if (div.querySelector(':scope > h3') && div.querySelector('.extension_block')) {
            if (!builtin) builtin = div;
        }
    }
    return { builtin, installed };
}

// ── Version cache + instant paint ─────────────────────────────────────────────
// Cache sweep results so author/branch/link paint instantly on next open.

function getCache() {
    const s = getSettings();
    if (!s[CACHE_KEY] || typeof s[CACHE_KEY] !== 'object') s[CACHE_KEY] = {};
    return s[CACHE_KEY];
}

/** Parse a block's version fields into discrete parts (avoids re-accumulation). */
function readBlockVersionData(block) {
    const nameEl = block.querySelector('.extension_name');
    const authorEl = block.querySelector('.extension_author');
    const versionEl = block.querySelector('.extension_version');
    const link = block.querySelector('a');

    // Author is the text of the author span, excluding the leading @ icon.
    let author = '';
    if (authorEl) {
        const span = authorEl.querySelector('span');
        author = (span ? span.textContent : authorEl.textContent || '').trim();
    }

    // Split "<version>" or "<version> (branch-hash)".
    const rawVersion = (versionEl?.textContent || '').trim();
    const m = rawVersion.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    const version = (m ? m[1] : rawVersion).trim();
    const branch = m ? m[2].trim() : '';

    return {
        updateAvailable: !!nameEl?.classList.contains('update_available'),
        author,
        version,
        branch,
        href: link && link.getAttribute('href') ? link.getAttribute('href') : '',
        ts: Date.now(),
    };
}

/** Apply non-accumulating native effects (update badge, repo link) + meta line. */
function paintCachedVersion(block, data) {
    if (!data) return;
    const nameEl = block.querySelector('.extension_name');
    const versionEl = block.querySelector('.extension_version');
    const link = block.querySelector('a');

    // Non-accumulating native effects we still want: update badge + repo link.
    if (data.updateAvailable && nameEl) {
        nameEl.classList.add('update_available');
        block.querySelector('.btn_update')?.classList.remove('displayNone');
    }
    if (data.href && link && !link.getAttribute('href')) {
        try {
            const url = new URL(data.href);
            if (['http:', 'https:'].includes(url.protocol)) {
                link.href = url.href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            }
        } catch (_) { /* ignore */ }
    }

    renderMetaLine(block, data, versionEl);
}

/** Build/replace the single `.exm-meta` line — "Name (version - branch) — author". */
function renderMetaLine(block, data, versionEl) {
    const statusSpan = block.querySelector('.extension_enabled, .extension_disabled, .extension_missing');
    if (!statusSpan) return;

    // Author + version from manifest so they show instantly (cache-independent).
    const manifest = getBlockManifest(block);
    const version = (manifest?.version || data.version
        || (versionEl ? versionEl.textContent.replace(/\s*\([^()]+\)\s*$/, '').trim() : '') || '').trim();

    // Built-ins show "Name (version)" only.
    const isExternal = ['local', 'global'].includes(getExtType(block.getAttribute('data-name')));
    const branch = isExternal ? (data.branch || '') : '';
    const author = isExternal ? (manifest?.author || data.author || '').trim() : '';

    let paren = '';
    if (version && branch) paren = ` (${version} - ${branch})`;
    else if (version) paren = ` (${version})`;
    else if (branch) paren = ` (${branch})`;
    const authorPart = author ? ` — ${author}` : '';

    let meta = statusSpan.querySelector(':scope > .exm-meta');
    if (!meta) {
        meta = document.createElement('span');
        meta.className = 'exm-meta';
        statusSpan.appendChild(meta);
    }
    meta.textContent = paren + authorPart; // replace → never accumulates
}

/** Paint every block immediately; set up sweep handling. */
function applyVersionCache(popup) {
    const cache = getCache();
    const blocks = popup.querySelectorAll('.extension_block[data-name]');
    blocks.forEach((block) => {
        const name = block.getAttribute('data-name');
        if (!name) return;
        paintCachedVersion(block, cache[name] || {});
    });

    const showProgress = getSettings().autoCheckOnOpen || _forceProgressOnce;
    _forceProgressOnce = false;
    if (showProgress) {
        setupSweepProgress(popup);
        observeNativeVersionWrites(popup);
    } else {
        // On-demand mode → hide native's banner so search is usable at once.
        hideNativeLoadingBanner(popup);
    }
}

/** Hide native's "Loading…" banner (on-demand mode). */
function hideNativeLoadingBanner(popup) {
    const spinner = popup.querySelector('.fa-spinner.fa-spin');
    const banner = spinner ? spinner.closest('.flex-container') : null;
    if (banner) banner.classList.add(NS + '-hidden');
}

// ── Sweep progress ring ───────────────────────────────────────────────────────
// Replace native's loading spinner with a percentage ring (no CSS animation).

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

/** Count installed blocks and how many have been swept. */
function sweepCounts(popup) {
    const installed = getInstalledContainer(popup);
    const blocks = installed
        ? Array.from(installed.querySelectorAll('.extension_block[data-name]'))
        : Array.from(popup.querySelectorAll('.extension_block[data-name]'));
    let done = 0;
    for (const b of blocks) {
        const link = b.querySelector('a');
        const author = b.querySelector('.extension_author');
        const swept = (link && link.getAttribute('href')) || (author && author.textContent.trim());
        if (swept) done++;
    }
    return { done, total: blocks.length };
}

/** Replace native's loading banner with the progress ring (once). */
function setupSweepProgress(popup) {
    if (popup.dataset[NS + 'Prog']) return;
    popup.dataset[NS + 'Prog'] = '1';

    const spinner = popup.querySelector('.fa-spinner.fa-spin');
    const banner = spinner ? spinner.closest('.flex-container') : null;
    if (!banner) return;

    // Explicit DOM/SVG nodes (no innerHTML) → no injection surface.
    const wrap = document.createElement('div');
    wrap.className = NS + '-progress flex-container alignItemsCenter justifyCenter';

    const SVGNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', NS + '-ring');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('aria-hidden', 'true');

    const bg = document.createElementNS(SVGNS, 'circle');
    bg.setAttribute('class', NS + '-ring-bg');
    bg.setAttribute('cx', '12');
    bg.setAttribute('cy', '12');
    bg.setAttribute('r', String(RING_R));

    const fg = document.createElementNS(SVGNS, 'circle');
    fg.setAttribute('class', NS + '-ring-fg');
    fg.setAttribute('cx', '12');
    fg.setAttribute('cy', '12');
    fg.setAttribute('r', String(RING_R));
    fg.setAttribute('stroke-dasharray', RING_C.toFixed(2));
    fg.setAttribute('stroke-dashoffset', RING_C.toFixed(2));

    svg.append(bg, fg);

    const label = document.createElement('span');
    label.className = NS + '-progress-label';
    label.textContent = '0%';

    wrap.append(svg, label);

    banner.replaceWith(wrap);
    popup.dataset[NS + 'ProgEl'] = '1';
    updateSweepProgress(popup);
}

function updateSweepProgress(popup) {
    const wrap = popup.querySelector('.' + NS + '-progress');
    if (!wrap) return;
    const { done, total } = sweepCounts(popup);
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
    const fg = wrap.querySelector('.' + NS + '-ring-fg');
    const label = wrap.querySelector('.' + NS + '-progress-label');
    if (fg) fg.style.strokeDashoffset = String((RING_C * (1 - pct / 100)).toFixed(2));
    if (label) label.textContent = pct + '%';
}

/** Sweep done → fade the ring out and remove it. */
function finishSweepProgress(popup) {
    const wrap = popup.querySelector('.' + NS + '-progress');
    if (!wrap) return;
    updateSweepProgress(popup);
    wrap.classList.add(NS + '-progress-done');
    setTimeout(() => wrap.remove(), 600);
}

/** True if a mutation is native's, not ours (filter class / .exm-meta). */
function isNativeMutation(rec) {
    const target = rec.target;
    if (target instanceof HTMLElement) {
        if (target.classList?.contains('exm-meta')) return false;
        if (rec.type === 'attributes' && rec.attributeName === 'class') {
            const had = (rec.oldValue || '').includes(NS + '-filtered');
            const has = target.classList.contains(NS + '-filtered');
            if (had !== has) return false;
        }
    }
    return true;
}

/** Snapshot the sweep into cache + drive progress, then self-disconnect. */
function observeNativeVersionWrites(popup) {
    if (popup.dataset[NS + 'VObserved']) return;
    popup.dataset[NS + 'VObserved'] = '1';

    let scheduled = false;
    let idleTimer = null;
    let obs = null;

    const stop = () => {
        if (obs) { obs.disconnect(); obs = null; }
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    };

    const isSweepDone = () => !popup.querySelector('.fa-spinner.fa-spin');
    const isPopupGone = () => !popup.isConnected;

    const snapshot = () => {
        scheduled = false;
        if (isPopupGone()) { stop(); return; }

        const cache = getCache();
        let changed = false;
        popup.querySelectorAll('.extension_block[data-name]').forEach((block) => {
            const name = block.getAttribute('data-name');
            if (!name) return;
            const data = readBlockVersionData(block);
            if (data.author || data.href || data.version || data.branch || data.updateAvailable) {
                cache[name] = data;
                changed = true;
                paintCachedVersion(block, data);
            }
        });
        if (changed) saveSettings();

        updateSweepProgress(popup);
        try { sortInstalledByName(popup); } catch (_) { /* ignore */ }

        if (isSweepDone()) {
            finishSweepProgress(popup);
            stop();
        }
    };

    obs = new MutationObserver((records) => {
        if (isPopupGone()) { stop(); return; }
        if (!records.some(isNativeMutation)) return; // skip our own mutations
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { snapshot(); stop(); }, 4000);
        if (scheduled) return;
        scheduled = true;
        setTimeout(snapshot, 600);
    });
    obs.observe(popup, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'href'] });

    setTimeout(stop, 30000); // hard ceiling
}

function enhanceManagePopup(popup) {
    const s = getSettings();
    const { builtin, installed } = findContainers(popup);

    // Full-screen the popup on phones.
    try { applyFullscreen(popup); } catch (err) { warn('fullscreen', err); }

    // Paint immediately so the panel looks complete.
    try { applyVersionCache(popup); } catch (err) { warn('paint', err); }

    // Installed extensions on top.
    if (installed && builtin && installed.parentElement && installed.parentElement === builtin.parentElement) {
        const pos = installed.compareDocumentPosition(builtin);
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
            installed.parentElement.insertBefore(installed, builtin);
        }
    }

    // Built-ins into a collapsed drawer.
    if (s.collapseBuiltin && builtin && !builtin.dataset[NS + 'Drawerized']) {
        wrapBuiltinInDrawer(builtin);
    }

    try { injectToolbarButtons(popup); } catch (err) { warn('toolbar', err); }
    if (s.btnCopy) {
        try { injectRowButtons(popup); } catch (err) { warn('rows', err); }
    }
    if (s.bulkEdit && installed) {
        bulkState.active = false;
        try { injectBulkEdit(popup, installed); } catch (err) { warn('bulk', err); }
    }
    try { skinToggles(popup); } catch (err) { warn('toggles', err); }
    try { sortInstalledByName(popup); } catch (err) { warn('sort', err); }
}

/** Wrap each native enable/disable checkbox with track+thumb spans (theme-proof). */
function skinToggles(popup) {
    popup.querySelectorAll('.extension_toggle > input[type="checkbox"]').forEach((input) => {
        if (input.parentElement?.classList.contains(NS + '-sw')) return;
        const sw = document.createElement('span');
        sw.className = NS + '-sw';
        const track = document.createElement('span');
        track.className = NS + '-sw-track';
        const thumb = document.createElement('span');
        thumb.className = NS + '-sw-thumb';
        track.appendChild(thumb);
        input.replaceWith(sw);
        sw.append(input, track);
    });
}

// ── Bulk editing ──────────────────────────────────────────────────────────────
// Select mode: per-row checkboxes + a bar to enable/disable/delete (installed).

const bulkState = { active: false };

function injectBulkEdit(popup, installed) {
    const tpToolbar = installed.querySelector('.third_party_toolbar');
    if (!tpToolbar || tpToolbar.dataset[NS + 'Bulk']) return;
    tpToolbar.dataset[NS + 'Bulk'] = '1';

    // Hide native toggle-all + restore buttons.
    tpToolbar.querySelectorAll(':scope > .menu_button').forEach((el) => {
        el.classList.add(NS + '-hidden-native');
    });

    const selectBtn = document.createElement('div');
    selectBtn.className = 'menu_button menu_button_icon ' + NS + '-select-btn';
    const selIcon = document.createElement('i');
    selIcon.className = 'fa-solid fa-square-check';
    const selLabel = document.createElement('span');
    selLabel.textContent = t('ui.select');
    selectBtn.append(selIcon, selLabel);
    tpToolbar.appendChild(selectBtn);

    const bar = buildBulkBar(popup, installed);
    bar.classList.add(NS + '-hidden');
    const header = installed.querySelector(':scope > .flex-container') || installed.firstElementChild;
    if (header && header.parentElement === installed) header.after(bar);
    else installed.prepend(bar);

    selectBtn.addEventListener('click', () => toggleSelectMode(popup, installed, bar, selLabel, selIcon));
}

function installedBlocks(installed) {
    return Array.from(installed.querySelectorAll('.extension_block[data-name]'));
}

function toggleSelectMode(popup, installed, bar, selLabel, selIcon) {
    bulkState.active = !bulkState.active;
    bar.classList.toggle(NS + '-hidden', !bulkState.active);
    popup.classList.toggle(NS + '-selecting', bulkState.active);
    selLabel.textContent = bulkState.active ? t('ui.cancel') : t('ui.select');
    selIcon.className = bulkState.active ? 'fa-solid fa-xmark' : 'fa-solid fa-square-check';

    installedBlocks(installed).forEach((block) => {
        if (bulkState.active) ensureSelectCheckbox(block, bar);
        else {
            const cb = block.querySelector('.' + NS + '-select');
            if (cb) cb.checked = false;
        }
    });
    updateBulkCount(installed, bar);
}

function ensureSelectCheckbox(block, bar) {
    if (block.querySelector('.' + NS + '-select-wrap')) return;
    const wrap = document.createElement('label');
    wrap.className = NS + '-select-wrap';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = NS + '-select';
    cb.addEventListener('change', () => {
        const installed = block.closest('.marginBot10');
        if (installed) updateBulkCount(installed, bar);
    });
    wrap.appendChild(cb);
    block.prepend(wrap);
}

function selectedBlocks(installed) {
    return installedBlocks(installed).filter((b) => b.querySelector('.' + NS + '-select')?.checked);
}

function updateBulkCount(installed, bar) {
    const n = selectedBlocks(installed).length;
    const counter = bar.querySelector('.' + NS + '-count');
    if (counter) counter.textContent = t('ui.selectedCount', { n });
}

function buildBulkBar(popup, installed) {
    const bar = document.createElement('div');
    bar.className = 'flex-container ' + NS + '-bulkbar';

    const count = document.createElement('span');
    count.className = NS + '-count';
    count.textContent = t('ui.selectedCount', { n: 0 });

    const mkBtn = (label, icon, cls, handler) => {
        const b = document.createElement('div');
        b.className = 'menu_button menu_button_icon ' + cls;
        const i = document.createElement('i');
        i.className = icon;
        const s = document.createElement('span');
        s.textContent = label;
        b.append(i, s);
        b.addEventListener('click', handler);
        return b;
    };

    const allBtn = mkBtn(t('ui.selectAll'), 'fa-solid fa-check-double', NS + '-all', () => {
        installedBlocks(installed).forEach((block) => {
            ensureSelectCheckbox(block, bar);
            const cb = block.querySelector('.' + NS + '-select');
            if (cb) cb.checked = true;
        });
        updateBulkCount(installed, bar);
    });
    const noneBtn = mkBtn(t('ui.selectNone'), 'fa-regular fa-square', NS + '-none', () => {
        installedBlocks(installed).forEach((block) => {
            const cb = block.querySelector('.' + NS + '-select');
            if (cb) cb.checked = false;
        });
        updateBulkCount(installed, bar);
    });
    const enableBtn = mkBtn(t('ui.bulkEnable'), 'fa-solid fa-toggle-on', NS + '-enable', () => bulkToggle(installed, true));
    const disableBtn = mkBtn(t('ui.bulkDisable'), 'fa-solid fa-toggle-off', NS + '-disable', () => bulkToggle(installed, false));
    const deleteBtn = mkBtn(t('ui.bulkDelete'), 'fa-solid fa-trash-can', NS + '-delete', () => bulkDelete(installed));
    deleteBtn.classList.add(NS + '-danger');

    const spacer = document.createElement('div');
    spacer.className = 'expander';

    bar.append(count, spacer, allBtn, noneBtn, enableBtn, disableBtn, deleteBtn);
    return bar;
}

/** Bulk enable/disable selected installed extensions, then one reload. */
async function bulkToggle(installed, enable) {
    const blocks = selectedBlocks(installed);
    if (!blocks.length) { toast('warning', t('ui.nothingSelected')); return; }
    const fn = enable ? enableExtension : disableExtension;
    for (const block of blocks) {
        const name = blockInternalName(block);
        if (!name) continue;
        try { await fn(name, false); } catch (err) { warn('toggle:' + name, err); }
    }
    toast('success', t('ui.bulkDone'));
    setTimeout(() => location.reload(), 700);
}

/** Bulk delete selected installed extensions via the API, then one reload. */
async function bulkDelete(installed) {
    const blocks = selectedBlocks(installed);
    if (!blocks.length) { toast('warning', t('ui.nothingSelected')); return; }

    const ok = await confirmPopup(t('ui.confirmDeleteTitle'), t('ui.confirmDelete', { n: blocks.length }));
    if (!ok) return;

    for (const block of blocks) {
        const extName = block.getAttribute('data-name');
        if (!extName) continue;
        const isGlobal = getExtType(extName) === 'global';
        try {
            await fetch('/api/extensions/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ extensionName: extName, global: isGlobal }),
            });
        } catch (err) {
            warn('delete:' + extName, err);
        }
    }
    toast('success', t('ui.bulkDone'));
    setTimeout(() => location.reload(), 700);
}

/** Resolve a block's internal name (with `third-party/` prefix) for native APIs. */
function blockInternalName(block) {
    const ext = block.getAttribute('data-name');
    if (!ext) return '';
    const keys = Object.keys(extensionTypes || {});
    return keys.find((k) => k === ext || (k.startsWith('third-party') && k.endsWith(ext))) || ext;
}

function getExtType(extName) {
    const keys = Object.keys(extensionTypes || {});
    const id = keys.find((k) => k === extName || (k.startsWith('third-party') && k.endsWith(extName)));
    return id ? extensionTypes[id] : '';
}

// Cache manifest lookups — they never change at runtime. getExtensionManifest
// is read from getContext() at call time (only on newer SillyTavern); on older
// builds it's absent and we fall back to sweep-derived author/version.
const _manifestCache = new Map();
function getBlockManifest(block) {
    const name = blockInternalName(block);
    if (!name) return null;
    if (_manifestCache.has(name)) return _manifestCache.get(name);
    let manifest = null;
    try {
        const fn = getContext()?.getExtensionManifest;
        if (typeof fn === 'function') manifest = fn(name);
    } catch (_) { manifest = null; }
    _manifestCache.set(name, manifest);
    return manifest;
}

async function confirmPopup(title, text) {
    try {
        const ctx = getContext();
        if (ctx?.Popup?.show?.confirm) {
            return await ctx.Popup.show.confirm(title, text);
        }
        if (ctx?.callGenericPopup && ctx.POPUP_TYPE) {
            const r = await ctx.callGenericPopup(`${title}\n\n${text}`, ctx.POPUP_TYPE.CONFIRM);
            return !!r;
        }
    } catch (_) { /* fall through */ }
    return window.confirm(`${title}\n\n${text}`);
}

// ── Toolbar / row buttons ─────────────────────────────────────────────────────

function toast(kind, msg) {
    try {
        const fn = globalThis.toastr;
        if (fn && typeof fn[kind] === 'function') fn[kind](msg);
    } catch (_) { /* ignore */ }
}

/** Add a search box and a refresh button to the popup toolbar. */
function injectToolbarButtons(popup) {
    const s = getSettings();
    const toolbar = popup.querySelector('.extensions_toolbar');
    if (!toolbar || toolbar.dataset[NS + 'Tools']) return;
    toolbar.dataset[NS + 'Tools'] = '1';

    // Hide native's sort button (it rebuilds the whole popup) + the expander so
    // the controls group together, then iconify the native update buttons.
    hideNativeSortButton(toolbar);
    toolbar.querySelector(':scope > .expander')?.classList.add(NS + '-hidden-native');
    iconifyNativeButtons(toolbar);

    if (s.btnSearch) {
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'text_pole ' + NS + '-search';
        search.placeholder = t('ui.search');
        search.setAttribute('aria-label', t('ui.search'));
        search.addEventListener('input', () => filterBlocks(popup, search.value));
        toolbar.insertBefore(search, toolbar.firstChild);
    }

    if (s.btnRefresh) {
        const btn = document.createElement('button');
        btn.className = 'menu_button menu_button_icon ' + NS + '-refresh ' + NS + '-iconbtn';
        btn.title = t('ui.refresh');
        btn.setAttribute('aria-label', t('ui.refresh'));
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-rotate';
        btn.appendChild(icon);
        btn.addEventListener('click', () => refreshUpdates(btn));
        toolbar.appendChild(btn);
    }
}

/** Hide native's "Sort: …" button (sits right after the toolbar expander). */
function hideNativeSortButton(toolbar) {
    const expander = toolbar.querySelector(':scope > .expander');
    const afterExpander = expander ? expander.nextElementSibling : null;
    if (afterExpander && afterExpander.tagName === 'BUTTON') {
        afterExpander.classList.add(NS + '-hidden-native');
    }
    toolbar.querySelectorAll(':scope > button').forEach((b) => {
        const txt = (b.textContent || '').toLowerCase();
        if (/\bsort\b|сортиров/.test(txt)) b.classList.add(NS + '-hidden-native');
    });
}

/** Turn native Update all / Update enabled text buttons into icon buttons. */
function iconifyNativeButtons(toolbar) {
    toolbar.querySelectorAll(':scope > button').forEach((b) => {
        if (b.classList.contains(NS + '-hidden-native') || b.dataset[NS + 'Icon']) return;
        const txt = (b.textContent || '').trim();
        if (!txt) return;
        const low = txt.toLowerCase();
        let iconClass = '';
        if (/all|все/.test(low)) iconClass = 'fa-solid fa-cloud-arrow-down';
        else if (/enabled|включ/.test(low)) iconClass = 'fa-solid fa-download';
        if (!iconClass) return;

        b.dataset[NS + 'Icon'] = '1';
        if (!b.title) b.title = txt;
        b.setAttribute('aria-label', txt);
        const icon = document.createElement('i');
        icon.className = iconClass;
        b.textContent = '';
        b.appendChild(icon);
        b.classList.add(NS + '-iconbtn');
    });
}

/** Sort installed extensions by name, in place (built-ins stay below). */
function sortInstalledByName(popup) {
    const container = getInstalledContainer(popup);
    if (!container) return;
    const blocks = Array.from(container.querySelectorAll('.extension_block[data-name]'));
    if (blocks.length < 2) return;

    const keyName = (b) => (b.querySelector('.extension_name')?.textContent || '').trim().toLowerCase();
    const sorted = blocks.slice().sort((a, b) => keyName(a).localeCompare(keyName(b)));

    // Skip the DOM write if order is already correct (avoids needless reflow).
    if (sorted.every((b, i) => b === blocks[i])) return;

    const parent = blocks[0].parentElement;
    if (!parent) return;
    const frag = document.createDocumentFragment();
    sorted.forEach((b) => frag.appendChild(b));
    parent.appendChild(frag);
}

/** Filter installed extensions by name (plain substring, no injection surface). */
function filterBlocks(popup, query) {
    const q = normalizeQuery(query);
    const installed = getInstalledContainer(popup);
    const scope = installed || popup;
    const blocks = scope.querySelectorAll('.extension_block[data-name]');
    blocks.forEach((block) => {
        if (!q) { block.classList.remove(NS + '-filtered'); return; }
        const name = (block.querySelector('.extension_name')?.textContent || '').toLowerCase();
        const match = name.includes(q);
        block.classList.toggle(NS + '-filtered', !match);
    });
}

/** Lowercased, trimmed, length-capped query. */
function normalizeQuery(query) {
    return String(query == null ? '' : query).trim().toLowerCase().slice(0, 200);
}

/** The installed container that holds the extension blocks. */
function getInstalledContainer(popup) {
    return findContainers(popup).installed;
}

/** Refresh updates: clear cache + reopen the panel to re-run the version sweep. */
async function refreshUpdates(btn) {
    const icon = btn.querySelector('i');
    icon?.classList.add('fa-spin');
    const s = getSettings();
    s[CACHE_KEY] = {};
    saveSettings();
    _forceProgressOnce = true; // show progress on the reopened popup
    setTimeout(() => {
        icon?.classList.remove('fa-spin');
        document.getElementById('extensions_details')?.click();
    }, 50);
}

// One-shot: Refresh forces progress on the next popup regardless of the setting.
let _forceProgressOnce = false;

/** Add per-row buttons (copy install URL) to each block. */
function injectRowButtons(popup) {
    const s = getSettings();
    popup.querySelectorAll('.extension_block').forEach((block) => {
        const actions = block.querySelector('.extension_actions');
        if (!actions || actions.dataset[NS + 'Rows']) return;
        actions.dataset[NS + 'Rows'] = '1';

        if (s.btnCopy) {
            const copyBtn = makeIconButton('fa-solid fa-link', t('ui.copyUrl'), NS + '-copy');
            copyBtn.addEventListener('click', () => copyInstallUrl(block));
            actions.insertBefore(copyBtn, actions.firstChild);
        }
    });
}

function makeIconButton(iconClasses, title, extraClass) {
    const btn = document.createElement('button');
    btn.className = 'menu_button ' + (extraClass || '');
    btn.title = title;
    btn.setAttribute('aria-label', title);
    const i = document.createElement('i');
    i.className = iconClasses;
    btn.appendChild(i);
    return btn;
}

function copyInstallUrl(block) {
    const link = block.querySelector('a');
    const href = link?.getAttribute('href') || '';
    if (!href) {
        // Try the cache as a fallback.
        const name = block.getAttribute('data-name');
        const cached = name ? getCache()[name] : null;
        if (cached?.href) return writeClipboard(cached.href);
        toast('warning', t('ui.copyFailed'));
        return;
    }
    writeClipboard(href);
}

function writeClipboard(text) {
    const done = () => toast('success', t('ui.copied'));
    try {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
        } else {
            legacyCopy(text, done);
        }
    } catch (_) {
        legacyCopy(text, done);
    }
}

function legacyCopy(text, done) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
    } catch (_) {
        toast('warning', t('ui.copyFailed'));
    }
}

/** Wrap the built-in container in a native inline-drawer, collapsed. */
function wrapBuiltinInDrawer(builtin) {
    builtin.dataset[NS + 'Drawerized'] = '1';

    // Pull the existing <h3> to use as the drawer label, hide it in place.
    const heading = builtin.querySelector(':scope > h3');
    const labelText = heading?.textContent?.trim() || t('ui.builtinHeading');
    if (heading) heading.style.display = 'none';

    const drawer = document.createElement('div');
    drawer.className = 'inline-drawer ' + NS + '-builtin-drawer';

    const toggle = document.createElement('div');
    toggle.className = 'inline-drawer-toggle inline-drawer-header';
    const b = document.createElement('b');
    b.textContent = labelText;
    const icon = document.createElement('div');
    icon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
    toggle.append(b, icon);

    const content = document.createElement('div');
    content.className = 'inline-drawer-content';
    content.style.display = 'none';

    builtin.parentElement.insertBefore(drawer, builtin);
    drawer.append(toggle, content);
    content.appendChild(builtin);

    toggle.addEventListener('click', () => {
        const open = content.style.display !== 'none';
        content.style.display = open ? 'none' : '';
        icon.classList.toggle('up', !open);
        icon.classList.toggle('down', open);
    });
}

// Detect the popup via a short, bounded watch tied to the open button — no
// idle global observer (keeps CPU/battery quiet).

let _popupWatch = null;

/** Briefly watch for the popup after a trigger; auto-stops. */
function watchForPopup() {
    if (!getSettings().enabled) return;

    const existing = findManagePopups();
    if (existing.length) { existing.forEach(handleManagePopup); return; }

    if (_popupWatch) return;
    const deadline = Date.now() + 8000;

    const tick = () => {
        const popups = findManagePopups();
        if (popups.length) { popups.forEach(handleManagePopup); stop(); return; }
        if (Date.now() > deadline) { stop(); return; }
    };
    const stop = () => {
        if (_popupWatch?.obs) _popupWatch.obs.disconnect();
        if (_popupWatch?.timer) clearTimeout(_popupWatch.timer);
        _popupWatch = null;
    };

    const layer = document.querySelector('dialog.popup, .popup_holder, #dialogue_popup, body') || document.body;
    const obs = new MutationObserver(tick);
    obs.observe(layer, { childList: true, subtree: true });
    const timer = setTimeout(stop, 8500); // never linger
    _popupWatch = { obs, timer };
    tick();
}

/** Bind the open triggers once. */
function bindOpenTriggers() {
    const detailsBtn = document.getElementById('extensions_details');
    if (detailsBtn && !detailsBtn.dataset[NS + 'Hooked']) {
        detailsBtn.dataset[NS + 'Hooked'] = '1';
        detailsBtn.addEventListener('click', () => setTimeout(watchForPopup, 0));
    }
    // Delegated fallback if the button is re-rendered.
    if (!document.body.dataset[NS + 'Deleg']) {
        document.body.dataset[NS + 'Deleg'] = '1';
        document.body.addEventListener('click', (e) => {
            if (e.target instanceof HTMLElement && e.target.closest('#extensions_details')) {
                setTimeout(watchForPopup, 0);
            }
        });
    }
}

jQuery(async () => {
    LANG = detectLang();
    getSettings();
    await injectSettingsPanel();
    bindOpenTriggers();
    watchForPopup();
});
