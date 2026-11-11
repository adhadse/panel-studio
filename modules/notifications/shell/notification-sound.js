import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import { Notification, Sound, } from "resource:///org/gnome/shell/ui/messageTray.js";
export class NotificationSoundManager {
    settingsManager;
    injectionManager = new InjectionManager();
    cancellable = new Gio.Cancellable();
    notificationSettings = new Gio.Settings({
        schema_id: "org.gnome.desktop.notifications",
    });
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        const manager = this;
        this.injectionManager.overrideMethod(Notification.prototype, "playSound", (original) => function () {
            const sound = this.sound;
            if (sound &&
                (Object.getPrototypeOf(sound) !== Sound.prototype ||
                    sound._soundName ||
                    sound._soundFile)) {
                original.call(this);
                return;
            }
            const fallback = manager.getSoundFor(this);
            if (!fallback) {
                original.call(this);
                return;
            }
            manager.playFallback(this, fallback);
        });
    }
    getSoundFor(notification) {
        if (this.cancellable.is_cancelled())
            return null;
        const configuration = this.settingsManager.getConfigurationFor(notification.source?.title ?? "", notification.title, notification.body);
        return configuration.enabled &&
            configuration.sound.enabled &&
            notification.source?.policy.enableSound &&
            this.notificationSettings.get_boolean("show-banners")
            ? configuration.sound
            : null;
    }
    playFallback(notification, sound) {
        const play = (file) => {
            if (this.getSoundFor(notification)?.file !== sound.file)
                return;
            new Sound(file, file ? undefined : "message-new-instant").play();
        };
        if (!sound.file) {
            play(null);
            return;
        }
        const file = Gio.File.new_for_path(sound.file);
        file.query_info_async("standard::type,access::can-read", Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, this.cancellable, (_queriedFile, result) => {
            try {
                const information = file.query_info_finish(result);
                play(information.get_file_type() === Gio.FileType.REGULAR &&
                    information.get_attribute_boolean("access::can-read")
                    ? file
                    : null);
            }
            catch {
                play(null);
            }
        });
    }
    dispose() {
        this.cancellable.cancel();
        this.injectionManager.clear();
    }
}
