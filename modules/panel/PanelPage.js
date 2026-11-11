import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {defaultPadding} from './spacing-math.js';

const BOXES = ['left', 'center', 'right'];

const BOX_INFO = {
    left: {
        title: () => _('Left'),
        description: () => _('Listed from the screen edge inwards'),
    },
    center: {
        title: () => _('Center'),
        description: () => _('Listed from left to right'),
    },
    right: {
        title: () => _('Right'),
        description: () => _('Listed from left to right, the last item sits at the screen edge'),
    },
};

function parseJson(text, fallback) {
    try {
        const value = JSON.parse(text);
        return value ?? fallback;
    } catch (_e) {
        return fallback;
    }
}

function readLayout(settings) {
    const raw = parseJson(settings.get_string('layout'), {});
    const layout = {hidden: []};
    for (const name of [...BOXES, 'hidden']) {
        layout[name] = Array.isArray(raw[name])
            ? raw[name].filter(k => typeof k === 'string')
            : [];
    }
    return layout;
}

function iconFor(icon) {
    try {
        if (icon)
            return Gtk.Image.new_from_gicon(Gio.icon_new_for_string(icon));
    } catch (_e) {
        // fall back below
    }
    return Gtk.Image.new_from_icon_name('application-x-executable-symbolic');
}

class PanelEditor {
    constructor(settings) {
        this._settings = settings;
        this._rows = {left: [], center: [], right: []};
        this._groups = {};
        this._building = false;
    }

    build(window) {
        const page = new Adw.PreferencesPage({
            title: _('Panel'),
            icon_name: 'view-list-symbolic',
        });

        page.add(this._buildSpacingGroup());

        for (const box of BOXES) {
            const group = new Adw.PreferencesGroup({
                title: BOX_INFO[box].title(),
                description: BOX_INFO[box].description(),
            });
            this._groups[box] = group;
            page.add(group);
        }

        const resetGroup = new Adw.PreferencesGroup();
        const resetButton = new Gtk.Button({
            label: _('Reset Panel Layout'),
            halign: Gtk.Align.CENTER,
            css_classes: ['destructive-action', 'pill'],
        });
        resetButton.connect('clicked', () => {
            for (const key of ['item-padding-overrides', 'item-inset', 'layout'])
                this._settings.reset(key);
        });
        resetGroup.add(resetButton);
        page.add(resetGroup);

        const render = () => this._render();
        this._settings.connect('changed::layout', render);
        this._settings.connect('changed::known-items', render);
        this._settings.connect('changed::item-inset', render);
        window.connect('close-request', () => {
            this._settings = null;
            return false;
        });

        this._render();
        return page;
    }

    _buildSpacingGroup() {
        const group = new Adw.PreferencesGroup({
            title: _('Spacing'),
            description: _('One value controls the whole bar. It is the distance from the edge of each item to ' +
                'its icon or text, so neighbouring items, the icons inside the system menu and the clock are ' +
                'all the same distance apart.'),
        });

        const inset = new Adw.SpinRow({
            title: _('Item Spacing'),
            subtitle: _('Pixels from an item\'s edge to its content. Icons end up twice this far apart'),
            adjustment: new Gtk.Adjustment({lower: 2, upper: 24, step_increment: 1, page_increment: 2}),
        });
        this._settings.bind('item-inset', inset, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(inset);

        return group;
    }

    _model() {
        const layout = readLayout(this._settings);
        const known = parseJson(this._settings.get_string('known-items'), []);
        const items = new Map();
        for (const entry of Array.isArray(known) ? known : []) {
            if (entry && typeof entry.key === 'string')
                items.set(entry.key, entry);
        }

        const assigned = new Map();
        const listed = {left: [], center: [], right: []};
        for (const box of BOXES) {
            for (const key of layout[box]) {
                if (!items.has(key) || assigned.has(key))
                    continue;
                assigned.set(key, box);
                listed[box].push(key);
            }
        }

        const order = {};
        for (const box of BOXES) {
            const loose = [...items.values()]
                .filter(e => !assigned.has(e.key) && (BOXES.includes(e.box) ? e.box : 'right') === box)
                .map(e => e.key);
            order[box] = box === 'right' ? [...loose, ...listed[box]] : [...listed[box], ...loose];
        }
        return {layout, items, order};
    }

    _commit(model, order, hidden) {
        const out = {hidden: [...new Set(hidden)]};
        for (const box of BOXES) {
            // Applets that are currently closed keep their saved slot.
            const absent = model.layout[box].filter(k => !model.items.has(k));
            out[box] = [...order[box], ...absent];
        }
        this._settings.set_string('layout', JSON.stringify(out));
    }

    _render() {
        if (!this._settings || this._building)
            return;
        this._building = true;
        try {
            for (const box of BOXES) {
                for (const row of this._rows[box])
                    this._groups[box].remove(row);
                this._rows[box] = [];
            }

            const model = this._model();
            const inset = this._settings.get_int('item-inset');
            const overrides = parseJson(this._settings.get_string('item-padding-overrides'), {});

            for (const box of BOXES) {
                const keys = model.order[box];
                if (keys.length === 0) {
                    const empty = new Adw.ActionRow({
                        title: _('No items'),
                        sensitive: false,
                    });
                    this._rows[box].push(empty);
                    this._groups[box].add(empty);
                    continue;
                }
                keys.forEach((key, index) => {
                    const row = this._buildRow(model, box, key, index, keys.length, inset, overrides);
                    this._rows[box].push(row);
                    this._groups[box].add(row);
                });
            }
        } finally {
            this._building = false;
        }
    }

    _buildRow(model, box, key, index, count, inset, overrides) {
        const entry = model.items.get(key);
        const hidden = model.layout.hidden.includes(key);

        const row = new Adw.ActionRow({
            title: escapeMarkup(entry.label || key),
            subtitle: hidden ? _('Hidden') : (entry.active === false ? _('Only shown while active') : ''),
        });
        if (entry.active === false && !hidden)
            row.set_opacity(0.6);
        const image = iconFor(entry.icon);
        image.set_pixel_size(20);
        row.add_prefix(image);

        const padding = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({lower: -1, upper: 30, step_increment: 1, page_increment: 4}),
            valign: Gtk.Align.CENTER,
            width_chars: 3,
            tooltip_text: _('Button padding in pixels. Changing it overrides the item spacing for this item'),
        });
        padding.set_value(Number.isInteger(overrides[key]) ? overrides[key] : defaultPadding(key, inset));
        padding.connect('value-changed', () => {
            if (this._building || !this._settings)
                return;
            const next = {...parseJson(this._settings.get_string('item-padding-overrides'), {})};
            const value = padding.get_value_as_int();
            if (value === defaultPadding(key, this._settings.get_int('item-inset')))
                delete next[key];
            else
                next[key] = value;
            this._settings.set_string('item-padding-overrides', JSON.stringify(next));
        });
        row.add_suffix(padding);

        const visible = new Gtk.Switch({
            active: !hidden,
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Show in panel'),
        });
        visible.connect('notify::active', () => {
            if (this._building)
                return;
            const current = model.layout.hidden.filter(k => k !== key);
            this._commit(model, model.order, visible.get_active() ? current : [...current, key]);
        });
        row.add_suffix(visible);

        row.add_suffix(this._buildMoveMenu(model, box, key));

        const up = Gtk.Button.new_from_icon_name('go-up-symbolic');
        const down = Gtk.Button.new_from_icon_name('go-down-symbolic');
        for (const button of [up, down]) {
            button.set_valign(Gtk.Align.CENTER);
            button.add_css_class('flat');
        }
        up.set_sensitive(index > 0);
        down.set_sensitive(index < count - 1);
        up.set_tooltip_text(_('Move up'));
        down.set_tooltip_text(_('Move down'));
        up.connect('clicked', () => this._shift(model, box, index, -1));
        down.connect('clicked', () => this._shift(model, box, index, 1));
        row.add_suffix(up);
        row.add_suffix(down);

        return row;
    }

    _buildMoveMenu(model, box, key) {
        const popover = new Gtk.Popover();
        const list = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 2});
        for (const target of BOXES) {
            const button = new Gtk.Button({
                label: BOX_INFO[target].title(),
                css_classes: ['flat'],
                sensitive: target !== box,
                halign: Gtk.Align.FILL,
            });
            button.connect('clicked', () => {
                popover.popdown();
                const order = {};
                for (const name of BOXES)
                    order[name] = model.order[name].filter(k => k !== key);
                order[target].push(key);
                this._commit(model, order, model.layout.hidden);
            });
            list.append(button);
        }
        popover.set_child(list);

        return new Gtk.MenuButton({
            icon_name: 'go-next-symbolic',
            popover,
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Move to another section'),
        });
    }

    _shift(model, box, index, delta) {
        const order = {};
        for (const name of BOXES)
            order[name] = [...model.order[name]];
        const list = order[box];
        const target = index + delta;
        if (target < 0 || target >= list.length)
            return;
        [list[index], list[target]] = [list[target], list[index]];
        this._commit(model, order, model.layout.hidden);
    }
}

function escapeMarkup(text) {
    return `${text}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildPanelPage(window, settings) {
    const page = new PanelEditor(settings).build(window);
    window.add(page);
    return page;
}
