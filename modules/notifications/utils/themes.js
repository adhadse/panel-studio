import { getMessageTrayContainer, resolveNotificationWidgets, } from "../shell/notification-widgets.js";
import { DEFAULT_THEME } from "./constants.js";
export function makeColorStyle([red, green, blue, alpha], kind = "color") {
    const redComponent = Math.round(red * 255);
    const greenComponent = Math.round(green * 255);
    const blueComponent = Math.round(blue * 255);
    const color = alpha < 1
        ? `rgba(${redComponent}, ${greenComponent}, ${blueComponent}, ${alpha})`
        : `#${redComponent.toString(16).padStart(2, "0")}${greenComponent.toString(16).padStart(2, "0")}${blueComponent.toString(16).padStart(2, "0")}`;
    return `${kind}: ${color};`;
}
export class ThemesManager {
    settingsManager;
    themeSignalId;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
        settingsManager.events.on("colorsEnabledChanged", (enabled) => {
            if (enabled) {
                this.enableThemes();
            }
            else {
                this.disableThemes();
            }
        });
        if (settingsManager.colorsEnabled) {
            this.enableThemes();
        }
    }
    dispose() {
        this.disableThemes();
    }
    disableThemes() {
        if (typeof this.themeSignalId === "number") {
            getMessageTrayContainer()?.disconnect(this.themeSignalId);
            this.themeSignalId = undefined;
        }
    }
    enableThemes() {
        this.disableThemes();
        const messageTrayContainer = getMessageTrayContainer();
        this.themeSignalId = messageTrayContainer?.connect("child-added", () => {
            if (!this.settingsManager.colorsEnabled)
                return;
            const widgets = resolveNotificationWidgets(messageTrayContainer);
            if (!widgets)
                return;
            const theme = this.settingsManager.getThemeFor(widgets.sourceName, widgets.titleText, widgets.bodyText);
            if (!theme)
                return;
            applyNotificationTheme(widgets, theme);
        });
    }
}
function makeStyle(color, fontSize) {
    return `${makeColorStyle(color)} font-size: ${fontSize}px;`;
}
export function applyNotificationTheme(widgets, theme, containerStyle = widgets.container.get_style()) {
    widgets.source?.set_style(makeStyle(theme.appNameColor, theme.appNameFontSize ?? DEFAULT_THEME.appNameFontSize));
    widgets.time?.set_style(makeStyle(theme.timeColor, theme.timeFontSize ?? DEFAULT_THEME.timeFontSize));
    widgets.title?.set_style(makeStyle(theme.titleColor, theme.titleFontSize ?? DEFAULT_THEME.titleFontSize));
    widgets.body?.set_style(makeStyle(theme.bodyColor, theme.bodyFontSize ?? DEFAULT_THEME.bodyFontSize));
    widgets.container.set_style(`${containerStyle ?? ""} ${makeColorStyle(theme.backgroundColor, "background")}`);
}
