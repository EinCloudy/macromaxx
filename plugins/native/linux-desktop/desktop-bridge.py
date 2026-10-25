"""Bundled desktop plugin's bridge; does not enable GNOME Shell's arbitrary Eval API."""
import json
import sys
import dbus

bus = dbus.SessionBus()
interface = dbus.Interface(bus.get_object('app.macromaxx.Shell', '/app/macromaxx/Shell'), 'app.macromaxx.Shell')
if sys.argv[1] == 'active':
    print(interface.GetActive())
elif sys.argv[1] == 'action':
    interface.Do(sys.argv[2])
    print(json.dumps({'ok': True}))
