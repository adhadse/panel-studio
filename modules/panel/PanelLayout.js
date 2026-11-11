import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BOX_PROPS, boxNameOf, collectItems} from './items.js';

const DEFAULT_LAYOUT = {left: [], center: [], right: [], hidden: []};

function parseLayout(text) {
    try {
        const raw = JSON.parse(text);
        const layout = {...DEFAULT_LAYOUT};
        for (const name of ['left', 'center', 'right', 'hidden']) {
            layout[name] = Array.isArray(raw?.[name])
                ? raw[name].filter(k => typeof k === 'string')
                : [];
        }
        return layout;
    } catch (_e) {
        return {...DEFAULT_LAYOUT};
    }
}

/**
 * Moves, reorders and hides panel items according to the `layout` setting.
 *
 * Listed items are placed in the listed order. Items that are not listed
 * (for example an applet that appears later) keep their natural position:
 * listed items sit at the end of the right box and at the start of the
 * left and center boxes.
 */
export class PanelLayout {
    constructor(settings) {
        this._settings = settings;
        this._applying = false;
        this._idleId = 0;
        this._hidden = new Map();
        this._watched = new Map();
        this._lastKnown = '';

        this._snapshot = {};
        for (const [name, prop] of Object.entries(BOX_PROPS))
            this._snapshot[name] = Main.panel[prop].get_children();

        for (const prop of Object.values(BOX_PROPS)) {
            Main.panel[prop].connectObject(
                'child-added', () => this._queue(),
                'child-removed', () => this._queue(),
                this);
        }
        this._settings.connectObject('changed::layout', () => this._queue(), this);

        this._queue();
    }

    destroy() {
        if (this._idleId) {
            GLib.source_remove(this._idleId);
            this._idleId = 0;
        }
        for (const prop of Object.values(BOX_PROPS))
            Main.panel[prop].disconnectObject(this);
        this._settings.disconnectObject(this);

        this._applying = true;
        this._restoreVisibility(new Set());
        this._restorePositions();
        this._applying = false;

        this._hidden.clear();
        for (const [actor, id] of this._watched) {
            try {
                actor.disconnect(id);
            } catch (_e) {
                // actor already destroyed
            }
        }
        this._watched.clear();
        this._settings = null;
    }

    _queue() {
        if (this._applying || this._idleId)
            return;
        this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._idleId = 0;
            this._apply();
            return GLib.SOURCE_REMOVE;
        });
    }

    _apply() {
        if (!this._settings)
            return;
        this._applying = true;
        try {
            const layout = parseLayout(this._settings.get_string('layout'));
            const items = collectItems();

            const assigned = new Map();
            const placed = {left: [], center: [], right: []};
            for (const name of Object.keys(placed)) {
                for (const key of layout[name]) {
                    const entry = items.get(key);
                    if (!entry || assigned.has(entry.container))
                        continue;
                    assigned.set(entry.container, name);
                    placed[name].push(entry.container);
                }
            }

            for (const [name, prop] of Object.entries(BOX_PROPS)) {
                const box = Main.panel[prop];
                const loose = box.get_children().filter(c => !assigned.has(c));
                const desired = name === 'right'
                    ? [...loose, ...placed[name]]
                    : [...placed[name], ...loose];
                this._arrange(box, desired);
            }

            this._applyVisibility(layout, items);
            this._watchVisibility(items);
            this._publish(items);
        } finally {
            this._applying = false;
        }
    }

    // Indicators such as screen recording only show while active; keep the
    // list shown in preferences in sync with that.
    _watchVisibility(items) {
        for (const {item} of items.values()) {
            if (this._watched.has(item))
                continue;
            this._watched.set(item, item.connect('notify::visible', () => this._queue()));
        }
    }

    _arrange(box, desired) {
        desired.forEach((child, index) => {
            const parent = child.get_parent();
            if (parent !== box) {
                parent?.remove_child(child);
                box.insert_child_at_index(child, index);
            } else if (box.get_child_at_index(index) !== child) {
                box.set_child_at_index(child, index);
            }
        });
    }

    _applyVisibility(layout, items) {
        const wantHidden = new Set();
        for (const key of layout.hidden) {
            const entry = items.get(key);
            if (!entry)
                continue;
            wantHidden.add(entry.container);
            if (this._hidden.has(entry.container))
                continue;
            const state = {wanted: entry.container.visible, id: 0};
            state.id = entry.container.connect('notify::visible', () => {
                if (this._applying || !entry.container.visible)
                    return;
                state.wanted = true;
                this._applying = true;
                entry.container.hide();
                this._applying = false;
            });
            this._hidden.set(entry.container, state);
            entry.container.hide();
        }
        this._restoreVisibility(wantHidden);
    }

    _restoreVisibility(keep) {
        for (const [container, state] of [...this._hidden]) {
            if (keep.has(container))
                continue;
            try {
                container.disconnect(state.id);
                container.visible = state.wanted;
            } catch (_e) {
                // actor already destroyed
            }
            this._hidden.delete(container);
        }
    }

    _restorePositions() {
        const boxes = Object.values(BOX_PROPS).map(prop => Main.panel[prop]);
        for (const [name, prop] of Object.entries(BOX_PROPS)) {
            // Destroyed actors have no parent and must not be re-added.
            const alive = this._snapshot[name].filter(c => boxes.includes(c.get_parent()));
            this._arrange(Main.panel[prop], alive);
        }
    }

    // Lets the preferences window list what is currently in the panel.
    _publish(items) {
        const known = [...items.values()].map(e => ({
            key: e.key,
            label: e.label,
            icon: e.icon,
            box: boxNameOf(e.container) ?? 'right',
            active: (this._hidden.get(e.container)?.wanted ?? e.container.visible) && e.item.visible,
        }));
        const text = JSON.stringify(known);
        if (text === this._lastKnown)
            return;
        this._lastKnown = text;
        this._settings.set_string('known-items', text);
    }
}
