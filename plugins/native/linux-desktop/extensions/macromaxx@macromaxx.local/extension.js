import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const xml = `<node><interface name="app.macromaxx.Shell"><method name="GetActive"><arg type="s" direction="out"/></method><method name="Do"><arg type="s" direction="in"/></method><signal name="ActiveWindowChanged"><arg type="s"/></signal></interface></node>`;
export default class MacroMaxxBridge extends Extension {
  enable() {
    this.hidden = [];
    this.object = Gio.DBusExportedObject.wrapJSObject(xml, this);
    this.object.export(Gio.DBus.session, '/app/macromaxx/Shell');
    this.owner = Gio.bus_own_name_on_connection(Gio.DBus.session, 'app.macromaxx.Shell', Gio.BusNameOwnerFlags.NONE, null, null);
    // Reporting is pull-based; no window titles are broadcast or stored.
  }
  GetActive() {
    const window = global.display.focus_window;
    const app = window && Shell.WindowTracker.get_default().get_window_app(window);
    return JSON.stringify({ appId: app?.get_id() || window?.get_wm_class() || '', title: window?.get_title() || '' });
  }
  Do(command) {
    const window = global.display.focus_window, time = global.get_current_time();
    const manager = global.workspace_manager, workspace = manager.get_active_workspace();
    if (command === 'workspace-next' || command === 'workspace-previous') {
      const index = Math.max(0, Math.min(manager.n_workspaces - 1, workspace.index() + (command === 'workspace-next' ? 1 : -1)));
      manager.get_workspace_by_index(index).activate(time); return;
    }
    if (command === 'show-desktop') {
      if (this.hidden.length) { this.hidden.forEach(w => { if (w.get_compositor_private()) w.unminimize(); }); this.hidden = []; }
      else { this.hidden = workspace.list_windows().filter(w => !w.minimized && w.get_window_type() === Meta.WindowType.NORMAL); this.hidden.forEach(w => w.minimize()); }
      return;
    }
    if (!window) throw new Error('No active window.');
    switch (command) {
      case 'minimize': window.minimize(); break;
      case 'maximize': if (window.get_maximized()) window.unmaximize(Meta.MaximizeFlags.BOTH); else window.maximize(Meta.MaximizeFlags.BOTH); break;
      case 'close': window.delete(time); break;
      case 'fullscreen': if (window.is_fullscreen()) window.unmake_fullscreen(); else window.make_fullscreen(); break;
      case 'next-output': case 'previous-output': {
        const count = global.display.get_n_monitors();
        window.move_to_monitor((window.get_monitor() + count + (command === 'next-output' ? 1 : -1)) % count); break;
      }
      case 'tile-left': window.tile(Meta.TileMode.LEFT); break;
      case 'tile-right': window.tile(Meta.TileMode.RIGHT); break;
      case 'switch-app': {
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        if (windows.length > 1) windows[(windows.indexOf(window) + 1) % windows.length].activate(time);
        break;
      }
      default: throw new Error('Unsupported desktop command.');
    }
  }
  disable() {
    this.object?.unexport(); this.object = null;
    if (this.owner) Gio.bus_unown_name(this.owner); this.owner = null; this.hidden = [];
  }
}
