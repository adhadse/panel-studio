import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export const BOX_PROPS = {
    left: '_leftBox',
    center: '_centerBox',
    right: '_rightBox',
};

const KNOWN_LABELS = {
    activities: 'Activities',
    dateMenu: 'Clock & Calendar',
    quickSettings: 'System Menu',
    keyboard: 'Keyboard Layout',
    a11y: 'Accessibility',
    screenRecording: 'Screen Recording',
    screenSharing: 'Screen Sharing',
    dwellClick: 'Dwell Click',
    appMenu: 'App Menu',
};

// AppIndicator keys embed a D-Bus unique name that changes every session,
// so they are mapped to a stable key built from the indicator id instead.
export function stableKey(key, item) {
    if (key.startsWith('appindicator-')) {
        const id = item?._indicator?.id;
        if (id)
            return `appindicator:${id}`;
    }
    return key;
}

function prettify(key) {
    return key
        .replace(/^appindicator:/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^\w/, c => c.toUpperCase());
}

function labelOf(key, item) {
    if (KNOWN_LABELS[key])
        return KNOWN_LABELS[key];
    try {
        const indicator = item?._indicator;
        const title = indicator?.title || indicator?.id;
        if (title)
            return `${title}`;
    } catch (_e) {
        // fall through
    }
    return item?.accessible_name || prettify(key);
}

function findIcon(actor, depth = 0) {
    if (!actor || depth > 4)
        return null;
    if (actor instanceof St.Icon)
        return actor;
    for (const child of actor.get_children?.() ?? []) {
        const found = findIcon(child, depth + 1);
        if (found)
            return found;
    }
    return null;
}

function iconOf(item) {
    try {
        const icon = findIcon(item);
        if (!icon)
            return '';
        return icon.icon_name || icon.gicon?.to_string?.() || '';
    } catch (_e) {
        return '';
    }
}

export function boxNameOf(container) {
    const parent = container.get_parent();
    for (const [name, prop] of Object.entries(BOX_PROPS)) {
        if (Main.panel[prop] === parent)
            return name;
    }
    return null;
}

// Every status area entry that lives in a panel box, keyed by stable key.
export function collectItems() {
    const items = new Map();
    for (const [rawKey, item] of Object.entries(Main.panel.statusArea)) {
        if (!item?.container || item.is_finalized?.())
            continue;
        const key = stableKey(rawKey, item);
        if (items.has(key))
            continue;
        items.set(key, {
            key,
            item,
            container: item.container,
            label: labelOf(key, item),
            icon: iconOf(item),
        });
    }
    return items;
}
