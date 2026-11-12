// Friendly "Discover + Chat" UI layer for SillyTavern.
// Adds a navigation rail and a character-discovery home screen on top of the existing
// DOM. It never replaces core elements, so every ST feature keeps working.
import { getContext } from './st-context.js';
import { selectCharacterById, default_avatar } from '../script.js';
import { tags, tag_map } from './tags.js';

const $ = window.jQuery;
const RAIL_ITEMS = [
    { id: 'discover', icon: 'fa-compass', label: 'Discover' },
    { id: 'chat', icon: 'fa-comment-dots', label: 'Chat' },
    { id: 'create', icon: 'fa-circle-plus', label: 'Create' },
    { id: 'personas', icon: 'fa-user-astronaut', label: 'Personas' },
    { id: 'more', icon: 'fa-ellipsis', label: 'More' },
];
const MORE_ITEMS = [
    { icon: 'fa-address-card', label: 'Manage characters', drawer: '#rightNavHolder' },
    { icon: 'fa-plug', label: 'Connect an AI (API)', drawer: '#sys-settings-button' },
    { icon: 'fa-sliders', label: 'Response settings', drawer: '#ai-config-button' },
    { icon: 'fa-book-atlas', label: 'Lorebooks', drawer: '#WI-SP-button' },
    { icon: 'fa-font', label: 'Prompt formatting', drawer: '#advanced-formatting-button' },
    { icon: 'fa-cubes', label: 'Extensions', drawer: '#extensions-settings-button' },
    { icon: 'fa-gear', label: 'Settings & themes', drawer: '#user-settings-button' },
];

const state = { query: '', tag: 'all', sort: 'recent' };

function isOpen(drawerSel) {
    return $(`${drawerSel} .drawer-content`).first().hasClass('openDrawer');
}

function openDrawer(drawerSel) {
    hideDiscover();
    if (!isOpen(drawerSel)) $(`${drawerSel} .drawer-toggle`).first().trigger('click');
}

function showDiscover() {
    $('body').addClass('crush-discover-open');
    setActiveRail('discover');
    render();
}

function hideDiscover() {
    $('body').removeClass('crush-discover-open');
    setActiveRail('chat');
}

function setActiveRail(id) {
    $('#crush-rail .crush-rail-btn').removeClass('active').filter(`[data-id="${id}"]`).addClass('active');
}

function plain(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html ?? '');
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

function tagsFor(char) {
    const ids = tag_map?.[char.avatar] ?? [];
    return ids.map(id => tags.find(t => t.id === id)?.name).filter(Boolean);
}

function blurb(char) {
    const text = plain(char.data?.creator_notes || char.creatorcomment || char.description || char.data?.description || '');
    return text.length > 110 ? text.slice(0, 107) + '…' : text;
}

function thumb(char) {
    // Full-size avatar: ST's built-in thumbnails are tiny and look blurry at card size.
    return char.avatar && char.avatar !== 'none' ? `characters/${encodeURIComponent(char.avatar)}` : default_avatar;
}

function visibleCharacters() {
    const { characters } = getContext();
    const q = state.query.toLowerCase();
    let list = characters.map((c, id) => ({ c, id, tg: tagsFor(c) }));
    if (state.tag === 'fav') list = list.filter(x => x.c.fav === true || x.c.fav === 'true');
    else if (state.tag !== 'all') list = list.filter(x => x.tg.includes(state.tag));
    if (q) list = list.filter(x => `${x.c.name} ${x.tg.join(' ')} ${blurb(x.c)}`.toLowerCase().includes(q));
    const by = {
        recent: (a, b) => (b.c.date_last_chat || 0) - (a.c.date_last_chat || 0),
        newest: (a, b) => (b.c.date_added || 0) - (a.c.date_added || 0),
        name: (a, b) => a.c.name.localeCompare(b.c.name),
    }[state.sort];
    return list.sort(by);
}

function cardEl({ c, id, tg }) {
    const card = $('<button type="button" class="crush-card"></button>').attr('data-chid', id);
    $('<img loading="lazy" alt="">').attr({ src: thumb(c), alt: c.name }).appendTo(card);
    if (c.fav === true || c.fav === 'true') card.append('<i class="crush-fav fa-solid fa-heart"></i>');
    const info = $('<div class="crush-card-info"></div>').appendTo(card);
    $('<div class="crush-card-name"></div>').text(c.name).appendTo(info);
    const text = blurb(c);
    if (text) $('<div class="crush-card-desc"></div>').text(text).appendTo(info);
    if (tg.length) {
        const row = $('<div class="crush-card-tags"></div>').appendTo(info);
        tg.slice(0, 2).forEach(name => $('<span></span>').text(name).appendTo(row));
    }
    return card;
}

function chipEl(value, label, icon) {
    const chip = $('<button type="button" class="crush-chip"></button>').attr('data-tag', value)
        .toggleClass('active', state.tag === value);
    if (icon) chip.append(`<i class="fa-solid ${icon}"></i> `);
    return chip.append(document.createTextNode(label));
}

function render() {
    const root = $('#crush-discover');
    if (!root.length || !$('body').hasClass('crush-discover-open')) return;
    const { characters } = getContext();

    // tag chips, most-used first
    const counts = {};
    characters.forEach(c => tagsFor(c).forEach(n => counts[n] = (counts[n] || 0) + 1));
    const topTags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 24);
    const chips = root.find('.crush-chips').empty();
    chips.append(chipEl('all', 'All', 'fa-border-all'), chipEl('fav', 'Favorites', 'fa-heart'));
    topTags.forEach(n => chips.append(chipEl(n, n)));

    // continue-chatting strip
    const recent = [...characters.entries()]
        .filter(([, c]) => c.date_last_chat).sort((a, b) => b[1].date_last_chat - a[1].date_last_chat).slice(0, 10)
        .map(([id, c]) => ({ c, id, tg: tagsFor(c) }));
    const strip = root.find('.crush-recent');
    strip.toggle(recent.length > 0 && !state.query && state.tag === 'all');
    strip.find('.crush-row').empty().append(recent.map(cardEl));

    // main grid
    const list = visibleCharacters();
    const grid = root.find('.crush-grid').empty();
    root.find('.crush-count').text(`${list.length} character${list.length === 1 ? '' : 's'}`);
    root.find('.crush-empty').toggle(list.length === 0);
    grid.append(list.map(cardEl));
}

function buildDiscover() {
    const root = $(`
        <section id="crush-discover" aria-label="Discover characters">
            <div class="crush-scroll">
                <header class="crush-top">
                    <div class="crush-logo"><i class="fa-solid fa-masks-theater"></i><span>SillyTavern</span></div>
                    <label class="crush-search"><i class="fa-solid fa-magnifying-glass"></i>
                        <input type="search" placeholder="Search characters, tags…" autocomplete="off"></label>
                    <button type="button" class="crush-connect" title="Connect an AI to start chatting">
                        <i class="fa-solid fa-plug"></i><span>Connect AI</span></button>
                    <button type="button" class="crush-create-btn"><i class="fa-solid fa-plus"></i><span>Create</span></button>
                </header>
                <div class="crush-hero">
                    <div>
                        <h1>Chat with anyone. <em>Anywhere.</em></h1>
                        <p>Pick a character below to start a conversation, or build your own.</p>
                    </div>
                    <button type="button" class="crush-surprise"><i class="fa-solid fa-dice"></i> Surprise me</button>
                </div>
                <div class="crush-chips"></div>
                <div class="crush-recent"><h2>Continue chatting</h2><div class="crush-row"></div></div>
                <div class="crush-section-head">
                    <h2>Characters <small class="crush-count"></small></h2>
                    <select class="crush-sort" aria-label="Sort">
                        <option value="recent">Recently chatted</option>
                        <option value="newest">Newest</option>
                        <option value="name">A → Z</option>
                    </select>
                </div>
                <div class="crush-grid"></div>
                <div class="crush-empty">No characters match. Try another search, or <a href="#" class="crush-empty-create">create one</a>.</div>
            </div>
        </section>`);

    root.on('input', '.crush-search input', e => { state.query = e.target.value; render(); });
    root.on('change', '.crush-sort', e => { state.sort = e.target.value; render(); });
    root.on('click', '.crush-chip', e => { state.tag = $(e.currentTarget).attr('data-tag'); render(); });
    root.on('click', '.crush-card', async e => {
        const id = Number($(e.currentTarget).attr('data-chid'));
        hideDiscover();
        await selectCharacterById(String(id), { switchMenu: false });
    });
    root.on('click', '.crush-surprise', () => {
        const list = visibleCharacters();
        if (list.length) root.find(`.crush-grid .crush-card[data-chid="${list[Math.floor(Math.random() * list.length)].id}"]`).trigger('click');
    });
    root.on('click', '.crush-connect', () => openDrawer('#sys-settings-button'));
    root.on('click', '.crush-create-btn, .crush-empty-create', e => { e.preventDefault(); createCharacter(); });
    $('body').append(root);
}

function createCharacter() {
    openDrawer('#rightNavHolder');
    setTimeout(() => $('#rm_button_create').trigger('click'), 50);
}

function buildRail() {
    const rail = $('<nav id="crush-rail" aria-label="Main navigation"></nav>');
    RAIL_ITEMS.forEach(item => {
        $(`<button type="button" class="crush-rail-btn"><i class="fa-solid ${item.icon}"></i><span></span></button>`)
            .attr({ 'data-id': item.id, title: item.label }).find('span').text(item.label).end().appendTo(rail);
    });
    const sheet = $('<div id="crush-more" class="displayNone"></div>');
    MORE_ITEMS.forEach(item => {
        $(`<button type="button"><i class="fa-solid ${item.icon}"></i><span></span></button>`)
            .attr('data-drawer', item.drawer).find('span').text(item.label).end().appendTo(sheet);
    });
    rail.on('click', '.crush-rail-btn', e => {
        const id = $(e.currentTarget).attr('data-id');
        if (id !== 'more') sheet.addClass('displayNone');
        if (id === 'discover') {
            $('.drawer-content.openDrawer').closest('.drawer').find('.drawer-toggle').first().trigger('click');
            showDiscover();
        } else if (id === 'chat') hideDiscover();
        else if (id === 'create') createCharacter();
        else if (id === 'personas') openDrawer('#persona-management-button');
        else if (id === 'more') sheet.toggleClass('displayNone');
    });
    sheet.on('click', 'button', e => { sheet.addClass('displayNone'); openDrawer($(e.currentTarget).attr('data-drawer')); });
    $(document).on('click', e => { if (!$(e.target).closest('#crush-more, [data-id="more"]').length) sheet.addClass('displayNone'); });
    $('body').append(rail, sheet);
}

function updateConnectBadge() {
    const connected = getContext().onlineStatus !== 'no_connection';
    $('body').toggleClass('crush-connected', connected);
}

function init() {
    $('body').addClass('crush-ui');
    buildRail();
    buildDiscover();
    const { eventSource, eventTypes } = getContext();
    const refresh = () => { updateConnectBadge(); render(); };
    [eventTypes.CHARACTER_PAGE_LOADED, eventTypes.CHARACTER_EDITED, eventTypes.CHARACTER_DELETED,
        eventTypes.CHARACTER_DUPLICATED, eventTypes.ONLINE_STATUS_CHANGED].forEach(t => eventSource.on(t, refresh));
    eventSource.on(eventTypes.CHAT_CHANGED, () => { if (getContext().characterId !== undefined || getContext().groupId) hideDiscover(); });
    // Land on Discover once startup (and the initial chat load) is finished.
    eventSource.on(eventTypes.APP_READY, () => { updateConnectBadge(); showDiscover(); });
    updateConnectBadge();
    showDiscover();
}

// Modules are deferred, so the DOM is parsed. Initialise right away instead of waiting for
// APP_READY, which on a fresh install is blocked behind the first-run onboarding popup.
init();
