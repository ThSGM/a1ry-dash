// ==UserScript==
// @name         a1ry Dash
// @namespace    https://github.com/ThSGM/a1ry-dash
// @version      0.3
// @description  A movable round launcher for Torn: tap it for a fan of shortcuts (messages, wars, settings and your own links). Desktop, mobile and TornPDA
// @author       ThSGM
// @match        https://www.torn.com/*
// @grant        none
// @license      MIT
// ==/UserScript==

// -------------------------------------------------------------------
// What it does
//
// A small round node (grey martini glass) floats over the page. Drag it
// anywhere; it remembers where, anchored to the nearest screen corner so it
// stays put when the window resizes or the phone rotates.
//
// Tap it and a fan of smaller nodes opens towards the middle of the screen:
//
//   Messages   torn.com/messages.php
//   Wars       your faction's war page
//   <yours>    one node per shortcut you added (first letter as the icon)
//   +          add a shortcut (name + URL, a full https:// link or a Torn
//              path such as /factions.php)
//   Settings   Limited API key (Save checks it), size, links in a new tab,
//              remove shortcuts, reset position, Update
//
// API key: a Limited key, stored as a1ry_dash_api_key. Save makes one call,
// key/?selections=info, to check the key and show its access level; the
// result is kept in a1ry_dash_api_status. Nothing else calls the API yet.
// Update opens UPDATE_URL (empty until the script is published).
//
// Tap the main node again, tap outside the fan, or press Esc to close it.
//
// Works the same on desktop, the mobile layout and TornPDA: pointer events
// only (mouse and touch alike), no GM_* functions (@grant none), no
// window.prompt / alert / confirm (they block or do nothing in TornPDA).
//
// Storage: localStorage keys starting a1ry_dash_ (shared across tabs; another
// tab's change is picked up through the storage event).
// -------------------------------------------------------------------

(function () {
    'use strict';

    // TornPDA and some hosts also run scripts in iframes: one launcher per page
    if (window.top !== window.self) return;
    if (document.getElementById('a1ry-dash')) return;

    // Keep in step with @version above (GM_info isn't available in every userscript host)
    const SCRIPT_VERSION = '0.3';
    const KEY = 'a1ry_dash_';
    // Settings' Update button opens this page (the script's install page). Empty = not published
    // yet, and the button is greyed out
    const UPDATE_URL = '';
    // A Limited key (access level 3) is what a1ry Dash asks for. The link opens Torn's "new key"
    // form with the name and access level filled in
    const API_LEVEL_WANTED = 3;
    const NEW_KEY_URL = 'https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=a1ry%20Dash&type=3';

    // Built-in link nodes. Settings and + are added after these and the user's shortcuts
    const BUILT_IN = [
        { id: 'messages', label: 'Messages', url: 'https://www.torn.com/messages.php', icon: 'mail' },
        { id: 'wars', label: 'Wars', url: 'https://www.torn.com/factions.php?step=your#/war/rank', icon: 'swords' },
    ];

    // Fan geometry (px at 100% Size): node sizes, the fan's radius, and the gap between
    // neighbouring child nodes along the arc. The arc widens with more nodes, up to MAX_SPREAD
    const MAIN_SIZE = 44;
    const CHILD_SIZE = 36;
    const FAN_RADIUS = 74;
    const ARC_GAP = 46;
    const MAX_SPREAD = 200;
    const FAN_RADIUS_STEP = 34; // extra radius per ring once a single arc is full

    // -------------------------------------------------------------------
    // 1. Storage
    // -------------------------------------------------------------------
    function load(name, fallback) {
        try {
            const raw = localStorage.getItem(KEY + name);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
    }
    function save(name, value) {
        try { localStorage.setItem(KEY + name, JSON.stringify(value)); } catch (e) { /* full or blocked */ }
    }

    let size = load('size', 100);
    let newTab = load('new_tab', false);
    let shortcuts = load('shortcuts', []);
    let apiKey = load('api_key', '');
    // The last check of the saved key: { text, state: 'ok'|'warn'|'bad' }
    let apiStatus = load('api_status', null);
    if (!Array.isArray(shortcuts)) shortcuts = [];
    // Position: { x: 'left'|'right', xv, y: 'top'|'bottom', yv }
    let pos = load('pos', { x: 'right', xv: 16, y: 'bottom', yv: 120 });

    // -------------------------------------------------------------------
    // 2. Icons (inline SVG, stroke = currentColor, so CSS sets the grey)
    // -------------------------------------------------------------------
    const ICONS = {
        martini: '<path d="M4 4h16l-8 9z"/><path d="M12 13v7"/><path d="M8 20h8"/><circle cx="14.5" cy="6.5" r="1.2"/><path d="M14.5 6.5L17 2"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
        swords: '<path d="M4 4l10 10"/><path d="M20 4L10 14"/><path d="M12 16l-2 2 -2-2 2-2"/><path d="M12 16l2 2 2-2-2-2"/><path d="M7 17l-3 3"/><path d="M17 17l3 3"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
    };
    function svg(name) {
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    }

    // -------------------------------------------------------------------
    // 3. CSS and markup
    // -------------------------------------------------------------------
    const style = document.createElement('style');
    style.textContent = `
        /* --s is the Size setting (1 = 100%). The root is a zero-size fixed point at the main
           node's centre; the main node and the fan nodes are placed around it */
        #a1ry-dash { --s: 1; position: fixed; z-index: 999990; width: 0; height: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        #a1ry-dash * { box-sizing: border-box; }
        .nd-node { position: absolute; display: flex; align-items: center; justify-content: center;
            border-radius: 50%; background: rgba(20, 20, 20, 0.92) !important; border: 2px solid #555 !important;
            color: #ccc !important; box-shadow: 0 3px 10px rgba(0,0,0,0.55); cursor: pointer; text-decoration: none !important;
            -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; padding: 0; margin: 0; }
        .nd-node svg { width: 58%; height: 58%; display: block; pointer-events: none; }
        .nd-node:hover, .nd-node:focus-visible { border-color: #999 !important; color: #fff !important; outline: none; }
        #nd-main { width: calc(${MAIN_SIZE}px * var(--s)); height: calc(${MAIN_SIZE}px * var(--s));
            left: calc(${-MAIN_SIZE / 2}px * var(--s)); top: calc(${-MAIN_SIZE / 2}px * var(--s));
            z-index: 2; touch-action: none; filter: grayscale(1); transition: transform 0.15s; }
        #a1ry-dash.nd-open #nd-main { transform: rotate(-15deg); border-color: #888 !important; }
        #a1ry-dash.nd-dragging #nd-main { transform: scale(1.08); cursor: grabbing; }
        .nd-child { width: calc(${CHILD_SIZE}px * var(--s)); height: calc(${CHILD_SIZE}px * var(--s));
            left: calc(${-CHILD_SIZE / 2}px * var(--s)); top: calc(${-CHILD_SIZE / 2}px * var(--s));
            z-index: 1; opacity: 0; pointer-events: none; transform: translate(0, 0) scale(0.4);
            transition: transform 0.22s cubic-bezier(.2,.9,.3,1.2), opacity 0.18s; }
        #a1ry-dash.nd-open .nd-child { opacity: 1; pointer-events: auto;
            transform: translate(calc(var(--dx) * var(--s)), calc(var(--dy) * var(--s))) scale(1); }
        .nd-letter { font-weight: bold; font-size: calc(15px * var(--s)); line-height: 1; pointer-events: none; }
        .nd-label { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 2px;
            font-size: calc(9px * var(--s)); font-weight: bold; color: #ddd; white-space: nowrap; pointer-events: none;
            text-shadow: 0 0 3px #000, 0 0 3px #000; max-width: calc(70px * var(--s)); overflow: hidden; text-overflow: ellipsis; }

        /* Panels (settings, add shortcut): fixed in the middle of the screen, phone-safe */
        .nd-panel { display: none; position: fixed; z-index: 999991; left: 50%; top: 50%; transform: translate(-50%, -50%);
            width: 300px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow-y: auto;
            background: rgba(17,17,17,0.97) !important; border: 2px solid #444 !important; border-radius: 8px;
            color: #eee !important; font-size: 13px; padding: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.7);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .nd-panel.nd-show { display: block; }
        .nd-panel h3 { margin: 0 0 10px; font-size: 14px; color: #fff !important; display: flex; justify-content: space-between; align-items: baseline; }
        .nd-panel h3 small { font-size: 10px; color: #777; font-weight: normal; }
        .nd-panel label { display: block; margin: 8px 0 3px; color: #aaa; font-size: 12px; }
        .nd-panel input[type="text"], .nd-panel input[type="url"] { width: 100%; padding: 7px 8px; font-size: 16px; /* 16px stops iOS zooming in */
            background: #222 !important; color: #fff !important; border: 1px solid #555 !important; border-radius: 4px; }
        .nd-panel input[type="range"] { width: 100%; }
        .nd-panel .nd-check { display: flex; align-items: center; gap: 6px; color: #ddd; }
        .nd-row { display: flex; gap: 8px; margin-top: 12px; }
        .nd-btn { flex: 1; padding: 7px 10px; background: #444 !important; color: #fff !important; border: none !important;
            border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer; }
        .nd-btn.nd-primary { background: #2d6a3e !important; }
        .nd-err { color: #f77; font-size: 12px; min-height: 1em; margin-top: 6px; }
        .nd-list { margin: 4px 0 0; padding: 0; list-style: none; }
        .nd-list li { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid #333; }
        .nd-list li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nd-list li small { color: #777; }
        .nd-list .nd-btn { flex: 0 0 auto; padding: 3px 8px; font-size: 12px; background: #6a2d2d !important; }
        .nd-empty { color: #777; font-size: 12px; }
        .nd-section { margin-top: 12px; padding-top: 8px; border-top: 1px solid #333; }
        .nd-section:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }
        .nd-inline { display: flex; gap: 6px; }
        .nd-inline input { flex: 1; min-width: 0; font-family: "Courier New", Courier, monospace; }
        .nd-inline .nd-btn { flex: 0 0 auto; }
        .nd-hint { font-size: 11px; color: #888; margin-top: 4px; }
        .nd-hint a { color: #8ab4f8 !important; }
        .nd-status { font-size: 12px; margin-top: 4px; min-height: 1em; color: #999; }
        .nd-status.nd-ok { color: #6c6; }
        .nd-status.nd-warn { color: #e0b030; }
        .nd-status.nd-bad { color: #f66; }
        a.nd-btn { display: flex; align-items: center; justify-content: center; text-decoration: none !important; }
        .nd-btn[aria-disabled="true"] { opacity: 0.4; cursor: not-allowed; }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'a1ry-dash';
    root.innerHTML = `<button type="button" class="nd-node" id="nd-main" title="a1ry Dash" aria-label="a1ry Dash" aria-expanded="false">${svg('martini')}</button>`;
    document.body.appendChild(root);
    const mainBtn = root.querySelector('#nd-main');

    const settingsPanel = document.createElement('div');
    settingsPanel.className = 'nd-panel';
    settingsPanel.innerHTML = `
        <h3>a1ry Dash settings <small>v${SCRIPT_VERSION}</small></h3>
        <div class="nd-section">
            <label for="nd-api">Limited API key</label>
            <div class="nd-inline">
                <input type="text" id="nd-api" placeholder="16-character key" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false">
                <button type="button" class="nd-btn nd-primary" id="nd-api-save">Save</button>
            </div>
            <div class="nd-status" id="nd-api-status"></div>
            <div class="nd-hint">No key yet? <a href="${NEW_KEY_URL}" target="_blank" rel="noopener">Create a Limited key</a>. It's kept in this browser only.</div>
        </div>
        <div class="nd-section">
            <label for="nd-size">Size: <b id="nd-size-val"></b></label>
            <input type="range" id="nd-size" min="75" max="200" step="5">
            <label class="nd-check"><input type="checkbox" id="nd-newtab"> Open shortcuts in a new tab</label>
        </div>
        <div class="nd-section">
            <label>Your shortcuts</label>
            <ul class="nd-list" id="nd-list"></ul>
        </div>
        <div class="nd-row">
            <button type="button" class="nd-btn" id="nd-reset">Reset position</button>
            ${UPDATE_URL
                ? `<a class="nd-btn" id="nd-update" href="${UPDATE_URL}" target="_blank" rel="noopener" title="Open the install page to get the latest version">Update</a>`
                : `<a class="nd-btn" id="nd-update" aria-disabled="true" title="No update link yet">Update</a>`}
            <button type="button" class="nd-btn nd-primary" id="nd-close">Close</button>
        </div>`;
    document.body.appendChild(settingsPanel);

    const addPanel = document.createElement('div');
    addPanel.className = 'nd-panel';
    addPanel.innerHTML = `
        <h3>Add a shortcut</h3>
        <label for="nd-add-name">Name</label>
        <input type="text" id="nd-add-name" maxlength="24" placeholder="e.g. Gym" autocomplete="off">
        <label for="nd-add-url">URL</label>
        <input type="url" id="nd-add-url" placeholder="/gym.php or https://..." autocomplete="off" autocapitalize="off" spellcheck="false">
        <label class="nd-check"><input type="checkbox" id="nd-add-here"> Use this page</label>
        <div class="nd-err" id="nd-add-err"></div>
        <div class="nd-row">
            <button type="button" class="nd-btn" id="nd-add-cancel">Cancel</button>
            <button type="button" class="nd-btn nd-primary" id="nd-add-save">Add</button>
        </div>`;
    document.body.appendChild(addPanel);

    // -------------------------------------------------------------------
    // 4. Position and size
    // -------------------------------------------------------------------
    // The root sits at the main node's centre; pos stores the distance from the nearest
    // corner to the node's edge, so it is independent of Size
    function half() { return (MAIN_SIZE / 2) * scale(); }
    function scale() {
        // Capped so the main node plus a full fan still fits a small phone screen
        const fit = Math.floor(Math.min(window.innerWidth, window.innerHeight) / 3.2);
        return Math.min(size, fit) / 100;
    }
    function clampCentre(cx, cy) {
        const h = half();
        return [Math.max(h, Math.min(cx, window.innerWidth - h)), Math.max(h, Math.min(cy, window.innerHeight - h))];
    }
    let centreX = 0;
    let centreY = 0;
    function placeAt(cx, cy) {
        centreX = cx;
        centreY = cy;
        root.style.left = cx + 'px';
        root.style.top = cy + 'px';
    }
    function centreFromPos() {
        const h = half();
        const cx = pos.x === 'right' ? window.innerWidth - pos.xv - h : pos.xv + h;
        const cy = pos.y === 'bottom' ? window.innerHeight - pos.yv - h : pos.yv + h;
        return clampCentre(cx, cy);
    }
    function applyLayout() {
        root.style.setProperty('--s', scale());
        const [cx, cy] = centreFromPos();
        placeAt(cx, cy);
        if (isOpen) layoutFan();
    }
    function savePosFromCentre(cx, cy) {
        const h = half();
        const w = window.innerWidth;
        const ht = window.innerHeight;
        pos = {
            x: cx > w / 2 ? 'right' : 'left',
            xv: Math.max(0, Math.round(cx > w / 2 ? w - cx - h : cx - h)),
            y: cy > ht / 2 ? 'bottom' : 'top',
            yv: Math.max(0, Math.round(cy > ht / 2 ? ht - cy - h : cy - h)),
        };
        save('pos', pos);
    }

    // -------------------------------------------------------------------
    // 5. The fan
    // -------------------------------------------------------------------
    let isOpen = false;

    // Order around the arc: built-ins, the user's shortcuts, +, Settings
    function fanItems() {
        const items = BUILT_IN.map(b => ({ ...b, kind: 'link' }));
        shortcuts.forEach((s, i) => items.push({ id: 'sc' + i, label: s.name, url: s.url, kind: 'link', letter: s.name.trim().charAt(0).toUpperCase() || '?' }));
        items.push({ id: 'add', label: 'Add', icon: 'plus', kind: 'add' });
        items.push({ id: 'settings', label: 'Settings', icon: 'gear', kind: 'settings' });
        return items;
    }

    function buildFan() {
        root.querySelectorAll('.nd-child').forEach(el => el.remove());
        for (const item of fanItems()) {
            const el = document.createElement(item.kind === 'link' ? 'a' : 'button');
            el.className = 'nd-node nd-child';
            el.dataset.kind = item.kind;
            el.title = item.label;
            el.setAttribute('aria-label', item.label);
            el.tabIndex = isOpen ? 0 : -1;
            if (item.kind === 'link') {
                el.href = item.url;
                if (newTab) { el.target = '_blank'; el.rel = 'noopener'; }
            } else {
                el.type = 'button';
            }
            if (item.icon) {
                el.innerHTML = svg(item.icon);
            } else {
                const letter = document.createElement('span');
                letter.className = 'nd-letter';
                letter.textContent = item.letter;
                el.appendChild(letter);
            }
            const label = document.createElement('span');
            label.className = 'nd-label';
            label.textContent = item.label;
            el.appendChild(label);
            root.appendChild(el);
        }
        if (isOpen) layoutFan();
    }

    // Spread the children on arcs centred on the direction from the main node to the middle
    // of the screen, so the fan always opens inwards (away from the nearest edges)
    function layoutFan() {
        const children = Array.from(root.querySelectorAll('.nd-child'));
        const toward = Math.atan2(window.innerHeight / 2 - centreY, window.innerWidth / 2 - centreX);
        let placed = 0;
        let ring = 0;
        while (placed < children.length) {
            const radius = FAN_RADIUS + ring * FAN_RADIUS_STEP;
            const step = ARC_GAP / radius; // radians between neighbours on this ring
            const capacity = Math.max(1, Math.floor((MAX_SPREAD * Math.PI / 180) / step) + 1);
            const count = Math.min(capacity, children.length - placed);
            const start = toward - (step * (count - 1)) / 2;
            for (let i = 0; i < count; i++) {
                const a = start + step * i;
                const el = children[placed + i];
                el.style.setProperty('--dx', (Math.cos(a) * radius).toFixed(1) + 'px');
                el.style.setProperty('--dy', (Math.sin(a) * radius).toFixed(1) + 'px');
                el.style.transitionDelay = (i * 0.025) + 's';
            }
            placed += count;
            ring++;
        }
    }

    function setOpen(open) {
        isOpen = open;
        if (open) layoutFan();
        root.classList.toggle('nd-open', open);
        mainBtn.setAttribute('aria-expanded', String(open));
        root.querySelectorAll('.nd-child').forEach(el => { el.tabIndex = open ? 0 : -1; });
    }

    root.addEventListener('click', (e) => {
        const child = e.target.closest('.nd-child');
        if (!child) return;
        const kind = child.dataset.kind;
        if (kind === 'settings') { setOpen(false); openSettings(); }
        else if (kind === 'add') { setOpen(false); openAdd(); }
        else setOpen(false); // links navigate by themselves
    });

    // Tap outside the fan (or Esc) closes it. pointerdown so it also works where click
    // doesn't fire on non-interactive elements (iOS)
    document.addEventListener('pointerdown', (e) => {
        if (isOpen && !root.contains(e.target)) setOpen(false);
    }, true);
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (settingsPanel.classList.contains('nd-show')) closePanel(settingsPanel);
        else if (addPanel.classList.contains('nd-show')) closePanel(addPanel);
        else if (isOpen) setOpen(false);
    });

    // -------------------------------------------------------------------
    // 6. Drag (main node). Pointer events cover mouse and touch (TornPDA) alike;
    //    under 5px of movement counts as a tap, which toggles the fan
    // -------------------------------------------------------------------
    let drag = null;
    mainBtn.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - centreX, oy: e.clientY - centreY, moved: false };
        try { mainBtn.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
    });
    mainBtn.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved && Math.abs(e.clientX - drag.sx) < 5 && Math.abs(e.clientY - drag.sy) < 5) return;
        if (!drag.moved) {
            drag.moved = true;
            if (isOpen) setOpen(false);
            root.classList.add('nd-dragging');
        }
        const [cx, cy] = clampCentre(e.clientX - drag.ox, e.clientY - drag.oy);
        placeAt(cx, cy);
        if (e.cancelable) e.preventDefault();
    });
    function endDrag(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const wasTap = !drag.moved && e.type === 'pointerup';
        drag = null;
        root.classList.remove('nd-dragging');
        savePosFromCentre(centreX, centreY);
        applyLayout();
        if (wasTap) setOpen(!isOpen);
    }
    mainBtn.addEventListener('pointerup', endDrag);
    mainBtn.addEventListener('pointercancel', endDrag);
    // Keyboard: Enter/Space toggle the fan (pointer taps are handled above, so ignore those clicks)
    mainBtn.addEventListener('click', (e) => {
        if (e.detail === 0) setOpen(!isOpen);
    });

    // -------------------------------------------------------------------
    // 7. Panels
    // -------------------------------------------------------------------
    function openPanel(panel) {
        closePanel(settingsPanel);
        closePanel(addPanel);
        panel.classList.add('nd-show');
    }
    function closePanel(panel) { panel.classList.remove('nd-show'); }

    // Settings
    const sizeInput = settingsPanel.querySelector('#nd-size');
    const sizeVal = settingsPanel.querySelector('#nd-size-val');
    const newTabInput = settingsPanel.querySelector('#nd-newtab');
    const list = settingsPanel.querySelector('#nd-list');

    function renderList() {
        list.textContent = '';
        if (!shortcuts.length) {
            const li = document.createElement('li');
            li.className = 'nd-empty';
            li.textContent = 'None yet. Tap + in the fan to add one.';
            list.appendChild(li);
            return;
        }
        shortcuts.forEach((s, i) => {
            const li = document.createElement('li');
            const text = document.createElement('span');
            text.textContent = s.name + ' ';
            const small = document.createElement('small');
            small.textContent = s.url.replace(/^https:\/\/www\.torn\.com/, '');
            text.appendChild(small);
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'nd-btn';
            del.textContent = 'Remove';
            del.addEventListener('click', () => {
                shortcuts.splice(i, 1);
                save('shortcuts', shortcuts);
                renderList();
                buildFan();
            });
            li.append(text, del);
            list.appendChild(li);
        });
    }
    function openSettings() {
        apiInput.value = apiKey;
        showApiStatus(apiStatus);
        sizeInput.value = size;
        sizeVal.textContent = size + '%';
        newTabInput.checked = newTab;
        renderList();
        openPanel(settingsPanel);
    }
    sizeInput.addEventListener('input', () => {
        size = parseInt(sizeInput.value, 10) || 100;
        sizeVal.textContent = size + '%';
        save('size', size);
        applyLayout();
    });
    newTabInput.addEventListener('change', () => {
        newTab = newTabInput.checked;
        save('new_tab', newTab);
        buildFan();
    });
    settingsPanel.querySelector('#nd-reset').addEventListener('click', () => {
        pos = { x: 'right', xv: 16, y: 'bottom', yv: 120 };
        save('pos', pos);
        applyLayout();
    });
    // API key: Save stores the key straight away, then checks it with one call (key info).
    // Torn's access levels: 1 Public, 2 Minimal, 3 Limited, 4 Full
    const apiInput = settingsPanel.querySelector('#nd-api');
    const apiSaveBtn = settingsPanel.querySelector('#nd-api-save');
    const apiStatusEl = settingsPanel.querySelector('#nd-api-status');

    function showApiStatus(status) {
        apiStatusEl.textContent = status ? status.text : (apiKey ? '' : 'No key saved.');
        apiStatusEl.className = 'nd-status' + (status ? ' nd-' + status.state : '');
    }
    function setApiStatus(text, state) {
        apiStatus = { text, state };
        save('api_status', apiStatus);
        showApiStatus(apiStatus);
    }
    let apiChecking = false;
    async function saveApiKey() {
        if (apiChecking) return;
        const key = apiInput.value.trim();
        if (key && !/^[A-Za-z0-9]{16}$/.test(key)) {
            showApiStatus({ text: 'A Torn API key is 16 letters and numbers.', state: 'bad' });
            return;
        }
        apiKey = key;
        save('api_key', apiKey);
        if (!key) {
            apiStatus = null;
            save('api_status', null);
            showApiStatus(null);
            return;
        }
        apiChecking = true;
        apiSaveBtn.textContent = '...';
        showApiStatus({ text: 'Saved. Checking the key...', state: '' });
        try {
            const res = await fetch('https://api.torn.com/key/?selections=info&key=' + encodeURIComponent(key));
            const data = res.ok ? await res.json() : null;
            if (!data) setApiStatus(`Saved, but Torn didn't answer (HTTP ${res.status}).`, 'warn');
            else if (data.error) setApiStatus(`Saved, but Torn says: ${data.error.error} (error ${data.error.code}).`, 'bad');
            else {
                const level = Number(data.access_level) || 0;
                const type = data.access_type || 'level ' + level;
                if (level < API_LEVEL_WANTED) setApiStatus(`Saved. This is a ${type} key; a1ry Dash needs a Limited key.`, 'warn');
                else setApiStatus(`Saved. ${type} key, works.` + (level > API_LEVEL_WANTED ? ' (Limited is enough.)' : ''), 'ok');
            }
        } catch (e) {
            setApiStatus('Saved, but the check failed (network).', 'warn');
        } finally {
            apiChecking = false;
            apiSaveBtn.textContent = 'Save';
        }
    }
    apiSaveBtn.addEventListener('click', saveApiKey);
    apiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveApiKey(); });

    settingsPanel.querySelector('#nd-close').addEventListener('click', () => closePanel(settingsPanel));

    // Add a shortcut
    const nameInput = addPanel.querySelector('#nd-add-name');
    const urlInput = addPanel.querySelector('#nd-add-url');
    const hereInput = addPanel.querySelector('#nd-add-here');
    const addErr = addPanel.querySelector('#nd-add-err');

    // Accepts a full http(s) URL, or a Torn path ("/gym.php", "gym.php", "torn.com/gym.php").
    // Anything else (javascript:, data:, ...) is refused. Returns the full URL or null
    function normaliseUrl(raw) {
        let s = raw.trim();
        if (!s) return null;
        if (/^(www\.)?torn\.com\//i.test(s)) s = 'https://' + s;
        try {
            const u = new URL(s, 'https://www.torn.com/');
            if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
            return u.href;
        } catch (e) {
            return null;
        }
    }
    function openAdd() {
        nameInput.value = '';
        urlInput.value = '';
        hereInput.checked = false;
        urlInput.disabled = false;
        addErr.textContent = '';
        openPanel(addPanel);
        // No autofocus on touch screens: it pops the keyboard over half the panel
        if (window.matchMedia('(pointer: fine)').matches) nameInput.focus();
    }
    hereInput.addEventListener('change', () => {
        urlInput.disabled = hereInput.checked;
        if (hereInput.checked) {
            urlInput.value = location.href;
            if (!nameInput.value.trim()) nameInput.value = (document.title.split('|')[0] || '').trim().slice(0, 24);
        }
    });
    addPanel.querySelector('#nd-add-cancel').addEventListener('click', () => closePanel(addPanel));
    addPanel.querySelector('#nd-add-save').addEventListener('click', addShortcut);
    addPanel.addEventListener('keydown', (e) => { if (e.key === 'Enter') addShortcut(); });
    function addShortcut() {
        const name = nameInput.value.trim().slice(0, 24);
        const url = normaliseUrl(urlInput.value);
        if (!name) { addErr.textContent = 'Give it a name.'; return; }
        if (!url) { addErr.textContent = 'That URL doesn\'t look right (use https://... or a Torn path like /gym.php).'; return; }
        shortcuts.push({ name, url });
        save('shortcuts', shortcuts);
        buildFan();
        closePanel(addPanel);
        setOpen(true);
    }

    // -------------------------------------------------------------------
    // 8. Start-up, resize and other tabs
    // -------------------------------------------------------------------
    window.addEventListener('resize', applyLayout);
    window.addEventListener('storage', (e) => {
        if (!e.key || !e.key.startsWith(KEY)) return;
        size = load('size', 100);
        newTab = load('new_tab', false);
        shortcuts = load('shortcuts', []);
        if (!Array.isArray(shortcuts)) shortcuts = [];
        pos = load('pos', pos);
        apiKey = load('api_key', '');
        apiStatus = load('api_status', null);
        buildFan();
        applyLayout();
        if (settingsPanel.classList.contains('nd-show')) renderList();
    });

    buildFan();
    applyLayout();
})();
