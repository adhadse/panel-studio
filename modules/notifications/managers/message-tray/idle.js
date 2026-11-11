export class IdleAdapter {
    settingsManager;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    createHook() {
        const settingsManager = this.settingsManager;
        return (original, { tray }) => {
            const notification = tray._notification;
            const configuration = notification
                ? settingsManager.getConfigurationFor(notification.source?.title ?? "", notification.title, notification.body)
                : null;
            if (configuration?.enabled &&
                configuration.timeout.enabled &&
                configuration.timeout.ignoreIdle) {
                tray._userActiveWhileNotificationShown = true;
            }
            original();
        };
    }
    register(manager) {
        manager.registerUpdateStateHook(this.createHook());
    }
}
