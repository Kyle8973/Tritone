#!/bin/bash

# Fix permissions for the chrome-sandbox (required for some Linux distros)
chmod 4755 '/opt/Tritone/chrome-sandbox' || true

# Update the desktop database so Tritone appears in the menu immediately
update-desktop-database /usr/share/applications || true

# Update the icon cache
gtk-update-icon-cache /usr/share/icons/hicolor || true