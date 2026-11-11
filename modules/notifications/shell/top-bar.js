import Clutter from "gi://Clutter";
import St from "gi://St";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { makeColorStyle } from "../utils/themes.js";
export class TopBarManager {
    settingsManager;
    injectionManager = new InjectionManager();
    dateMenu = Main.panel.statusArea.dateMenu;
    pending = new St.BoxLayout({
        style_class: "panel-status-indicators-box",
        y_align: Clutter.ActorAlign.CENTER,
    });
    pendingPad = new St.Widget();
    showBannersSignalId;
    menuSignalId;
    settingsListenerId;
    traySignalIds;
    sourceSignalIds = new Map();
    seenNotifications = new WeakSet();
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        const messagesIndicator = this.dateMenu._indicator;
        this.injectionManager.overrideMethod(Object.getPrototypeOf(messagesIndicator), "_sync", (original) => function () {
            if (settingsManager.recentIcons.enabled ||
                settingsManager.indicator.enabled) {
                this.visible = false;
                return;
            }
            original.call(this);
        });
        this.showBannersSignalId = messagesIndicator._settings.connect("changed::show-banners", () => {
            messagesIndicator._sync();
            this.update();
        });
        this.menuSignalId = this.dateMenu.menu.connect("open-state-changed", () => {
            this.update();
        });
        this.parentSignalId = this.dateMenu.container.connect("parent-set", () => this.syncPad());
        this.pendingPad.add_constraint(new Clutter.BindConstraint({
            source: this.pending,
            coordinate: Clutter.BindCoordinate.SIZE,
        }));
        const clockBox = this.dateMenu._clockDisplay.get_parent();
        clockBox.insert_child_at_index(this.pendingPad, 0);
        clockBox.add_child(this.pending);
        this.traySignalIds = [
            Main.messageTray.connect("source-added", (_tray, source) => this.trackSource(source)),
            Main.messageTray.connect("source-removed", (_tray, source) => {
                for (const signalId of this.sourceSignalIds.get(source) ?? []) {
                    source.disconnect(signalId);
                }
                this.sourceSignalIds.delete(source);
                this.update();
            }),
        ];
        for (const source of Main.messageTray.getSources()) {
            this.trackSource(source);
        }
        this.settingsListenerId = settingsManager.events.on("topBarChanged", () => {
            messagesIndicator._sync();
            this.update();
        });
        messagesIndicator._sync();
        this.update();
    }
    // The spacer keeps the clock text centred, which only matters in the centre box.
    syncPad() {
        this.pendingPad.visible =
            this.pending.visible && this.dateMenu.container.get_parent() === Main.panel._centerBox;
    }
    trackSource(source) {
        this.sourceSignalIds.set(source, [
            source.connect("notify::count", () => this.update()),
            source.connect("notify::icon", () => this.update()),
            source.connect("notification-request-banner", (_source, notification) => {
                this.seenNotifications.delete(notification);
                this.update();
            }),
        ]);
        this.update();
    }
    latestNotificationTime(notifications) {
        return Math.max(...notifications.map((notification) => notification.datetime.to_unix_usec()));
    }
    createIcon(source, count) {
        const { monochrome, counts, countsBackground, countsColor } = this.settingsManager.recentIcons;
        const icon = new St.Icon({ gicon: source.icon, icon_size: 16 });
        if (monochrome) {
            icon.add_effect(new Clutter.DesaturateEffect());
        }
        const container = new St.Widget({
            style_class: "system-status-icon",
            layout_manager: new Clutter.BinLayout(),
        });
        container.add_child(icon);
        if (counts) {
            const [red, green, blue] = countsColor;
            const textColor = 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.5 ? "#000" : "#fff";
            const countStyle = countsBackground
                ? `${makeColorStyle(countsColor, "background")} color: ${textColor};`
                : `${makeColorStyle(countsColor)} text-shadow: 0 0 2px #000;`;
            container.add_child(new St.Label({
                text: `${count}`,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.END,
                translation_x: 4,
                translation_y: 3,
                style: `${countStyle} font-size: 8px; font-weight: bold; border-radius: 5px; padding: 0 2px; min-width: 6px; height: 10px; text-align: center;`,
            }));
        }
        return container;
    }
    update() {
        const { recentIcons, indicator, doNotDisturb } = this.settingsManager;
        if (this.dateMenu.menu.isOpen) {
            for (const source of this.sourceSignalIds.keys()) {
                for (const notification of source.notifications) {
                    this.seenNotifications.add(notification);
                }
            }
        }
        const clearIndicator = indicator.onOpen === "clear";
        const clearIcons = recentIcons.onOpen === "followIndicator"
            ? clearIndicator
            : recentIcons.onOpen === "clear";
        const topBarMode = this.dateMenu._indicator._settings.get_boolean("show-banners")
            ? "show"
            : doNotDisturb.topBar;
        const sources = [...this.sourceSignalIds.keys()];
        const iconSources = recentIcons.enabled && topBarMode === "show"
            ? sources
                .map((source) => ({
                source,
                notifications: source.notifications.filter((notification) => !clearIcons || !this.seenNotifications.has(notification)),
            }))
                .filter(({ notifications }) => notifications.length > 0)
                .sort((first, second) => this.latestNotificationTime(second.notifications) -
                this.latestNotificationTime(first.notifications))
                .slice(0, recentIcons.maximumCount)
            : [];
        const iconNotifications = new Set(iconSources.flatMap(({ notifications }) => notifications));
        const remainingCount = sources
            .flatMap((source) => source.notifications)
            .filter((notification) => !iconNotifications.has(notification) &&
            (!clearIndicator || !this.seenNotifications.has(notification))).length;
        this.pending.destroy_all_children();
        this.syncPad();
        for (const { source, notifications } of iconSources) {
            this.pending.add_child(this.createIcon(source, notifications.length));
        }
        if (indicator.enabled && topBarMode !== "hideAll" && remainingCount > 0) {
            this.pending.add_child(indicator.format === "dot"
                ? new St.Icon({
                    icon_name: "message-indicator-symbolic",
                    style_class: "messages-indicator",
                    y_align: Clutter.ActorAlign.CENTER,
                    style: makeColorStyle(indicator.color),
                })
                : new St.Label({
                    text: `${iconSources.length > 0 ? "+" : ""}${remainingCount}`,
                    y_align: Clutter.ActorAlign.CENTER,
                    style: makeColorStyle(indicator.color),
                }));
        }
        this.pending.visible = this.pending.get_n_children() > 0;
        this.syncPad();
    }
    dispose() {
        this.settingsManager.events.off(this.settingsListenerId);
        this.dateMenu.menu.disconnect(this.menuSignalId);
        this.injectionManager.clear();
        this.dateMenu._indicator._settings.disconnect(this.showBannersSignalId);
        this.dateMenu._indicator._sync();
        for (const [source, signalIds] of this.sourceSignalIds) {
            for (const signalId of signalIds) {
                source.disconnect(signalId);
            }
        }
        for (const signalId of this.traySignalIds) {
            Main.messageTray.disconnect(signalId);
        }
        this.dateMenu.container.disconnect(this.parentSignalId);
        this.pending.destroy();
        this.pendingPad.destroy();
    }
}
