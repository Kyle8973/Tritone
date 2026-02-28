
  

<img src="https://github.com/Kyle8973/Tritone/blob/main/assets/images/banner-tritone.png?raw=true" >

  

<div align="center">
  A Sleek, High-Fidelity Subsonic Music Player Built With Electron. Features A Devilishly Smooth UI With Dynamic Theming, Real-Time Synchronized Lyrics Via LRCLIB, And Smart Playlist Art Generation. Includes Discord Rich Presence And A Robust Queue System For A Premium Listening Experience.
</div>
<br>

<p  align="center">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/images/icon.ico?raw=true"  width="200">

</p>

  

<div align="center">
  <img src="https://img.shields.io/badge/Electron-000000?style=for-the-badge&logo=electron&logoColor=9FEAF9">
</div>

  
## 📃Table Of Contents
- [Tech Stack](https://github.com/Kyle8973/Tritone/edit/main/readme.md#%EF%B8%8F-tech-stack)
- [Tritone Screenshots](https://github.com/Kyle8973/Tritone/edit/main/readme.md#%EF%B8%8Ftritone-screenshots)
- [Current Features](https://github.com/Kyle8973/Tritone/edit/main/readme.md#-current-features)
- [Installation & Setup](https://github.com/Kyle8973/Tritone/edit/main/readme.md#-installation--setup)
- [Roadmap](https://github.com/Kyle8973/Tritone/edit/main/readme.md#-roadmap)
- [License](https://github.com/Kyle8973/Tritone/edit/main/readme.md#-license)
- [Support](https://github.com/Kyle8973/Tritone/edit/main/readme.md#-support)
----------
## 🛠️ Tech Stack

### 🚀 Core Framework
* **[Electron](https://www.electronjs.org/)**: The Foundation Of The Desktop Application, Enabling Cross-Platform Functionality With Web Technologies.
* **[JavaScript (ES6+)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)**: Powers The Core Application Logic, Asynchronous Data Handling, And State Management.
* **[HTML5](https://developer.mozilla.org/en-US/docs/Web/HTML) & [CSS3](https://developer.mozilla.org/en-US/docs/Web/CSS)**: Used For Building The Custom, Responsive User Interface And Devilishly Smooth Animations.

### 📡 APIs & Backend
* **[OpenSubsonic / Subsonic API](https://www.subsonic.org/pages/api.jsp)**: The Primary Data Source For Music Streaming, Library Indexing, And Playlist Synchronization.
* **[LRCLIB](https://lrclib.net/)**: Provides Real-Time, Time-Synchronized Lyrics For Currently Playing Tracks.
* **[TheAudioDB](https://www.theaudiodb.com/)**: Sources High-Resolution Artist Imagery And Detailed Biographical Metadata.
* **[Wikipedia API](https://en.wikipedia.org/api/rest_v1/)**: Acts As A Secondary Source For Extended Artist History And Context.

### 📦 Key Libraries
* **[ColorThief](https://lokeshdhakar.com/projects/color-thief/)**: Dynamically Extracts Dominant Colors From Album Artwork To Theme The UI In Real-Time.
* **[Crypto-JS](https://github.com/brix/crypto-js)**: Handles Secure MD5 Token Generation And Salt-Based Authentication For Subsonic Server Handshakes.
* **[Electron Builder](https://www.electron.build/)**: Utilized For Packaging And Generating The Professional NSIS Windows Installer.

### 🎮 Integrations
* **Discord Rich Presence (RPC)**: Uses Custom IPC Communication To Display Live Listening Activity On Discord Profiles.
----------
## 🖼️Tritone Screenshots

<div  align="center">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/home.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/home-accent.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/album.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/album-accent.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/artist.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/lyrics.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/playlists.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/queue.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/search.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/settings.png?raw=true"  width="49.5%">

<img  src="https://github.com/Kyle8973/Tritone/blob/main/assets/screenshots/login.png?raw=true"  width="49.5%">

</div>

----------

## 🚀 Current Features

### 🎵 Core Audio & Playback
-  **High-Fidelity Streaming**: Direct Integration With Subsonic-Compatible Servers Using The `stream` Endpoint.

-  **Variable Bitrate Support**: Specify Maximum Bitrates (Up To 320 kbps) To Balance Audio Quality And Data Usage.

-  **Intelligent Queue Engine**:

-  **Play Next**: Injects Tracks Immediately After The Current Song.

-  **Add To Queue**: Appends Tracks To The End Of The Session.

-  **Live Reordering**: Full Drag-And-Drop Support Within The Queue View To Re-Sort Tracks.

-  **Playback Modes**: Supports Hardware Media Keys, Shuffle (With Original Order Memory), And Repeat Functionality.

-  **Server Scrobbling**: Automatically Reports Playback To Your Server Once A Track Passes The 50% Mark.

<br>

### 🔍 Discovery & Metadata
-  **Real-Time Lyrics**: Automatic Fetching And Time-Syncing Of Lyrics Via The **LRCLIB API**.
-  **Artist Deep-Dive**: Dedicated Views Featuring High-Res Imagery, Biographies From TheAudioDB / Wikipedia, And Top Tracks.
-  **Smart Global Search**: Search Your Entire Library For Artists, Albums, Songs, And Playlists By Pressing Enter.
-  **Dynamic Theming**: Real-Time UI Color Extraction From Album Art Using **ColorThief** To Theme The Background And Accents.

<br>

### 🛠 Tools & Integrations
-  **Discord Rich Presence (RPC)**: Displays Live Song Details, Duration Progress Bars, And Custom Action Buttons.
-  **Playlist Management**: Full Support For Creating, Deleting, And Managing Server-Side Playlists With Duplicate Protection.
-  **Smart Collage Art**: Playlists Dynamically Generate Smart Artwork Collages Based On The Tracks They Contain.
-  **Local History**: Tracks Your Last 50 Played Songs In A Dedicated "Recently Played" View.
----------
## 🛠 Installation & Setup

### For Users:

1. Download The Latest Installer From The [Releases](https://github.com/Kyle8973/Tritone/releases) Page

2. Run The Installer And Follow The Wizard

3. Enter Your Subsonic Server URL, Username, And Password To Connect
<br>
  
### For Developers:

```bash

# Clone The Repository

git  clone  https://github.com/Kyle8973/Tritone.git

  

# Install Dependencies

npm  install

  

# Run The App In Development Mode

npm  start

  

# Build The Windows Installer

npm  run  dist
```
----------
## 🗺 Roadmap

#### Stay Up-To Date With The Development Roadmap [Here](https://github.com/Kyle8973/Tritone/roadmap.md)
----------

## 📄 License
This Project Is Licensed Under The **MIT [License](https://github.com/Kyle8973/Tritone/blob/main/LICENSE):**

**Copyright (C) 2026 Kyle8973**

#### THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
----------

## 🤝 Support
Found A Bug Or Have A Suggestion? Open An Issue [Here](https://github.com/Kyle8973/Tritone)