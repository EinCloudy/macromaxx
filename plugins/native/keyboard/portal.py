"""Bundled keyboard plugin: JSON-lines bridge to Linux's keyboard portal."""
import json
import sys
import threading
import uuid
import os
import configparser
import ctypes
import ctypes.util
import time
import dbus
import dbus.mainloop.glib
from gi.repository import GLib

dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
bus = dbus.SessionBus()
destination = 'org.freedesktop.portal.Desktop'
root = '/org/freedesktop/portal/desktop'
remote = dbus.Interface(bus.get_object(destination, root), 'org.freedesktop.portal.RemoteDesktop')
session = None
ready = False
keymap = None
xkb = None
eis = None

# KWin versions can acknowledge NotifyKeyboardKeysym without delivering an
# event. Resolve symbols against the configured layout and use evdev keycodes.
if ctypes.util.find_library('xkbcommon'):
    try:
        class Names(ctypes.Structure):
            _fields_ = [(name, ctypes.c_char_p) for name in ['rules', 'model', 'layout', 'variant', 'options']]
        config = configparser.ConfigParser()
        config.read(os.path.expanduser('~/.config/kxkbrc'))
        layout = config.get('Layout', 'LayoutList', fallback='us')
        variant = config.get('Layout', 'VariantList', fallback='')
        xkb = ctypes.CDLL(ctypes.util.find_library('xkbcommon'))
        xkb.xkb_context_new.argtypes = [ctypes.c_int]
        xkb.xkb_context_new.restype = ctypes.c_void_p
        xkb.xkb_keymap_new_from_names.argtypes = [ctypes.c_void_p, ctypes.POINTER(Names), ctypes.c_int]
        xkb.xkb_keymap_new_from_names.restype = ctypes.c_void_p
        xkb.xkb_keymap_min_keycode.argtypes = [ctypes.c_void_p]
        xkb.xkb_keymap_max_keycode.argtypes = [ctypes.c_void_p]
        xkb.xkb_keymap_num_levels_for_key.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint]
        xkb.xkb_keymap_key_get_syms_by_level.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.POINTER(ctypes.POINTER(ctypes.c_uint))]
        context = xkb.xkb_context_new(0)
        keymap = xkb.xkb_keymap_new_from_names(context, ctypes.byref(Names(None, None, layout.encode(), variant.encode(), None)), 0)
    except Exception:
        keymap = None

def keycode_for(symbol, group):
    if not keymap:
        return None
    fallback = None
    for code in range(xkb.xkb_keymap_min_keycode(keymap), xkb.xkb_keymap_max_keycode(keymap) + 1):
        for level in range(min(2, xkb.xkb_keymap_num_levels_for_key(keymap, code, group))):
            syms = ctypes.POINTER(ctypes.c_uint)()
            count = xkb.xkb_keymap_key_get_syms_by_level(keymap, code, group, level, ctypes.byref(syms))
            if symbol in [syms[i] for i in range(count)]:
                if level == 0:
                    return (code - 8, False)
                fallback = (code - 8, True)
    return fallback

pressed_symbols = set()
automatic_shift = set()

class EIS:
    """Small libei sender. The compositor provides the real keyboard map."""
    def __init__(self, fd, on_ready, on_error):
        self.lib = ctypes.CDLL(ctypes.util.find_library('ei'))
        self.device = None
        self.group = 0
        self.sequence = 0
        self.on_ready = on_ready
        self.on_error = on_error
        self.completed = False
        self.events = []
        self.disconnected = False
        signatures = {
            'ei_new_sender': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_configure_name': (None, [ctypes.c_void_p, ctypes.c_char_p]),
            'ei_setup_backend_fd': (ctypes.c_int, [ctypes.c_void_p, ctypes.c_int]),
            'ei_get_fd': (ctypes.c_int, [ctypes.c_void_p]),
            'ei_dispatch': (None, [ctypes.c_void_p]),
            'ei_get_event': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_event_get_type': (ctypes.c_int, [ctypes.c_void_p]),
            'ei_event_get_seat': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_event_get_device': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_device_has_capability': (ctypes.c_bool, [ctypes.c_void_p, ctypes.c_int]),
            'ei_device_ref': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_device_unref': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_event_unref': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_device_start_emulating': (None, [ctypes.c_void_p, ctypes.c_uint]),
            'ei_device_keyboard_key': (None, [ctypes.c_void_p, ctypes.c_uint, ctypes.c_bool]),
            'ei_device_frame': (None, [ctypes.c_void_p, ctypes.c_uint64]),
            'ei_device_keyboard_get_keymap': (ctypes.c_void_p, [ctypes.c_void_p]),
            'ei_keymap_get_fd': (ctypes.c_int, [ctypes.c_void_p]),
            'ei_keymap_get_size': (ctypes.c_size_t, [ctypes.c_void_p]),
            'ei_event_keyboard_get_xkb_group': (ctypes.c_uint, [ctypes.c_void_p]),
        }
        for name, (result, args) in signatures.items():
            function = getattr(self.lib, name)
            function.restype, function.argtypes = result, args
        self.lib.ei_seat_bind_capabilities.restype = None
        self.lib.ei_seat_bind_capabilities.argtypes = [ctypes.c_void_p]
        self.context = self.lib.ei_new_sender(None)
        self.lib.ei_configure_name(self.context, b'MacroMaxx')
        if self.lib.ei_setup_backend_fd(self.context, fd) < 0:
            raise RuntimeError('EIS connection failed.')
        self.watch = GLib.io_add_watch(self.lib.ei_get_fd(self.context), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, self.pump)
        self.pump()
        GLib.timeout_add_seconds(8, self.timeout)

    def timeout(self):
        if not self.completed:
            self.completed = True
            self.on_error('The desktop did not provide a virtual keyboard. EIS events: ' + str(self.events))
        return False

    def pump(self, *args):
        global keymap, ready
        self.lib.ei_dispatch(self.context)
        while True:
            event = self.lib.ei_get_event(self.context)
            if not event:
                break
            kind = self.lib.ei_event_get_type(event)
            self.events.append(kind)
            device = self.lib.ei_event_get_device(event)
            if kind == 3:  # EI_EVENT_SEAT_ADDED
                seat = self.lib.ei_event_get_seat(event)
                self.lib.ei_seat_bind_capabilities(seat, ctypes.c_uint(4), ctypes.c_void_p(None))
            elif kind == 8 and device and self.lib.ei_device_has_capability(device, 4):
                if self.device:
                    self.lib.ei_device_unref(self.device)
                self.device = self.lib.ei_device_ref(device)
                self.sequence += 1
                self.lib.ei_device_start_emulating(self.device, self.sequence)
                ei_map = self.lib.ei_device_keyboard_get_keymap(self.device)
                if ei_map and xkb:
                    data = os.pread(self.lib.ei_keymap_get_fd(ei_map), self.lib.ei_keymap_get_size(ei_map), 0)
                    xkb.xkb_keymap_new_from_string.restype = ctypes.c_void_p
                    xkb.xkb_keymap_new_from_string.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_int]
                    keymap = xkb.xkb_keymap_new_from_string(context, data, 1, 0)
                if not self.completed:
                    self.completed = True
                    self.on_ready()
            elif kind in (6, 7) and device == self.device:
                self.lib.ei_device_unref(self.device)
                self.device = None
            elif kind == 9:  # EI_EVENT_KEYBOARD_MODIFIERS
                self.group = self.lib.ei_event_keyboard_get_xkb_group(event)
            elif kind == 2:
                self.disconnected = True
                ready = False
                self.device = None
                emit({'event': 'closed'})
                if not self.completed:
                    self.completed = True
                    self.on_error('The desktop closed the EIS connection.')
            self.lib.ei_event_unref(event)
            self.lib.ei_dispatch(self.context)
        return not self.disconnected

    def send(self, code, state):
        if not self.device:
            raise RuntimeError('The virtual keyboard is paused. Set up keyboard permission again.')
        self.lib.ei_device_keyboard_key(self.device, code, bool(state))
        self.lib.ei_device_frame(self.device, time.monotonic_ns() // 1000)
        self.pump()

def emit(value):
    print(json.dumps(value), flush=True)

def request(method, args, options, callback, failure):
    token = 'mm' + uuid.uuid4().hex
    sender = bus.get_unique_name()[1:].replace('.', '_')
    handle = root + '/request/' + sender + '/' + token
    options['handle_token'] = dbus.String(token)
    def response(code, results):
        match.remove()
        if code == 0:
            callback(results)
        else:
            failure('Permission denied or dialog closed.')
    match = bus.add_signal_receiver(response, signal_name='Response', dbus_interface='org.freedesktop.portal.Request', path=handle)
    try:
        method(*args, options, timeout=120)
    except Exception as error:
        match.remove()
        failure(str(error))

def process(message):
    global session, ready, eis
    ident = message['id']
    def ok(result=None):
        emit({'id': ident, 'result': result})
    def fail(error):
        emit({'id': ident, 'error': str(error)})
    try:
        if message['command'] == 'setup':
            if session and ready:
                ok({'ready': True})
                return False
            def created(result):
                global session
                session = str(result['session_handle'])
                bus.add_signal_receiver(closed, signal_name='Closed', dbus_interface='org.freedesktop.portal.Session', path=session)
                def selected(_):
                    def started(result):
                        global ready, eis
                        if not int(result.get('devices', 0)) & 1:
                            fail('Keyboard permission was not granted.')
                        else:
                            def authorized():
                                global ready
                                ready = True
                                ok({'ready': True, 'restoreToken': str(result.get('restore_token', ''))})
                            try:
                                if ctypes.util.find_library('ei') and keymap:
                                    fd = remote.ConnectToEIS(dbus.ObjectPath(session), {}).take()
                                    eis = EIS(fd, authorized, fail)
                                elif 'KDE' in os.environ.get('XDG_CURRENT_DESKTOP', '').upper():
                                    fail('Install libei and libxkbcommon for KDE.')
                                else:
                                    authorized()
                            except Exception as error:
                                fail(str(error))
                    request(remote.Start, [dbus.ObjectPath(session), ''], {}, started, fail)
                options = {'types': dbus.UInt32(1)}
                properties = dbus.Interface(bus.get_object(destination, root), 'org.freedesktop.DBus.Properties')
                version = int(properties.Get('org.freedesktop.portal.RemoteDesktop', 'version'))
                if version >= 2 and message.get('persist', True):
                    options['persist_mode'] = dbus.UInt32(2)
                    if message.get('restoreToken'):
                        options['restore_token'] = dbus.String(message['restoreToken'])
                request(remote.SelectDevices, [dbus.ObjectPath(session)], options, selected, fail)
            request(remote.CreateSession, [], {'session_handle_token': dbus.String('mm' + uuid.uuid4().hex)}, created, fail)
        elif message['command'] == 'keys':
            if not session or not ready:
                raise RuntimeError('Allow Wayland keyboard input in Settings first.')
            group = 0
            if eis:
                group = eis.group
            elif keymap:
                try:
                    keyboard = dbus.Interface(bus.get_object('org.kde.keyboard', '/Layouts'), 'org.kde.KeyboardLayouts')
                    group = int(keyboard.getCurrentLayout())
                except Exception:
                    pass
            for key, state in message['events']:
                resolved = keycode_for(key, group)
                if resolved:
                    code, shift = resolved
                    if state and shift and not pressed_symbols.intersection({0xffe1, 0xffe2}):
                        send_code(42, 1)
                        automatic_shift.add(key)
                    send_code(code, state)
                    if not state and key in automatic_shift:
                        send_code(42, 0)
                        automatic_shift.discard(key)
                else:
                    if eis:
                        raise RuntimeError('Key is not available in the current keyboard layout: ' + str(key))
                    remote.NotifyKeyboardKeysym(dbus.ObjectPath(session), {}, dbus.Int32(key), dbus.UInt32(state))
                if state:
                    pressed_symbols.add(key)
                else:
                    pressed_symbols.discard(key)
            ok(True)
    except Exception as error:
        fail(error)
    return False

def send_code(code, state):
    if eis:
        eis.send(code, state)
    else:
        remote.NotifyKeyboardKeycode(dbus.ObjectPath(session), {}, dbus.Int32(code), dbus.UInt32(state))

def closed(*args):
    global session, ready
    session = None
    ready = False
    emit({'event': 'closed'})

def read():
    for line in sys.stdin:
        try:
            GLib.idle_add(process, json.loads(line))
        except Exception as error:
            emit({'error': str(error)})
    GLib.idle_add(loop.quit)

loop = GLib.MainLoop()
threading.Thread(target=read, daemon=True).start()
emit({'event': 'started'})
loop.run()
