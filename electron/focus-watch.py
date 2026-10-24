"""Session-local KWin focus receiver. Only KWin may publish application IDs."""
import json
import sys
import threading
import signal
import dbus
import dbus.service
import dbus.mainloop.glib
from gi.repository import GLib

dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
name = dbus.service.BusName(sys.argv[2], bus=bus, do_not_queue=True)
class Receiver(dbus.service.Object):
    @dbus.service.method('app.macromaxx.Focus', in_signature='ss', out_signature='', sender_keyword='sender')
    def Active(self, app_id, title, sender=None):
        if sender == bus.get_name_owner('org.kde.KWin'):
            print(json.dumps({'appId': str(app_id), 'title': str(title)}), flush=True)

receiver = Receiver(bus, '/Focus')
scripts = dbus.Interface(bus.get_object('org.kde.KWin', '/Scripting'), 'org.kde.kwin.Scripting')
plugin_name = 'macromaxx-focus-' + sys.argv[2].split('.')[-1]
scripts.unloadScript(plugin_name)
script_id = bus.call_blocking('org.kde.KWin', '/Scripting', 'org.kde.kwin.Scripting', 'loadScript', 'ss', (sys.argv[1], plugin_name))
script = dbus.Interface(bus.get_object('org.kde.KWin', '/Scripting/Script' + str(script_id)), 'org.kde.kwin.Script')
loop = GLib.MainLoop()
def stop(*args):
    GLib.idle_add(loop.quit)
signal.signal(signal.SIGTERM, stop)
def read():
    for _ in sys.stdin:
        pass
    stop()
threading.Thread(target=read, daemon=True).start()
try:
    script.run()
    print(json.dumps({'ready': True}), flush=True)
    loop.run()
finally:
    scripts.unloadScript(plugin_name)
