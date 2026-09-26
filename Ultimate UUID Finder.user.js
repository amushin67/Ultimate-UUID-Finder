// ==UserScript==
// @name         Ultimate UUID Finder
// @namespace    https://github.com/amushin67
// @version      1.0
// @description  Find original Grok posts online and on Grok itself.
// @author       Amu + Grok
// @match        *://*/*
// @icon         https://grok.com/images/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// @connect      grok.com
// @connect      assets.grok.com
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

// ========== SCRIPT 1: Detective (Grok) – sem Ani, miniaturas verticais abaixo do zoom ==========
(function () {
    'use strict';

    const SIZE = 144;
    const MAX_DEPTH = 4;
    const BTN_ID = 'dani-btn';
    const DROP_ID = 'dani-drop';
    const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

    const cache = new Map();
    let rafId = 0;

    function lastUuid(str) {
        if (!str) return null;
        const m = String(str).match(UUID_RE);
        return m ? m[m.length - 1].toLowerCase() : null;
    }

    function getPostUuid() {
        const m = location.pathname.match(/^\/imagine\/post\/([0-9a-f-]{36})/i);
        return m ? m[1].toLowerCase() : null;
    }

    async function fetchAsset(uuid) {
        if (cache.has(uuid)) return cache.get(uuid);
        try {
            const res = await fetch('/rest/assets/' + uuid, { credentials: 'include' });
            if (!res.ok) return null;
            const data = await res.json();
            cache.set(uuid, data);
            return data;
        } catch {
            return null;
        }
    }

    function extractRefs(data, exclude) {
        const found = new Set();
        const mgi = data?.mediaGenInput;

        if (mgi && typeof mgi === 'object') {
            for (const key of Object.keys(mgi)) {
                const block = mgi[key];
                if (Array.isArray(block?.inputAssets)) {
                    for (const id of block.inputAssets) {
                        if (typeof id === 'string' && id.length > 30) {
                            found.add(id.toLowerCase());
                        }
                    }
                }
            }
        }

        try {
            let raw = data?.auxKeys?.image_references;
            if (raw) {
                const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (Array.isArray(arr)) {
                    for (const url of arr) {
                        const u = lastUuid(url);
                        if (u) found.add(u);
                    }
                }
            }
        } catch {}

        if (exclude) found.delete(exclude);
        return [...found];
    }

    function buildThumbCandidates(uuid, owner, data) {
        const list = [];

        try {
            let raw = data?.auxKeys?.image_references;
            if (raw) {
                const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (Array.isArray(arr)) {
                    for (const u of arr) if (typeof u === 'string' && u.startsWith('http')) list.push(u);
                }
            }
        } catch {}

        const preview = data?.auxKeys?.['preview-image'];
        if (preview) list.push('https://assets.grok.com/' + preview + '?cache=1');

        if (owner) {
            list.push(`https://assets.grok.com/users/${owner}/generated/${uuid}/image.jpg?cache=1`);
            list.push(`https://assets.grok.com/users/${owner}/${uuid}/content?cache=1`);
            list.push(`https://assets.grok.com/users/${owner}/generated/${uuid}/content?cache=1`);
        }

        list.push(`https://assets.grok.com/generated/${uuid}/image.jpg?cache=1`);
        list.push(`https://assets.grok.com/generated/${uuid}/content?cache=1`);

        return [...new Set(list)];
    }

    async function collectParents(root) {
        const ordered = [];
        const seen = new Set([root]);
        let frontier = [root];
        let depth = 0;

        while (frontier.length && depth < MAX_DEPTH) {
            depth++;
            const next = [];
            for (const id of frontier) {
                const data = await fetchAsset(id);
                if (!data) continue;

                for (const ref of extractRefs(data, root)) {
                    if (seen.has(ref)) continue;
                    seen.add(ref);

                    const refData = await fetchAsset(ref);
                    const owner = (refData && refData.ownerUserId) || data.ownerUserId || null;
                    const isComposer = !(refData && refData.mediaGenInput);

                    ordered.push({
                        uuid: ref,
                        depth,
                        ownerUserId: owner,
                        isComposer,
                        thumbs: buildThumbCandidates(ref, owner, refData)
                    });
                    next.push(ref);
                }
            }
            frontier = next;
        }

        ordered.sort((a, b) => {
            if (a.isComposer && !b.isComposer) return -1;
            if (!a.isComposer && b.isComposer) return 1;
            return a.depth - b.depth;
        });

        return ordered;
    }

    function css() {
        if (document.getElementById('dani-css')) return;
        const s = document.createElement('style');
        s.id = 'dani-css';
        s.textContent = `
#${DROP_ID}{
  position:fixed!important;z-index:2147483647!important;
  display:none!important;
  flex-direction:column!important;flex-wrap:nowrap!important;gap:6px!important;
  padding:8px!important;border-radius:12px!important;
  background:#181716!important;
  border:none!important;
  box-shadow:0 12px 32px rgba(0,0,0,.6)!important;
  max-width:90px!important;max-height:70vh!important;overflow-y:auto!important;
}
#${DROP_ID}.open{display:flex!important}

#${DROP_ID} .thumb{
  width:72px!important;height:72px!important;
  object-fit:cover!important;border-radius:8px!important;
  cursor:pointer!important;border:none!important;
  transition:transform .12s,opacity .12s!important;
  background:#2a2a2a;
  flex-shrink:0!important;
}
#${DROP_ID} .thumb:hover{
  transform:scale(1.08)!important;opacity:.9!important;
}

#${BTN_ID}{
  position:fixed!important;
  width:36px!important;height:36px!important;
  padding:0!important;margin:0!important;border:none!important;
  background:rgba(24,23,22,.85)!important;
  border-radius:10px!important;
  cursor:pointer!important;z-index:2147483646!important;
  display:flex!important;align-items:center!important;justify-content:center!important;
  box-shadow:0 4px 14px rgba(0,0,0,.45)!important;
  transition:transform .12s,background .12s!important;
  font-size:18px!important;line-height:1!important;
  color:#fff!important;user-select:none!important;
}
#${BTN_ID}:hover{transform:scale(1.1)!important;background:rgba(40,38,36,.95)!important}
#${BTN_ID}.empty{display:none!important}
#${BTN_ID} .count{
  position:absolute!important;top:-6px!important;right:-6px!important;
  background:#3b82f6!important;color:#fff!important;
  font-size:11px!important;font-weight:700!important;
  min-width:18px!important;height:18px!important;
  border-radius:9px!important;
  display:flex!important;align-items:center!important;justify-content:center!important;
  padding:0 4px!important;box-shadow:0 2px 6px rgba(0,0,0,.4)!important;
}
`;
        (document.head || document.documentElement).appendChild(s);
    }

    function findZoomButton() {
        // Tenta achar o botão de zoom / full-screen / expand comum em páginas de mídia
        const candidates = document.querySelectorAll('button, [role="button"], a');
        for (const el of candidates) {
            const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
            if (
                label.includes('zoom') ||
                label.includes('fullscreen') ||
                label.includes('full screen') ||
                label.includes('expand') ||
                label.includes('maximize') ||
                label.includes('ampliar') ||
                label.includes('tela cheia')
            ) {
                return el;
            }
        }
        // Fallback: botões de ação conhecidos (Regenerate/Share/etc) – coloca à esquerda do painel
        for (const b of document.querySelectorAll('button')) {
            const t = (b.textContent || '').trim();
            if (t === 'Regenerate' || t === 'Share' || t === 'Extend' || t === 'Presets') {
                return b.closest('div[class*="flex"]') || b.parentElement;
            }
        }
        return null;
    }

    function updatePos() {
        const wrap = document.getElementById(BTN_ID);
        if (!wrap) return;

        const zoom = findZoomButton();
        let left, top;

        if (zoom) {
            const r = zoom.getBoundingClientRect();
            // Miniaturas e botão ficam logo abaixo do botão de zoom, alinhados à esquerda dele
            left = Math.round(r.left);
            top = Math.round(r.bottom + 8);
        } else {
            left = window.innerWidth - 56;
            top = window.innerHeight - 56;
        }

        wrap.style.cssText = `left:${left}px!important;top:${top}px!important;right:auto!important;bottom:auto!important`;

        const drop = document.getElementById(DROP_ID);
        if (drop) {
            // Coluna vertical logo abaixo do botão
            drop.style.cssText = `left:${left}px!important;top:${top + 42}px!important;bottom:auto!important;right:auto!important`;
        }
    }

    function schedulePos() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            updatePos();
        });
    }

    function openRef(uuid) {
        window.open('https://grok.com/imagine/post/' + uuid, '_blank');
    }

    function renderDrop(parents) {
        let drop = document.getElementById(DROP_ID);
        if (!drop) {
            drop = document.createElement('div');
            drop.id = DROP_ID;
            document.body.appendChild(drop);
        }
        drop.innerHTML = '';
        if (!parents.length) return;

        for (const p of parents) {
            const img = document.createElement('img');
            img.className = 'thumb';
            img.alt = '';

            const candidates = p.thumbs || [];
            let idx = 0;
            img.src = candidates[0] || '';

            img.onerror = () => {
                idx++;
                if (idx < candidates.length) {
                    img.src = candidates[idx];
                }
            };

            img.onclick = e => {
                e.preventDefault();
                e.stopPropagation();
                openRef(p.uuid);
                drop.classList.remove('open');
            };
            drop.appendChild(img);
        }
    }

    function place(count) {
        css();
        let wrap = document.getElementById(BTN_ID);
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = BTN_ID;
            wrap.title = 'Referências (pais)\nClique para abrir/fechar';
            wrap.textContent = '🔗';
            document.body.appendChild(wrap);

            wrap.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                document.getElementById(DROP_ID)?.classList.toggle('open');
            });

            document.addEventListener('click', e => {
                const drop = document.getElementById(DROP_ID);
                const btn = document.getElementById(BTN_ID);
                if (drop && btn && !drop.contains(e.target) && !btn.contains(e.target)) {
                    drop.classList.remove('open');
                }
            }, true);
        }

        // Badge de contagem
        let countEl = wrap.querySelector('.count');
        if (count > 0) {
            if (!countEl) {
                countEl = document.createElement('span');
                countEl.className = 'count';
                wrap.appendChild(countEl);
            }
            countEl.textContent = String(count);
        } else if (countEl) {
            countEl.remove();
        }

        wrap.classList.toggle('empty', count === 0);
        schedulePos();
    }

    async function run() {
        const uuid = getPostUuid();
        if (!uuid) {
            document.getElementById(BTN_ID)?.remove();
            document.getElementById(DROP_ID)?.remove();
            return;
        }

        place(0);

        const parents = await collectParents(uuid);
        place(parents.length);
        renderDrop(parents);
    }

    function start() {
        run();

        const obs = new MutationObserver(schedulePos);
        obs.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        window.addEventListener('resize', schedulePos);

        const push = history.pushState;
        const replace = history.replaceState;
        history.pushState = function () {
            push.apply(this, arguments);
            setTimeout(run, 200);
        };
        history.replaceState = function () {
            replace.apply(this, arguments);
            setTimeout(run, 200);
        };
        window.addEventListener('popstate', () => setTimeout(run, 200));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

// ========== SCRIPT 2: Lupa (Twitter/X + genéricos) – sem Ani ==========
(function () {
    'use strict';

    const host = location.hostname.toLowerCase();
    const isGrok = host === 'grok.com' || host.endsWith('.grok.com') || host.includes('grok.com');
    const isRedgifs = host === 'redgifs.com' || host.endsWith('.redgifs.com') || host.includes('redgifs.com');

    if (isGrok || isRedgifs) return;

    const MAKE_IMAGINE_LINK = uuid => `https://grok.com/imagine/post/${uuid}`;
    const MAKE_THUMB_LINK  = uuid => `https://grok.com/imagine/post/${uuid}/image`;
    const BYTES_TO_FETCH = 65536;
    const MARKER = 'titlex$';
    const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const ICON_CLASS = 'titlex-ani';
    const ICON_CLASS_X = 'grok-uuid-icon';

    const checkedUrls = new Set();
    const mediaState = new WeakMap();
    const thumbCache = new Map();
    let iconsVisible = true;

    GM_addStyle(`
        .${ICON_CLASS}, .${ICON_CLASS_X} {
            position: absolute !important;
            bottom: 4px !important;
            right: 4px !important;
            z-index: 2147483647 !important;
            width: 22px !important;
            height: 22px !important;
            font-size: 16px !important;
            line-height: 22px !important;
            text-align: center !important;
            cursor: pointer !important;
            transition: transform .15s ease, opacity .15s ease !important;
            user-select: none !important;
            pointer-events: auto !important;
            opacity: .9 !important;
            filter: drop-shadow(0 0 2px rgba(0,0,0,.85));
            background: rgba(0,0,0,.55) !important;
            border-radius: 6px !important;
        }
        .${ICON_CLASS}:hover, .${ICON_CLASS_X}:hover {
            transform: scale(1.25) !important;
            opacity: 1 !important;
        }
        .${ICON_CLASS}.hidden, .${ICON_CLASS_X}.hidden {
            display: none !important;
        }

        /* Container de miniaturas abaixo da mídia principal no Twitter */
        .grok-thumbs-below {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
            margin-top: 8px !important;
            padding: 0 4px !important;
            max-width: 100% !important;
        }
        .grok-thumbs-below .grok-thumb-item {
            width: 64px !important;
            height: 64px !important;
            border-radius: 8px !important;
            overflow: hidden !important;
            cursor: pointer !important;
            position: relative !important;
            border: 1px solid rgba(255,255,255,0.12) !important;
            transition: transform .15s ease, border-color .15s ease !important;
            background: #1a1a22 !important;
            flex-shrink: 0 !important;
        }
        .grok-thumbs-below .grok-thumb-item:hover {
            transform: scale(1.06) !important;
            border-color: rgba(100, 200, 255, 0.65) !important;
        }
        .grok-thumbs-below .grok-thumb-item img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
        }
        .grok-thumbs-below .grok-thumb-item .badge {
            position: absolute !important;
            bottom: 3px !important;
            right: 3px !important;
            background: rgba(0,0,0,0.75) !important;
            color: #fff !important;
            font-size: 10px !important;
            padding: 1px 4px !important;
            border-radius: 4px !important;
            pointer-events: none !important;
        }

        /* Dropdown genérico (sites não-X) – grid 2 colunas */
        .grok-lupa-dropdown {
            position: fixed !important;
            z-index: 2147483647 !important;
            background: rgba(12, 12, 18, 0.97) !important;
            border: 1px solid rgba(255,255,255,0.14) !important;
            border-radius: 14px !important;
            padding: 10px !important;
            box-shadow: 0 12px 40px rgba(0,0,0,0.6) !important;
            backdrop-filter: blur(16px) !important;
            display: grid !important;
            grid-template-columns: repeat(2, 78px) !important;
            gap: 8px !important;
            max-width: 180px !important;
            max-height: 300px !important;
            overflow-y: auto !important;
            animation: grokFadeIn .18s ease !important;
        }
        @keyframes grokFadeIn {
            from { opacity: 0; transform: translateY(8px) scale(0.95); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .grok-lupa-item {
            width: 78px !important;
            height: 78px !important;
            border-radius: 10px !important;
            overflow: hidden !important;
            cursor: pointer !important;
            position: relative !important;
            border: 1px solid rgba(255,255,255,0.12) !important;
            transition: transform .15s ease, border-color .15s ease !important;
            background: #1a1a22 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .grok-lupa-item:hover {
            transform: scale(1.07) !important;
            border-color: rgba(100, 200, 255, 0.65) !important;
        }
        .grok-lupa-item img {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            display: block !important;
        }
        .grok-lupa-item .badge {
            position: absolute !important;
            bottom: 4px !important;
            right: 4px !important;
            background: rgba(0,0,0,0.75) !important;
            color: #fff !important;
            font-size: 10px !important;
            padding: 1px 5px !important;
            border-radius: 5px !important;
            pointer-events: none !important;
        }
    `);

    function toggleIcons() {
        iconsVisible = !iconsVisible;
        document.querySelectorAll(`.${ICON_CLASS}, .${ICON_CLASS_X}`).forEach(i => {
            i.classList.toggle('hidden', !iconsVisible);
        });
        document.querySelectorAll('.grok-thumbs-below').forEach(c => {
            c.style.display = iconsVisible ? 'flex' : 'none';
        });
        document.querySelectorAll('.grok-lupa-dropdown').forEach(d => d.remove());
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'F4' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            toggleIcons();
        }
    }, true);

    document.addEventListener('click', e => {
        if (!e.target.closest('.grok-lupa-dropdown') && !e.target.closest(`.${ICON_CLASS_X}`)) {
            document.querySelectorAll('.grok-lupa-dropdown').forEach(d => d.remove());
        }
    }, true);

    function createIcon(uuid, cls = ICON_CLASS) {
        const icon = document.createElement('span');
        icon.className = cls;
        if (!iconsVisible) icon.classList.add('hidden');
        icon.textContent = '🔍';
        icon.title = `UUID: ${uuid}\nClique para abrir no Imagine\nF4 para mostrar/esconder`;
        icon.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            window.open(MAKE_IMAGINE_LINK(uuid), '_blank');
            navigator.clipboard?.writeText(uuid).catch(() => {});
        };
        return icon;
    }

    function ensureRelative(el) {
        if (!el) return null;
        if (getComputedStyle(el).position === 'static') {
            if (el.parentElement) {
                const w = document.createElement('span');
                w.style.cssText = 'position:relative;display:inline-block;max-width:100%;line-height:0;';
                el.parentElement.insertBefore(w, el);
                w.appendChild(el);
                return w;
            }
            el.style.position = 'relative';
        }
        return el;
    }

    function addAniToMedia(media, uuid) {
        if (!uuid || media.dataset.titlexUuid === uuid) return;
        media.dataset.titlexUuid = uuid;
        media.parentElement?.querySelectorAll(`.${ICON_CLASS}`).forEach(e => e.remove());
        const container = ensureRelative(media.parentElement) || media.parentElement;
        if (container) {
            container.appendChild(createIcon(uuid));
        }
    }

    function isRedgifsUrl(url) {
        return url && /redgifs\.com/i.test(String(url));
    }

    function isInsideRedgifs(el) {
        let n = el;
        while (n) {
            if (n.tagName === 'IFRAME') {
                const src = n.src || n.getAttribute('src') || '';
                if (isRedgifsUrl(src)) return true;
            }
            if (n.tagName === 'SHREDDIT-EMBED' || n.classList?.contains('redgifs')) return true;
            n = n.parentElement;
        }
        return false;
    }

    function extractUuidFromExif(buffer) {
        try {
            const view = new DataView(buffer);
            if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;
            let offset = 2;
            while (offset < view.byteLength - 4) {
                if (view.getUint8(offset) !== 0xFF) break;
                const marker = view.getUint8(offset + 1);
                if (marker === 0xDA) break;
                const size = view.getUint16(offset + 2);
                if (marker === 0xE1 && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
                    const tiff = offset + 10;
                    const little = view.getUint16(tiff) === 0x4949;
                    const r16 = o => view.getUint16(o, little);
                    const r32 = o => view.getUint32(o, little);
                    const ifd0 = tiff + r32(tiff + 4);
                    if (ifd0 >= view.byteLength) return null;
                    const entries = r16(ifd0);
                    for (let i = 0; i < entries; i++) {
                        const entry = ifd0 + 2 + i * 12;
                        if (entry + 12 > view.byteLength) break;
                        if (r16(entry) === 0x013B) {
                            const count = r32(entry + 4);
                            let vo = entry + 8;
                            if (count > 4) vo = tiff + r32(entry + 8);
                            if (vo + count > view.byteLength) return null;
                            let str = '';
                            for (let j = 0; j < count; j++) {
                                const c = view.getUint8(vo + j);
                                if (c === 0) break;
                                str += String.fromCharCode(c);
                            }
                            const m = str.match(UUID_REGEX);
                            if (m) return m[0];
                        }
                    }
                }
                offset += 2 + size;
            }
        } catch {}
        return null;
    }

    function extractUuidFromFilename(url, isVideo = false) {
        if (!url) return null;
        let filename = '', fn = null;
        try {
            const u = new URL(url);
            filename = decodeURIComponent(u.pathname.split('/').pop() || '');
            fn = u.searchParams.get('fn');
            if (fn) {
                fn = decodeURIComponent(fn);
                filename += ' ' + fn;
            }
        } catch {
            filename = url;
        }

        const gen = filename.match(/_generated_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        if (gen) return gen[1];

        if (isVideo) {
            if (fn) {
                const m = fn.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]+)?$/i);
                if (m) return m[1];
            }
            const m2 = filename.match(/(?:^|[\s\/])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]+)?(?:$|[\s?&#])/i);
            if (m2) return m2[1];
        }
        if (/grok/i.test(filename)) {
            const m = filename.match(UUID_REGEX);
            if (m) return m[0];
        }
        return null;
    }

    function findUUIDInBuffer(buf) {
        try {
            const text = new TextDecoder('latin1').decode(buf);
            const idx = text.indexOf(MARKER);
            if (idx === -1) return null;
            const after = text.slice(idx + MARKER.length, idx + MARKER.length + 60);
            const m = after.match(UUID_REGEX);
            return m ? m[0] : null;
        } catch {
            return null;
        }
    }

    function checkUrl(url, media) {
        if (!url || isRedgifsUrl(url) || (media && isInsideRedgifs(media))) return;
        const clean = url.split(/["'\s<>]/)[0];
        if (isRedgifsUrl(clean)) return;

        const isImg = media?.tagName === 'IMG' || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(clean);
        const isVid = media?.tagName === 'VIDEO' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(clean);
        if (!isImg && !isVid) return;

        const fromName = extractUuidFromFilename(clean, isVid);
        if (fromName && media) addAniToMedia(media, fromName);

        if (checkedUrls.has(clean)) return;
        checkedUrls.add(clean);

        GM_xmlhttpRequest({
            method: 'GET',
            url: clean,
            headers: { Range: `bytes=0-${BYTES_TO_FETCH - 1}` },
            responseType: 'arraybuffer',
            timeout: 10000,
            onload(res) {
                if (res.status !== 200 && res.status !== 206) return;
                let uuid = null;
                if (isVid) uuid = findUUIDInBuffer(res.response);
                else if (isImg) uuid = extractUuidFromExif(res.response);
                if (uuid && media) addAniToMedia(media, uuid);
            }
        });
    }

    function processMedia(media) {
        if (!media || media.dataset.titlexUuid || isInsideRedgifs(media) || isRedgifsUrl(media.src) || isRedgifsUrl(media.currentSrc)) return;

        const state = mediaState.get(media) || { tries: 0, lastSrc: '' };
        const src = media.currentSrc || media.src || media.getAttribute('src') || '';
        if (src && src !== state.lastSrc) {
            state.tries = 0;
            state.lastSrc = src;
        }
        state.tries++;
        mediaState.set(media, state);
        if (state.tries > 10) return;

        const urls = new Set();
        if (media.src) urls.add(media.src);
        if (media.currentSrc) urls.add(media.currentSrc);
        if (media.tagName === 'VIDEO') media.querySelectorAll('source').forEach(s => s.src && urls.add(s.src));
        ['data-src', 'data-original', 'data-lazy-src', 'data-url'].forEach(a => {
            const v = media.getAttribute(a);
            if (v) urls.add(v);
        });
        if (media.tagName === 'IMG' && media.srcset) {
            media.srcset.split(',').forEach(p => {
                const u = p.trim().split(/\s+/)[0];
                if (u) urls.add(u);
            });
        }
        urls.forEach(u => checkUrl(u, media));
    }

    function scan() {
        document.querySelectorAll('video, img').forEach(processMedia);
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                const src = (iframe.src || iframe.getAttribute('src') || '').toLowerCase();
                if (src.includes('redgifs.com')) return;
                if (iframe.closest('shreddit-embed') || iframe.closest('[class*="redgifs"]')) return;
                const doc = iframe.contentDocument;
                if (doc) doc.querySelectorAll('video, img').forEach(processMedia);
            } catch {}
        });
    }

    // ========== Twitter / X ==========
    const isX = location.hostname === 'x.com' || location.hostname === 'twitter.com' ||
                location.hostname.endsWith('.x.com') || location.hostname.endsWith('.twitter.com');

    if (isX) {
        const processed = new WeakSet();
        let scanning = false, timer = null;

        // Detecção leve + "Faça você mesmo" / links grok.com/imagine
        function extractMediaObjects(article) {
            const results = [];
            const seen = new Set();
            const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

            function addUuid(uuid, isVideo) {
                if (!uuid) return;
                const u = String(uuid).toLowerCase();
                if (!UUID_RE.test(u) || seen.has(u)) return;
                seen.add(u);
                results.push({ uuid: u, isVideo: !!isVideo });
            }

            // --- 1) Fiber: grok_post_id (só em elementos de mídia/texto) ---
            const candidates = [
                article,
                ...article.querySelectorAll(
                    '[data-testid="tweetPhoto"],[data-testid="videoComponent"],[data-testid="videoPlayer"],[data-testid="tweetText"]'
                )
            ];

            for (const el of candidates) {
                let key;
                try {
                    key = Object.keys(el).find(k =>
                        k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
                    );
                } catch { continue; }
                if (!key) continue;

                let fiber = el[key];
                let depth = 0;
                while (fiber && depth < 35) {
                    try {
                        if (fiber.memoizedProps) {
                            const str = JSON.stringify(fiber.memoizedProps);
                            const re = /"grok_post_id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;
                            let m;
                            while ((m = re.exec(str))) {
                                const chunk = str.slice(Math.max(0, m.index - 280), Math.min(str.length, m.index + 450));
                                const mediaKey = (chunk.match(/"media_key"\s*:\s*"([^"]+)"/) || [])[1];
                                const type = (chunk.match(/"type"\s*:\s*"([^"]+)"/) || [])[1];
                                const expanded = (chunk.match(/"expanded_url"\s*:\s*"([^"]+)"/) || [])[1];
                                const isVideo = type === 'video' || (mediaKey && mediaKey.startsWith('13_')) ||
                                    (expanded && expanded.includes('/video/')) || chunk.includes('amplify_video');
                                addUuid(m[1], isVideo);
                            }
                        }
                    } catch {}
                    fiber = fiber.return;
                    depth++;
                }
            }

            // --- 2) Links / botões "Faça você mesmo" e grok.com/imagine ---
            // Texto em PT/EN/ES que costuma aparecer no CTA do Grok no X
            const DIY_RE = /faça\s*voc[eê]\s*mesmo|make\s*your\s*own|try\s*it\s*yourself|try\s*grok|remix|criar\s*o\s*seu|hazlo\s*t[uú]\s*mismo/i;

            article.querySelectorAll('a[href], button, [role="link"], [role="button"]').forEach(el => {
                try {
                    const href = (el.getAttribute('href') || el.href || '').toString();
                    const text = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).trim();

                    // Link direto para imagine/post/UUID
                    if (/grok\.com\/imagine/i.test(href)) {
                        const m = href.match(UUID_RE);
                        if (m) addUuid(m[0], false);
                    }

                    // Botão/link com texto "Faça você mesmo" (e similares)
                    if (DIY_RE.test(text)) {
                        // UUID no próprio href
                        if (href) {
                            const m = href.match(UUID_RE);
                            if (m) addUuid(m[0], false);
                        }
                        // UUID no data-* ou no fiber do botão
                        for (const attr of el.attributes || []) {
                            const m = String(attr.value).match(UUID_RE);
                            if (m) addUuid(m[0], false);
                        }
                        try {
                            const key = Object.keys(el).find(k =>
                                k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
                            );
                            if (key) {
                                let fiber = el[key], d = 0;
                                while (fiber && d < 20) {
                                    try {
                                        if (fiber.memoizedProps) {
                                            const str = JSON.stringify(fiber.memoizedProps);
                                            const re = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
                                            let m2;
                                            while ((m2 = re.exec(str))) addUuid(m2[1], false);
                                        }
                                    } catch {}
                                    fiber = fiber.return;
                                    d++;
                                }
                            }
                        } catch {}
                    }
                } catch {}
            });

            return results;
        }

        function validateUUID(uuid) {
            if (thumbCache.has(uuid)) {
                return Promise.resolve(thumbCache.get(uuid));
            }

            return new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: MAKE_THUMB_LINK(uuid),
                    responseType: 'blob',
                    timeout: 7000,
                    onload(res) {
                        if (res.status < 200 || res.status >= 300 || !res.response) {
                            thumbCache.set(uuid, null);
                            resolve(null);
                            return;
                        }

                        const blob = res.response;
                        const type = (blob.type || '').toLowerCase();

                        if (type.startsWith('image/') && blob.size > 1500) {
                            const blobUrl = URL.createObjectURL(blob);
                            thumbCache.set(uuid, blobUrl);
                            resolve(blobUrl);
                            return;
                        }

                        const reader = new FileReader();
                        reader.onload = () => {
                            const text = (reader.result || '').toLowerCase();
                            const isError =
                                text.includes('media post not found') ||
                                text.includes('post not found') ||
                                text.includes('not found') ||
                                text.includes('<!doctype') ||
                                text.includes('<html');

                            if (isError || blob.size < 2000) {
                                thumbCache.set(uuid, null);
                                resolve(null);
                            } else {
                                const blobUrl = URL.createObjectURL(blob);
                                thumbCache.set(uuid, blobUrl);
                                resolve(blobUrl);
                            }
                        };
                        reader.onerror = () => {
                            thumbCache.set(uuid, null);
                            resolve(null);
                        };
                        reader.readAsText(blob.slice(0, 2500));
                    },
                    onerror() {
                        thumbCache.set(uuid, null);
                        resolve(null);
                    },
                    ontimeout() {
                        thumbCache.set(uuid, null);
                        resolve(null);
                    }
                });
            });
        }

        // Encontra o bloco completo de mídia (o mais externo que contém todas as fotos/vídeos)
        function findMediaBlock(article) {
            const photos = [...article.querySelectorAll('[data-testid="tweetPhoto"]')];
            const videos = [...article.querySelectorAll('[data-testid="videoComponent"], [data-testid="videoPlayer"]')];
            const mediaEls = [...photos, ...videos];

            if (!mediaEls.length) {
                // Fallback: qualquer img/video de mídia
                const img = article.querySelector('img[src*="pbs.twimg.com/media"], img[src*="twimg.com/media"], video');
                if (!img) return null;
                mediaEls.push(img);
            }

            // Sobe até o ancestral comum mais baixo que contém TODA a mídia
            let block = mediaEls[0];
            for (let i = 0; i < 10 && block && block !== article; i++) {
                const parent = block.parentElement;
                if (!parent || parent === article) break;
                const allInside = mediaEls.every(m => parent.contains(m));
                if (allInside) {
                    block = parent;
                } else {
                    break;
                }
            }
            return block;
        }

        // Barra de ações (reply/rt/like) – sempre fica abaixo da mídia
        function findActionBar(article) {
            const groups = article.querySelectorAll('[role="group"]');
            for (const g of groups) {
                // A barra de engajamento tem botões de reply/retweet/like
                if (
                    g.querySelector('[data-testid="reply"]') ||
                    g.querySelector('[data-testid="retweet"]') ||
                    g.querySelector('[data-testid="like"]') ||
                    g.querySelector('a[href*="/analytics"]')
                ) {
                    return g;
                }
            }
            return null;
        }

        function addThumbsBelowMedia(article, items) {
            if (article.querySelector('.grok-thumbs-below')) return;

            const wrap = document.createElement('div');
            wrap.className = 'grok-thumbs-below';
            if (!iconsVisible) wrap.style.display = 'none';

            items.forEach(({ uuid, isVideo, thumb }) => {
                const item = document.createElement('div');
                item.className = 'grok-thumb-item';
                item.title = `Abrir no Grok Imagine\n${uuid}`;

                const img = document.createElement('img');
                img.src = thumb;
                img.loading = 'lazy';
                img.alt = '';
                item.appendChild(img);

                if (isVideo) {
                    const badge = document.createElement('span');
                    badge.className = 'badge';
                    badge.textContent = '▶';
                    item.appendChild(badge);
                }

                item.onclick = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    window.open(MAKE_IMAGINE_LINK(uuid), '_blank');
                    navigator.clipboard?.writeText(uuid).catch(() => {});
                };

                wrap.appendChild(item);
            });

            // Estratégia 1 (preferida): inserir LOGO ANTES da barra de ações
            // → fica sempre abaixo de texto + mídia
            const actionBar = findActionBar(article);
            if (actionBar && actionBar.parentNode) {
                actionBar.parentNode.insertBefore(wrap, actionBar);
                return;
            }

            // Estratégia 2: inserir DEPOIS do bloco completo de mídia
            const mediaBlock = findMediaBlock(article);
            if (mediaBlock && mediaBlock.parentNode) {
                if (mediaBlock.nextSibling) {
                    mediaBlock.parentNode.insertBefore(wrap, mediaBlock.nextSibling);
                } else {
                    mediaBlock.parentNode.appendChild(wrap);
                }
                return;
            }

            // Estratégia 3: final do article
            article.appendChild(wrap);
        }

        async function processTweet(article) {
            if (article.querySelector('.grok-thumbs-below')) return;
            if (processed.has(article)) return;

            // Atalho: se não tem mídia nem CTA do Grok, pula rápido
            const hasMedia = article.querySelector(
                '[data-testid="tweetPhoto"],[data-testid="videoComponent"],[data-testid="videoPlayer"],img[src*="pbs.twimg.com/media"]'
            );
            const hasDiyHint = /faça\s*voc|make\s*your\s*own|try\s*it\s*yourself|try\s*grok|remix|grok\.com\/imagine/i.test(
                article.textContent || ''
            );
            // Posts só de texto sem menção a Grok → não vale a pena
            if (!hasMedia && !hasDiyHint) return;

            const objs = extractMediaObjects(article);
            if (!objs.length) return;

            processed.add(article);

            // Valida em paralelo (cache evita re-fetch)
            const checks = await Promise.all(
                objs.map(async (o) => {
                    try {
                        const thumb = await validateUUID(o.uuid);
                        return thumb ? { uuid: o.uuid, isVideo: o.isVideo, thumb } : null;
                    } catch {
                        return null;
                    }
                })
            );

            const seenValid = new Set();
            const validItems = [];
            for (const item of checks) {
                if (!item || !item.uuid) continue;
                const u = item.uuid.toLowerCase();
                if (seenValid.has(u)) continue;
                seenValid.add(u);
                validItems.push(item);
            }

            if (validItems.length > 0 && !article.querySelector('.grok-thumbs-below')) {
                addThumbsBelowMedia(article, validItems);
            }
        }

        function scanX() {
            if (scanning) return;
            scanning = true;
            // Só processa articles visíveis (ou próximos) – mais rápido no feed
            const articles = document.querySelectorAll('article[data-testid="tweet"]');
            const vh = window.innerHeight;
            const tasks = [];
            for (const article of articles) {
                if (processed.has(article) || article.querySelector('.grok-thumbs-below')) continue;
                const rect = article.getBoundingClientRect();
                // Processa se está na viewport ou perto (±1 tela)
                if (rect.bottom < -vh || rect.top > vh * 2) continue;
                tasks.push(processTweet(article));
            }
            Promise.allSettled(tasks).finally(() => { scanning = false; });
        }

        function schedule() {
            if (timer) return;
            timer = setTimeout(() => {
                timer = null;
                scanX();
            }, 250);
        }

        new MutationObserver(muts => {
            // Só agenda se entrou article novo
            for (const m of muts) {
                if (m.type !== 'childList') continue;
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (
                        n.matches?.('article[data-testid="tweet"]') ||
                        n.querySelector?.('article[data-testid="tweet"]')
                    ) {
                        schedule();
                        return;
                    }
                }
            }
        }).observe(document.body, { childList: true, subtree: true });

        window.addEventListener('scroll', schedule, { passive: true });
        setInterval(scanX, 3000);
        setTimeout(scanX, 500);
        setTimeout(scanX, 1500);
    } else {
        // Sites genéricos
        new MutationObserver(muts => {
            let need = false;
            for (const m of muts) {
                if (m.type === 'childList') {
                    for (const n of m.addedNodes) {
                        if (n.nodeType !== 1) continue;
                        if (n.tagName === 'IFRAME' && isRedgifsUrl(n.src || n.getAttribute('src'))) continue;
                        if (n.querySelector?.('iframe[src*="redgifs"]')) continue;
                        need = true;
                        break;
                    }
                } else if (m.type === 'attributes' && (m.target.tagName === 'VIDEO' || m.target.tagName === 'IMG')) {
                    if (!isInsideRedgifs(m.target) && !isRedgifsUrl(m.target.src)) processMedia(m.target);
                }
            }
            if (need) scan();
        }).observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'srcset', 'data-src', 'data-original']
        });

        ['loadstart', 'loadedmetadata', 'load', 'canplay'].forEach(evt => {
            document.addEventListener(evt, e => {
                if ((e.target.tagName === 'VIDEO' || e.target.tagName === 'IMG') &&
                    !isInsideRedgifs(e.target) && !isRedgifsUrl(e.target.src || e.target.currentSrc)) {
                    processMedia(e.target);
                }
            }, true);
        });

        scan();
        [600, 1500, 3000, 6000, 10000].forEach(t => setTimeout(scan, t));
        let ticks = 0;
        const keep = setInterval(() => {
            scan();
            if (++ticks > 5) clearInterval(keep);
        }, 5000);
    }

    console.log('%c[Detective Lupa] Ativo – sem Ani | miniaturas abaixo da mídia (X) / abaixo do zoom (Grok)', 'color:#00ff88;font-weight:bold');
})();
