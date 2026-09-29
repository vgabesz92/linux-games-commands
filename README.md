# Linux Games Commands - Flarum 2.x Extension

A **Linux Games Commands** egy dedikált Flarum bővítmény, amely kifejezetten Linuxos és Steam Deck játékos közösségek számára készült. Segítségével a fórumtagok könnyedén, vizuális felületen állíthatnak össze összetett Steam indítási parancsokat (Steam Launch Options), beleértve a **Gamescope**, **Proton**, **DXVK**, **Feral GameMode**, **MangoHud** és **Wine DLL felülbírálás (WINEDLLOVERRIDES)** konfigurációkat.

---

## 🌟 Főbb funkciók

### 1. ⚙️ Adminisztrációs beállítások
- **Kategória / Címke szűrés (`allowed_tags`):** Megadható vesszővel elválasztva, hogy mely fórumkategóriákban (pl. `general`, `guides`, `support`) legyen aktív a gomb. Üresen hagyva mindenhol elérhető.
- **Megjelenítési kapcsolók:** Külön-külön engedélyezhető vagy tiltható a megjelenés a téma oldalon és az üzenetszerkesztő (Composer) eszköztárban.

### 2. 🎮 Indítási Parancskészítő Modal (Launcher Suite)
- **Gyors Sablonok (Presets):**
  - 🚀 *Steam Deck FSR* (Belső és külső felbontás skálázása FSR-rel)
  - ⚡ *Max Teljesítmény* (`gamemoderun mangohud %command%`)
  - 🛠️ *Modding / ReShade* (`WINEDLLOVERRIDES="dxgi=n,b;dinput8=n,b" %command%`)
  - 🎮 *Nvidia RTX & DLSS* (`PROTON_ENABLE_NVAPI=1 PROTON_DLSS_UPGRADE=1 %command%`)
  - 🐞 *Hibakeresés* (`PROTON_LOG=1 DXVK_HUD=fps,devinfo,compiler %command%`)
- **Fülek és Részletes beállítások:**
  - **⚡ Gyors eszközök:** GameMode és MangoHud wrapperek, modulok gyorskapcsolói.
  - **📺 Gamescope:** Belső és kimeneti felbontás, FPS limitek, FSR/NIS skálázás, élesítés, Fullscreen/Borderless, HDR, Adaptive-Sync.
  - **⚙️ Proton & Grafika:** `PROTON_LOG`, DXVK HUD, FPS limit, NVAPI, DLSS upgrade, Wayland, Esync/Fsync, vkBasalt.
  - **🔗 DLL Felülbírálás:** Gyakori mod és grafikai DLL-ek (`dxgi`, `d3d11`, `dinput8`, `version`, `nvapi64` stb.) felülbírálási típusokkal (`n,b`, `b,n`, `n`, `b`, `d`) + egyedi DLL hozzáadása.
  - **🔀 Sorrend & Parancs:** A paraméterek helyes Linux sorrendbe fűzése, `%command%` testreszabása.

### 3. 📋 Egykattintásos másolás & Beillesztés
- Élő, syntax-színekkel formázott parancselőnézet terminál fejléc dobozban.
- **1-kattintásos másolás:** Zöld vizuális visszajelzéssel ("Másolva! ✓").
- **Beillesztés a hozzászólásba:** A szerkesztőben azonnal beilleszti az egyedi `[linux-command]...[/linux-command]` BBCode-ot.

### 4. 🖥️ Egyedi megjelenítés a hozzászólásokban
A fórumban közzétett `[linux-command]` blokkok sötét tónusú terminál kártyaként jelennek meg színes ablakvezérlő pöttyökkel, és a látogatók egyetlen kattintással kimásolhatják a parancsot közvetlenül a Steam indítási opciókba.

---

## 📁 Könyvtárszerkezet
```
linux-games-commands/
├── composer.json       # Bővítmény metaadatok (Flarum 2.x)
├── extend.php          # Frontend regisztráció, beállítások és BBCode Formatter
├── js/
│   └── dist/
│       ├── forum.js    # Fórum frontend (Modal, Toolbar és Sidebar gombok)
│       └── admin.js    # Admin felület beállítások
├── less/
│   ├── forum.less      # Modal és hozzászólás terminál doboz stíluslapja
│   └── admin.less      # Admin stíluslap
├── locale/
│   ├── hu.yml          # Magyar fordítás
│   └── en.yml          # Angol fordítás
└── mod/                # Eredeti referencia fájlok (Steam Launcher Suite)
```
