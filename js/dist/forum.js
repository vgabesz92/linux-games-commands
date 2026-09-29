(() => {
  'use strict';

  // Biztonságos modul-feloldó Flarum 2.x-hez (kezeli mind a default exportot, mind a közvetlen objektumot)
  const resolve = (ext, id) => {
    try {
      const mod = (window.flarum && window.flarum.reg && typeof window.flarum.reg.get === 'function')
        ? window.flarum.reg.get(ext, id)
        : null;
      if (!mod) return null;
      return (mod.__esModule && mod.default) ? mod.default : mod;
    } catch (e) {
      console.warn(`[linux-games-commands] Failed to resolve ${ext}:${id}`, e);
      return null;
    }
  };

  const app = window.app || resolve('core', 'forum/app');
  const extendModule = resolve('core', 'common/extend');
  const extend = extendModule ? extendModule.extend : null;

  const Modal = resolve('core', 'common/components/Modal');
  const Button = resolve('core', 'common/components/Button');
  const TextEditor = resolve('core', 'common/components/TextEditor');
  const DiscussionPage = resolve('core', 'forum/components/DiscussionPage');
  const DiscussionHero = resolve('core', 'forum/components/DiscussionHero');
  const IndexSidebar = resolve('core', 'forum/components/IndexSidebar');

  // Emojik levágása a címkék elejéről a dupla ikonok elkerülésére
  const stripEmoji = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str.replace(/^[\p{Emoji}\u200d\uFE0F\s]+/gu, '').trim();
  };

  const safeTrans = (k, def) => {
    const text = (app && app.translator) ? app.translator.trans(k) : def;
    return stripEmoji(text) || def;
  };

  // Felbontás gyorssablonok
  const RESOLUTION_PRESETS = [
    { label: 'Válassz felbontást...', value: '' },
    { label: '1280 × 720 (HD / 720p 16:9)', value: '1280x720' },
    { label: '1920 × 1080 (Full HD / 1080p 16:9)', value: '1920x1080' },
    { label: '2560 × 1440 (QHD / 2K 16:9)', value: '2560x1440' },
    { label: '3840 × 2160 (UHD / 4K 16:9)', value: '3840x2160' },
    { label: '1280 × 800 (Steam Deck natív 16:10)', value: '1280x800' },
    { label: '1440 × 900 (16:10)', value: '1440x900' },
    { label: '1680 × 1050 (16:10)', value: '1680x1050' },
    { label: '1920 × 1200 (16:10)', value: '1920x1200' },
    { label: '2560 × 1600 (16:10)', value: '2560x1600' },
    { label: '2560 × 1080 (Ultrawide 21:9)', value: '2560x1080' },
    { label: '3440 × 1440 (Ultrawide 21:9)', value: '3440x1440' },
    { label: '3840 × 1080 (Super Ultrawide 32:9)', value: '3840x1080' },
    { label: '5120 × 1440 (Super Ultrawide 32:9)', value: '5120x1440' },
    { label: '1024 × 768 (Régi 4:3)', value: '1024x768' },
    { label: '1280 × 1024 (Régi 5:4)', value: '1280x1024' }
  ];

  // Gyakori DLL-ek definíciója kategóriákkal és részletes leírásokkal
  const PREDEFINED_DLLS = [
    // DirectX & Grafika
    { name: 'dxgi', cat: 'DirectX / Grafika', badge: 'dx', desc: 'DirectX Graphics Infrastructure (ReShade, SpecialK és grafikai modokhoz elengedhetetlen)' },
    { name: 'd3d11', cat: 'DirectX / Grafika', badge: 'dx', desc: 'DirectX 11 kompatibilitási könyvtár (DXVK használatakor)' },
    { name: 'd3d12', cat: 'DirectX / Grafika', badge: 'dx', desc: 'DirectX 12 kompatibilitási könyvtár (VKD3D-Proton esetén)' },
    { name: 'd3d12core', cat: 'DirectX / Grafika', badge: 'dx', desc: 'Direct3D 12 Core könyvtár (Újabb DX12 játékok és mod-loaderek felülbírálásához)' },
    { name: 'd3d9', cat: 'DirectX / Grafika', badge: 'dx', desc: 'DirectX 9 kompatibilitás (D9VK vagy régebbi kiegészítők esetében)' },
    // Mod-Loaderek & Injektorok
    { name: 'dinput8', cat: 'Mod-Loaderek & Injektorok', badge: 'mod', desc: 'DirectInput 8 beviteli modul (ASI mod-loader injektorok: GTA, Skyrim, Souls játékok)' },
    { name: 'version', cat: 'Mod-Loaderek & Injektorok', badge: 'mod', desc: 'Fájlverzió lekérdező könyvtár (Népszerű mod-injektorok és ASI betöltők)' },
    { name: 'dsound', cat: 'Mod-Loaderek & Injektorok', badge: 'mod', desc: 'DirectSound hangkönyvtár (Régi hangmodokhoz és 3D audio kiegészítőkhöz)' },
    { name: 'winmm', cat: 'Mod-Loaderek & Injektorok', badge: 'mod', desc: 'Windows multimédiás API (Zene és média modokhoz régebbi játékokban)' },
    // VR & Hardver / Kiegészítők
    { name: 'openvr_api', cat: 'VR & Hardver', badge: 'vr', desc: 'OpenVR API könyvtár (VR modok, pl. UEVR betöltéséhez)' },
    { name: 'nvapi64', cat: 'VR & Hardver', badge: 'vr', desc: 'Nvidia 64-bites NVAPI (DLSS és sugárkövetés felülbírálásokhoz Nvidia kártyákon)' },
    { name: 'xinput1_3', cat: 'VR & Hardver', badge: 'vr', desc: 'Xbox kontroller API v1.3 (Egyedi gamepad emulátorokhoz)' }
  ];

  // Ellenőrizzük, hogy az adott témában/kategóriában engedélyezett-e a funkció
  function isAllowedForDiscussion(discussion) {
    if (!app || !app.forum) return true;
    const allowedSetting = (app.forum.attribute('linuxGamesAllowedTags') || '').trim();
    if (!allowedSetting) return true; // Ha üres, mindenhol megjelenik

    const allowed = allowedSetting.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length === 0) return true;

    if (!discussion) return true;

    try {
      const tags = (typeof discussion.tags === 'function') ? discussion.tags() : [];
      if (!tags || tags.length === 0) return true;

      return tags.some(tag => {
        const slug = (tag && typeof tag.slug === 'function' ? tag.slug() : '').toLowerCase();
        const id = String(tag && typeof tag.id === 'function' ? tag.id() : '');
        return allowed.includes(slug) || allowed.includes(id);
      });
    } catch (e) {
      return true;
    }
  }

  // =========================================================================
  // MODAL KOMPONENS
  // =========================================================================
  const BaseModal = Modal || class {};

  class LinuxGamesCommandsModal extends BaseModal {
    className() {
      return 'LinuxGamesCommandsModal Modal--large';
    }

    title() {
      const t = safeTrans('gabeszm-linux-games-commands.forum.modal_title', 'Steam & Linux Játék Indítási Parancskészítő');
      return [
        m('i.fas.fa-gamepad', { style: 'margin-right: 8px;' }),
        t
      ];
    }

    oninit(vnode) {
      if (typeof super.oninit === 'function') {
        super.oninit(vnode);
      }

      this.activeTab = 'quick'; // quick | gamescope | proton | dll | order
      this.copyStatus = '';
      this.activePreset = '';

      // Harmonikák (Accordion) nyitott/zárt állapota
      this.gsShowAdvanced = false;
      this.prShowAdvancedDxvk = false;
      this.prShowAdvancedSync = false;

      // Wrapperek
      this.useGamemode = false;
      this.useMangohud = false;

      // Gamescope modul
      this.enableGamescope = false;
      this.gsResPreset = '';
      this.gsGameW = '';
      this.gsGameH = '';
      this.gsOutPreset = '';
      this.gsOutW = '';
      this.gsOutH = '';
      this.gsFps = '';
      this.gsFpsUnfocused = '';
      this.gsScaling = 'fit';
      this.gsUpscaler = 'fsr';
      this.gsFsrSharpness = '2';
      this.gsDisplayIndex = '';
      this.gsFullscreen = true;
      this.gsBorderless = false;
      this.gsImmediateFlips = false;
      this.gsHdr = false;
      this.gsAdaptiveSync = true;
      this.gsMangoapp = false;
      this.gsExposeWayland = false;
      this.gsGrabCursor = false;
      this.gsGrabKeyboard = false;
      this.gsBackend = '';
      this.gsForceOrientation = '';
      this.gsExtraArgs = '';

      // Proton modul
      this.enableProton = false;
      this.prLog = false;
      this.prLogDir = '';
      this.prWinedebug = '';
      this.prDxvkHud = '';
      this.prDxvkFrameRate = '';
      this.prNvapi = false;
      this.prDlssUpgrade = false;
      this.prHideNvidiaGpu = false;
      this.prHdr = false;
      this.prWayland = false;
      this.prVkbasalt = false;
      this.prDumpDebugCommands = false;

      // Proton Haladó DXVK & VKD3D
      this.prVkd3dConfig = '';
      this.prVkd3dDebug = '';
      this.prVkd3dFeatureLevel = '';
      this.prDxvkConfigFile = '';
      this.prNoD3d10 = false;
      this.prNoD3d11 = false;
      this.prNoD3d12 = false;
      this.prDxvkNoStateCache = false;

      // Proton Haladó CPU Szinkr & Rendszer
      this.prMesaVkDeviceSelect = '';
      this.prNoEsync = false;
      this.prNoFsync = false;
      this.prUseNtsync = false;
      this.prForceLaa = false;
      this.prHeapDelayFree = false;
      this.prUseWined3d = false;
      this.prWineprefix = '';
      this.prExtraArgs = '';

      // DLL Felülbírálás modul
      this.enableDll = false;
      this.predefinedDlls = PREDEFINED_DLLS.map(d => ({
        name: d.name,
        cat: d.cat,
        badge: d.badge,
        desc: d.desc,
        checked: false,
        type: 'n,b'
      }));
      this.customDlls = [];
      this.customDllName = '';
      this.customDllType = 'n,b';

      // Parancs és futtatás
      this.gameCommand = '%command%';
    }

    // Sablon alkalmazása
    applyPreset(type) {
      this.clearAll();
      this.activePreset = type;

      if (type === 'steam_deck') {
        this.enableGamescope = true;
        this.gsResPreset = '1280x800';
        this.gsGameW = '1280';
        this.gsGameH = '800';
        this.gsOutPreset = '1920x1080';
        this.gsOutW = '1920';
        this.gsOutH = '1080';
        this.gsUpscaler = 'fsr';
        this.gsFsrSharpness = '2';
        this.gsFullscreen = true;
        this.gsAdaptiveSync = true;
        this.useGamemode = true;
        this.useMangohud = true;
        this.activeTab = 'gamescope';
      } else if (type === 'performance') {
        this.useGamemode = true;
        this.useMangohud = true;
        this.enableProton = true;
        this.prWinedebug = '-all';
        this.prForceLaa = true;
        this.activeTab = 'quick';
      } else if (type === 'modding') {
        this.enableDll = true;
        const dxgi = this.predefinedDlls.find(d => d.name === 'dxgi');
        if (dxgi) dxgi.checked = true;
        const dinput8 = this.predefinedDlls.find(d => d.name === 'dinput8');
        if (dinput8) dinput8.checked = true;
        const version = this.predefinedDlls.find(d => d.name === 'version');
        if (version) version.checked = true;
        this.activeTab = 'dll';
      } else if (type === 'nvidia') {
        this.enableProton = true;
        this.prNvapi = true;
        this.prDlssUpgrade = true;
        this.prVkd3dConfig = 'dxr11,dxr';
        this.activeTab = 'proton';
      } else if (type === 'debug') {
        this.enableProton = true;
        this.prLog = true;
        this.prDxvkHud = 'fps,devinfo,compiler';
        this.prWinedebug = '+timestamp,+pid,+tid';
        this.prDumpDebugCommands = true;
        this.activeTab = 'proton';
      }
      m.redraw();
    }

    // Minden visszaállítása alaphelyzetbe
    clearAll() {
      this.activePreset = '';
      this.useGamemode = false;
      this.useMangohud = false;

      this.enableGamescope = false;
      this.gsResPreset = '';
      this.gsGameW = '';
      this.gsGameH = '';
      this.gsOutPreset = '';
      this.gsOutW = '';
      this.gsOutH = '';
      this.gsFps = '';
      this.gsFpsUnfocused = '';
      this.gsScaling = 'fit';
      this.gsUpscaler = 'fsr';
      this.gsFsrSharpness = '2';
      this.gsDisplayIndex = '';
      this.gsFullscreen = true;
      this.gsBorderless = false;
      this.gsImmediateFlips = false;
      this.gsHdr = false;
      this.gsAdaptiveSync = true;
      this.gsMangoapp = false;
      this.gsExposeWayland = false;
      this.gsGrabCursor = false;
      this.gsGrabKeyboard = false;
      this.gsBackend = '';
      this.gsForceOrientation = '';
      this.gsExtraArgs = '';

      this.enableProton = false;
      this.prLog = false;
      this.prLogDir = '';
      this.prWinedebug = '';
      this.prDxvkHud = '';
      this.prDxvkFrameRate = '';
      this.prNvapi = false;
      this.prDlssUpgrade = false;
      this.prHideNvidiaGpu = false;
      this.prHdr = false;
      this.prWayland = false;
      this.prVkbasalt = false;
      this.prDumpDebugCommands = false;

      this.prVkd3dConfig = '';
      this.prVkd3dDebug = '';
      this.prVkd3dFeatureLevel = '';
      this.prDxvkConfigFile = '';
      this.prNoD3d10 = false;
      this.prNoD3d11 = false;
      this.prNoD3d12 = false;
      this.prDxvkNoStateCache = false;

      this.prMesaVkDeviceSelect = '';
      this.prNoEsync = false;
      this.prNoFsync = false;
      this.prUseNtsync = false;
      this.prForceLaa = false;
      this.prHeapDelayFree = false;
      this.prUseWined3d = false;
      this.prWineprefix = '';
      this.prExtraArgs = '';

      this.enableDll = false;
      this.predefinedDlls.forEach(d => { d.checked = false; d.type = 'n,b'; });
      this.customDlls = [];
      this.customDllName = '';
      this.gameCommand = '%command%';
      this.copyStatus = '';
      m.redraw();
    }

    // Render felbontás preset kiválasztásakor automatikus szélesség és magasság kitöltés
    onRenderPresetChange(val) {
      this.gsResPreset = val;
      if (val && val.includes('x')) {
        const [w, h] = val.split('x');
        this.gsGameW = w;
        this.gsGameH = h;
      }
    }

    // Kimeneti felbontás preset kiválasztásakor automatikus szélesség és magasság kitöltés
    onOutputPresetChange(val) {
      this.gsOutPreset = val;
      if (val && val.includes('x')) {
        const [w, h] = val.split('x');
        this.gsOutW = w;
        this.gsOutH = h;
      }
    }

    // Egyedi DLL hozzáadása
    addCustomDll() {
      let name = (this.customDllName || '').trim().toLowerCase();
      if (name.endsWith('.dll')) name = name.slice(0, -4);
      if (!name) return;

      const existsPre = this.predefinedDlls.find(d => d.name === name);
      const existsCust = this.customDlls.find(d => d.name === name);

      if (existsPre) {
        existsPre.checked = true;
        existsPre.type = this.customDllType;
      } else if (!existsCust) {
        this.customDlls.push({
          name: name,
          type: this.customDllType,
          checked: true
        });
      }

      this.customDllName = '';
      m.redraw();
    }

    // Parancs összeállítása a logikus sorrendben
    buildCommand() {
      const parts = [];

      // 1. Wrapperek
      if (this.useGamemode) parts.push('gamemoderun');
      if (this.useMangohud) parts.push('mangohud');

      // 2. Gamescope kompozitor
      if (this.enableGamescope) {
        const gsArgs = [];
        if (this.gsGameW) gsArgs.push('-w', this.gsGameW);
        if (this.gsGameH) gsArgs.push('-h', this.gsGameH);
        if (this.gsOutW) gsArgs.push('-W', this.gsOutW);
        if (this.gsOutH) gsArgs.push('-H', this.gsOutH);
        if (this.gsFps) gsArgs.push('-r', this.gsFps);
        if (this.gsFpsUnfocused) gsArgs.push('-o', this.gsFpsUnfocused);
        if (this.gsFullscreen) gsArgs.push('-f');
        if (this.gsBorderless) gsArgs.push('-b');
        if (this.gsImmediateFlips) gsArgs.push('--immediate-flips');
        if (this.gsScaling) gsArgs.push('-S', this.gsScaling);
        if (this.gsUpscaler) gsArgs.push('-F', this.gsUpscaler);
        if (this.gsUpscaler === 'fsr' && this.gsFsrSharpness !== '' && this.gsFsrSharpness !== '2') {
          gsArgs.push('--fsr-sharpness', this.gsFsrSharpness);
        }
        if (this.gsDisplayIndex !== '' && this.gsDisplayIndex !== null && this.gsDisplayIndex !== '-1') {
          gsArgs.push('--display-index', this.gsDisplayIndex);
        }
        if (this.gsAdaptiveSync) gsArgs.push('--adaptive-sync');
        if (this.gsHdr) gsArgs.push('--hdr-enabled');
        if (this.gsMangoapp) gsArgs.push('--mangoapp');
        if (this.gsExposeWayland) gsArgs.push('--expose-wayland');
        if (this.gsGrabCursor) gsArgs.push('--force-grab-cursor');
        if (this.gsGrabKeyboard) gsArgs.push('--grab');
        if (this.gsBackend) gsArgs.push('--backend', this.gsBackend);
        if (this.gsForceOrientation) gsArgs.push('--force-orientation', this.gsForceOrientation);
        if (this.gsExtraArgs && this.gsExtraArgs.trim()) {
          gsArgs.push(this.gsExtraArgs.trim());
        }

        parts.push('gamescope ' + gsArgs.join(' ') + ' --');
      }

      // 3. Környezeti változók (DLL overrides + Proton)
      const envVars = [];

      // WINEDLLOVERRIDES
      if (this.enableDll) {
        const overrides = [];
        this.predefinedDlls.forEach(dll => {
          if (dll.checked) overrides.push(`${dll.name}=${dll.type}`);
        });
        this.customDlls.forEach(dll => {
          if (dll.checked) overrides.push(`${dll.name}=${dll.type}`);
        });
        if (overrides.length > 0) {
          envVars.push(`WINEDLLOVERRIDES="${overrides.join(';')}"`);
        }
      }

      // PROTON & Grafikai változók
      if (this.enableProton) {
        // Alap & Naplózás
        if (this.prLog) envVars.push('PROTON_LOG=1');
        if (this.prLogDir && this.prLogDir.trim()) envVars.push(`PROTON_LOG_DIR="${this.prLogDir.trim()}"`);
        if (this.prWinedebug) envVars.push(`WINEDEBUG="${this.prWinedebug}"`);
        if (this.prDxvkHud && this.prDxvkHud.trim()) envVars.push(`DXVK_HUD="${this.prDxvkHud.trim()}"`);
        if (this.prDxvkFrameRate) envVars.push(`DXVK_FRAME_RATE=${this.prDxvkFrameRate}`);

        // DXVK & VKD3D Haladó
        if (this.prVkd3dConfig && this.prVkd3dConfig.trim()) envVars.push(`VKD3D_CONFIG="${this.prVkd3dConfig.trim()}"`);
        if (this.prVkd3dDebug) envVars.push(`VKD3D_DEBUG=${this.prVkd3dDebug}`);
        if (this.prVkd3dFeatureLevel) envVars.push(`VKD3D_FEATURE_LEVEL=${this.prVkd3dFeatureLevel}`);
        if (this.prDxvkConfigFile && this.prDxvkConfigFile.trim()) envVars.push(`DXVK_CONFIG_FILE="${this.prDxvkConfigFile.trim()}"`);
        if (this.prNoD3d10) envVars.push('PROTON_NO_D3D10=1');
        if (this.prNoD3d11) envVars.push('PROTON_NO_D3D11=1');
        if (this.prNoD3d12) envVars.push('PROTON_NO_D3D12=1');
        if (this.prDxvkNoStateCache) envVars.push('DXVK_STATE_CACHE=0');

        // Rendszer & Szinkronizáció
        if (this.prMesaVkDeviceSelect && this.prMesaVkDeviceSelect.trim()) envVars.push(`MESA_VK_DEVICE_SELECT="${this.prMesaVkDeviceSelect.trim()}"`);
        if (this.prNoEsync) envVars.push('PROTON_NO_ESYNC=1');
        if (this.prNoFsync) envVars.push('PROTON_NO_FSYNC=1');
        if (this.prUseNtsync) envVars.push('PROTON_USE_NTSYNC=1');
        if (this.prForceLaa) envVars.push('PROTON_FORCE_LARGE_ADDRESS_AWARE=1');
        if (this.prHeapDelayFree) envVars.push('WINE_HEAP_DELAY_FREE=1');
        if (this.prUseWined3d) envVars.push('PROTON_USE_WINED3D=1');
        if (this.prWineprefix && this.prWineprefix.trim()) envVars.push(`WINEPREFIX="${this.prWineprefix.trim()}"`);

        // GPU & Integrációk
        if (this.prNvapi) envVars.push('PROTON_ENABLE_NVAPI=1');
        if (this.prDlssUpgrade) envVars.push('PROTON_DLSS_UPGRADE=1');
        if (this.prHideNvidiaGpu) envVars.push('PROTON_HIDE_NVIDIA_GPU=1');
        if (this.prHdr) envVars.push('PROTON_ENABLE_HDR=1');
        if (this.prWayland) envVars.push('PROTON_ENABLE_WAYLAND=1');
        if (this.prVkbasalt) envVars.push('ENABLE_VKBASALT=1');
        if (this.prDumpDebugCommands) envVars.push('PROTON_DUMP_DEBUG_COMMANDS=1');

        if (this.prExtraArgs && this.prExtraArgs.trim()) envVars.push(this.prExtraArgs.trim());
      }

      if (envVars.length > 0) {
        parts.push(envVars.join(' '));
      }

      // 4. Játék indítási parancs
      parts.push(this.gameCommand.trim() || '%command%');

      return parts.join(' ').trim();
    }

    // Beillesztés a hozzászólásba
    insertToPost() {
      const cmd = this.buildCommand();
      const bbcode = `[linux-command]${cmd}[/linux-command]`;
      let inserted = false;

      // 1. Ha a szerkesztőből közvetlenül hívták meg
      if (this.attrs.editor) {
        if (typeof this.attrs.editor.insertAtCursor === 'function') {
          this.attrs.editor.insertAtCursor(bbcode);
          inserted = true;
        } else if (this.attrs.editor.attrs && this.attrs.editor.attrs.composer && this.attrs.editor.attrs.composer.editor) {
          this.attrs.editor.attrs.composer.editor.insertAtCursor(bbcode);
          inserted = true;
        }
      }

      // 2. Ha a globális composer nyitva van
      if (!inserted && app && app.composer) {
        if (app.composer.editor && typeof app.composer.editor.insertAtCursor === 'function') {
          app.composer.editor.insertAtCursor(bbcode);
          inserted = true;
        } else if (app.composer.fields && typeof app.composer.fields.content === 'function') {
          const current = app.composer.fields.content() || '';
          app.composer.fields.content(current ? current + '\n\n' + bbcode : bbcode);
          inserted = true;
        }
      }

      // 3. Ha a composer még nincs megnyitva, de van téma kontextus
      if (!inserted && app && app.composer) {
        const discussion = this.attrs.discussion || (app.current ? app.current.get('discussion') : null);
        const DiscussionControls = resolve('core', 'forum/utils/DiscussionControls');
        if (discussion && DiscussionControls && typeof DiscussionControls.replyAction === 'function') {
          DiscussionControls.replyAction.call(discussion).then(() => {
            setTimeout(() => {
              if (app.composer && app.composer.editor && typeof app.composer.editor.insertAtCursor === 'function') {
                app.composer.editor.insertAtCursor(bbcode);
              }
            }, 300);
          }).catch(() => {});
          inserted = true;
        }
      }

      // Másolás vágólapra is a kényelem kedvéért
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(bbcode).catch(() => {});
      }

      if (app && app.alerts && inserted) {
        const alertMsg = safeTrans('gabeszm-linux-games-commands.forum.inserted_alert', 'Parancs sikeresen beillesztve a bejegyzésbe!');
        app.alerts.show({ type: 'success' }, alertMsg);
      }

      if (app && app.modal) {
        app.modal.close();
      }
    }

    // Fülváltó renderelés panelben
    renderTabs() {
      const tabs = [
        { id: 'quick', icon: 'fa-bolt', label: safeTrans('gabeszm-linux-games-commands.forum.tabs.quick', 'Gyors eszközök') },
        { id: 'gamescope', icon: 'fa-desktop', label: safeTrans('gabeszm-linux-games-commands.forum.tabs.gamescope', 'Gamescope') },
        { id: 'proton', icon: 'fa-gear', label: safeTrans('gabeszm-linux-games-commands.forum.tabs.proton', 'Proton & Grafika') },
        { id: 'dll', icon: 'fa-cubes', label: safeTrans('gabeszm-linux-games-commands.forum.tabs.dll', 'DLL Felülbírálás') },
        { id: 'order', icon: 'fa-arrow-down-short-wide', label: safeTrans('gabeszm-linux-games-commands.forum.tabs.order', 'Sorrend & Parancs') }
      ];

      return m('.lgc-panel.lgc-tabs-panel', [
        m('.lgc-tabs-nav', tabs.map(tab => {
          const isActive = this.activeTab === tab.id;
          return m('button.lgc-tab-btn', {
            type: 'button',
            className: isActive ? 'active' : '',
            onclick: () => { this.activeTab = tab.id; }
          }, [
            m(`i.fas.${tab.icon}`, { style: 'margin-right: 6px;' }),
            tab.label
          ]);
        }))
      ]);
    }

    // Gyors sablon gombok panelben
    renderPresetsBar() {
      return m('.lgc-panel.lgc-presets-panel', [
        m('.lgc-presets-header', [
          m('i.fas.fa-wand-magic-sparkles.presets-header-icon'),
          m('span.lgc-presets-title', safeTrans('gabeszm-linux-games-commands.forum.presets.title', 'Gyors Sablonok:'))
        ]),
        m('.lgc-presets-list', [
          m('button.lgc-preset-pill', {
            type: 'button',
            className: this.activePreset === 'steam_deck' ? 'active' : '',
            onclick: () => this.applyPreset('steam_deck')
          }, [
            m('i.fas.fa-gamepad', { style: 'margin-right: 5px;' }),
            safeTrans('gabeszm-linux-games-commands.forum.presets.steam_deck', 'Steam Deck FSR')
          ]),
          m('button.lgc-preset-pill', {
            type: 'button',
            className: this.activePreset === 'performance' ? 'active' : '',
            onclick: () => this.applyPreset('performance')
          }, [
            m('i.fas.fa-gauge-high', { style: 'margin-right: 5px;' }),
            safeTrans('gabeszm-linux-games-commands.forum.presets.performance', 'Max Teljesítmény')
          ]),
          m('button.lgc-preset-pill', {
            type: 'button',
            className: this.activePreset === 'modding' ? 'active' : '',
            onclick: () => this.applyPreset('modding')
          }, [
            m('i.fas.fa-wrench', { style: 'margin-right: 5px;' }),
            safeTrans('gabeszm-linux-games-commands.forum.presets.modding', 'Modding / ReShade')
          ]),
          m('button.lgc-preset-pill', {
            type: 'button',
            className: this.activePreset === 'nvidia' ? 'active' : '',
            onclick: () => this.applyPreset('nvidia')
          }, [
            m('i.fas.fa-microchip', { style: 'margin-right: 5px;' }),
            safeTrans('gabeszm-linux-games-commands.forum.presets.nvidia', 'Nvidia RTX & DLSS')
          ]),
          m('button.lgc-preset-pill', {
            type: 'button',
            className: this.activePreset === 'debug' ? 'active' : '',
            onclick: () => this.applyPreset('debug')
          }, [
            m('i.fas.fa-bug', { style: 'margin-right: 5px;' }),
            safeTrans('gabeszm-linux-games-commands.forum.presets.debug', 'Hibakeresés (Log)')
          ])
        ])
      ]);
    }

    // Kimeneti parancsdoboz renderelése (szigorúan 2 gombbal: beillesztés és törlés)
    renderOutputBox() {
      const cmd = this.buildCommand();

      return m('.lgc-output-container', [
        m('.lgc-output-header', [
          m('.lgc-output-title-group', [
            m('.terminal-dots', [m('span'), m('span'), m('span')]),
            m('.lgc-output-label', safeTrans('gabeszm-linux-games-commands.forum.output_label', 'GENERÁLT STEAM INDÍTÁSI PARANCS:'))
          ]),
          m('.lgc-output-badge', [
            m('i.fas.fa-terminal', { style: 'margin-right: 4px;' }),
            'BASH / STEAM'
          ])
        ]),
        m('pre.lgc-output-code', cmd),
        m('.lgc-actions-bar', [
          m('.lgc-actions-left', [
            m('button.btn-insert', {
              type: 'button',
              onclick: () => this.insertToPost()
            }, [
              m('i.fas.fa-pen-to-square'),
              ' ' + safeTrans('gabeszm-linux-games-commands.forum.insert_to_post', 'Beillesztés a hozzászólásba')
            ])
          ]),
          m('button.btn-clear', {
            type: 'button',
            onclick: () => this.clearAll()
          }, [
            m('i.fas.fa-trash-alt', { style: 'margin-right: 6px;' }),
            safeTrans('gabeszm-linux-games-commands.forum.clear', 'Minden törlése')
          ])
        ])
      ]);
    }

    // Fül tartalom generálás
    content() {
      return m('.Modal-body', [
        this.renderPresetsBar(),
        this.renderTabs(),
        m('.lgc-tab-content', [
          this.activeTab === 'quick' ? this.tabQuick() : null,
          this.activeTab === 'gamescope' ? this.tabGamescope() : null,
          this.activeTab === 'proton' ? this.tabProton() : null,
          this.activeTab === 'dll' ? this.tabDll() : null,
          this.activeTab === 'order' ? this.tabOrder() : null
        ]),
        this.renderOutputBox()
      ]);
    }

    // 1. Gyors eszközök fül
    tabQuick() {
      return m('div', [
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-bolt.header-icon.amber'),
            m('span.header-title', 'Rendszer Wrapperek és Főkapcsolók'),
            m('span.lgc-badge.badge-amber', 'Optimalizálás')
          ]),
          m('.lgc-card-body', [
            m('label.lgc-toggle-card', { className: this.useGamemode ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.useGamemode,
                onchange: e => { this.useGamemode = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'gamemoderun (Feral GameMode)'),
                m('span.desc', 'Optimalizálja a CPU frekvenciát, I/O prioritást és a GPU állapotot a játék futása alatt.')
              ])
            ]),
            m('label.lgc-toggle-card', { className: this.useMangohud ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.useMangohud,
                onchange: e => { this.useMangohud = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'mangohud (Teljesítmény kijelző OSD réteg)'),
                m('span.desc', 'Megjeleníti az FPS-t, CPU/GPU terhelést, hőmérsékletet és képkockaidőt a játék képernyőjén.')
              ])
            ])
          ])
        ]),

        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-sliders.header-icon.blue'),
            m('span.header-title', 'Fő Alrendszerek Bekapcsolása'),
            m('span.lgc-badge.badge-blue', 'Modulok')
          ]),
          m('.lgc-card-body', [
            m('label.lgc-toggle-card', { className: this.enableGamescope ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.enableGamescope,
                onchange: e => { this.enableGamescope = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'Gamescope Kompozitor bekapcsolása'),
                m('span.desc', 'Felbontás skálázás (FSR/NIS), adaptív szinkron, ablakkezelés és mikrowindow-manager használata.')
              ])
            ]),
            m('label.lgc-toggle-card', { className: this.enableProton ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.enableProton,
                onchange: e => { this.enableProton = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'Proton & Grafikai változók bekapcsolása'),
                m('span.desc', 'DXVK beállítások, Proton naplózás, NVAPI/DLSS és CPU szinkronizációs flag-ek érvényesítése.')
              ])
            ]),
            m('label.lgc-toggle-card', { className: this.enableDll ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.enableDll,
                onchange: e => { this.enableDll = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'Wine DLL felülbírálások bekapcsolása (WINEDLLOVERRIDES)'),
                m('span.desc', 'Egyedi könyvtárak, ReShade (dxgi) vagy mod-loaderek (dinput8, version) betöltéséhez.')
              ])
            ])
          ])
        ])
      ]);
    }

    // 2. Gamescope fül
    tabGamescope() {
      return m('div', [
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-power-off.header-icon.blue'),
            m('span.header-title', 'Gamescope Modul Állapot'),
            m('span.lgc-badge.badge-blue', this.enableGamescope ? 'Aktív' : 'Inaktív')
          ]),
          m('.lgc-card-body', [
            m('label.lgc-toggle-card', { className: this.enableGamescope ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.enableGamescope,
                onchange: e => { this.enableGamescope = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'Gamescope beillesztése az indítási parancsba'),
                m('span.desc', 'Ha be van jelölve, a futtatás a gamescope argumentumaival és a -- határolóval indul.')
              ])
            ])
          ])
        ]),

        // Felbontások kártya
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-desktop.header-icon.cyan'),
            m('span.header-title', 'Felbontások és Képfrissítés'),
            m('span.lgc-badge.badge-cyan', 'Kijelző')
          ]),
          m('.lgc-card-body', [
            m('.lgc-grid-2', [
              m('.lgc-field', [
                m('label', [
                  m('i.fas.fa-gamepad', { style: 'margin-right: 5px; color: #58a6ff;' }),
                  'Belső Render Felbontás (-w × -h):'
                ]),
                m('select', {
                  value: this.gsResPreset,
                  onchange: e => this.onRenderPresetChange(e.target.value)
                }, RESOLUTION_PRESETS.map(p => m('option', { value: p.value }, p.label))),
                m('.lgc-grid-nested-2', { style: 'margin-top: 6px;' }, [
                  m('input[type=number]', {
                    placeholder: 'Szélesség (-w pl. 1280)',
                    value: this.gsGameW,
                    oninput: e => { this.gsGameW = e.target.value; }
                  }),
                  m('input[type=number]', {
                    placeholder: 'Magasság (-h pl. 720)',
                    value: this.gsGameH,
                    oninput: e => { this.gsGameH = e.target.value; }
                  })
                ])
              ]),

              m('.lgc-field', [
                m('label', [
                  m('i.fas.fa-tv', { style: 'margin-right: 5px; color: #39c5bb;' }),
                  'Kimeneti Monitor Felbontás (-W × -H):'
                ]),
                m('select', {
                  value: this.gsOutPreset,
                  onchange: e => this.onOutputPresetChange(e.target.value)
                }, RESOLUTION_PRESETS.map(p => m('option', { value: p.value }, p.label))),
                m('.lgc-grid-nested-2', { style: 'margin-top: 6px;' }, [
                  m('input[type=number]', {
                    placeholder: 'Kijelző szél. (-W pl. 1920)',
                    value: this.gsOutW,
                    oninput: e => { this.gsOutW = e.target.value; }
                  }),
                  m('input[type=number]', {
                    placeholder: 'Kijelző mag. (-H pl. 1080)',
                    value: this.gsOutH,
                    oninput: e => { this.gsOutH = e.target.value; }
                  })
                ])
              ])
            ]),

            m('.lgc-grid-2', { style: 'margin-top: 12px;' }, [
              m('.lgc-field', [
                m('label', 'Játékbeli FPS korlát (-r):'),
                m('input[type=number]', {
                  placeholder: 'pl. 60, 120 vagy 144 (üres = korlátlan)',
                  value: this.gsFps,
                  oninput: e => { this.gsFps = e.target.value; }
                })
              ]),
              m('.lgc-field', [
                m('label', 'Háttérbeli FPS korlát (-o):'),
                m('input[type=number]', {
                  placeholder: 'pl. 30 (Alt+Tab esetén energiatakarékos)',
                  value: this.gsFpsUnfocused,
                  oninput: e => { this.gsFpsUnfocused = e.target.value; }
                })
              ])
            ])
          ])
        ]),

        // Skálázás és Módok kártya
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-wand-magic.header-icon.purple'),
            m('span.header-title', 'Felskálázás és Megjelenítés'),
            m('span.lgc-badge.badge-purple', 'FSR & NIS')
          ]),
          m('.lgc-card-body', [
            m('.lgc-grid-3', [
              m('.lgc-field', [
                m('label', 'Felskálázó Motor (-F):'),
                m('select', {
                  value: this.gsUpscaler,
                  onchange: e => { this.gsUpscaler = e.target.value; }
                }, [
                  m('option[value=fsr]', 'AMD FSR (FidelityFX)'),
                  m('option[value=nis]', 'NVIDIA Image Scaling (NIS)'),
                  m('option[value=linear]', 'Bilineáris (Linear)'),
                  m('option[value=nearest]', 'Legközelebbi szomszéd (Pixel)'),
                  m('option[value=integer]', 'Egész szorzós (Integer)')
                ])
              ]),
              m('.lgc-field', [
                m('label', 'Képarány Illesztés (-S):'),
                m('select', {
                  value: this.gsScaling,
                  onchange: e => { this.gsScaling = e.target.value; }
                }, [
                  m('option[value=fit]', 'Fit (Aránytartó méretezés)'),
                  m('option[value=fill]', 'Fill (Kitöltés levágással)'),
                  m('option[value=stretch]', 'Stretch (Nyújtás)'),
                  m('option[value=integer]', 'Integer (Pixelpontos)')
                ])
              ]),
              m('.lgc-field', [
                m('label', 'FSR Élesség (--fsr-sharpness, 0-20):'),
                m('input[type=number][min=0][max=20]', {
                  value: this.gsFsrSharpness,
                  oninput: e => { this.gsFsrSharpness = e.target.value; }
                })
              ])
            ]),

            m('.lgc-grid-2', { style: 'margin-top: 12px;' }, [
              m('label.lgc-toggle-card', { className: this.gsFullscreen ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsFullscreen,
                  onchange: e => { this.gsFullscreen = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'Teljes képernyő (-f)'),
                  m('span.desc', 'A Gamescope ablak kitölti a teljes képernyőt.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.gsBorderless ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsBorderless,
                  onchange: e => { this.gsBorderless = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'Keret nélküli ablak (-b)'),
                  m('span.desc', 'Ablakos megjelenítés ablakkeret nélkül.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.gsAdaptiveSync ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsAdaptiveSync,
                  onchange: e => { this.gsAdaptiveSync = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'Adaptív szinkron (--adaptive-sync)'),
                  m('span.desc', 'VRR / FreeSync / G-Sync hardveres támogatás.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.gsHdr ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsHdr,
                  onchange: e => { this.gsHdr = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'HDR támogatás (--hdr-enabled)'),
                  m('span.desc', 'Nagy dinamikatartomány átadása a támogatott kijelzőre.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.gsMangoapp ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsMangoapp,
                  onchange: e => { this.gsMangoapp = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'MangoApp statisztikai réteg (--mangoapp)'),
                  m('span.desc', 'MangoHud beágyazása közvetlenül a Gamescope felületébe.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.gsImmediateFlips ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsImmediateFlips,
                  onchange: e => { this.gsImmediateFlips = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'Azonnali képkocka-váltás (--immediate-flips)'),
                  m('span.desc', 'V-Sync kikapcsolása a legalacsonyabb beviteli késleltetésért.')
                ])
              ])
            ])
          ])
        ]),

        // Harmonika: Haladó Gamescope Funkciók
        m('.lgc-card.lgc-accordion-card', [
          m('button.lgc-accordion-btn', {
            type: 'button',
            onclick: () => { this.gsShowAdvanced = !this.gsShowAdvanced; }
          }, [
            m('.lgc-accordion-title-group', [
              m('i.fas.fa-sliders.header-icon.cyan'),
              m('span.header-title', 'Haladó Gamescope Funkciók & Eszközök'),
              m('span.lgc-badge.badge-gray', 'Opcionális')
            ]),
            m(`i.fas.fa-chevron-down.accordion-chevron${this.gsShowAdvanced ? '.open' : ''}`)
          ]),
          this.gsShowAdvanced ? m('.lgc-card-body.accordion-body', [
            m('.lgc-grid-2', [
              m('.lgc-field', [
                m('label', 'Célkijelző indexe (--display-index):'),
                m('input[type=number]', {
                  placeholder: '-1 (Alapértelmezett monitor)',
                  value: this.gsDisplayIndex,
                  oninput: e => { this.gsDisplayIndex = e.target.value; }
                })
              ]),
              m('.lgc-field', [
                m('label', 'Renderelő backend (--backend):'),
                m('select', {
                  value: this.gsBackend,
                  onchange: e => { this.gsBackend = e.target.value; }
                }, [
                  m('option[value=""]', 'Alapértelmezett (Auto)'),
                  m('option[value=sdl]', 'sdl - SDL2 ablakos mód'),
                  m('option[value=wayland]', 'wayland - Natív Wayland'),
                  m('option[value=drm]', 'drm - Közvetlen DRM (standalone)'),
                  m('option[value=openvr]', 'openvr - SteamVR Overlay'),
                  m('option[value=headless]', 'headless - Fej nélküli / Virtuális')
                ])
              ])
            ]),

            m('.lgc-grid-2', { style: 'margin-top: 10px;' }, [
              m('.lgc-field', [
                m('label', 'Kijelző elforgatása (--force-orientation):'),
                m('select', {
                  value: this.gsForceOrientation,
                  onchange: e => { this.gsForceOrientation = e.target.value; }
                }, [
                  m('option[value=""]', 'Nincs elforgatás'),
                  m('option[value=normal]', 'normal - Normál'),
                  m('option[value=left]', 'left - Balra (90°)'),
                  m('option[value=right]', 'right - Jobbra (270°)'),
                  m('option[value=upsidedown]', 'upsidedown - Fejjel lefelé (180°)')
                ])
              ]),
              m('.lgc-field', [
                m('label', 'Egyéb közvetlen Gamescope argumentumok:'),
                m('input[type=text]', {
                  placeholder: 'pl. --mouse-sensitivity 1.5',
                  value: this.gsExtraArgs,
                  oninput: e => { this.gsExtraArgs = e.target.value; }
                })
              ])
            ]),

            m('.lgc-grid-3', { style: 'margin-top: 10px;' }, [
              m('label.lgc-toggle-card', { className: this.gsExposeWayland ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsExposeWayland,
                  onchange: e => { this.gsExposeWayland = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'Wayland kliensek (--expose-wayland)'),
                  m('span.desc', 'Natív Wayland alkalmazások engedélyezése.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.gsGrabCursor ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsGrabCursor,
                  onchange: e => { this.gsGrabCursor = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'Kurzor zárolása (--force-grab-cursor)'),
                  m('span.desc', 'Egér benntartása az ablakban (FPS játékokhoz).')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.gsGrabKeyboard ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.gsGrabKeyboard,
                  onchange: e => { this.gsGrabKeyboard = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'Billentyűzet zárolása (--grab)'),
                  m('span.desc', 'Bemenetek teljes átadása Gamescope-nak.')
                ])
              ])
            ])
          ]) : null
        ])
      ]);
    }

    // 3. Proton fül
    tabProton() {
      return m('div', [
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-power-off.header-icon.purple'),
            m('span.header-title', 'Proton Környezeti Változók Állapota'),
            m('span.lgc-badge.badge-purple', this.enableProton ? 'Aktív' : 'Inaktív')
          ]),
          m('.lgc-card-body', [
            m('label.lgc-toggle-card', { className: this.enableProton ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.enableProton,
                onchange: e => { this.enableProton = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'Proton környezeti változók hozzáadása a parancshoz'),
                m('span.desc', 'Akkor kapcsold be, ha az alábbi grafikai vagy kompatibilitási beállításokat érvényesíteni szeretnéd.')
              ])
            ])
          ])
        ]),

        // Alap Naplózás & Grafika kártya
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-file-lines.header-icon.emerald'),
            m('span.header-title', 'Alapvető Naplózás és Teljesítmény'),
            m('span.lgc-badge.badge-emerald', 'DXVK & Log')
          ]),
          m('.lgc-card-body', [
            m('.lgc-grid-2', [
              m('label.lgc-toggle-card', { className: this.prLog ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prLog,
                  onchange: e => { this.prLog = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_LOG=1 (Hibakeresési napló)'),
                  m('span.desc', 'Részletes logfájlt generál a ~/steam-<appid>.log helyre.')
                ])
              ]),
              m('.lgc-field', [
                m('label', 'Wine hibakereső csatornák (WINEDEBUG):'),
                m('select', {
                  value: this.prWinedebug,
                  onchange: e => { this.prWinedebug = e.target.value; }
                }, [
                  m('option[value=""]', 'Alapértelmezett naplózás'),
                  m('option[value="-all"]', '-all (Csendes mód - teljesítmény javulhat)'),
                  m('option[value="+timestamp,+pid,+tid"]', '+timestamp,+pid,+tid (Időbélyeges nyomkövetés)'),
                  m('option[value="+fps"]', '+fps (Belső FPS kiírás)'),
                  m('option[value="+loaddll"]', '+loaddll (DLL betöltések vizsgálata)')
                ])
              ])
            ]),

            m('.lgc-grid-2', { style: 'margin-top: 12px;' }, [
              m('.lgc-field', [
                m('label', 'DXVK HUD kijelző (DXVK_HUD):'),
                m('input[type=text]', {
                  placeholder: 'pl. fps,devinfo,gputemp vagy memory',
                  value: this.prDxvkHud,
                  oninput: e => { this.prDxvkHud = e.target.value; }
                })
              ]),
              m('.lgc-field', [
                m('label', 'DXVK FPS korlát (DXVK_FRAME_RATE):'),
                m('input[type=number]', {
                  placeholder: 'pl. 60 (D3D9/10/11 DXVK szintű képkocka-limit)',
                  value: this.prDxvkFrameRate,
                  oninput: e => { this.prDxvkFrameRate = e.target.value; }
                })
              ])
            ])
          ])
        ]),

        // GPU & Raytracing kártya
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-microchip.header-icon.cyan'),
            m('span.header-title', 'GPU & Grafikai Integrációk'),
            m('span.lgc-badge.badge-cyan', 'Nvidia / DLSS / HDR')
          ]),
          m('.lgc-card-body', [
            m('.lgc-grid-2', [
              m('label.lgc-toggle-card', { className: this.prNvapi ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prNvapi,
                  onchange: e => { this.prNvapi = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_ENABLE_NVAPI=1'),
                  m('span.desc', 'Nvidia DLSS, Reflex és sugárkövetés (RTX) engedélyezése.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prDlssUpgrade ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prDlssUpgrade,
                  onchange: e => { this.prDlssUpgrade = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_DLSS_UPGRADE=1'),
                  m('span.desc', 'Proton beépített újabb DLSS verziójának kényszerítése.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prHdr ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prHdr,
                  onchange: e => { this.prHdr = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_ENABLE_HDR=1'),
                  m('span.desc', 'Proton beépített HDR kimenet aktiválása.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prVkbasalt ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prVkbasalt,
                  onchange: e => { this.prVkbasalt = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'ENABLE_VKBASALT=1'),
                  m('span.desc', 'vkBasalt Vulkan utófeldolgozó shader réteg aktiválása.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prHideNvidiaGpu ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prHideNvidiaGpu,
                  onchange: e => { this.prHideNvidiaGpu = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_HIDE_NVIDIA_GPU=1'),
                  m('span.desc', 'Nvidia GPU elrejtése a hibás kártyafelismerésű játékok elől.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prWayland ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prWayland,
                  onchange: e => { this.prWayland = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_ENABLE_WAYLAND=1'),
                  m('span.desc', 'Kísérleti natív Wayland illesztő Wine alatt.')
                ])
              ])
            ])
          ])
        ]),

        // Harmonika 1: Haladó DXVK és VKD3D
        m('.lgc-card.lgc-accordion-card', [
          m('button.lgc-accordion-btn', {
            type: 'button',
            onclick: () => { this.prShowAdvancedDxvk = !this.prShowAdvancedDxvk; }
          }, [
            m('.lgc-accordion-title-group', [
              m('i.fas.fa-cubes.header-icon.purple'),
              m('span.header-title', 'Haladó DXVK & VKD3D Beállítások'),
              m('span.lgc-badge.badge-gray', 'D3D12 & Raytracing')
            ]),
            m(`i.fas.fa-chevron-down.accordion-chevron${this.prShowAdvancedDxvk ? '.open' : ''}`)
          ]),
          this.prShowAdvancedDxvk ? m('.lgc-card-body.accordion-body', [
            m('.lgc-grid-2', [
              m('.lgc-field', [
                m('label', 'VKD3D beállítások (VKD3D_CONFIG):'),
                m('input[type=text]', {
                  placeholder: 'pl. dxr11,dxr (Raytracing-hez)',
                  value: this.prVkd3dConfig,
                  oninput: e => { this.prVkd3dConfig = e.target.value; }
                })
              ]),
              m('.lgc-field', [
                m('label', 'D3D12 Feature Level korlát (VKD3D_FEATURE_LEVEL):'),
                m('select', {
                  value: this.prVkd3dFeatureLevel,
                  onchange: e => { this.prVkd3dFeatureLevel = e.target.value; }
                }, [
                  m('option[value=""]', 'Alapértelmezett'),
                  m('option[value="12_1"]', '12_1 - Direct3D 12.1'),
                  m('option[value="12_0"]', '12_0 - Direct3D 12.0'),
                  m('option[value="11_1"]', '11_1 - Direct3D 11.1'),
                  m('option[value="11_0"]', '11_0 - Direct3D 11.0')
                ])
              ])
            ]),

            m('.lgc-grid-2', { style: 'margin-top: 10px;' }, [
              m('.lgc-field', [
                m('label', 'VKD3D naplózás (VKD3D_DEBUG):'),
                m('select', {
                  value: this.prVkd3dDebug,
                  onchange: e => { this.prVkd3dDebug = e.target.value; }
                }, [
                  m('option[value=""]', 'Alapértelmezett'),
                  m('option[value=none]', 'none - Csendes'),
                  m('option[value=error]', 'error - Csak hibák'),
                  m('option[value=warn]', 'warn - Figyelmeztetések'),
                  m('option[value=info]', 'info - Információs'),
                  m('option[value=debug]', 'debug - Részletes debug')
                ])
              ]),
              m('.lgc-field', [
                m('label', 'Egyedi DXVK konfigurációs fájl (DXVK_CONFIG_FILE):'),
                m('input[type=text]', {
                  placeholder: 'pl. /home/user/dxvk.conf',
                  value: this.prDxvkConfigFile,
                  oninput: e => { this.prDxvkConfigFile = e.target.value; }
                })
              ])
            ]),

            m('.lgc-grid-2', { style: 'margin-top: 10px;' }, [
              m('label.lgc-toggle-card', { className: this.prNoD3d11 ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prNoD3d11,
                  onchange: e => { this.prNoD3d11 = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_NO_D3D11=1'),
                  m('span.desc', 'D3D11 DXVK fordítás letiltása.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prNoD3d12 ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prNoD3d12,
                  onchange: e => { this.prNoD3d12 = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_NO_D3D12=1'),
                  m('span.desc', 'D3D12 VKD3D letiltása (visszaesés D3D11-re).')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prNoD3d10 ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prNoD3d10,
                  onchange: e => { this.prNoD3d10 = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_NO_D3D10=1'),
                  m('span.desc', 'D3D10 DXVK fordítás letiltása.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prDxvkNoStateCache ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prDxvkNoStateCache,
                  onchange: e => { this.prDxvkNoStateCache = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'DXVK_STATE_CACHE=0'),
                  m('span.desc', 'DXVK shader gyorsítótár kikapcsolása (debug).')
                ])
              ])
            ])
          ]) : null
        ]),

        // Harmonika 2: CPU Szinkronizáció & Memória & Rendszer
        m('.lgc-card.lgc-accordion-card', [
          m('button.lgc-accordion-btn', {
            type: 'button',
            onclick: () => { this.prShowAdvancedSync = !this.prShowAdvancedSync; }
          }, [
            m('.lgc-accordion-title-group', [
              m('i.fas.fa-microchip.header-icon.amber'),
              m('span.header-title', 'CPU Szinkronizáció, Memória & Rendszer'),
              m('span.lgc-badge.badge-gray', 'Esync / Fsync / LAA')
            ]),
            m(`i.fas.fa-chevron-down.accordion-chevron${this.prShowAdvancedSync ? '.open' : ''}`)
          ]),
          this.prShowAdvancedSync ? m('.lgc-card-body.accordion-body', [
            m('.lgc-grid-2', [
              m('.lgc-field', [
                m('label', 'Vulkan GPU választás (MESA_VK_DEVICE_SELECT):'),
                m('input[type=text]', {
                  placeholder: 'pl. 1002:73bf (Hibrid grafika esetén)',
                  value: this.prMesaVkDeviceSelect,
                  oninput: e => { this.prMesaVkDeviceSelect = e.target.value; }
                })
              ]),
              m('.lgc-field', [
                m('label', 'Egyedi Wine Prefix könyvtár (WINEPREFIX):'),
                m('input[type=text]', {
                  placeholder: 'pl. /home/user/jatek_prefix',
                  value: this.prWineprefix,
                  oninput: e => { this.prWineprefix = e.target.value; }
                })
              ])
            ]),

            m('.lgc-grid-2', { style: 'margin-top: 10px;' }, [
              m('label.lgc-toggle-card', { className: this.prForceLaa ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prForceLaa,
                  onchange: e => { this.prForceLaa = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_FORCE_LARGE_ADDRESS_AWARE=1'),
                  m('span.desc', '32 bites játékoknak 4 GB memóriaterületet engedélyez.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prUseNtsync ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prUseNtsync,
                  onchange: e => { this.prUseNtsync = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_USE_NTSYNC=1'),
                  m('span.desc', 'Natív Linux NT szinkronizáció bekapcsolása.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prNoEsync ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prNoEsync,
                  onchange: e => { this.prNoEsync = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_NO_ESYNC=1'),
                  m('span.desc', 'Esync (eventfd) letiltása hibakereséshez.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prNoFsync ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prNoFsync,
                  onchange: e => { this.prNoFsync = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_NO_FSYNC=1'),
                  m('span.desc', 'Fsync (futex) szinkronizáció letiltása.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prUseWined3d ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prUseWined3d,
                  onchange: e => { this.prUseWined3d = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_USE_WINED3D=1 (OpenGL)'),
                  m('span.desc', 'OpenGL-alapú WineD3D használata DXVK helyett.')
                ])
              ]),
              m('label.lgc-toggle-card', { className: this.prDumpDebugCommands ? 'active' : '' }, [
                m('input[type=checkbox]', {
                  checked: this.prDumpDebugCommands,
                  onchange: e => { this.prDumpDebugCommands = e.target.checked; }
                }),
                m('.lgc-toggle-content', [
                  m('strong', 'PROTON_DUMP_DEBUG_COMMANDS=1'),
                  m('span.desc', 'Indítófájlok mentése a /tmp mappába a Steam-en kívüli teszteléshez.')
                ])
              ])
            ]),

            m('.lgc-field', { style: 'margin-top: 10px;' }, [
              m('label', 'Egyéb egyedi környezeti változók / argumentumok:'),
              m('input[type=text]', {
                placeholder: 'pl. PROTON_NO_WRITE_WATCH=1 vagy WINE_HEAP_DELAY_FREE=1',
                value: this.prExtraArgs,
                oninput: e => { this.prExtraArgs = e.target.value; }
              })
            ])
          ]) : null
        ])
      ]);
    }

    // 4. Wine DLL Overrides fül
    tabDll() {
      // Csoportosítás kategóriák szerint, tiszta FontAwesome ikonokkal
      const categories = [
        { key: 'DirectX / Grafika', label: 'DirectX & Grafikai Könyvtárak', badgeClass: 'badge-dx', icon: 'fa-cubes-stacked', iconColor: 'blue' },
        { key: 'Mod-Loaderek & Injektorok', label: 'Mod-Loaderek & Injektor Könyvtárak', badgeClass: 'badge-mod', icon: 'fa-screwdriver-wrench', iconColor: 'purple' },
        { key: 'VR & Hardver', label: 'VR & Hardver / Kiegészítők', badgeClass: 'badge-vr', icon: 'fa-vr-cardboard', iconColor: 'amber' }
      ];

      return m('div', [
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-power-off.header-icon.emerald'),
            m('span.header-title', 'DLL Felülbírálás Modul Állapot'),
            m('span.lgc-badge.badge-emerald', this.enableDll ? 'Aktív' : 'Inaktív')
          ]),
          m('.lgc-card-body', [
            m('label.lgc-toggle-card', { className: this.enableDll ? 'active' : '' }, [
              m('input[type=checkbox]', {
                checked: this.enableDll,
                onchange: e => { this.enableDll = e.target.checked; }
              }),
              m('.lgc-toggle-content', [
                m('strong', 'WINEDLLOVERRIDES beillesztése a parancsba'),
                m('span.desc', 'Szükséges ReShade (dxgi), ASI mod-loaderek (dinput8, version) vagy egyedi DLL fájlok betöltéséhez.')
              ])
            ])
          ])
        ]),

        // Gyakori DLL-ek kategóriák szerint
        categories.map(cat => {
          const dllsInCat = this.predefinedDlls.filter(d => d.cat === cat.key);
          return m('.lgc-card', [
            m('.lgc-card-header', [
              m('.lgc-card-title-group', [
                m(`i.fas.${cat.icon}.header-icon.${cat.iconColor}`, { style: 'margin-right: 8px;' }),
                m('span.header-title', cat.label)
              ]),
              m(`span.lgc-badge.${cat.badgeClass}`, `${dllsInCat.filter(d => d.checked).length} kiválasztva`)
            ]),
            m('.lgc-card-body', [
              m('.lgc-dll-list', dllsInCat.map(dll => {
                return m('.lgc-dll-row', { className: dll.checked ? 'checked' : '' }, [
                  m('.lgc-dll-info', [
                    m('input[type=checkbox]', {
                      checked: dll.checked,
                      onchange: e => { dll.checked = e.target.checked; }
                    }),
                    m('span.lgc-dll-name', dll.name),
                    m('span.lgc-dll-desc', dll.desc)
                  ]),
                  m('select.lgc-dll-select', {
                    value: dll.type,
                    onchange: e => { dll.type = e.target.value; }
                  }, [
                    m('option[value="n,b"]', 'n,b (Native, utána Builtin)'),
                    m('option[value="b,n"]', 'b,n (Builtin, utána Native)'),
                    m('option[value="n"]', 'n (Csak Native)'),
                    m('option[value="b"]', 'b (Csak Builtin)'),
                    m('option[value="d"]', 'd (Letiltva / Disabled)')
                  ])
                ]);
              }))
            ])
          ]);
        }),

        // Egyedi DLL hozzáadása kártya
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-plus-circle.header-icon.cyan'),
            m('span.header-title', 'Egyedi DLL Felülbírálás Hozzáadása'),
            m('span.lgc-badge.badge-cyan', 'Egyedi')
          ]),
          m('.lgc-card-body', [
            m('.lgc-grid-3', [
              m('.lgc-field', [
                m('input[type=text]', {
                  placeholder: safeTrans('gabeszm-linux-games-commands.forum.dll_name_placeholder', 'DLL neve (pl. winhttp vagy ddraw)'),
                  value: this.customDllName,
                  oninput: e => { this.customDllName = e.target.value; },
                  onkeydown: e => { if (e.key === 'Enter') this.addCustomDll(); }
                })
              ]),
              m('.lgc-field', [
                m('select', {
                  value: this.customDllType,
                  onchange: e => { this.customDllType = e.target.value; }
                }, [
                  m('option[value="n,b"]', 'n,b (Native, utána Builtin)'),
                  m('option[value="b,n"]', 'b,n (Builtin, utána Native)'),
                  m('option[value="n"]', 'n (Csak Native)'),
                  m('option[value="b"]', 'b (Csak Builtin)'),
                  m('option[value="d"]', 'd (Letiltva / Disabled)')
                ])
              ]),
              m('button.Button.Button--primary', {
                type: 'button',
                style: 'width: 100%; white-space: nowrap;',
                onclick: () => this.addCustomDll()
              }, [
                m('i.fas.fa-plus', { style: 'margin-right: 6px;' }),
                safeTrans('gabeszm-linux-games-commands.forum.add_custom_dll', 'Hozzáadás')
              ])
            ]),

            this.customDlls.length > 0 ? m('.lgc-custom-dll-list', { style: 'margin-top: 12px;' }, this.customDlls.map((dll, idx) => {
              return m('.lgc-dll-row.checked', [
                m('.lgc-dll-info', [
                  m('input[type=checkbox]', {
                    checked: dll.checked,
                    onchange: e => { dll.checked = e.target.checked; }
                  }),
                  m('span.lgc-dll-name', dll.name),
                  m('span.lgc-dll-desc', 'Egyedileg megadott DLL')
                ]),
                m('select.lgc-dll-select', {
                  value: dll.type,
                  onchange: e => { dll.type = e.target.value; }
                }, [
                  m('option[value="n,b"]', 'n,b'),
                  m('option[value="b,n"]', 'b,n'),
                  m('option[value="n"]', 'n'),
                  m('option[value="b"]', 'b'),
                  m('option[value="d"]', 'd')
                ]),
                m('button.Button.Button--link', {
                  type: 'button',
                  style: 'color: #f85149; margin-left: 8px;',
                  onclick: () => {
                    this.customDlls.splice(idx, 1);
                    m.redraw();
                  }
                }, m('i.fas.fa-trash'))
              ]);
            })) : null
          ])
        ])
      ]);
    }

    // 5. Sorrend & Parancs fül
    tabOrder() {
      const hasWrappers = this.useGamemode || this.useMangohud;
      const hasGamescope = this.enableGamescope;
      const hasEnv = this.enableDll || this.enableProton;

      return m('div', [
        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-diagram-project.header-icon.cyan'),
            m('span.header-title', 'Parancssorrend Pipeline'),
            m('span.lgc-badge.badge-cyan', 'Architektúra')
          ]),
          m('.lgc-card-body', [
            m('p', { style: 'color: #8b949e; font-size: 0.85rem; margin-bottom: 12px;' },
              'A Linux indítási hierarchia szerint a komponensek az alábbi helyes láncban kerülnek végrehajtásra:'
            ),
            m('.lgc-pipeline-flow', [
              m('.lgc-pipeline-step', { className: hasWrappers ? 'active' : '' }, [
                m('.step-badge', '1'),
                m('.step-title', 'Wrapperek'),
                m('.step-desc', hasWrappers ? [
                  this.useGamemode ? 'gamemoderun ' : '',
                  this.useMangohud ? 'mangohud ' : ''
                ] : 'Kikapcsolva')
              ]),
              m('.lgc-pipeline-connector', m('i.fas.fa-arrow-right')),
              m('.lgc-pipeline-step', { className: hasGamescope ? 'active' : '' }, [
                m('.step-badge', '2'),
                m('.step-title', 'Gamescope'),
                m('.step-desc', hasGamescope ? 'gamescope [paraméterek] --' : 'Kikapcsolva')
              ]),
              m('.lgc-pipeline-connector', m('i.fas.fa-arrow-right')),
              m('.lgc-pipeline-step', { className: hasEnv ? 'active' : '' }, [
                m('.step-badge', '3'),
                m('.step-title', 'Környezet (Env)'),
                m('.step-desc', hasEnv ? 'WINEDLLOVERRIDES & PROTON_' : 'Kikapcsolva')
              ]),
              m('.lgc-pipeline-connector', m('i.fas.fa-arrow-right')),
              m('.lgc-pipeline-step.active', [
                m('.step-badge', '4'),
                m('.step-title', 'Játék / Steam'),
                m('.step-desc', this.gameCommand || '%command%')
              ])
            ])
          ])
        ]),

        m('.lgc-card', [
          m('.lgc-card-header', [
            m('i.fas.fa-terminal.header-icon.emerald'),
            m('span.header-title', 'Futtatási Cél / Steam Változó'),
            m('span.lgc-badge.badge-emerald', 'Parancs')
          ]),
          m('.lgc-card-body', [
            m('.lgc-field', [
              m('label', 'Futtatandó parancs vagy Steam helyettesítő:'),
              m('input[type=text]', {
                value: this.gameCommand,
                oninput: e => { this.gameCommand = e.target.value; },
                placeholder: '%command%'
              }),
              m('small', { style: 'color: #8b949e; font-size: 0.75rem; margin-top: 4px;' },
                'Steam indítási opciók esetén a %command% jelöli a játék eredeti végrehajtható fájlját.'
              )
            ])
          ])
        ])
      ]);
    }
  }

  // =========================================================================
  // GOMBOK BEKÖTÉSE A FLARUM FELÜLETÉRE
  // =========================================================================
  if (app && app.initializers) {
    app.initializers.add('gabeszm-linux-games-commands', () => {
      console.log('[Linux Games Commands] Extension initialized successfully');

      // 1. TextEditor (Hozzászólás- és témakészítő eszköztár)
      if (extend && TextEditor && TextEditor.prototype) {
        extend(TextEditor.prototype, 'toolbarItems', function (items) {
          if (app.forum && app.forum.attribute('linuxGamesShowInComposer') === false) return;

          const discussion = app.current ? app.current.get('discussion') : null;
          if (discussion && !isAllowedForDiscussion(discussion)) return;

          items.add('linux-games-commands', m(Button, {
            icon: 'fas fa-gamepad',
            className: 'Button Button--icon Button--link Button-linux-games-commands',
            title: safeTrans('gabeszm-linux-games-commands.forum.toolbar_tooltip', 'Steam & Linux Indítási Parancskészítő'),
            onclick: () => {
              if (app.modal) {
                app.modal.show(LinuxGamesCommandsModal, {
                  editor: this,
                  discussion: discussion
                });
              }
            }
          }), 20);
        });
      }

      // 2. DiscussionPage Sidebar (Téma oldalsáv)
      if (extend && DiscussionPage && DiscussionPage.prototype) {
        extend(DiscussionPage.prototype, 'sidebarItems', function (items) {
          if (app.forum && app.forum.attribute('linuxGamesShowInDiscussion') === false) return;

          const discussion = this.discussion || (app.current ? app.current.get('discussion') : null);
          if (!isAllowedForDiscussion(discussion)) return;

          items.add('linux-games-commands-sidebar', m(Button, {
            className: 'Button Button--primary LinuxGamesCommands-sidebar-btn',
            icon: 'fas fa-gamepad',
            onclick: () => {
              if (app.modal) {
                app.modal.show(LinuxGamesCommandsModal, {
                  discussion: discussion
                });
              }
            }
          }, safeTrans('gabeszm-linux-games-commands.forum.sidebar_button', 'Linux Launch Builder')), 60);
        });
      }

      // 3. DiscussionHero (Téma fejléc gomb)
      if (extend && DiscussionHero && DiscussionHero.prototype) {
        extend(DiscussionHero.prototype, 'items', function (items) {
          if (app.forum && app.forum.attribute('linuxGamesShowInDiscussion') === false) return;

          const discussion = this.attrs ? this.attrs.discussion : null;
          if (!isAllowedForDiscussion(discussion)) return;

          items.add('linux-games-commands-hero', m(Button, {
            className: 'Button Button--link LinuxGamesCommands-hero-btn',
            icon: 'fas fa-gamepad',
            onclick: () => {
              if (app.modal) {
                app.modal.show(LinuxGamesCommandsModal, {
                  discussion: discussion
                });
              }
            }
          }, safeTrans('gabeszm-linux-games-commands.forum.hero_button', 'Indítási Opciók')), 10);
        });
      }

      // 4. IndexSidebar (Főoldali és kategória oldalsáv gomb)
      if (extend && IndexSidebar && IndexSidebar.prototype) {
        extend(IndexSidebar.prototype, 'items', function (items) {
          items.add('linux-games-commands-index-sidebar', m(Button, {
            className: 'Button Button--primary LinuxGamesCommands-sidebar-btn',
            icon: 'fas fa-gamepad',
            onclick: () => {
              if (app.modal) {
                app.modal.show(LinuxGamesCommandsModal, {});
              }
            }
          }, safeTrans('gabeszm-linux-games-commands.forum.sidebar_button', 'Linux Launch Builder')), 10);
        });
      }

      // 5. Globális eseménykezelő a hozzászólásokban megjelenő [linux-command] dobozok másolás gombjához
      document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.linux-command-copy-btn');
        if (!copyBtn) return;

        const container = copyBtn.closest('.linux-command-container');
        if (!container) return;

        const codeEl = container.querySelector('code');
        if (!codeEl) return;

        const text = codeEl.innerText.trim();
        navigator.clipboard.writeText(text).then(() => {
          const origText = copyBtn.innerText;
          copyBtn.innerText = 'Másolva! ✓';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            copyBtn.innerText = origText;
            copyBtn.classList.remove('copied');
          }, 2000);
        });
      });

    });
  }

  if (typeof module !== 'undefined') {
    module.exports = { extend: [] };
  }
})();
