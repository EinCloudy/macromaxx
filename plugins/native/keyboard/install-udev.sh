#!/bin/sh
# Bundled keyboard plugin's Linux USB setup helper.
set -eu
install -m 0644 "$1" /etc/udev/rules.d/70-macromaxx-streamdeck.rules
udevadm control --reload-rules
udevadm trigger --subsystem-match=hidraw
