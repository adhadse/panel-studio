export class TimeoutAdapter {
    settingsManager;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    createHook() {
        const settingsManager = this.settingsManager;
        return (_original, timeout, { tray }) => {
            const notification = tray._notification;
            const configuration = notification
                ? settingsManager.getConfigurationFor(notification.source?.title ?? "", notification.title, notification.body)
                : null;
            if (timeout !== null && timeout > 0) {
                if (!configuration?.enabled || !configuration.timeout.enabled)
                    return timeout;
                return configuration.timeout.notificationTimeout > 0
                    ? configuration.timeout.notificationTimeout
                    : null;
            }
            return timeout;
        };
    }
    register(manager) {
        manager.registerUpdateNotificationTimeoutHook(this.createHook());
    }
}
