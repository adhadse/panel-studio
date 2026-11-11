import * as Main from "resource:///org/gnome/shell/ui/main.js";
export class FullscreenAdapter {
    settingsManager;
    getMonitor;
    constructor(settingsManager, getMonitor) {
        this.settingsManager = settingsManager;
        this.getMonitor = getMonitor;
    }
    createHook() {
        return (original) => {
            const primaryMonitor = Main.layoutManager.primaryMonitor;
            const monitor = this.getMonitor();
            if (!primaryMonitor || !monitor)
                return;
            if (!this.settingsManager.fullscreenEnabled && monitor === primaryMonitor)
                return;
            const inFullscreen = !this.settingsManager.fullscreenEnabled && monitor.inFullscreen;
            const originalDescriptor = Object.getOwnPropertyDescriptor(primaryMonitor, "inFullscreen");
            Object.defineProperty(primaryMonitor, "inFullscreen", {
                get: () => inFullscreen,
                configurable: true,
            });
            try {
                original();
            }
            finally {
                if (originalDescriptor) {
                    Object.defineProperty(primaryMonitor, "inFullscreen", originalDescriptor);
                }
                else {
                    Reflect.deleteProperty(primaryMonitor, "inFullscreen");
                }
            }
        };
    }
    register(manager) {
        manager.registerUpdateStateHook(this.createHook());
    }
}
