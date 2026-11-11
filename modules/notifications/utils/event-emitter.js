export class TypedEventEmitter {
    listeners = new Map();
    nextId = 1;
    on(event, listener) {
        let eventListeners = this.listeners.get(event);
        if (!eventListeners) {
            eventListeners = new Map();
            this.listeners.set(event, eventListeners);
        }
        const id = this.nextId++;
        eventListeners.set(id, listener);
        return id;
    }
    off(id) {
        for (const eventListeners of this.listeners.values()) {
            if (eventListeners.delete(id)) {
                return;
            }
        }
    }
    emit(event, ...args) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const listener of eventListeners.values()) {
                listener(...args);
            }
        }
    }
}
