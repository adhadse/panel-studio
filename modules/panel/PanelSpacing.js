import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {BOX_PROPS, collectItems} from './items.js';
import {CLOCK_SLACK, ICON_MARGIN, defaultPadding} from './spacing-math.js';

const MARK = '/* panel-studio */';

function parseOverrides(text) {
    try {
        const raw = JSON.parse(text);
        return raw && typeof raw === 'object' ? raw : {};
    } catch (_e) {
        return {};
    }
}

function setStyle(actor, style) {
    actor.set_style(style || null);
}

/**
 * Uniform spacing for the panel: item padding, the gap between the icons of
 * the system menu, the clock padding and the built-in padding of tray icons.
 */
export class PanelSpacing {
    constructor(settings) {
        this._settings = settings;
        this._applied = new Map();
        this._icons = new Map();
        this._indicatorStyle = null;
        this._clockStyle = null;
        this._idleId = 0;
        this._busy = false;

        for (const prop of Object.values(BOX_PROPS))
            Main.panel[prop].connectObject('child-added', () => this._queue(), this);
        this._settings.connectObject(
            'changed::item-inset', () => this._queue(),
            'changed::item-padding-overrides', () => this._queue(),
            this);

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

        for (const item of [...this._applied.keys()])
            this._release(item);
        for (const icon of [...this._icons.keys()])
            this._releaseIcon(icon);
        this._restoreIndicators();
        this._restoreClock();
        this._settings = null;
    }

    _queue() {
        if (this._idleId)
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
        const inset = this._settings.get_int('item-inset');
        const overrides = parseOverrides(this._settings.get_string('item-padding-overrides'));

        const seen = new Set();
        const seenIcons = new Set();
        for (const {key, item} of collectItems().values()) {
            if (!item.has_style_class_name?.('panel-button') || key === 'activities')
                continue;
            seen.add(item);

            const override = overrides[key];
            const padding = Number.isInteger(override) ? override : defaultPadding(key, inset);
            if (padding < 0)
                this._release(item);
            else
                this._hold(item, padding);

            // Tray icons carry their own padding; remove it so the inset is exact.
            if (key !== 'quickSettings' && key !== 'dateMenu')
                this._flattenIcons(item, seenIcons);
        }
        for (const item of [...this._applied.keys()]) {
            if (!seen.has(item))
                this._release(item);
        }
        for (const icon of [...this._icons.keys()]) {
            if (!seenIcons.has(icon))
                this._releaseIcon(icon);
        }

        this._applyIndicators(inset);
        this._applyClock(inset);
    }

    _style(padding) {
        return `-natural-hpadding: ${padding}px; -minimum-hpadding: ${padding}px; ${MARK}`;
    }

    _hold(item, padding) {
        let state = this._applied.get(item);
        if (!state) {
            state = {original: item.get_style() ?? '', padding, id: 0};
            state.id = item.connect('notify::style', () => {
                if (this._busy)
                    return;
                const current = item.get_style() ?? '';
                if (current.includes(MARK))
                    return;
                state.original = current;
                this._write(item, state);
            });
            this._applied.set(item, state);
        }
        state.padding = padding;
        this._write(item, state);
    }

    _write(item, state) {
        this._busy = true;
        setStyle(item, `${this._style(state.padding)} ${state.original}`.trim());
        this._busy = false;
    }

    _release(item) {
        const state = this._applied.get(item);
        if (!state)
            return;
        try {
            item.disconnect(state.id);
            this._busy = true;
            setStyle(item, state.original);
            this._busy = false;
        } catch (_e) {
            // actor already destroyed
        }
        this._applied.delete(item);
    }

    _flattenIcons(actor, seen, depth = 0) {
        if (depth > 4)
            return;
        for (const child of actor.get_children?.() ?? []) {
            if (child instanceof St.Icon && child.has_style_class_name('system-status-icon')) {
                seen.add(child);
                if (!this._icons.has(child))
                    this._icons.set(child, child.get_style() ?? '');
                setStyle(child, `padding: 0; margin: 0; ${this._icons.get(child)}`.trim());
            } else {
                this._flattenIcons(child, seen, depth + 1);
            }
        }
    }

    _releaseIcon(icon) {
        try {
            setStyle(icon, this._icons.get(icon));
        } catch (_e) {
            // actor already destroyed
        }
        this._icons.delete(icon);
    }

    // The icons in the system menu are `2 * inset` apart, like everything else.
    _applyIndicators(inset) {
        const box = Main.panel.statusArea.quickSettings?._indicators;
        if (!box)
            return;
        if (!this._indicatorStyle)
            this._indicatorStyle = {box, original: box.get_style() ?? ''};
        const spacing = Math.max(0, 2 * inset - 2 * ICON_MARGIN);
        setStyle(box, `spacing: ${spacing}px; ${this._indicatorStyle.original}`.trim());
    }

    _restoreIndicators() {
        if (!this._indicatorStyle)
            return;
        try {
            setStyle(this._indicatorStyle.box, this._indicatorStyle.original);
        } catch (_e) {
            // actor already destroyed
        }
        this._indicatorStyle = null;
    }

    // The clock label carries its own side padding on top of the button's.
    _applyClock(inset) {
        const label = Main.panel.statusArea.dateMenu?._clockDisplay;
        if (!label)
            return;
        if (!this._clockStyle)
            this._clockStyle = {label, original: label.get_style() ?? ''};
        // The label is a few pixels wider than the text it holds.
        const padding = Math.max(0, inset - CLOCK_SLACK);
        setStyle(label, `padding: 0 ${padding}px; ${this._clockStyle.original}`.trim());
    }

    _restoreClock() {
        if (!this._clockStyle)
            return;
        try {
            setStyle(this._clockStyle.label, this._clockStyle.original);
        } catch (_e) {
            // actor already destroyed
        }
        this._clockStyle = null;
    }
}
