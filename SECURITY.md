<p align="center">
  <img src="assets/images/archived-banner.svg" alt="This project has been archived" width="100%">
</p>

# 🔐 Tritone Security Policy

## 📦 Project Status: Archived

Tritone has been **archived** and is **no longer maintained**.

This means:

- ❌ No further releases, updates, or patches will be published
- ❌ No security fixes will be made, including for known or newly discovered vulnerabilities
- ❌ Security reports are no longer accepted or actioned
- ❌ Dependencies (including Electron) will not be updated and will become outdated over time

> ❗ Tritone is provided **as is**, with no security support of any kind. Use it at your own risk.

---

## ⚠️ Using Existing Releases

Previous releases remain available on this repository's Releases page for reference. They are **not supported**.

Because the app and its dependencies are no longer updated, vulnerabilities may already exist or may be found in the future, and none of them will be fixed.

If you choose to keep using Tritone:

- Only download from this repository's official Releases page
- Check the SHA256 hash against the one published with the release
- Be aware that a matching hash only shows the file is unaltered, not that it is free of vulnerabilities

#### On Windows (PowerShell):

```
CertUtil -hashfile Tritone-x.x.x.exe SHA256
```

#### On Linux:

```
shasum -a 256 Tritone-x.x.x.AppImage
```

---

## 🔀 Forks and Third-Party Builds

Tritone is open-source software released under the MIT License, so others may fork, modify, and redistribute it.

> ❗ The original Tritone project is **not involved in, affiliated with, or responsible for any forks or their distributed binaries**, including any that continue development after this archive.

All third-party builds should be treated as **untrusted by default**. Any security questions about a fork should go to that fork's maintainers.

---

## 📌 Disclaimer

Tritone is provided under the MIT License, **without warranty of any kind**. The project:

- Is no longer maintained or monitored
- Will not respond to security reports
- Is not responsible for any damage caused by official or unofficial builds

---

## 🔚 Final Reminder

> **Tritone is archived and receives no security updates. If you need a supported client, use an actively maintained alternative.**