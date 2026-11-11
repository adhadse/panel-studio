// Built-in horizontal margin the theme puts on each side of a status icon.
export const ICON_MARGIN = 4;

// Extra width of the clock label compared to its text, per side.
export const CLOCK_SLACK = 3;

/**
 * Button padding an item gets from the global item spacing `inset`.
 *
 * Every item is laid out so that the distance from the edge of its hover area
 * to its content is `inset`. Two neighbouring items therefore always have
 * `2 * inset` between their glyphs, and the icons inside the system menu are
 * spaced with the same distance.
 */
export function defaultPadding(key, inset) {
    switch (key) {
    case 'quickSettings':
        // The icons already carry their own margin inside the pill.
        return Math.max(0, inset - ICON_MARGIN);
    case 'dateMenu':
        // The clock text gets its inset from the label padding instead.
        return 0;
    default:
        return inset;
    }
}
