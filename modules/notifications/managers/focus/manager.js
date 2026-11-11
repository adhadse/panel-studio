import GLib from "gi://GLib";
import Shell from "gi://Shell";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MessageTray, NotificationDestroyedReason, } from "resource:///org/gnome/shell/ui/messageTray.js";
export class FocusManager {
    settingsManager;
    injectionManager = new InjectionManager();
    windowTracker = Shell.WindowTracker.get_default();
    focusedApplicationId;
    settingsListener;
    focusSignal;
    traySignals = [];
    sources = new Map();
    applicationSources = new Map();
    pending = new Set();
    pendingIdle;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    enable() {
        this.settingsListener = this.settingsManager.events.on("clearOnFocusChanged", () => this.sync());
        this.sync();
    }
    sync() {
        if (!this.settingsManager.clearOnFocusEnabled) {
            this.stopTracking();
            return;
        }
        if (this.focusSignal === undefined) {
            this.startTracking();
            return;
        }
        for (const source of this.getFocusedSources()) {
            for (const notification of source.notifications) {
                this.deferNotification(notification);
            }
        }
    }
    startTracking() {
        this.focusedApplicationId = this.windowTracker.focus_app?.get_id();
        this.focusSignal = this.windowTracker.connect("notify::focus-app", () => {
            const applicationId = this.windowTracker.focus_app?.get_id();
            if (applicationId === this.focusedApplicationId) {
                return;
            }
            this.focusedApplicationId = applicationId;
            this.pending.clear();
            for (const source of this.getFocusedSources()) {
                for (const notification of [...source.notifications]) {
                    if (this.shouldClear(notification)) {
                        notification.destroy(NotificationDestroyedReason.DISMISSED);
                    }
                }
            }
        });
        this.traySignals = [
            Main.messageTray.connect("source-added", (_tray, source) => {
                this.watchSource(source);
            }),
            Main.messageTray.connect("source-removed", (_tray, source) => {
                this.unwatchSource(source);
            }),
            Main.messageTray.connect("queue-changed", () => this.schedulePending()),
        ];
        for (const source of Main.messageTray.getSources()) {
            this.watchSource(source);
        }
        const manager = this;
        const prototype = MessageTray.prototype;
        this.injectionManager.overrideMethod(prototype, "_hideNotificationCompleted", (original) => function () {
            const notification = this._notification;
            original.call(this);
            if (notification) {
                manager.deferNotification(notification);
            }
        });
    }
    getFocusedSources() {
        return this.focusedApplicationId
            ? (this.applicationSources.get(this.focusedApplicationId) ?? [])
            : [];
    }
    watchSource(source) {
        if (this.sources.has(source)) {
            return;
        }
        const applicationId = (source.app ?? source._app)?.get_id();
        if (!applicationId) {
            return;
        }
        const sources = this.applicationSources.get(applicationId) ?? new Set();
        sources.add(source);
        this.applicationSources.set(applicationId, sources);
        this.sources.set(source, {
            applicationId,
            signals: [
                source.connect("notification-added", (_source, notification) => {
                    this.deferNotification(notification);
                }),
                source.connect("notification-removed", (_source, notification) => {
                    this.pending.delete(notification);
                }),
            ],
        });
        for (const notification of source.notifications) {
            this.deferNotification(notification);
        }
    }
    unwatchSource(source) {
        const tracked = this.sources.get(source);
        if (!tracked) {
            return;
        }
        for (const signal of tracked.signals) {
            source.disconnect(signal);
        }
        this.sources.delete(source);
        const sources = this.applicationSources.get(tracked.applicationId);
        sources?.delete(source);
        if (sources?.size === 0) {
            this.applicationSources.delete(tracked.applicationId);
        }
        for (const notification of source.notifications) {
            this.pending.delete(notification);
        }
    }
    shouldClear(notification) {
        const source = notification.source;
        if (!this.focusedApplicationId ||
            !source ||
            this.sources.get(source)?.applicationId !== this.focusedApplicationId ||
            !source.notifications.includes(notification)) {
            return false;
        }
        const configuration = this.settingsManager.getConfigurationFor(source.title, notification.title, notification.body);
        return (configuration.enabled && configuration.notificationCenter.clearOnFocus);
    }
    deferNotification(notification) {
        if (!this.shouldClear(notification)) {
            return;
        }
        this.pending.add(notification);
        this.schedulePending();
    }
    schedulePending() {
        if (this.pending.size === 0 || this.pendingIdle !== undefined) {
            return;
        }
        this.pendingIdle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.pendingIdle = undefined;
            const tray = Main.messageTray;
            const queued = new Set(tray._notificationQueue);
            for (const notification of this.pending) {
                if (!this.shouldClear(notification)) {
                    this.pending.delete(notification);
                }
                else if (tray._notification !== notification &&
                    !queued.has(notification)) {
                    this.pending.delete(notification);
                    notification.destroy(NotificationDestroyedReason.DISMISSED);
                }
            }
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this.pendingIdle, "[notification-configurator] clear focused notifications");
    }
    stopTracking() {
        this.injectionManager.clear();
        if (this.focusSignal !== undefined) {
            this.windowTracker.disconnect(this.focusSignal);
            this.focusSignal = undefined;
        }
        for (const signal of this.traySignals) {
            Main.messageTray.disconnect(signal);
        }
        this.traySignals = [];
        for (const source of this.sources.keys()) {
            this.unwatchSource(source);
        }
        if (this.pendingIdle !== undefined) {
            GLib.source_remove(this.pendingIdle);
            this.pendingIdle = undefined;
        }
        this.pending.clear();
        this.focusedApplicationId = undefined;
    }
    disable() {
        if (this.settingsListener !== undefined) {
            this.settingsManager.events.off(this.settingsListener);
            this.settingsListener = undefined;
        }
        this.stopTracking();
    }
}
