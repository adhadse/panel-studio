# Panel Studio

One GNOME Shell extension (46–51) that replaces:

| Was | Now |
| --- | --- |
| [Sanket](https://github.com/narkagni/sanket) | `modules/sanket` – notification island, compact Quick Settings, calendar menu |
| [Notification Configurator](https://github.com/ExposedCat/gnome-notification-configurator) | `modules/notifications` – notification position, styling, filtering, notification center |
| [Move Clock](https://github.com/kuvaus/moveclock) | `modules/panel/PanelLayout.js` – any panel item can be moved to any section |
| [Status Area Horizontal Spacing](https://extensions.gnome.org/extension/355/status-area-horizontal-spacing) | `modules/panel/PanelSpacing.js` – padding per item instead of one global value |

Settings keep the original schema IDs for Sanket and Notification Configurator, so existing configuration carries over.

## Panel editor

* Reorder, hide, or move every item (system menu, clock, AppIndicator tray apps, other extensions' indicators) between the left, center and right sections.
* Items listed in the layout are placed in order. Items that appear later (a newly launched tray app) stay where the shell put them.
* Padding can be set per item, so tray icons can sit close together while the system menu and clock keep a comfortable hover area.

## Licence

GPL-3.0-or-later. Vendored code keeps its original copyright headers.
