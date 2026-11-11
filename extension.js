import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {NOTIFICATIONS_SCHEMA, SANKET_SCHEMA} from './modules/schemas.js';
import {PanelLayout} from './modules/panel/PanelLayout.js';
import {PanelSpacing} from './modules/panel/PanelSpacing.js';

import {ToggleOrder} from './modules/sanket/ui/ToggleOrder.js';
import {SourceMerge} from './modules/sanket/shell/SourceMerge.js';
import {MessageSlide} from './modules/sanket/shell/MessageSlide.js';
import {setAnimationSpeed} from './modules/sanket/ui/Animations.js';
import {CompactToggles} from './modules/sanket/ui/CompactToggles.js';
import {DateMenuLayout} from './modules/sanket/shell/DateMenuLayout.js';
import {NotificationIsland} from './modules/sanket/ui/NotificationIsland.js';

import {migrateRegexSchema} from './modules/notifications/migrations/regex.js';
import {MediaPlayerManager} from './modules/notifications/shell/media-player.js';
import {NotificationCenterManager} from './modules/notifications/shell/notification-center.js';
import {NotificationsManager} from './modules/notifications/shell/notifications.js';
import {TopBarManager} from './modules/notifications/shell/top-bar.js';
import {SettingsManager} from './modules/notifications/utils/settings.js';
import {ThemesManager} from './modules/notifications/utils/themes.js';


export default class PanelStudioExtension extends Extension {
    enable() {
        this._teardown = [];

        this._module('panel layout', () => this._enablePanelLayout());
        this._module('panel spacing', () => this._enablePanelSpacing());
        this._module('quick settings and calendar', () => this._enableSanket());
        this._module('notifications', () => this._enableNotifications());
    }

    disable() {
        for (const [name, undo] of this._teardown.reverse()) {
            try {
                undo();
            } catch (e) {
                console.error(`Panel Studio: failed to disable ${name}`, e);
            }
        }
        this._teardown = null;
        this._settings = null;
    }

    // A failure in one module must not take the others down with it.
    _module(name, enable) {
        try {
            const undo = enable();
            this._teardown.push([name, undo]);
        } catch (e) {
            console.error(`Panel Studio: failed to enable ${name}`, e);
        }
    }

    _enablePanelLayout() {
        this._settings = this.getSettings();
        const layout = new PanelLayout(this._settings);
        return () => layout.destroy();
    }

    _enablePanelSpacing() {
        const spacing = new PanelSpacing(this._settings);
        return () => spacing.destroy();
    }

    _enableSanket() {
        const {dateMenu, quickSettings} = Main.panel.statusArea;
        const settings = this.getSettings(SANKET_SCHEMA);

        const sync = () => setAnimationSpeed(settings.get_double('animation-speed'));
        sync();
        settings.connectObject('changed::animation-speed', sync, this);

        const dateMenuLayout = new DateMenuLayout(dateMenu, quickSettings, settings);
        const messageSlide = new MessageSlide(dateMenu._messageList);
        const sourceMerge = new SourceMerge();
        const toggleOrder = new ToggleOrder(quickSettings.menu, settings);
        const compactToggles = new CompactToggles(quickSettings.menu, settings, toggleOrder);
        const island = new NotificationIsland(quickSettings.menu, dateMenu, compactToggles,
            dateMenuLayout.calendarPanel, settings);

        return () => {
            island.destroy();
            compactToggles.destroy();
            toggleOrder.destroy();
            sourceMerge.destroy();
            messageSlide.destroy();
            dateMenuLayout.destroy();
            settings.disconnectObject(this);
            setAnimationSpeed(1);
        };
    }

    _enableNotifications() {
        const settings = this.getSettings(NOTIFICATIONS_SCHEMA);
        migrateRegexSchema(settings);

        const settingsManager = new SettingsManager(settings);
        const notificationsManager = new NotificationsManager(settingsManager);
        const themesManager = new ThemesManager(settingsManager);
        const notificationCenterManager = new NotificationCenterManager(
            settingsManager, () => this.openPreferences());
        const topBarManager = new TopBarManager(settingsManager);
        const mediaPlayerManager = new MediaPlayerManager(settingsManager);

        return () => {
            notificationCenterManager.dispose();
            mediaPlayerManager.dispose();
            settingsManager.dispose();
            notificationsManager.dispose();
            themesManager.dispose();
            topBarManager.dispose();
        };
    }
}
