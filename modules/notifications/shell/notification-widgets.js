import * as Main from "resource:///org/gnome/shell/ui/main.js";
const hiddenHeaders = new WeakSet();
const resolvedWidgets = new WeakMap();
export function getMessageTrayContainer() {
    return Main.messageTray.get_first_child();
}
export function getBannerBin() {
    return Main.messageTray._bannerBin;
}
export function getFirstBannerRow(banner = getBannerBin()) {
    return (banner
        ?.get_first_child()
        ?.get_child_at_index(0)
        ?.get_child_at_index(0) ?? null);
}
export function hideBannerAppTitleRow(banner = getBannerBin()) {
    const message = banner?.get_first_child();
    if (!message)
        return false;
    if (hiddenHeaders.has(message))
        return true;
    const appTitleRow = getFirstBannerRow(banner);
    if (!appTitleRow)
        return false;
    for (const _ of [0, 1]) {
        const child = appTitleRow.get_child_at_index(0);
        child?.get_parent()?.remove_child(child);
    }
    appTitleRow.set_x_expand(false);
    appTitleRow.get_parent()?.remove_child(appTitleRow);
    const targetWrapper = getFirstBannerRow(banner);
    targetWrapper?.set_style("margin-top: 2px !important");
    targetWrapper?.add_child(appTitleRow);
    hiddenHeaders.add(message);
    return true;
}
function readText(actor) {
    return actor?.text ?? "";
}
export function resolveNotificationWidgets(messageTrayContainer) {
    const container = messageTrayContainer?.get_first_child();
    return container ? resolveBannerWidgets(container) : null;
}
export function resolveBannerWidgets(container) {
    let widgets = resolvedWidgets.get(container);
    if (!widgets) {
        const notification = container.get_first_child();
        const header = notification?.get_first_child() !== notification?.get_last_child()
            ? notification?.get_first_child()
            : null;
        const headerContent = header?.get_child_at_index(1);
        const source = headerContent?.get_child_at_index(0);
        const sourceText = source?.get_first_child();
        const time = headerContent?.get_child_at_index(1);
        const content = notification?.get_child_at_index(1);
        const contentBody = content?.get_child_at_index(1);
        const title = contentBody?.get_child_at_index(0);
        const body = contentBody?.get_child_at_index(1);
        widgets = {
            container,
            sourceText,
            source,
            time,
            title,
            body,
            sourceName: "",
            titleText: "",
            bodyText: "",
        };
        resolvedWidgets.set(container, widgets);
    }
    const notification = container.notification;
    widgets.sourceName =
        notification?.source?.title ??
            widgets.sourceText?.text ??
            widgets.sourceName;
    widgets.titleText = notification
        ? (notification.title ?? "")
        : readText(widgets.title?.get_first_child()) || widgets.titleText;
    widgets.bodyText = notification
        ? (notification.body ?? "")
        : readText(widgets.body?.get_first_child()) || widgets.bodyText;
    return widgets;
}
