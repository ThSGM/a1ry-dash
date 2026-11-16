// ==UserScript==
// @name         a1ry Dash
// @namespace    https://github.com/ThSGM/a1ry-dash
// @version      0.31
// @description  A movable round launcher for Torn: tap it for a fan of shortcuts (faction messages, settings and your own links). Desktop, mobile and TornPDA
// @author       ThSGM
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
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
//   Messages   faction messages from the officers (not Torn's own mail), with
//              a red count of new ones on this node and the main node. Some
//              carry questions (one choice, several choices or free text);
//              answers can be changed until the message closes. The panel
//              has a slim inbox list at the top (closed envelope = new, open =
//              read, green arrow = answered, time left on the right) and the
//              chosen message below it (its title and time left are on its
//              highlighted row, not repeated above the message).
//              The martini flashes while a new message waits for answers
//   Offline    (bed) going offline. At the top: your revive setting from
//              Torn (v2 user/profile with the Settings key); if it is
//              Everyone, a flashing link to the hospital page instead.
//              Pick 1-12 hours and one request: a
//              bounty on yourself, a merc hit or a Stricken merc hit. It goes
//              to the faction sheet's Offline tab for an officer to action
//              (no API key is sent anywhere else). It can be cancelled until
//              an officer changes its status. The 5 latest are listed on top.
//              Admins (player IDs on the sheet's Admins tab, checked by the
//              server) also get an Open sheet link (read-only view of the
//              Offline tab) and an Admin button: every request not yet
//              actioned, with Place bounty (Torn's add-bounty page for that
//              player), Place merc (shows the C39 request, a toggle to confirm;
//              MERC_LIVE = false: test only, nothing is sent) and Mark placed
//              (separate on purpose). Merc orders use the admin's own Public
//              key, saved in the Admin panel (a1ry_dash_admin_key), not the
//              Settings key
//              Admins also get an Admin button under Messages: open messages
//              (Close now, two taps) and Create message: title, body, closes
//              in 1-168 h or never, then optional questions one screen each
//              (type, text, options one per line; Back / Next question /
//              Finish), a check screen, then Confirm and send. The server
//              gives the ID, MMDD_XX (TCT date + number)
//   War        (crossed swords) a fixed group: tap it and two more bubbles pop
//              out beside it: Faction war (flag) and Chain (chain)
//   Items      (box) a fixed group: Items (backpack) and Faction armory (locker)
//   <yours>    one node per shortcut; its icon is up to 3 letters (the first
//              letter of its name by default)
//   +          add a shortcut: tap a suggestion (Hospital, Gym), or give a
//              name, an icon and a URL (a full https:// link
//              or a Torn path such as /factions.php)
//   Settings   Limited API key (Save checks it), size, links in a new tab,
//              remove shortcuts, reset position, Help, Update
//
// Nodes have no text under them; the name shows as a tooltip.
//
// API key: a Limited key, stored as a1ry_dash_api_key. Save makes one call,
// key/?selections=info, to check the key and show its access level; the
// result is kept in a1ry_dash_api_status.
//
// Faction messages come from the faction's server, a Google Apps Script web
// app (SERVER_URL) backed by a Google Sheet. The first request sends the key
// once: the server asks Torn who the player is, refuses non-members, and
// returns a token (a1ry_dash_session); the key isn't kept there. Every request
// is a GET through GM_xmlhttpRequest with anonymous: true (Torn's CSP blocks a
// plain fetch, TornPDA can't follow Google's redirect on POST). One tab fetches
// for all (a1ry_dash_msgs). Opening the panel always fetches; start-up, the
// fan opening and the tab coming back into view fetch only if the copy is over
// 1 minute old.
// Update opens the script's Greasy Fork page (UPDATE_URL), whose Install
// button updates it.
//
// While the fan is open, the version shows in faint grey under the martini.
//
// Tap the main node again, tap outside the fan, or press Esc to close it.
//
// Works the same on desktop, the mobile layout and TornPDA: pointer events
// only (mouse and touch alike), GM_xmlhttpRequest for the server only, no
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
    const SCRIPT_VERSION = '0.31';
    const KEY = 'a1ry_dash_';
    // Settings' Update button: the script's Greasy Fork page, whose Install button updates it.
    // Empty = greyed out
    const UPDATE_URL = 'https://greasyfork.org/en/scripts/603980-a1ry-dash';
    // A Limited key (access level 3) is what a1ry Dash asks for. The link opens Torn's "new key"
    // form with the name and access level filled in
    const API_LEVEL_WANTED = 3;
    const NEW_KEY_URL = 'https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=a1ry%20Dash&type=3';

    // Faction messages server (Google Apps Script web app, see server/Code.js). Torn's CSP blocks
    // a plain fetch to it, and TornPDA can't follow Google's redirect on POST, so every request is
    // a GET through GM_xmlhttpRequest with anonymous: true (Google login cookies cause 404s)
    const SERVER_URL = 'https://script.google.com/macros/s/AKfycbyL6VVu7nxUfOh02DWUjUAOFTQr3kXJ4Wsi41ED5a9-7arkJQPjk44wXwP8_FPcjGT9/exec';
    const MSG_STALE_MS = 60 * 1000;      // refetch messages when the copy is older than this
    const MSG_BUSY_MS = 30 * 1000;      // another tab's fetch counts as running for this long

    // Going offline: what each request costs the faction (shown next to the choice)
    const OFFLINE_PRICE = { bounty: '$100k-$1m', merc: '$3m', stricken: '$3.5m' };
    // Admin panel: Place merc would send this request to C39 (ultimata.net), as their "C39 Merc
    // Requests" script does: POST {key, userId, isStricken}. While MERC_LIVE is false nothing is
    // sent; the confirm screen shows the request and says it was a test
    const MERC_LIVE = false;
    const MERC_URL = 'https://ultimata.net/api/v1/requestmerc';
    const BOUNTY_URL = 'https://www.torn.com/bounties.php?p=add&XID=';
    const HOSPITAL_URL = 'https://www.torn.com/hospitalview.php';
    const OFFLINE_HOURS_MAX = 12;

    // Built-in nodes. Settings and + are added after these and the user's shortcuts
    const BUILT_IN = [
        { id: 'messages', label: 'Messages', icon: 'mail', kind: 'messages' },
        { id: 'offline', label: 'Going offline', icon: 'bed', kind: 'offline' },
    ];

    // Fixed groups after the built-ins: tapping one pops its secondary bubbles out beside it
    const FACTION_URL = 'https://www.torn.com/factions.php?step=your&type=1#/';
    const GROUPS = [
        { id: 'war', label: 'War', icon: 'swords', links: [
            { label: 'Faction war', icon: 'flag', url: FACTION_URL + 'war/rank' },
            { label: 'Chain', icon: 'chain', url: FACTION_URL + 'war/chain' },
        ] },
        { id: 'items', label: 'Items', icon: 'box', links: [
            { label: 'Items', icon: 'backpack', url: 'https://www.torn.com/item.php' },
            { label: 'Faction armory', icon: 'locker', url: FACTION_URL + 'tab=armoury' },
        ] },
    ];
    // The War and Chain shortcuts that 0.18-0.30 added by default (now in the War group)
    const OLD_DEFAULT_URLS = [FACTION_URL + 'war/rank', FACTION_URL + 'war/chain'];

    // Suggested shortcuts, offered at the top of the Add panel (one tap adds one). A `sym`
    // draws an ICONS picture instead of the letters
    const SUGGESTED = [
        { name: 'Hospital', icon: 'Hos', url: 'https://www.torn.com/hospitalview.php' },
        { name: 'Gym', icon: 'Gym', url: 'https://www.torn.com/gym.php' },
    ];
    // A shortcut's icon: up to 3 letters or digits
    const ICON_RE = /^[\p{L}\p{N}]{1,3}$/u;

    // Panels are drawn at this fraction of their original size
    const PANEL_SCALE = 0.88;

    // Fan geometry (px at 100% Size): node sizes, the fan's radius, and the gap between
    // neighbouring child nodes along the arc. The arc widens with more nodes, up to MAX_SPREAD
    const MAIN_SIZE = 44;
    const CHILD_SIZE = 36;
    const FAN_RADIUS = 58;
    const ARC_GAP = 40;
    const MAX_SPREAD = 200;
    const FAN_RADIUS_STEP = 40; // extra radius per ring once a single arc is full
    const SUB_STEP = 42;        // a group's secondary bubbles sit this much further out

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
    // 0.12 renamed the suggestions' icons (W -> War, ...): update shortcuts added from them
    function upgradeIcons() {
        let changed = false;
        shortcuts.forEach(sc => {
            const g = SUGGESTED.find(x => x.url === sc.url);
            if (g && sc.name === g.name && sc.icon === g.icon.charAt(0)) { sc.icon = g.icon; changed = true; }
        });
        if (changed) save('shortcuts', shortcuts);
    }
    upgradeIcons();
    // 0.31: War and Chain live in the fixed War group, so the old War/Chain shortcuts go, once
    // (a1ry_dash_defaults 2 = done)
    function dropOldDefaults() {
        if (load('defaults', 0) >= 2) return;
        const keep = shortcuts.filter(s => OLD_DEFAULT_URLS.indexOf(s.url) === -1);
        if (keep.length !== shortcuts.length) { shortcuts = keep; save('shortcuts', shortcuts); }
        save('defaults', 2);
    }
    dropOldDefaults();
    // Position: { x: 'left'|'right', xv, y: 'top'|'bottom', yv }
    let pos = load('pos', { x: 'right', xv: 16, y: 'bottom', yv: 120 });
    // Faction messages. session: the server's login token { token, id, name } (never the key).
    // msgs: the last message list, shared by all tabs { time, list, error: { code, text } }.
    // seen: { messageId: true } for messages already shown in the panel
    let session = load('session', null);
    let msgs = load('msgs', null);
    let seen = load('seen', {});
    if (!seen || typeof seen !== 'object') seen = {};

    // -------------------------------------------------------------------
    // 2. Icons (inline SVG, stroke = currentColor, so CSS sets the grey)
    // -------------------------------------------------------------------
    const ICONS = {
        martini: '<path d="M4 4h16l-8 9z"/><path d="M12 13v7"/><path d="M8 20h8"/><circle cx="14.5" cy="6.5" r="1.2"/><path d="M14.5 6.5L17 2"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
        mailOpen: '<path d="M3 10l9-6 9 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10l9 6 9-6"/>',
        reply: '<path d="M10 7l-5 5 5 5"/><path d="M5 12h9a5 5 0 0 1 5 5v2"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        // A bed: headboard, mattress, foot, a pillow and a blanket
        bed: '<path d="M3 6v13M3 15h18v4"/><path d="M10 15v-4h8a3 3 0 0 1 3 3v1"/><circle cx="6.5" cy="12" r="1.8"/>',
        // A banner on a pole (faction war page)
        flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
        // A box (Items group)
        box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
        // A backpack (your items)
        backpack: '<path d="M6 10a6 6 0 0 1 12 0v10H6z"/><path d="M9 4.5V4a3 3 0 0 1 6 0v.5"/><path d="M9 14h6v3H9z"/>',
        // A double-door locker (faction armory)
        locker: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M8 7h2M14 7h2M10 13v2M14 13v2"/>',
        // Two crossed swords: blade, guard, grip and pommel each
        swords: '<path d="M3 3l13 13M14 18l4-4M17 17l2.5 2.5"/><circle cx="20.5" cy="20.5" r="1"/>' +
            '<path d="M21 3L8 16M6 14l4 4M7 17l-2.5 2.5"/><circle cx="3.5" cy="20.5" r="1"/>',
        // A chain: two links end to end, joined by a third seen edge-on
        chain: '<g transform="rotate(-45 12 12)"><rect x="0.5" y="8.5" width="10" height="7" rx="3.5"/>' +
            '<rect x="13.5" y="8.5" width="10" height="7" rx="3.5"/><path d="M7 12h10"/></g>',
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
        /* A group's secondary bubbles: hidden at the group's bubble until it is tapped */
        #a1ry-dash.nd-open .nd-child.nd-subnode { opacity: 0; pointer-events: none;
            transform: translate(calc(var(--px) * var(--s)), calc(var(--py) * var(--s))) scale(0.4); }
        #a1ry-dash.nd-open .nd-child.nd-subnode.nd-sub-show { opacity: 1; pointer-events: auto;
            transform: translate(calc(var(--dx) * var(--s)), calc(var(--dy) * var(--s))) scale(1); }
        .nd-child.nd-group-open { border-color: #e0b030 !important; color: #fff !important; }
        .nd-letter { font-weight: bold; font-size: calc(15px * var(--s)); line-height: 1; pointer-events: none; white-space: nowrap; }
        .nd-letter.nd-l2 { font-size: calc(12.5px * var(--s)); }
        .nd-letter.nd-l3 { font-size: calc(9.5px * var(--s)); letter-spacing: calc(-0.4px * var(--s)); }

        /* Panels (settings, add shortcut, help, messages): fixed in the middle of the screen,
           phone-safe. --p scales every size in a panel (PANEL_SCALE); inputs keep 16px text,
           which stops iOS zooming in */
        .nd-panel { --p: ${PANEL_SCALE}; display: none; position: fixed; z-index: 999991; left: 50%; top: 50%; transform: translate(-50%, -50%);
            width: calc(300px * var(--p)); max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow-y: auto;
            background: rgba(17,17,17,0.97) !important; border: 2px solid #444 !important; border-radius: calc(8px * var(--p));
            color: #eee !important; font-size: calc(13px * var(--p)); padding: calc(16px * var(--p)) calc(18px * var(--p)); box-shadow: 0 calc(6px * var(--p)) calc(20px * var(--p)) rgba(0,0,0,0.7);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        .nd-panel, .nd-panel * { box-sizing: border-box; }
        .nd-panel.nd-show { display: block; }
        .nd-panel h3 { margin: 0 0 calc(12px * var(--p)); font-family: inherit; font-size: calc(14px * var(--p)); font-weight: normal; line-height: 1.3;
            text-transform: uppercase; letter-spacing: 0.04em; color: #e0b030 !important; display: flex; justify-content: space-between; align-items: center; }
        .nd-panel h3 small { font-size: calc(10px * var(--p)); color: #777; font-weight: normal; text-transform: none; letter-spacing: 0; }
        .nd-panel label { display: block; margin: calc(8px * var(--p)) 0 calc(3px * var(--p)); color: #aaa; font-size: calc(12px * var(--p)); }
        .nd-panel input[type="text"], .nd-panel input[type="url"] { width: 100%; padding: calc(7px * var(--p)) calc(8px * var(--p)); font-size: 16px; /* calc(16px * var(--p)) stops iOS zooming in */
            background: #222 !important; color: #fff !important; border: 1px solid #555 !important; border-radius: calc(4px * var(--p)); }
        .nd-panel input[type="range"] { width: 100%; }
        .nd-panel .nd-check { display: flex; align-items: center; gap: calc(6px * var(--p)); color: #ddd; }
        .nd-row { display: flex; gap: calc(8px * var(--p)); margin-top: calc(12px * var(--p)); }
        .nd-btn { flex: 1; padding: calc(7px * var(--p)) calc(10px * var(--p)); background: #444 !important; color: #fff !important; border: none !important;
            border-radius: calc(4px * var(--p)); font-size: calc(13px * var(--p)); font-weight: bold; cursor: pointer; }
        .nd-btn.nd-primary { background: #2d6a3e !important; }
        .nd-err { color: #f77; font-size: calc(12px * var(--p)); min-height: 1em; margin-top: calc(6px * var(--p)); }
        .nd-list { margin: calc(4px * var(--p)) 0 0; padding: 0; list-style: none; }
        .nd-list li { display: flex; align-items: center; gap: calc(6px * var(--p)); padding: calc(4px * var(--p)) 0; border-bottom: 1px solid #333; }
        .nd-list li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nd-list li small { color: #777; }
        .nd-list .nd-btn { flex: 0 0 auto; padding: calc(3px * var(--p)) calc(8px * var(--p)); font-size: calc(12px * var(--p)); background: #6a2d2d !important; }
        .nd-empty { color: #777; font-size: calc(12px * var(--p)); }
        .nd-section { margin-top: calc(12px * var(--p)); padding-top: calc(8px * var(--p)); border-top: 1px solid #333; }
        .nd-section:first-of-type { margin-top: 0; padding-top: 0; border-top: none; }
        .nd-inline { display: flex; gap: calc(6px * var(--p)); }
        .nd-inline input { flex: 1; min-width: 0; font-family: "Courier New", Courier, monospace; }
        .nd-inline .nd-btn { flex: 0 0 auto; }
        .nd-hint { font-size: calc(11px * var(--p)); color: #888; margin-top: calc(4px * var(--p)); }
        .nd-hint a { color: #8ab4f8 !important; }
        .nd-status { font-size: calc(12px * var(--p)); margin-top: calc(4px * var(--p)); min-height: 1em; color: #999; }
        .nd-status.nd-ok { color: #6c6; }
        .nd-status.nd-warn { color: #e0b030; }
        .nd-status.nd-bad { color: #f66; }
        /* Unread count on the main node and the Messages node */
        .nd-badge { position: absolute; top: -3px; right: -3px; min-width: 16px; height: 16px; padding: 0 4px;
            border-radius: 8px; background: #c33 !important; color: #fff !important; font-size: 10px; font-weight: bold;
            line-height: 16px; text-align: center; pointer-events: none; display: none; box-shadow: 0 0 0 2px #111; }
        .nd-badge.nd-show { display: block; }
        /* The main node is greyscale, so its badge is a sibling placed on its top-right edge */
        #nd-main-badge { left: calc(${MAIN_SIZE / 2 - 13}px * var(--s)); top: calc(${-MAIN_SIZE / 2 - 3}px * var(--s)); right: auto; z-index: 3; }

        /* Faction messages panel */
        .nd-panel.nd-wide { width: calc(380px * var(--p)); }
        .nd-msg { margin-top: calc(10px * var(--p)); padding: calc(8px * var(--p)); border: 1px solid #333; border-radius: calc(6px * var(--p)); background: #1a1a1a !important; }
        .nd-msg.nd-new { border-color: #7a3a3a !important; }
        .nd-msg .nd-body { margin: 0; white-space: pre-wrap; word-wrap: break-word; color: #ddd; }
        .nd-q { margin-top: calc(18px * var(--p)); }
        .nd-msg .nd-body + .nd-q { margin-top: calc(14px * var(--p)); }
        .nd-q > div:first-child { color: #ccc; font-weight: bold; margin-bottom: calc(3px * var(--p)); }
        .nd-q .nd-check { margin: 2px 0; font-size: calc(13px * var(--p)); }
        .nd-q textarea { width: 100%; min-height: calc(54px * var(--p)); padding: calc(6px * var(--p)) calc(8px * var(--p)); font-size: 16px; resize: vertical;
            background: #222 !important; color: #fff !important; border: 1px solid #555 !important; border-radius: calc(4px * var(--p)); font-family: inherit; }
        .nd-msg .nd-row { margin-top: calc(8px * var(--p)); align-items: center; }
        .nd-msg .nd-row .nd-status { flex: 1; margin: 0; }
        .nd-msg .nd-row .nd-btn { flex: 0 0 auto; }
        .nd-panel h3 .nd-x { flex: 0 0 auto; width: calc(28px * var(--p)); height: calc(28px * var(--p)); margin: calc(-6px * var(--p)) 0; padding: 0; border: none !important;
            background: none !important; color: #999 !important; font-size: calc(22px * var(--p)); line-height: calc(28px * var(--p)); cursor: pointer; border-radius: calc(4px * var(--p)); }
        .nd-panel h3 .nd-x:hover, .nd-panel h3 .nd-x:focus-visible { color: #fff !important; background: #333 !important; outline: none; }
        .nd-help p { margin: 0 0 calc(10px * var(--p)); line-height: 1.4; color: #ccc; }
        .nd-help b { color: #fff; }
        .nd-btn.nd-small { flex: 0 0 auto; margin-top: calc(6px * var(--p)); padding: calc(5px * var(--p)) calc(10px * var(--p)); font-size: calc(12px * var(--p)); font-weight: normal; }
        .nd-list li .nd-dot { flex: 0 0 auto; }
        .nd-dot svg { width: 62%; height: 62%; display: block; }
        .nd-dot.nd-l2 { font-size: calc(11px * var(--p)); }
        .nd-dot.nd-l3 { font-size: calc(9.5px * var(--p)); letter-spacing: -0.4px; }
        .nd-suggest { display: flex; flex-wrap: wrap; gap: calc(6px * var(--p)); }
        .nd-chip { display: inline-flex; align-items: center; gap: calc(6px * var(--p)); padding: calc(4px * var(--p)) calc(10px * var(--p)) calc(4px * var(--p)) calc(4px * var(--p)); border-radius: calc(16px * var(--p));
            background: #2a2a2a !important; border: 1px solid #444 !important; color: #eee !important; font-size: calc(13px * var(--p)); cursor: pointer; }
        .nd-chip:hover, .nd-chip:focus-visible { border-color: #888 !important; outline: none; }
        .nd-dot { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: calc(34px * var(--p)); height: calc(34px * var(--p));
            border-radius: 50%; background: #141414 !important; border: 1px solid #555 !important; color: #ccc !important;
            font-size: calc(12px * var(--p)); font-weight: bold; white-space: nowrap; }
        /* Inbox: one slim row per message (icon | title) above the open message */
        .nd-inbox { margin: 0; padding: 0; list-style: none; border: 1px solid #333; border-radius: calc(6px * var(--p));
            max-height: calc(170px * var(--p)); overflow-y: auto; }
        .nd-inbox li { display: flex; align-items: center; gap: calc(8px * var(--p)); padding: calc(6px * var(--p)) calc(8px * var(--p));
            border-bottom: 1px solid #2a2a2a; cursor: pointer; color: #aaa; font-size: calc(13px * var(--p)); }
        .nd-inbox li:last-child { border-bottom: none; }
        .nd-inbox li:hover, .nd-inbox li:focus-visible { background: #222 !important; outline: none; }
        .nd-inbox li.nd-sel { background: #2b2b2b !important; color: #fff; }
        .nd-inbox li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nd-inbox li svg { flex: 0 0 auto; width: calc(16px * var(--p)); height: calc(16px * var(--p)); }
        .nd-inbox li .nd-due { flex: 0 0 auto; font-size: calc(11px * var(--p)); font-weight: normal; color: #b08a2a; white-space: nowrap; }
        .nd-inbox li.nd-unread { color: #fff; font-weight: bold; }
        .nd-inbox li.nd-unread svg { color: #e0b030; }
        .nd-inbox li.nd-replied svg { color: #6c6; }
        /* Version under the martini, shown while the fan is open */
        #nd-ver { position: absolute; left: 0; top: calc(${MAIN_SIZE / 2 + 3}px * var(--s)); transform: translateX(-50%);
            font-size: calc(9px * var(--s)); color: #777; white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.18s; }
        #a1ry-dash.nd-open #nd-ver { opacity: 0.8; }

        /* The martini flashes gold while a new message waits for answers. The node's colours are
           !important (to beat Torn's styles), so the animation runs on the icon and a glow ring */
        #a1ry-dash.nd-flash #nd-main { filter: none; }
        #a1ry-dash.nd-flash #nd-main svg { animation: nd-flash-icon 1.2s ease-in-out infinite; }
        #a1ry-dash.nd-flash #nd-main::after { content: ''; position: absolute; inset: -4px; border-radius: 50%;
            border: 2px solid #e0b030; box-shadow: 0 0 12px 3px rgba(224,176,48,0.6); pointer-events: none;
            animation: nd-flash-ring 1.2s ease-in-out infinite; }
        @keyframes nd-flash-icon { 0%, 100% { color: #ccc; } 50% { color: #ffd166; } }
        @keyframes nd-flash-ring { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
            #a1ry-dash.nd-flash #nd-main svg { animation: none; color: #ffd166; }
            #a1ry-dash.nd-flash #nd-main::after { animation: none; opacity: 1; }
        }
        /* Going offline panel */
        .nd-panel .nd-check input[type="radio"] { margin: 0; }
        .nd-sub { margin: calc(4px * var(--p)) 0 0 calc(22px * var(--p)); }
        .nd-off-log li { cursor: default; flex-wrap: wrap; }
        .nd-off-log li:hover { background: none !important; }
        .nd-off-log li small { flex: 0 0 100%; color: #777; font-size: calc(11px * var(--p)); }
        .nd-off-log .nd-st { flex: 0 0 auto; font-size: calc(11px * var(--p)); color: #999; }
        .nd-off-log .nd-st.nd-ok { color: #6c6; }
        .nd-off-log .nd-st.nd-gone { color: #777; text-decoration: line-through; }
        .nd-off-log .nd-btn { flex: 0 0 auto; padding: calc(2px * var(--p)) calc(8px * var(--p)); font-size: calc(11px * var(--p)); background: #6a2d2d !important; }
        .nd-panel input[type="password"] { width: 100%; padding: calc(7px * var(--p)) calc(8px * var(--p)); font-size: 16px; font-family: "Courier New", Courier, monospace;
            background: #222 !important; color: #fff !important; border: 1px solid #555 !important; border-radius: calc(4px * var(--p)); }
        .nd-sheet { float: right; color: #8ab4f8 !important; font-size: calc(11px * var(--p)); }
        /* Messages admin */
        .nd-ta { width: 100%; padding: calc(6px * var(--p)) calc(8px * var(--p)); font-size: 16px; resize: vertical; font-family: inherit;
            background: #222 !important; color: #fff !important; border: 1px solid #555 !important; border-radius: calc(4px * var(--p)); }
        .nd-ma-open li .nd-btn { background: #6a2d2d !important; }
        .nd-sum { border: 1px solid #333; border-radius: calc(6px * var(--p)); background: #1a1a1a !important; padding: calc(8px * var(--p)); }
        .nd-sum .nd-sum-k { color: #888; font-size: calc(11px * var(--p)); margin-top: calc(8px * var(--p)); }
        .nd-sum .nd-sum-k:first-child { margin-top: 0; }
        .nd-sum .nd-sum-v { color: #eee; white-space: pre-wrap; word-wrap: break-word; }
        .nd-sum ol { margin: calc(4px * var(--p)) 0 0; padding-left: calc(18px * var(--p)); color: #eee; }
        .nd-sum ol li { margin-bottom: calc(6px * var(--p)); }
        .nd-sum ol small { display: block; color: #999; }
        /* Revive setting at the top of Going offline; flashes while revives are on for everyone */
        .nd-revive { margin: 0 0 calc(10px * var(--p)); color: #aaa; }
        .nd-revive b { color: #ddd; }
        .nd-revive .nd-revive-on { display: flex; justify-content: space-between; align-items: baseline; gap: calc(8px * var(--p)); flex-wrap: wrap; padding: calc(7px * var(--p)) calc(10px * var(--p)); border-radius: calc(6px * var(--p));
            border: 1px solid #c33; background: #3a1414 !important; color: #ff8a8a !important; font-weight: bold;
            animation: nd-revive-flash 1.1s ease-in-out infinite; }
        .nd-revive .nd-revive-on a { font-weight: normal; color: #ffd0d0 !important; text-decoration: underline !important; }
        @keyframes nd-revive-flash { 0%, 100% { background: #3a1414; box-shadow: none; } 50% { background: #6a1c1c; box-shadow: 0 0 10px 2px rgba(220,60,60,0.55); } }
        @media (prefers-reduced-motion: reduce) { .nd-revive .nd-revive-on { animation: none; } }
        .nd-test { font-size: calc(11px * var(--p)); color: #e0b030; margin: calc(-4px * var(--p)) 0 calc(8px * var(--p)); }
        /* Admin panel: one card per request waiting for an admin */
        .nd-adm { list-style: none; margin: 0; padding: 0; max-height: calc(360px * var(--p)); overflow-y: auto; }
        .nd-adm li { padding: calc(8px * var(--p)); border: 1px solid #333; border-radius: calc(6px * var(--p)); margin-bottom: calc(6px * var(--p)); background: #1a1a1a !important; }
        .nd-adm .nd-who { color: #fff; font-weight: bold; }
        .nd-adm .nd-kind { float: right; font-size: calc(11px * var(--p)); font-weight: bold; padding: 1px calc(6px * var(--p)); border-radius: calc(8px * var(--p)); background: #333 !important; color: #ddd; }
        .nd-adm .nd-kind.nd-k-merc, .nd-adm .nd-kind.nd-k-stricken { background: #5a2424 !important; color: #fcc; }
        .nd-adm small { display: block; color: #888; font-size: calc(11px * var(--p)); margin-top: 2px; }
        .nd-adm .nd-row { margin-top: calc(6px * var(--p)); }
        .nd-adm .nd-btn { padding: calc(5px * var(--p)) calc(8px * var(--p)); font-size: calc(12px * var(--p)); }
        .nd-btn.nd-danger { background: #7a1a1a !important; }
        .nd-adm-what { color: #ddd; line-height: 1.4; }
        .nd-adm-what b { color: #fff; }
        .nd-code { margin: 0; padding: calc(8px * var(--p)); background: #0c0c0c !important; border: 1px solid #333; border-radius: calc(4px * var(--p));
            color: #9fd49f; font: calc(11px * var(--p))/1.4 "Courier New", Courier, monospace; white-space: pre-wrap; word-break: break-all; }
        .nd-switch { display: flex !important; align-items: center; gap: calc(8px * var(--p)); margin-top: calc(12px * var(--p)) !important; color: #ddd !important; cursor: pointer; }
        .nd-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
        .nd-track { flex: 0 0 auto; position: relative; width: calc(40px * var(--p)); height: calc(22px * var(--p)); border-radius: calc(11px * var(--p)); background: #444 !important; transition: background 0.15s; }
        .nd-track::after { content: ''; position: absolute; top: calc(3px * var(--p)); left: calc(3px * var(--p)); width: calc(16px * var(--p)); height: calc(16px * var(--p));
            border-radius: 50%; background: #ddd; transition: transform 0.15s; }
        .nd-switch input:checked + .nd-track { background: #a33 !important; }
        .nd-switch input:checked + .nd-track::after { transform: translateX(calc(18px * var(--p))); }
        .nd-switch input:focus-visible + .nd-track { outline: 2px solid #888; }
        a.nd-btn { display: flex; align-items: center; justify-content: center; text-decoration: none !important; }
        .nd-btn[aria-disabled="true"], .nd-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'a1ry-dash';
    root.innerHTML = `<button type="button" class="nd-node" id="nd-main" title="a1ry Dash" aria-label="a1ry Dash" aria-expanded="false">${svg('martini')}</button><span class="nd-badge" id="nd-main-badge"></span><span id="nd-ver">v${SCRIPT_VERSION}</span>`;
    document.body.appendChild(root);
    const mainBtn = root.querySelector('#nd-main');
    const mainBadge = root.querySelector('#nd-main-badge');

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
            <div class="nd-hint">No key yet? <a href="${NEW_KEY_URL}" target="_blank" rel="noopener">Create a Limited key</a>. It's kept in this browser.</div>
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
            <button type="button" class="nd-btn" id="nd-help">Help</button>
        </div>
        <div class="nd-row" style="margin-top: 8px">
            ${UPDATE_URL
                ? `<a class="nd-btn" id="nd-update" href="${UPDATE_URL}" target="_blank" rel="noopener" title="Open the script's Greasy Fork page to install the latest version">Update</a>`
                : `<a class="nd-btn" id="nd-update" aria-disabled="true" title="No update link yet">Update</a>`}
            <button type="button" class="nd-btn nd-primary" id="nd-close">Close</button>
        </div>`;
    document.body.appendChild(settingsPanel);

    const helpPanel = document.createElement('div');
    helpPanel.className = 'nd-panel';
    helpPanel.innerHTML = `
        <h3>a1ry Dash help <button type="button" class="nd-x" id="nd-help-close" aria-label="Back to settings" title="Back to settings">\u00D7</button></h3>
        <div class="nd-help">
            <p><b>Moving it.</b> Drag the martini anywhere. It stays near the screen corner you put it by.</p>
            <p><b>Shortcuts.</b> Tap + in the fan to add one: pick a suggestion, or give a name, up to 3 letters for its icon, and a link. Remove them here in Settings.</p>
            <p><b>Faction messages.</b> Tap Messages in the fan. A red number shows new ones, and the martini flashes while a message is waiting for your answers. You can change your answers until the message closes.</p>
            <p><b>Admins.</b> Faction admins (listed in the sheet) get an Admin button under Messages, to send a new message with optional questions or close one early, and one under Going offline, to action requests.</p>
            <p><b>Going offline.</b> Tap the bed, set how many hours you'll be away and pick one: a bounty on yourself, a merc hit or a Stricken merc hit. Your request goes to the faction sheet for an officer to action. You can cancel it until they do. Faction admins also see an Admin button there, listing the requests still waiting.</p>
            <p><b>Your API key.</b> It's kept in this browser. For faction messages, the key is sent once to the faction's a1ry Dash server, which asks Torn who you are and checks you're in Naughty Souls. The server doesn't keep the key. Your answers go to a faction Google Sheet with your name and player ID.</p>
        </div>
        <div class="nd-row"><button type="button" class="nd-btn nd-primary" id="nd-help-back">Back</button></div>`;
    document.body.appendChild(helpPanel);

    const addPanel = document.createElement('div');
    addPanel.className = 'nd-panel';
    addPanel.innerHTML = `
        <h3>Add a shortcut</h3>
        <div class="nd-section" id="nd-suggest-wrap">
            <label>Suggested (tap to add)</label>
            <div class="nd-suggest" id="nd-suggest"></div>
        </div>
        <div class="nd-section">
            <label for="nd-add-name">Name</label>
            <input type="text" id="nd-add-name" maxlength="24" placeholder="e.g. Gym" autocomplete="off">
            <label for="nd-add-icon">Icon (up to 3 letters)</label>
            <input type="text" id="nd-add-icon" maxlength="3" placeholder="G" autocomplete="off" autocapitalize="off" spellcheck="false">
            <label for="nd-add-url">URL</label>
            <input type="url" id="nd-add-url" placeholder="/gym.php or https://..." autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="button" class="nd-btn nd-small" id="nd-add-here" title="Fill in the address (and name) of the page you're on">Current page URL</button>
        </div>
        <div class="nd-err" id="nd-add-err"></div>
        <div class="nd-row">
            <button type="button" class="nd-btn" id="nd-add-cancel">Cancel</button>
            <button type="button" class="nd-btn nd-primary" id="nd-add-save">Add</button>
        </div>`;
    document.body.appendChild(addPanel);

    const msgPanel = document.createElement('div');
    msgPanel.className = 'nd-panel nd-wide';
    msgPanel.innerHTML = `
        <h3>Faction messages <button type="button" class="nd-x" id="nd-msg-close" aria-label="Close" title="Close">\u00D7</button></h3>
        <div id="nd-msg-list"></div>
        <div class="nd-row" id="nd-msg-admin-row" style="display: none"><button type="button" class="nd-btn" id="nd-msg-admin">Admin</button></div>`;
    document.body.appendChild(msgPanel);

    // Messages admin: open messages (Close now) and a step-by-step Create message
    const mAdmPanel = document.createElement('div');
    mAdmPanel.className = 'nd-panel nd-wide';
    mAdmPanel.innerHTML = `
        <h3><span id="nd-ma-title">Admin: messages</span> <button type="button" class="nd-x" id="nd-ma-close" aria-label="Back" title="Back">\u00D7</button></h3>
        <div id="nd-ma-home">
            <label>Open messages <a class="nd-sheet" id="nd-ma-sheet" target="_blank" rel="noopener" style="display: none">Open sheet</a></label>
            <div id="nd-ma-open"></div>
            <div class="nd-row">
                <button type="button" class="nd-btn" id="nd-ma-back">Back</button>
                <button type="button" class="nd-btn nd-primary" id="nd-ma-new">Create message</button>
            </div>
        </div>
        <div id="nd-ma-msg" style="display: none">
            <div class="nd-hint" id="nd-ma-id"></div>
            <label for="nd-ma-tt">Title</label>
            <input type="text" id="nd-ma-tt" maxlength="100" autocomplete="off">
            <label for="nd-ma-body">Message</label>
            <textarea id="nd-ma-body" class="nd-ta" maxlength="1500" rows="5"></textarea>
            <label for="nd-ma-hours">Closes in: <b id="nd-ma-hours-val"></b></label>
            <input type="range" id="nd-ma-hours" min="1" max="168" step="1">
            <label class="nd-check"><input type="checkbox" id="nd-ma-never"> No expiry</label>
            <div class="nd-err" id="nd-ma-msg-err"></div>
            <div class="nd-row">
                <button type="button" class="nd-btn" id="nd-ma-msg-back">Back</button>
                <button type="button" class="nd-btn" id="nd-ma-addq">Add question</button>
                <button type="button" class="nd-btn nd-primary" id="nd-ma-submit">Submit</button>
            </div>
        </div>
        <div id="nd-ma-q" style="display: none">
            <label>Type</label>
            <label class="nd-check"><input type="radio" name="nd-ma-type" value="single"> One choice</label>
            <label class="nd-check"><input type="radio" name="nd-ma-type" value="multi"> Several choices</label>
            <label class="nd-check"><input type="radio" name="nd-ma-type" value="text"> Written answer</label>
            <label for="nd-ma-qt">Question</label>
            <input type="text" id="nd-ma-qt" maxlength="300" autocomplete="off">
            <div id="nd-ma-opts-box">
                <label for="nd-ma-opts">Options (one per line)</label>
                <textarea id="nd-ma-opts" class="nd-ta" rows="4"></textarea>
            </div>
            <button type="button" class="nd-btn nd-small" id="nd-ma-delq">Remove this question</button>
            <div class="nd-err" id="nd-ma-q-err"></div>
            <div class="nd-row">
                <button type="button" class="nd-btn" id="nd-ma-q-back">Back</button>
                <button type="button" class="nd-btn" id="nd-ma-nextq">Next question</button>
                <button type="button" class="nd-btn nd-primary" id="nd-ma-finish">Finish</button>
            </div>
        </div>
        <div id="nd-ma-review" style="display: none">
            <div id="nd-ma-sum"></div>
            <div class="nd-err" id="nd-ma-rev-err"></div>
            <div class="nd-row">
                <button type="button" class="nd-btn" id="nd-ma-rev-back">Back</button>
                <button type="button" class="nd-btn nd-primary" id="nd-ma-send">Confirm and send</button>
            </div>
        </div>
        <div id="nd-ma-done" style="display: none">
            <div class="nd-status nd-ok" id="nd-ma-done-text"></div>
            <div class="nd-row"><button type="button" class="nd-btn nd-primary" id="nd-ma-ok">OK</button></div>
        </div>`;
    document.body.appendChild(mAdmPanel);

    const offPanel = document.createElement('div');
    offPanel.className = 'nd-panel';
    offPanel.innerHTML = `
        <h3>Going offline <button type="button" class="nd-x" id="nd-off-close" aria-label="Close" title="Close">\u00D7</button></h3>
        <div class="nd-revive" id="nd-off-revive"></div>
        <div class="nd-section">
            <label>Your requests <a class="nd-sheet" id="nd-off-sheet" target="_blank" rel="noopener" style="display: none">Open sheet</a></label>
            <div id="nd-off-log"></div>
        </div>
        <div class="nd-section" id="nd-off-form">
            <label for="nd-off-hours">Offline for: <b id="nd-off-hours-val"></b></label>
            <input type="range" id="nd-off-hours" min="1" max="${OFFLINE_HOURS_MAX}" step="1">
            <label class="nd-check"><input type="radio" name="nd-off-kind" value="bounty"> Request a bounty (${OFFLINE_PRICE.bounty})</label>
            <label class="nd-check"><input type="radio" name="nd-off-kind" value="merc"> Request a merc hit</label>
            <div class="nd-sub" id="nd-off-merc" style="display: none">
                <label class="nd-check"><input type="radio" name="nd-off-merc" value="merc" checked> Regular hit (${OFFLINE_PRICE.merc})</label>
                <label class="nd-check"><input type="radio" name="nd-off-merc" value="stricken"> Stricken hit (${OFFLINE_PRICE.stricken})</label>
            </div>
            <div class="nd-err" id="nd-off-err"></div>
            <div class="nd-row"><button type="button" class="nd-btn nd-primary" id="nd-off-submit">Submit</button></div>
        </div>
        <div class="nd-section" id="nd-off-done" style="display: none">
            <div class="nd-status" id="nd-off-done-text"></div>
            <div class="nd-row"><button type="button" class="nd-btn nd-primary" id="nd-off-ok">OK</button></div>
        </div>
        <div class="nd-row" id="nd-off-admin-row" style="display: none"><button type="button" class="nd-btn" id="nd-off-admin">Admin</button></div>`;
    document.body.appendChild(offPanel);

    const admPanel = document.createElement('div');
    admPanel.className = 'nd-panel nd-wide';
    admPanel.innerHTML = `
        <h3>Admin: offline requests <button type="button" class="nd-x" id="nd-adm-close" aria-label="Back" title="Back">\u00D7</button></h3>
        ${MERC_LIVE ? '' : '<div class="nd-test">Test mode: merc hits are not sent.</div>'}
        <div class="nd-section" id="nd-adm-keybox">
            <label for="nd-adm-key">Public API key for merc orders (C39)</label>
            <div class="nd-inline">
                <input type="password" id="nd-adm-key" placeholder="16-character key" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false">
                <button type="button" class="nd-btn nd-primary" id="nd-adm-key-save">Save</button>
            </div>
            <div class="nd-status" id="nd-adm-key-status"></div>
            <div class="nd-hint">Separate from the key in Settings. Kept in this browser and sent only to C39 (ultimata.net) when you order a merc hit.</div>
        </div>
        <div class="nd-section"><label>Waiting for an admin <a class="nd-sheet" id="nd-adm-sheet" target="_blank" rel="noopener" style="display: none">Open sheet</a></label><div id="nd-adm-list"></div></div>
        <div id="nd-adm-confirm" style="display: none">
            <div class="nd-adm-what" id="nd-adm-what"></div>
            <label>Request that would be sent</label>
            <pre class="nd-code" id="nd-adm-code"></pre>
            <label class="nd-switch"><input type="checkbox" id="nd-adm-toggle"><span class="nd-track"></span><span id="nd-adm-toggle-text"></span></label>
            <div class="nd-status" id="nd-adm-result"></div>
            <div class="nd-row">
                <button type="button" class="nd-btn" id="nd-adm-back">Back</button>
                <button type="button" class="nd-btn nd-danger" id="nd-adm-go" disabled>Place merc</button>
            </div>
        </div>
        <div class="nd-row" id="nd-adm-foot"><button type="button" class="nd-btn" id="nd-adm-done">Back</button></div>`;
    document.body.appendChild(admPanel);

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

    // The letters on a shortcut's node: its own icon, or the first letter of its name
    function iconText(s) {
        const icon = typeof s.icon === 'string' ? s.icon.trim() : '';
        if (ICON_RE.test(icon)) return icon;
        return (s.name || '').trim().charAt(0).toUpperCase() || '?';
    }

    // Fill a node or dot with a shortcut's picture (sym) or its letters
    function fillIcon(el, s, letterClass) {
        if (s.sym && ICONS[s.sym]) { el.innerHTML = svg(s.sym); return; }
        const text = iconText(s);
        if (letterClass) {
            const letter = document.createElement('span');
            letter.className = letterClass + lenClass(text);
            letter.textContent = text;
            el.appendChild(letter);
        } else {
            el.className += lenClass(text);
            el.textContent = text;
        }
    }

    // Smaller text for 2- and 3-letter icons
    function lenClass(text) {
        return text.length > 1 ? ' nd-l' + Math.min(3, text.length) : '';
    }

    // Order around the arc: built-ins, the groups, the user's shortcuts, +, Settings
    function fanItems() {
        const items = BUILT_IN.map(b => ({ ...b, kind: b.kind || 'link' }));
        GROUPS.forEach(g => items.push({ id: 'g-' + g.id, label: g.label, icon: g.icon, kind: 'group', group: g }));
        shortcuts.forEach((s, i) => items.push({ id: 'sc' + i, label: s.name, url: s.url, kind: 'link', shortcut: s }));
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
            if (item.icon) el.innerHTML = svg(item.icon);
            else fillIcon(el, item.shortcut, 'nd-letter');
            if (item.kind === 'messages') {
                const badge = document.createElement('span');
                badge.className = 'nd-badge';
                el.appendChild(badge);
            }
            if (item.kind === 'group') {
                el.dataset.group = item.group.id;
                el.setAttribute('aria-expanded', 'false');
            }
            root.appendChild(el);
            // A group's secondary bubbles: links, hidden until the group is tapped
            if (item.kind === 'group') {
                item.group.links.forEach(l => {
                    const a = document.createElement('a');
                    a.className = 'nd-node nd-child nd-subnode';
                    a.dataset.kind = 'link';
                    a.dataset.parent = item.group.id;
                    a.title = l.label;
                    a.setAttribute('aria-label', l.label);
                    a.tabIndex = -1;
                    a.href = l.url;
                    if (newTab) { a.target = '_blank'; a.rel = 'noopener'; }
                    a.innerHTML = svg(l.icon);
                    root.appendChild(a);
                });
            }
        }
        renderBadges();
        if (isOpen) layoutFan();
        setGroup(openGroup);
    }

    // The group whose secondary bubbles are showing (one at a time), or null
    let openGroup = null;
    function setGroup(id) {
        openGroup = id;
        root.querySelectorAll('.nd-subnode').forEach(e => {
            const on = isOpen && e.dataset.parent === id;
            e.classList.toggle('nd-sub-show', on);
            e.tabIndex = on ? 0 : -1;
        });
        root.querySelectorAll('.nd-child[data-kind=group]').forEach(e => {
            const on = e.dataset.group === id;
            e.classList.toggle('nd-group-open', on);
            e.setAttribute('aria-expanded', String(on));
        });
    }

    // Spread the children on arcs centred on the direction from the main node to the middle
    // of the screen, so the fan always opens inwards (away from the nearest edges)
    function layoutFan() {
        const children = Array.from(root.querySelectorAll('.nd-child:not(.nd-subnode)'));
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
                if (el.dataset.group) layoutSubs(el.dataset.group, a, radius);
            }
            placed += count;
            ring++;
        }
    }
    // A group's bubbles: a short arc SUB_STEP further out, on the group's own direction. They
    // grow out of the group's bubble (--px/--py)
    function layoutSubs(id, angle, radius) {
        const subs = Array.from(root.querySelectorAll('.nd-subnode[data-parent="' + id + '"]'));
        const r = radius + SUB_STEP;
        const step = ARC_GAP / r;
        const start = angle - (step * (subs.length - 1)) / 2;
        subs.forEach((el, i) => {
            const a = start + step * i;
            el.style.setProperty('--px', (Math.cos(angle) * radius).toFixed(1) + 'px');
            el.style.setProperty('--py', (Math.sin(angle) * radius).toFixed(1) + 'px');
            el.style.setProperty('--dx', (Math.cos(a) * r).toFixed(1) + 'px');
            el.style.setProperty('--dy', (Math.sin(a) * r).toFixed(1) + 'px');
            el.style.transitionDelay = (i * 0.03) + 's';
        });
    }

    function setOpen(open) {
        isOpen = open;
        if (open) { layoutFan(); refreshMessages(false); }
        root.classList.toggle('nd-open', open);
        mainBtn.setAttribute('aria-expanded', String(open));
        root.querySelectorAll('.nd-child:not(.nd-subnode)').forEach(el => { el.tabIndex = open ? 0 : -1; });
        setGroup(null);
    }

    root.addEventListener('click', (e) => {
        const child = e.target.closest('.nd-child');
        if (!child) return;
        const kind = child.dataset.kind;
        if (kind === 'group') { setGroup(openGroup === child.dataset.group ? null : child.dataset.group); return; }
        if (kind === 'settings') { setOpen(false); openSettings(); }
        else if (kind === 'messages') { setOpen(false); openMessages(); }
        else if (kind === 'offline') { setOpen(false); openOffline(); }
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
        if (msgPanel.classList.contains('nd-show')) closePanel(msgPanel);
        else if (mAdmPanel.classList.contains('nd-show')) openMessages();
        else if (offPanel.classList.contains('nd-show')) closePanel(offPanel);
        else if (admPanel.classList.contains('nd-show')) openOffline();
        else if (helpPanel.classList.contains('nd-show')) openSettings();
        else if (settingsPanel.classList.contains('nd-show')) closePanel(settingsPanel);
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
        closePanel(msgPanel);
        closePanel(helpPanel);
        closePanel(offPanel);
        closePanel(admPanel);
        closePanel(mAdmPanel);
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
            const dot = document.createElement('span');
            dot.className = 'nd-dot';
            fillIcon(dot, s);
            li.appendChild(dot);
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
        if (key !== apiKey) {
            // A new key may be another player: log in again with it next time
            session = null;
            save('session', null);
            msgs = null;
            save('msgs', null);
            offData = null;
            save('offline', null);
            renderBadges();
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
        refreshMessages(true);
    }
    apiSaveBtn.addEventListener('click', saveApiKey);
    apiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveApiKey(); });

    settingsPanel.querySelector('#nd-close').addEventListener('click', () => closePanel(settingsPanel));
    settingsPanel.querySelector('#nd-help').addEventListener('click', () => openPanel(helpPanel));
    const backToSettings = () => openSettings();
    helpPanel.querySelector('#nd-help-close').addEventListener('click', backToSettings);
    helpPanel.querySelector('#nd-help-back').addEventListener('click', backToSettings);

    // Add a shortcut
    const nameInput = addPanel.querySelector('#nd-add-name');
    const urlInput = addPanel.querySelector('#nd-add-url');
    const hereBtn = addPanel.querySelector('#nd-add-here');
    const iconInput = addPanel.querySelector('#nd-add-icon');
    const suggestWrap = addPanel.querySelector('#nd-suggest-wrap');
    const suggestBox = addPanel.querySelector('#nd-suggest');

    // Suggestions not added yet (same URL = already there)
    function renderSuggestions() {
        suggestBox.textContent = '';
        const have = new Set(shortcuts.map(s => s.url));
        const left = SUGGESTED.filter(g => !have.has(g.url));
        suggestWrap.style.display = left.length ? '' : 'none';
        left.forEach(g => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nd-chip';
            b.title = 'Add ' + g.name;
            const dot = document.createElement('span');
            dot.className = 'nd-dot';
            fillIcon(dot, g);
            b.append(dot, document.createTextNode(g.name));
            b.addEventListener('click', () => {
                shortcuts.push(g.sym ? { name: g.name, url: g.url, icon: g.icon, sym: g.sym } : { name: g.name, url: g.url, icon: g.icon });
                save('shortcuts', shortcuts);
                buildFan();
                // Same as adding your own: close the panel and show the fan with the new node
                closePanel(addPanel);
                setOpen(true);
            });
            suggestBox.appendChild(b);
        });
    }
    // The icon's placeholder follows the name's first letter
    function iconPlaceholder() {
        iconInput.placeholder = nameInput.value.trim().charAt(0).toUpperCase() || 'G';
    }
    nameInput.addEventListener('input', iconPlaceholder);
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
        iconInput.value = '';
        iconPlaceholder();
        renderSuggestions();
        urlInput.value = '';
        addErr.textContent = '';
        openPanel(addPanel);
        // No autofocus on touch screens: it pops the keyboard over half the panel
        if (window.matchMedia('(pointer: fine)').matches) nameInput.focus();
    }
    // Fills the URL with the page you're on, and the name from its title if the name is empty
    hereBtn.addEventListener('click', () => {
        urlInput.value = location.href;
        if (!nameInput.value.trim()) {
            nameInput.value = (document.title.split('|')[0] || '').trim().slice(0, 24);
            iconPlaceholder();
        }
        addErr.textContent = '';
    });
    addPanel.querySelector('#nd-add-cancel').addEventListener('click', () => closePanel(addPanel));
    addPanel.querySelector('#nd-add-save').addEventListener('click', addShortcut);
    addPanel.addEventListener('keydown', (e) => { if (e.key === 'Enter') addShortcut(); });
    function addShortcut() {
        const name = nameInput.value.trim().slice(0, 24);
        const url = normaliseUrl(urlInput.value);
        if (!name) { addErr.textContent = 'Give it a name.'; return; }
        const icon = iconInput.value.trim();
        if (icon && !ICON_RE.test(icon)) { addErr.textContent = 'The icon is up to 3 letters or numbers.'; return; }
        if (!url) { addErr.textContent = 'That URL doesn\'t look right (use https://... or a Torn path like /gym.php).'; return; }
        shortcuts.push(icon ? { name, url, icon } : { name, url });
        save('shortcuts', shortcuts);
        buildFan();
        closePanel(addPanel);
        setOpen(true);
    }

    // -------------------------------------------------------------------
    // 8. Faction messages
    //    The server's API is described at the top of server/Code.js. One tab fetches for all:
    //    the list is kept in a1ry_dash_msgs, and a1ry_dash_msgs_busy says a fetch is running.
    //    Opening the panel always fetches. Start-up, the fan opening and the tab coming back
    //    into view fetch only if the copy is older than MSG_STALE_MS.
    // -------------------------------------------------------------------
    const gmXhr = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') ? GM.xmlHttpRequest.bind(GM) : null;

    class ServerError extends Error {
        constructor(code, message) { super(message); this.code = code; }
    }

    // One GET to the server. Resolves with the reply ({ ok: true, ... }), rejects with a
    // ServerError whose message is safe to show (it never contains the key or token)
    function serverGet(params) {
        return new Promise((resolve, reject) => {
            if (!gmXhr) {
                reject(new ServerError('host', 'Your userscript manager doesn\'t allow a1ry Dash to reach its server (GM_xmlhttpRequest is missing).'));
                return;
            }
            const query = Object.keys(params).map(k => k + '=' + encodeURIComponent(params[k])).join('&');
            const fail = (text) => reject(new ServerError('net', text));
            try {
                gmXhr({
                    method: 'GET',
                    url: SERVER_URL + '?' + query,
                    anonymous: true,
                    timeout: 20000,
                    onload: (res) => {
                        let data = null;
                        try { data = JSON.parse(res.responseText); } catch (e) { /* not JSON */ }
                        if (!data) { fail(`The server sent an odd reply (HTTP ${res.status}).`); return; }
                        if (!data.ok) { reject(new ServerError(data.error || 'server', data.message || 'Server error.')); return; }
                        resolve(data);
                    },
                    onerror: () => fail('Couldn\'t reach the server (network).'),
                    ontimeout: () => fail('The server took too long to answer.'),
                });
            } catch (e) {
                fail('Couldn\'t reach the server.');
            }
        });
    }

    // A server call that needs the token: logs in with the saved key first if needed, and once
    // more if the token has expired
    async function withSession(params) {
        for (let attempt = 0; attempt < 2; attempt++) {
            if (!session) {
                if (!apiKey) throw new ServerError('nokey', 'Add your API key in Settings to see faction messages.');
                const r = await serverGet({ a: 'login', key: apiKey });
                session = { token: r.token, id: r.id, name: r.name };
                save('session', session);
            }
            try {
                return await serverGet({ ...params, t: session.token });
            } catch (e) {
                if (e.code !== 'auth' || attempt) throw e;
                session = null;
                save('session', null);
            }
        }
        throw new ServerError('auth', 'Please try again.');
    }

    let msgLoading = false;
    async function refreshMessages(force) {
        if (msgLoading || !apiKey) return;
        const fresh = msgs && Date.now() - msgs.time < MSG_STALE_MS;
        if (fresh && !force) return;
        const busy = load('msgs_busy', 0);
        if (!force && busy && Date.now() - busy < MSG_BUSY_MS) return; // another tab is on it
        msgLoading = true;
        save('msgs_busy', Date.now());
        if (msgPanel.classList.contains('nd-show') && !msgs) renderMessages();
        try {
            const r = await withSession({ a: 'messages' });
            msgs = { time: Date.now(), list: r.messages || [], admin: !!r.admin, error: null };
            // Only remember ids still on the server, so the seen list doesn't grow forever
            const keep = {};
            msgs.list.forEach(m => { if (seen[m.id]) keep[m.id] = true; });
            if (Object.keys(keep).length !== Object.keys(seen).length) { seen = keep; save('seen', seen); }
        } catch (e) {
            // Keep the last list so a network blip doesn't empty the panel
            msgs = { time: Date.now(), list: (msgs && msgs.list) || [], admin: !!(msgs && msgs.admin), error: { code: e.code || 'net', text: e.message } };
        } finally {
            msgLoading = false;
            save('msgs_busy', 0);
        }
        save('msgs', msgs);
        if (msgPanel.classList.contains('nd-show')) {
            if (!msgDirty) renderMessages();
        }
        renderBadges();
    }

    // Has questions and none answered yet
    function needsAnswer(m) {
        return !!(m.questions && m.questions.length && !Object.keys(m.answers || {}).length);
    }
    function unreadCount() {
        if (!msgs || !msgs.list) return 0;
        return msgs.list.filter(m => !seen[m.id]).length;
    }
    function renderBadges() {
        const n = unreadCount();
        const text = n > 9 ? '9+' : String(n);
        root.querySelectorAll('.nd-badge').forEach(b => {
            b.textContent = text;
            b.classList.toggle('nd-show', n > 0);
        });
        root.classList.toggle('nd-flash', !!(msgs && msgs.list && msgs.list.some(m => !seen[m.id] && needsAnswer(m))));
        const label = n ? `Messages (${n} new)` : 'Messages';
        const node = root.querySelector('.nd-child[data-kind=messages]');
        if (node) { node.title = label; node.setAttribute('aria-label', label); }
    }

    const msgList = msgPanel.querySelector('#nd-msg-list');
    let msgDirty = false; // the user has changed an answer but not saved it
    let msgCurrentId = null; // the message shown in the panel

    // Time left before a message closes, for the inbox list: "53h 12m", "12m", "Closed"
    function timeLeft(iso) {
        const ms = new Date(iso).getTime() - Date.now();
        if (isNaN(ms)) return '';
        if (ms <= 0) return 'Closed';
        const min = Math.ceil(ms / 60000);
        const h = Math.floor(min / 60);
        return (h ? h + 'h ' : '') + (min % 60) + 'm';
    }
    // The countdown ticks once a minute, only while the panel is open
    let countdownTimer = null;
    function updateCountdowns() {
        msgList.querySelectorAll('[data-expires]').forEach(e => { e.textContent = timeLeft(e.dataset.expires); });
    }
    function startCountdown() {
        if (countdownTimer) return;
        countdownTimer = setInterval(() => {
            if (!msgPanel.classList.contains('nd-show')) { clearInterval(countdownTimer); countdownTimer = null; return; }
            updateCountdowns();
        }, 60000);
    }


    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }

    function renderMessages() {
        msgDirty = false;
        msgList.textContent = '';
        msgPanel.querySelector('#nd-msg-admin-row').style.display = apiKey && msgs && msgs.admin ? '' : 'none';
        if (!apiKey) {
            const p = el('div', 'nd-status nd-warn', 'Add your API key in Settings to see faction messages.');
            const b = el('button', 'nd-btn', 'Open Settings');
            b.type = 'button';
            b.style.marginTop = '8px';
            b.addEventListener('click', openSettings);
            msgList.append(p, b);
            return;
        }
        if (msgs && msgs.error) {
            msgList.appendChild(el('div', 'nd-status ' + (msgs.error.code === 'net' || msgs.error.code === 'busy' ? 'nd-warn' : 'nd-bad'), msgs.error.text));
        }
        if (!msgs) {
            msgList.appendChild(el('div', 'nd-empty', msgLoading ? 'Loading...' : 'Not loaded yet.'));
            return;
        }
        if (!msgs.list.length) {
            if (!msgs.error) msgList.appendChild(el('div', 'nd-empty', 'No faction messages right now.'));
            return;
        }
        const list = msgs.list;
        let i = list.findIndex(m => m.id === msgCurrentId);
        if (i < 0) i = 0;
        msgCurrentId = list[i].id;
        // Mark the open message read first, so its row already shows it; the red border on
        // the message itself still says it was new
        const wasNew = !seen[msgCurrentId];
        markSeen(msgCurrentId);

        const inbox = el('ul', 'nd-inbox');
        list.forEach((m, j) => {
            const replied = Object.keys(m.answers || {}).length > 0;
            const state = !seen[m.id] ? 'unread' : replied ? 'replied' : 'read';
            const li = el('li', 'nd-' + state + (j === i ? ' nd-sel' : ''));
            li.tabIndex = 0;
            li.setAttribute('role', 'button');
            li.title = m.title + (state === 'unread' ? ' (new)' : state === 'replied' ? ' (answered)' : '');
            li.innerHTML = svg(state === 'unread' ? 'mail' : state === 'replied' ? 'reply' : 'mailOpen');
            li.appendChild(el('span', '', m.title || '(no title)'));
            if (m.expires) {
                const due = el('b', 'nd-due', timeLeft(m.expires));
                due.dataset.expires = m.expires;
                due.title = 'Closes ' + new Date(m.expires).toISOString().slice(0, 16).replace('T', ' ') + ' TCT';
                li.appendChild(due);
            }
            li.addEventListener('click', () => showMessageAt(j));
            li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showMessageAt(j); } });
            inbox.appendChild(li);
        });
        msgList.appendChild(inbox);
        msgList.appendChild(renderMessage(list[i], wasNew));
    }

    // Moving to another message drops unsaved answers on this one
    function showMessageAt(i) {
        if (!msgs || !msgs.list[i]) return;
        msgCurrentId = msgs.list[i].id;
        renderMessages();
    }

    function renderMessage(m, isNew) {
        // The title and time left are on the highlighted inbox row above, so the box has neither
        const frag = document.createDocumentFragment();
        const box = el('div', 'nd-msg' + (isNew ? ' nd-new' : ''));
        frag.appendChild(box);
        if (m.body) box.appendChild(el('div', 'nd-body', m.body));
        if (!m.questions || !m.questions.length) return frag;

        const answers = m.answers || {};
        // One reader per question: returns its current value in the server's format
        const readers = [];
        m.questions.forEach((q, qi) => {
            const wrap = el('div', 'nd-q');
            wrap.appendChild(el('div', '', q.text));
            const name = 'nd-' + m.id + '-' + qi;
            if (q.type === 'text') {
                const ta = document.createElement('textarea');
                ta.maxLength = 500;
                ta.value = answers[q.id] || '';
                wrap.appendChild(ta);
                readers.push(() => [q.id, ta.value.trim()]);
            } else {
                const inputs = q.options.map(opt => {
                    const lab = el('label', 'nd-check');
                    const inp = document.createElement('input');
                    inp.type = q.type === 'multi' ? 'checkbox' : 'radio';
                    inp.name = name;
                    inp.value = opt;
                    inp.checked = q.type === 'multi'
                        ? Array.isArray(answers[q.id]) && answers[q.id].includes(opt)
                        : answers[q.id] === opt;
                    lab.append(inp, document.createTextNode(' ' + opt));
                    wrap.appendChild(lab);
                    return inp;
                });
                readers.push(() => {
                    const picked = inputs.filter(i => i.checked).map(i => i.value);
                    if (q.type === 'multi') return [q.id, picked];
                    // Nothing picked and nothing saved: leave it out
                    return picked.length ? [q.id, picked[0]] : (answers[q.id] ? [q.id, ''] : null);
                });
            }
            box.appendChild(wrap);
        });

        const row = el('div', 'nd-row');
        const status = el('div', 'nd-status', Object.keys(answers).length ? 'Answered. You can change it until it closes.' : '');
        const saveBtn = el('button', 'nd-btn nd-primary', 'Save');
        saveBtn.type = 'button';
        row.append(status, saveBtn);
        box.appendChild(row);

        box.addEventListener('input', () => {
            msgDirty = true;
            status.textContent = 'Not saved yet.';
            status.className = 'nd-status nd-warn';
        });
        saveBtn.addEventListener('click', async () => {
            if (saveBtn.disabled) return;
            const d = {};
            readers.forEach(r => { const kv = r(); if (kv) d[kv[0]] = kv[1]; });
            saveBtn.disabled = true;
            saveBtn.textContent = '...';
            status.textContent = 'Saving...';
            status.className = 'nd-status';
            try {
                const r = await withSession({ a: 'answer', m: m.id, d: JSON.stringify(d) });
                m.answers = r.answers || {};
                // Keep the shared copy in step so other tabs show the new answers
                const copy = msgs && msgs.list.find(x => x.id === m.id);
                if (copy) { copy.answers = m.answers; save('msgs', msgs); }
                renderBadges();
                msgDirty = false;
                // The open message's inbox row: answered (or back to read if all cleared)
                const row = msgList.querySelector('.nd-inbox li.nd-sel');
                if (row) {
                    const replied = Object.keys(m.answers).length > 0;
                    row.className = (replied ? 'nd-replied' : 'nd-read') + ' nd-sel';
                    const icon = row.querySelector('svg');
                    if (icon) icon.outerHTML = svg(replied ? 'reply' : 'mailOpen');
                }
                status.textContent = 'Saved. You can change it until it closes.';
                status.className = 'nd-status nd-ok';
            } catch (e) {
                status.textContent = e.message || 'Couldn\'t save.';
                status.className = 'nd-status nd-bad';
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        });
        return frag;
    }

    // The shown message counts as read; its red border stays until the next render
    function markSeen(id) {
        if (!seen[id]) {
            seen[id] = true;
            save('seen', seen);
        }
        renderBadges();
    }

    // Opens on the first new message that needs answers, else the first new one, else where
    // the user was last time
    function pickStartMessage() {
        if (!msgs || !msgs.list.length) return;
        const m = msgs.list.find(x => !seen[x.id] && needsAnswer(x)) || msgs.list.find(x => !seen[x.id]);
        if (m) msgCurrentId = m.id;
    }

    function openMessages() {
        pickStartMessage();
        renderMessages();
        openPanel(msgPanel);
        startCountdown();
        // Always fetch on open; the shown copy stays until the new one arrives
        refreshMessages(true);
    }
    msgPanel.querySelector('#nd-msg-close').addEventListener('click', () => closePanel(msgPanel));

    // -------------------------------------------------------------------
    // 8b. Going offline: ask for a bounty or a merc hit on yourself while away
    // -------------------------------------------------------------------
    const offLog = offPanel.querySelector('#nd-off-log');
    const offForm = offPanel.querySelector('#nd-off-form');
    const offDone = offPanel.querySelector('#nd-off-done');
    const offHours = offPanel.querySelector('#nd-off-hours');
    const offHoursVal = offPanel.querySelector('#nd-off-hours-val');
    const offMerc = offPanel.querySelector('#nd-off-merc');
    const offErr = offPanel.querySelector('#nd-off-err');
    const offSubmit = offPanel.querySelector('#nd-off-submit');
    // The player's latest requests from the server: { list, error: text } (this tab only)
    let offData = load('offline', null);
    let offLoading = false;

    function offKind() {
        const r = offPanel.querySelector('input[name="nd-off-kind"]:checked');
        if (!r) return '';
        if (r.value === 'bounty') return 'bounty';
        return offPanel.querySelector('input[name="nd-off-merc"]:checked').value; // merc | stricken
    }
    function showOffStep(step) {
        offForm.style.display = step === 'form' ? '' : 'none';
        offDone.style.display = step === 'done' ? '' : 'none';
    }
    function showHours() { offHoursVal.textContent = offHours.value + ' h'; }

    const KIND_LABEL = { bounty: 'Bounty', merc: 'Merc hit', stricken: 'Stricken hit' };
    // "16 Nov 21:04 TCT"
    function tct(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return '';
        const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
        return d.getUTCDate() + ' ' + mon + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' TCT';
    }

    // Show an "Open sheet" link for a docs.google.com URL from the server, else hide it
    function setSheetLink(a, url) {
        const ok = typeof url === 'string' && url.startsWith('https://docs.google.com/');
        a.style.display = ok ? '' : 'none';
        if (ok) a.href = url; else a.removeAttribute('href');
    }

    function renderOffLog() {
        offLog.textContent = '';
        // Admins only: the Admin button and a read-only link to the sheet's Offline tab
        const isAdm = !!(offData && offData.admin);
        offPanel.querySelector('#nd-off-admin-row').style.display = isAdm ? '' : 'none';
        setSheetLink(offPanel.querySelector('#nd-off-sheet'), isAdm ? offData.sheet : '');
        if (!apiKey) {
            offLog.appendChild(el('div', 'nd-status nd-warn', 'Add your API key in Settings first.'));
            return;
        }
        if (offData && offData.error) offLog.appendChild(el('div', 'nd-status nd-bad', offData.error));
        if (!offData || !offData.list) {
            offLog.appendChild(el('div', 'nd-empty', offLoading ? 'Loading...' : 'Not loaded yet.'));
            return;
        }
        if (!offData.list.length) {
            offLog.appendChild(el('div', 'nd-empty', 'None yet.'));
            return;
        }
        const ul = el('ul', 'nd-inbox nd-off-log');
        offData.list.forEach(r => {
            const li = el('li');
            li.appendChild(el('span', '', (KIND_LABEL[r.request] || r.request) + ', ' + r.hours + ' h'));
            const st = r.status.toLowerCase();
            const cls = st === 'cancelled' ? ' nd-gone' : st === 'requested' ? '' : ' nd-ok';
            li.appendChild(el('span', 'nd-st' + cls, r.status));
            if (r.canCancel) {
                const b = el('button', 'nd-btn', 'Cancel');
                b.type = 'button';
                b.addEventListener('click', () => cancelOffline(r.id, b));
                li.appendChild(b);
            }
            li.appendChild(el('small', '', tct(r.time) + (r.until ? ', back by ' + tct(r.until).replace(/^\d+ \w+ /, '') : '')));
            ul.appendChild(li);
        });
        offLog.appendChild(ul);
    }

    // Every server call here returns the fresh list
    async function offCall(params) {
        const r = await withSession(params);
        offData = { list: r.requests || [], admin: !!r.admin, sheet: r.sheet || '', error: null };
        save('offline', offData);
        renderOffLog();
    }
    async function loadOffline() {
        if (offLoading || !apiKey) return;
        offLoading = true;
        if (!offData) renderOffLog();
        try {
            await offCall({ a: 'offline' });
        } catch (e) {
            offData = { ...(offData || { list: null }), error: e.message };
            renderOffLog();
        } finally {
            offLoading = false;
        }
    }
    async function cancelOffline(id, btn) {
        btn.disabled = true;
        btn.textContent = '...';
        try {
            await offCall({ a: 'offline_cancel', id });
        } catch (e) {
            offData = { ...(offData || { list: null }), error: e.message };
            renderOffLog();
        }
    }

    function offFinish(text, state) {
        const t = offPanel.querySelector('#nd-off-done-text');
        t.textContent = text;
        t.className = 'nd-status nd-' + state;
        showOffStep('done');
    }

    offHours.addEventListener('input', () => { showHours(); save('off_hours', Number(offHours.value)); });
    offPanel.querySelectorAll('input[name="nd-off-kind"]').forEach(r => r.addEventListener('change', () => {
        offMerc.style.display = offKind() === 'bounty' ? 'none' : '';
        offErr.textContent = '';
    }));

    offSubmit.addEventListener('click', async () => {
        if (offSubmit.disabled) return;
        offErr.textContent = '';
        const kind = offKind();
        if (!apiKey) { offErr.textContent = 'Add your API key in Settings first.'; return; }
        if (!kind) { offErr.textContent = 'Pick a bounty or a merc hit.'; return; }
        offSubmit.disabled = true;
        offSubmit.textContent = 'Sending...';
        try {
            await offCall({ a: 'offline_add', h: offHours.value, r: kind });
            offFinish((kind === 'bounty' ? 'Bounty' : kind === 'stricken' ? 'Stricken merc hit' : 'Merc hit') +
                ' request sent to the faction sheet for an officer to action. You can cancel it above until then.', 'ok');
        } catch (e) {
            offErr.textContent = e.message || 'Couldn\'t send it.';
        } finally {
            offSubmit.disabled = false;
            offSubmit.textContent = 'Submit';
        }
    });
    offPanel.querySelector('#nd-off-ok').addEventListener('click', () => closePanel(offPanel));
    offPanel.querySelector('#nd-off-close').addEventListener('click', () => closePanel(offPanel));

    offPanel.querySelector('#nd-off-admin').addEventListener('click', openAdmin);

    // -------------------------------------------------------------------
    // 8c. Admin panel (admins only; the server checks the Admins tab on every call): the
    //     requests nobody has actioned. Place bounty opens Torn's add-bounty page for that
    //     player; Place merc shows the C39 request and a toggle to confirm. Mark placed
    //     records it as actioned
    // -------------------------------------------------------------------
    const admList = admPanel.querySelector('#nd-adm-list');
    const admConfirm = admPanel.querySelector('#nd-adm-confirm');
    const admFoot = admPanel.querySelector('#nd-adm-foot');
    const admToggle = admPanel.querySelector('#nd-adm-toggle');
    const admGo = admPanel.querySelector('#nd-adm-go');
    const admResult = admPanel.querySelector('#nd-adm-result');
    let admItems = null;
    let admError = '';
    let admLoading = false;

    // The admin's own key for C39, separate from the Settings key
    const admKey = admPanel.querySelector('#nd-adm-key');
    const admKeyStatus = admPanel.querySelector('#nd-adm-key-status');
    let adminKey = load('admin_key', '') || '';
    function showAdmKeyStatus() {
        admKeyStatus.textContent = adminKey ? 'Key saved (ends ' + adminKey.slice(-4) + ').' : 'No key saved: needed to order merc hits.';
        admKeyStatus.className = 'nd-status ' + (adminKey ? 'nd-ok' : 'nd-warn');
    }
    admPanel.querySelector('#nd-adm-key-save').addEventListener('click', () => {
        const key = admKey.value.trim();
        if (key && !/^[A-Za-z0-9]{16}$/.test(key)) {
            admKeyStatus.textContent = 'A Torn API key is 16 letters and numbers.';
            admKeyStatus.className = 'nd-status nd-bad';
            return;
        }
        adminKey = key;
        save('admin_key', adminKey);
        showAdmKeyStatus();
    });

    function admView(confirm) {
        admPanel.querySelector('#nd-adm-keybox').style.display = confirm ? 'none' : '';
        admList.parentNode.style.display = confirm ? 'none' : '';
        admFoot.style.display = confirm ? 'none' : '';
        admConfirm.style.display = confirm ? '' : 'none';
    }

    function renderAdmin() {
        admList.textContent = '';
        if (admError) admList.appendChild(el('div', 'nd-status nd-bad', admError));
        if (!admItems) {
            admList.appendChild(el('div', 'nd-empty', admLoading ? 'Loading...' : 'Not loaded yet.'));
            return;
        }
        if (!admItems.length) {
            admList.appendChild(el('div', 'nd-empty', 'Nothing waiting. All requests have been actioned.'));
            return;
        }
        const ul = el('ul', 'nd-adm');
        admItems.forEach(it => {
            const li = el('li');
            li.appendChild(el('span', 'nd-kind nd-k-' + it.request, KIND_LABEL[it.request] || it.request));
            li.appendChild(el('div', 'nd-who', it.name + ' [' + it.player + ']'));
            li.appendChild(el('small', '', 'Offline ' + it.hours + ' h from ' + tct(it.time) +
                (it.until ? ', back by ' + tct(it.until) : '')));
            const row = el('div', 'nd-row');
            if (it.request === 'bounty') {
                const a = el('a', 'nd-btn nd-primary', 'Place bounty');
                a.href = BOUNTY_URL + encodeURIComponent(it.player);
                a.target = '_blank';
                a.rel = 'noopener';
                row.appendChild(a);
            } else {
                const b = el('button', 'nd-btn nd-danger', 'Place merc');
                b.type = 'button';
                b.addEventListener('click', () => showMercConfirm(it));
                row.appendChild(b);
            }
            const mark = el('button', 'nd-btn', 'Mark placed');
            mark.type = 'button';
            mark.title = 'Record this request as actioned (status "placed by you")';
            mark.addEventListener('click', () => markPlaced(it.id, mark));
            row.appendChild(mark);
            li.appendChild(row);
            ul.appendChild(li);
        });
        admList.appendChild(ul);
    }

    async function admCall(params) {
        const r = await withSession(params);
        admItems = r.items || [];
        admError = '';
        setSheetLink(admPanel.querySelector('#nd-adm-sheet'), r.sheet);
        renderAdmin();
    }
    async function loadAdmin() {
        if (admLoading) return;
        admLoading = true;
        renderAdmin();
        try {
            await admCall({ a: 'admin_list' });
        } catch (e) {
            admError = e.message;
            if (e.code === 'admin' && offData) { offData.admin = false; save('offline', offData); }
            renderAdmin();
        } finally {
            admLoading = false;
        }
    }
    async function markPlaced(id, btn) {
        btn.disabled = true;
        btn.textContent = '...';
        try {
            await admCall({ a: 'admin_mark', id });
        } catch (e) {
            admError = e.message;
            renderAdmin();
        }
    }

    function showMercConfirm(it) {
        if (!adminKey) {
            showAdmKeyStatus();
            admKeyStatus.textContent = 'Save your Public API key above first.';
            admKeyStatus.className = 'nd-status nd-bad';
            admKey.focus();
            return;
        }
        const stricken = it.request === 'stricken';
        const what = admPanel.querySelector('#nd-adm-what');
        what.textContent = '';
        what.append('Place a ', el('b', '', stricken ? 'Stricken merc hit' : 'regular merc hit'),
            ' (' + OFFLINE_PRICE[it.request] + ', paid by the faction) on ', el('b', '', it.name + ' [' + it.player + ']'), '.');
        admPanel.querySelector('#nd-adm-code').textContent = 'POST ' + MERC_URL + '\n' +
            JSON.stringify({ key: '(admin key ending ' + adminKey.slice(-4) + ')', userId: it.player, isStricken: stricken }, null, 1);
        admPanel.querySelector('#nd-adm-toggle-text').textContent = 'I confirm this hit on ' + it.name;
        admToggle.checked = false;
        admGo.disabled = true;
        admGo.style.display = '';
        admResult.textContent = '';
        admResult.className = 'nd-status';
        admView(true);
    }
    admToggle.addEventListener('change', () => { admGo.disabled = !admToggle.checked; });
    admGo.addEventListener('click', () => {
        if (admGo.disabled) return;
        // Test mode: nothing leaves the browser
        admResult.textContent = 'Test mode: nothing was sent. When this goes live, the request above goes to C39. ' +
            'Use Mark placed once the hit is really ordered.';
        admResult.className = 'nd-status nd-warn';
        admGo.style.display = 'none';
        admToggle.disabled = false;
    });
    admPanel.querySelector('#nd-adm-back').addEventListener('click', () => admView(false));
    admPanel.querySelector('#nd-adm-done').addEventListener('click', openOffline);
    admPanel.querySelector('#nd-adm-close').addEventListener('click', openOffline);

    function openAdmin() {
        adminKey = load('admin_key', '') || '';
        admKey.value = adminKey;
        showAdmKeyStatus();
        admView(false);
        openPanel(admPanel);
        loadAdmin();
    }

    // The player's revive setting, from Torn (v2 user/profile, needs a Limited key for the real
    // value). One call each time the panel opens; never more than one at a time
    let reviveBusy = false;
    function showRevive(setting, error) {
        const box = offPanel.querySelector('#nd-off-revive');
        box.textContent = '';
        if (setting === 'Everyone') {
            const on = el('div', 'nd-revive-on', 'Revives are ON ');
            const a = el('a', '', 'Open hospital page to change');
            a.href = HOSPITAL_URL;
            on.appendChild(a);
            box.appendChild(on);
            return;
        }
        box.append('Revive setting: ');
        if (setting === 'No one') box.appendChild(el('b', '', 'off'));
        else if (setting === 'Friends & faction') box.appendChild(el('b', '', 'friends and faction only'));
        else box.appendChild(el('b', '', error || (setting === 'Unknown' ? 'unknown (needs a Limited key)' : 'checking...')));
    }
    async function loadRevive() {
        if (!apiKey) { showRevive(null, 'add your API key in Settings'); return; }
        if (reviveBusy) return;
        reviveBusy = true;
        showRevive(null);
        try {
            const res = await fetch('https://api.torn.com/v2/user/profile?comment=a1ryDash&key=' + encodeURIComponent(apiKey));
            const data = res.ok ? await res.json() : null;
            if (!data) showRevive(null, 'unknown (Torn HTTP ' + res.status + ')');
            else if (data.error) showRevive(null, 'unknown (Torn error ' + data.error.code + ')');
            else showRevive(data.profile && data.profile.revive_setting);
        } catch (e) {
            showRevive(null, 'unknown (network)');
        } finally {
            reviveBusy = false;
        }
    }

    function openOffline() {
        offHours.value = Math.min(OFFLINE_HOURS_MAX, Math.max(1, Number(load('off_hours', 8)) || 8));
        showHours();
        offPanel.querySelectorAll('input[name="nd-off-kind"]').forEach(r => { r.checked = false; });
        offMerc.style.display = 'none';
        offErr.textContent = '';
        showOffStep('form');
        renderOffLog();
        openPanel(offPanel);
        loadOffline();
        loadRevive();
    }

    // -------------------------------------------------------------------
    // 8d. Messages admin (admins only; the server checks every call). Steps: home (open
    //     messages, Close now, Create message) -> msg (title, body, expiry) -> q (one screen
    //     per question) -> review -> done. The draft lives in memory until it is sent
    // -------------------------------------------------------------------
    const MA_TYPE_LABEL = { single: 'One choice', multi: 'Several choices', text: 'Written answer' };
    const maQ = (sel) => mAdmPanel.querySelector(sel);
    const maHours = maQ('#nd-ma-hours');
    const maNever = maQ('#nd-ma-never');
    let maData = null;      // { open: [...], nextId } from the server
    let maError = '';
    let maDraft = null;     // { title, body, hours, never, questions: [{ type, text, opts }] }
    let maQi = 0;           // the question being edited

    function maStep(step, title) {
        ['home', 'msg', 'q', 'review', 'done'].forEach(k => { maQ('#nd-ma-' + k).style.display = k === step ? '' : 'none'; });
        maQ('#nd-ma-title').textContent = title;
    }

    // "2 d 6 h"
    function hoursText(h) {
        const d = Math.floor(h / 24);
        const r = h % 24;
        return d ? d + ' d' + (r ? ' ' + r + ' h' : '') : r + ' h';
    }
    function showMaHours() {
        const h = Number(maHours.value);
        maQ('#nd-ma-hours-val').textContent = maNever.checked ? 'never' : hoursText(h) + ' (' + tct(new Date(Date.now() + h * 36e5).toISOString()) + ')';
        maHours.disabled = maNever.checked;
    }
    maHours.addEventListener('input', showMaHours);
    maNever.addEventListener('change', showMaHours);

    function renderMaHome() {
        const box = maQ('#nd-ma-open');
        box.textContent = '';
        if (maError) box.appendChild(el('div', 'nd-status nd-bad', maError));
        if (!maData) { box.appendChild(el('div', 'nd-empty', 'Loading...')); return; }
        if (!maData.open.length) { box.appendChild(el('div', 'nd-empty', 'No open messages.')); return; }
        const ul = el('ul', 'nd-list nd-ma-open');
        maData.open.forEach(m => {
            const li = el('li');
            const t = el('span', '', m.title + ' ');
            t.appendChild(el('small', '', m.id + (m.expires ? ', ' + timeLeft(m.expires) + ' left' : ', no expiry')));
            li.appendChild(t);
            const b = el('button', 'nd-btn', 'Close now');
            b.type = 'button';
            b.title = 'Close this message for answers now';
            // Two taps: the first asks "Sure?"
            b.addEventListener('click', () => {
                if (b.dataset.sure) maCall({ a: 'admin_msg_close', id: m.id }, b).catch(() => { /* shown in the list */ });
                else { b.dataset.sure = '1'; b.textContent = 'Sure?'; }
            });
            li.appendChild(b);
            ul.appendChild(li);
        });
        box.appendChild(ul);
    }
    async function maCall(params, btn) {
        if (btn) { btn.disabled = true; btn.textContent = '...'; }
        try {
            const r = await withSession(params);
            maData = { open: r.open || [], nextId: r.nextId || '' };
            setSheetLink(maQ('#nd-ma-sheet'), r.sheet);
            maError = '';
            if (params.a !== 'admin_msgs') refreshMessages(true);
            return r;
        } catch (e) {
            maError = e.message;
            if (params.a !== 'admin_msg_new') renderMaHome();
            throw e;
        } finally {
            if (params.a !== 'admin_msg_new') renderMaHome();
        }
    }

    // Message screen <-> draft
    function maReadMsg() {
        maDraft.title = maQ('#nd-ma-tt').value.trim();
        maDraft.body = maQ('#nd-ma-body').value.trim();
        maDraft.hours = Number(maHours.value);
        maDraft.never = maNever.checked;
    }
    function maShowMsg() {
        maQ('#nd-ma-id').textContent = 'ID: ' + (maData && maData.nextId ? maData.nextId : 'MMDD_XX') + ' (given automatically when sent)';
        maQ('#nd-ma-tt').value = maDraft.title;
        maQ('#nd-ma-body').value = maDraft.body;
        maHours.value = maDraft.hours;
        maNever.checked = maDraft.never;
        maQ('#nd-ma-msg-err').textContent = '';
        showMaHours();
        maStep('msg', 'Create message');
    }
    function maMsgOk() {
        maReadMsg();
        if (!maDraft.title) { maQ('#nd-ma-msg-err').textContent = 'Give the message a title.'; return false; }
        return true;
    }

    // Question screen <-> draft
    function maReadQ() {
        const q = maDraft.questions[maQi];
        const t = mAdmPanel.querySelector('input[name="nd-ma-type"]:checked');
        q.type = t ? t.value : '';
        q.text = maQ('#nd-ma-qt').value.trim();
        q.opts = maQ('#nd-ma-opts').value;
    }
    function maOptList(q) {
        return q.opts.split('\n').map(x => x.trim()).filter(Boolean);
    }
    function maShowQ(i) {
        maQi = i;
        if (!maDraft.questions[i]) maDraft.questions[i] = { type: 'single', text: '', opts: '' };
        const q = maDraft.questions[i];
        mAdmPanel.querySelectorAll('input[name="nd-ma-type"]').forEach(r => { r.checked = r.value === q.type; });
        maQ('#nd-ma-qt').value = q.text;
        maQ('#nd-ma-opts').value = q.opts;
        maQ('#nd-ma-opts-box').style.display = q.type === 'text' ? 'none' : '';
        maQ('#nd-ma-q-err').textContent = '';
        maStep('q', 'Question ' + (i + 1));
    }
    function maQOk() {
        maReadQ();
        const q = maDraft.questions[maQi];
        const err = maQ('#nd-ma-q-err');
        if (!q.type) { err.textContent = 'Pick a type.'; return false; }
        if (!q.text) { err.textContent = 'Write the question.'; return false; }
        if (q.type !== 'text') {
            const n = maOptList(q).length;
            if (n < 2) { err.textContent = 'Give at least 2 options, one per line.'; return false; }
            if (n > 12) { err.textContent = 'At most 12 options.'; return false; }
        }
        return true;
    }
    mAdmPanel.querySelectorAll('input[name="nd-ma-type"]').forEach(r => r.addEventListener('change', () => {
        maQ('#nd-ma-opts-box').style.display = r.value === 'text' && r.checked ? 'none' : '';
    }));

    function maShowReview() {
        const sum = maQ('#nd-ma-sum');
        sum.textContent = '';
        const box = el('div', 'nd-sum');
        const add = (k, v) => { box.append(el('div', 'nd-sum-k', k), el('div', 'nd-sum-v', v)); };
        add('ID', (maData && maData.nextId ? maData.nextId : 'MMDD_XX') + ' (given when sent)');
        add('Title', maDraft.title);
        if (maDraft.body) add('Message', maDraft.body);
        add('Closes', maDraft.never ? 'Never' : 'In ' + hoursText(maDraft.hours) + ', ' + tct(new Date(Date.now() + maDraft.hours * 36e5).toISOString()));
        box.appendChild(el('div', 'nd-sum-k', maDraft.questions.length ? 'Questions' : 'No questions'));
        if (maDraft.questions.length) {
            const ol = el('ol');
            maDraft.questions.forEach(q => {
                const li = el('li', '', q.text);
                li.appendChild(el('small', '', MA_TYPE_LABEL[q.type] + (q.type === 'text' ? '' : ': ' + maOptList(q).join(' | '))));
                ol.appendChild(li);
            });
            box.appendChild(ol);
        }
        sum.appendChild(box);
        maQ('#nd-ma-rev-err').textContent = '';
        maStep('review', 'Check and send');
    }

    maQ('#nd-ma-new').addEventListener('click', () => {
        maDraft = { title: '', body: '', hours: 48, never: false, questions: [] };
        maShowMsg();
    });
    maQ('#nd-ma-msg-back').addEventListener('click', () => { maReadMsg(); maStep('home', 'Admin: messages'); });
    maQ('#nd-ma-addq').addEventListener('click', () => { if (maMsgOk()) maShowQ(0); });
    maQ('#nd-ma-submit').addEventListener('click', () => {
        if (!maMsgOk()) return;
        maDraft.questions = maDraft.questions.filter(q => q.text); // unfinished blanks are dropped
        maShowReview();
    });
    maQ('#nd-ma-q-back').addEventListener('click', () => {
        maReadQ();
        if (maQi > 0) maShowQ(maQi - 1); else maShowMsg();
    });
    maQ('#nd-ma-nextq').addEventListener('click', () => {
        if (!maQOk()) return;
        if (maQi + 1 >= 10 && !maDraft.questions[maQi + 1]) { maQ('#nd-ma-q-err').textContent = 'At most 10 questions.'; return; }
        maShowQ(maQi + 1);
    });
    maQ('#nd-ma-finish').addEventListener('click', () => {
        if (!maQOk()) return;
        maShowReview();
    });
    maQ('#nd-ma-delq').addEventListener('click', () => {
        maDraft.questions.splice(maQi, 1);
        if (maDraft.questions.length) maShowQ(Math.max(0, maQi - 1)); else maShowMsg();
    });
    maQ('#nd-ma-rev-back').addEventListener('click', () => {
        if (maDraft.questions.length) maShowQ(maDraft.questions.length - 1); else maShowMsg();
    });
    const maSend = maQ('#nd-ma-send');
    maSend.addEventListener('click', async () => {
        if (maSend.disabled) return;
        const d = {
            title: maDraft.title, body: maDraft.body, hours: maDraft.never ? 0 : maDraft.hours,
            questions: maDraft.questions.map(q => ({ type: q.type, text: q.text, options: q.type === 'text' ? [] : maOptList(q) })),
        };
        maSend.disabled = true;
        maSend.textContent = 'Sending...';
        try {
            const r = await maCall({ a: 'admin_msg_new', d: JSON.stringify(d) });
            maDraft = null;
            maQ('#nd-ma-done-text').textContent = 'Sent as ' + r.id + '. Members will see it within a minute or so.';
            maStep('done', 'Message sent');
        } catch (e) {
            maQ('#nd-ma-rev-err').textContent = e.message || 'Couldn\'t send it.';
        } finally {
            maSend.disabled = false;
            maSend.textContent = 'Confirm and send';
        }
    });
    maQ('#nd-ma-ok').addEventListener('click', () => { maStep('home', 'Admin: messages'); renderMaHome(); });
    maQ('#nd-ma-back').addEventListener('click', openMessages);
    maQ('#nd-ma-close').addEventListener('click', openMessages);

    function openMsgAdmin() {
        maError = '';
        maStep('home', 'Admin: messages');
        renderMaHome();
        openPanel(mAdmPanel);
        maCall({ a: 'admin_msgs' }).catch(() => { /* shown in the list */ });
    }
    msgPanel.querySelector('#nd-msg-admin').addEventListener('click', openMsgAdmin);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshMessages(false);
    });

    // -------------------------------------------------------------------
    // 9. Start-up, resize and other tabs
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
        session = load('session', null);
        seen = load('seen', {}) || {};
        if (e.key === KEY + 'msgs') {
            msgs = load('msgs', null);
            // Don't wipe answers the user is typing; their Save still works on the old copy
            if (msgPanel.classList.contains('nd-show')) {
                if (!msgDirty) renderMessages();
            }
        }
        buildFan();
        applyLayout();
        if (settingsPanel.classList.contains('nd-show')) renderList();
    });

    buildFan();
    applyLayout();
    refreshMessages(false);
})();
