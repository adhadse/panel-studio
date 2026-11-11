import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {NOTIFICATIONS_SCHEMA, SANKET_SCHEMA} from './modules/schemas.js';
import {buildPanelPage} from './modules/panel/PanelPage.js';
import {buildIslandPage} from './modules/sanket/prefs/IslandPage.js';
import {buildCalendarPage} from './modules/sanket/prefs/CalendarPage.js';
import {buildAnimationsPage} from './modules/sanket/prefs/AnimationsPage.js';
import {disconnectSettingSignals} from './modules/sanket/prefs/SettingsSignals.js';
import {NotificationPreferences} from './modules/notifications/prefs.js';

const CREDITS = [
    ['Sanket', 'https://github.com/narkagni/sanket', 'Notification island, compact Quick Settings, calendar menu'],
    ['Notification Configurator', 'https://github.com/ExposedCat/gnome-notification-configurator', 'Notification position, styling, filtering and notification center'],
    ['Move Clock', 'https://github.com/kuvaus/moveclock', 'Moving the clock to the right'],
    ['Status Area Horizontal Spacing', 'https://extensions.gnome.org/extension/355/status-area-horizontal-spacing', 'Tighter panel spacing'],
];

function buildAboutPage(window) {
    const page = new Adw.PreferencesPage({
        title: _('About'),
        icon_name: 'help-about-symbolic',
    });

    const intro = new Adw.PreferencesGroup({
        title: _('Panel Studio'),
        description: _('One extension for the whole top bar. It combines the projects below, all licensed under the GPL.'),
    });
    page.add(intro);

    const credits = new Adw.PreferencesGroup({title: _('Built from')});
    for (const [name, url, about] of CREDITS) {
        const row = new Adw.ActionRow({
            title: name,
            subtitle: about,
            activatable: true,
        });
        row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        row.connect('activated', () => Gtk.show_uri(window, url, 0));
        credits.add(row);
    }
    page.add(credits);

    window.add(page);
}

export default class PanelStudioPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const sanket = this.getSettings(SANKET_SCHEMA);
        const notifications = this.getSettings(NOTIFICATIONS_SCHEMA);

        window.set_default_size(980, 820);
        window._settings = settings;

        buildPanelPage(window, settings);
        buildIslandPage(window, sanket);
        buildCalendarPage(window, sanket);
        buildAnimationsPage(window, sanket);
        new NotificationPreferences(notifications).fillPreferencesWindow(window);
        buildAboutPage(window);

        window.connect('close-request', () => {
            disconnectSettingSignals();
            return false;
        });
    }
}
