# 🔐 Tritone Security Policy  
  
## 📦 Official Distribution  
  
Tritone is **only officially distributed** via this repository’s Releases page.  
  
Official builds follow this format:

`Tritone-x.x.x.exe`
`Tritone-x.x.x.AppImage`
`Tritone-x.x.x_amd64.deb`
`Tritone-x.x.x.x86_64.rpm`

  
No other filenames or distribution methods are endorsed.  
  
---  
  
## ⚠️ Important Note on Impersonation  
  
The use of the expected filename or format **does not guarantee authenticity**.  
  
It is possible for third parties to:  
- Rename executables to match the official naming convention   
- Repackage or redistribute modified versions of Tritone   
- Distribute altered binaries that appear legitimate   
  
> ❗ A file named `Tritone-x.x.x.exe` is **not automatically trusted** unless it is downloaded from the official repository and verified.  
  
---  
  
## 🔀 Forks and Third-Party Modifications  
  
Tritone is open-source software released under the MIT License.   
This allows others to fork, modify, and redistribute the project.  
  
Some forks may be:  
- Legitimate enhancements   
- Experimental features   
- Community-driven improvements   
  
However:  
  
> ❗ The original Tritone project is **not involved in, affiliated with, or responsible for any third-party forks or their distributed binaries**.  
  
This includes:  
- Modified versions of the application   
- Repackaged installers or executables   
- Any additional features or changes introduced outside this repository   
  
---  
  
## ⚠️ Trust and Verification  
  
While some forks may be genuine and well-intentioned:  
  
- Their code, build process, and binaries are **not reviewed or verified**  
- There is **no guarantee** they behave the same as official releases  
- It is not possible for the original author to confirm their safety  
  
> 🔍 All third-party builds should be treated as **untrusted by default**  
  
Only official releases from this repository can be verified.  
  
---  
  
## ✅ How to Verify a Release  
  
Before running Tritone, always verify the file.  
  
### 1. Verify the Source  
- Only download from the official GitHub Releases page  
- Do not trust downloads from forks, mirrors, or third-party websites  
  
---  
  
  
### 2. Verify the SHA256 Hash  
  
Each release includes a SHA256 hash.  
  
#### On Windows (PowerShell):

CertUtil -hashfile Tritone-x.x.x.exe SHA256

  
#### On Linux:

shasum -a 256 Tritone-x.x.x.AppImage

  
Compare the output with the hash published in the official release.  
  
- ✔ Match → File is authentic   
- ❌ Mismatch → File has been altered or is unsafe   
  
> ❗ If the hash does not match, and you are in doubt, then refrain from running the file.
  
---  
  
  
## 🚨 Reporting Security Issues  
  
If you encounter any of the following:  
  
- A suspicious fork or repository distributing Tritone binaries   
- A file claiming to be Tritone behaving unexpectedly   
- A mismatch between official hashes and a downloaded file   
- Potential vulnerabilities in the source code   
  
Please report it.  
  
### How to Report  
  
1. Open an issue in this repository   
2. Provide as much detail as possible:  
 - Link to the suspicious repository or file   
 - File name and hash (if available)   
 - Observed behaviour   
 - Screenshots or logs (if applicable)   
  
If the issue involves potentially malicious content, avoid executing the file outside of a controlled environment.  

**You can also report issues to [security@tritone.dev](mailto:security@tritone.dev)**
  
---  
  
## 🛡️ Security Best Practices  
  
Users are strongly encouraged to:  
  
- Only download from official sources   
- Verify SHA256 hashes before execution   
- Avoid running unknown executables from third parties   
- Use antivirus or endpoint protection tools   
- Analyse suspicious files in a sandbox or virtual machine   
  
---  
  
## 📌 Disclaimer  
  
Tritone is provided as open-source software under the MIT License.  
  
While the source code is publicly available, the project:  
  
- Does not control third-party forks or distributions   
- Cannot guarantee the safety of modified versions   
- Is not responsible for any damage caused by unofficial builds   
  
---  
  
## 🧠 Security Philosophy  
  
Tritone prioritises:  
  
- Transparency of source code   
- Verifiable release integrity   
- Clear and consistent distribution practices   
  
Security is a shared responsibility between the developer and the user.  
  
---  
  
## 🔚 Final Reminder  
  
If there is any doubt about a file:  
  
> **Do not run it. Verify it first.**