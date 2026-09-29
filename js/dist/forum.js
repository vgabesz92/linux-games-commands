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

  // Gyakori DLL-ek definíciója leírásokkal
  const PREDEFINED_DLLS = [
    { name: 'dxgi', desc: 'DirectX Graphics Infrastructure (ReShade, SpecialK és grafikai modokhoz)' },
    { name: 'd3d11', desc: 'DirectX 11 kompatibilitási könyvtár (DXVK használatakor)' },
    { name: 'dinput8', desc: 'DirectInput 8 beviteli modul (ASI mod-loader injektorok: GTA, Skyrim)' },
    { name: 'version', desc: 'Fájlverzió lekérdező könyvtár (Népszerű mod-injektorok és ASI betöltők)' },
    { name: 'd3d12', desc: 'DirectX 12 könyvtár (VKD3D-Proton)' },
    { name: 'd3d12core', desc: 'Direct3D 12 Core könyvtár (Újabb DX12 mod-loaderek)' },
    { name: 'd3d9', desc: 'DirectX 9 kompatibilitás (D9VK vagy régebbi kiegészítők)' },
    { name: 'dsound', desc: 'DirectSound hangkönyvtár (Régi hangmodokhoz)' },
    { name: 'xinput1_3', desc: 'Xbox kontroller API v1.3 (Egyedi gamepad emulátorokhoz)' },
    { name: 'winmm', desc: 'Windows multimédiás API (Zene és média modokhoz)' },
    { name: 'openvr_api', desc: 'OpenVR API könyvtár (VR modok, UEVR betöltése)' },
    { name: 'nvapi64', desc: 'Nvidia 64-bites NVAPI (DLSS és ray tracing Nvidia kártyákon)' }
  ];

  // Ellenőrizzük, hogy az adott témában/kategóriában engedélyezett-e a funkció
  function isAllowedForDiscussion(discussion) {
    if (!app || !app.forum) return true;
    const allowedSetting = (app.forum.attribute('linuxGamesAllowedTags') || '').trim();
    if (!allowedSetting) return true; // Ha üres, mindenhol megjelenik

    const allowed = allowedSetting.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length === 0) return true;

    if (!discussion) return true; // Ha nincs meghatározva, ne rejtsük el

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
      const t = app && app.translator ? app.translator.trans('gabeszm-linux-games-commands.forum.modal_title') : 'Steam & Linux Parancskészítő';
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

      // Wrapperek
      this.useGamemode = false;
      this.useMangohud = false;

      // Gamescope modul
      this.enableGamescope = false;
      this.gsGameW = '';
      this.gsGameH = '';
      this.gsOutW = '';
      this.gsOutH = '';
      this.gsFps = '';
      this.gsFpsUnfocused = '';
      this.gsScaling = 'fit';
      this.gsUpscaler = 'fsr';
      this.gsFsrSharpness = '2';
      this.gsFullscreen = true;
      this.gsBorderless = false;
      this.gsHdr = false;
      this.gsAdaptiveSync = true;
      this.gsMangoapp = false;
      this.gsExposeWayland = false;
      this.gsGrabCursor = false;

      // Proton modul
      this.enableProton = false;
      this.prLog = false;
      this.prLogDir = '';
      this.prNvapi = false;
      this.prDlssUpgrade = false;
      this.prHideNvidiaGpu = false;
      this.prWayland = false;
      this.prVkbasalt = false;
      this.prForceLaa = false;
      this.prUseWined3d = false;
      this.prNoEsync = false;
      this.prNoFsync = false;
      this.prUseNtsync = false;
      this.prDxvkHud = '';
      this.prDxvkFrameRate = '';
      this.prDxvkNoStateCache = false;
      this.prExtraArgs = '';

      // DLL Felülbírálás modul
      this.enableDll = false;
      this.predefinedDlls = PREDEFINED_DLLS.map(d => ({
        name: d.name,
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

      if (type === 'steam_deck') {
        this.enableGamescope = true;
        this.gsGameW = '1280';
        this.gsGameH = '800';
        this.gsOutW = '1920';
        this.gsOutH = '1080';
        this.gsUpscaler = 'fsr';
        this.gsFullscreen = true;
        this.useGamemode = true;
        this.useMangohud = true;
        this.activeTab = 'gamescope';
      } else if (type === 'performance') {
        this.useGamemode = true;
        this.useMangohud = true;
        this.activeTab = 'quick';
      } else if (type === 'modding') {
        this.enableDll = true;
        const dxgi = this.predefinedDlls.find(d => d.name === 'dxgi');
        if (dxgi) dxgi.checked = true;
        const dinput8 = this.predefinedDlls.find(d => d.name === 'dinput8');
        if (dinput8) dinput8.checked = true;
        this.activeTab = 'dll';
      } else if (type === 'nvidia') {
        this.enableProton = true;
        this.prNvapi = true;
        this.prDlssUpgrade = true;
        this.activeTab = 'proton';
      } else if (type === 'debug') {
        this.enableProton = true;
        this.prLog = true;
        this.prDxvkHud = 'fps,devinfo,compiler';
        this.activeTab = 'proton';
      }
      m.redraw();
    }

    // Minden visszaállítása alaphelyzetbe
    clearAll() {
      this.useGamemode = false;
      this.useMangohud = false;
      this.enableGamescope = false;
      this.gsGameW = '';
      this.gsGameH = '';
      this.gsOutW = '';
      this.gsOutH = '';
      this.gsFps = '';
      this.gsFpsUnfocused = '';
      this.gsScaling = 'fit';
      this.gsUpscaler = 'fsr';
      this.gsFsrSharpness = '2';
      this.gsFullscreen = true;
      this.gsBorderless = false;
      this.gsHdr = false;
      this.gsAdaptiveSync = true;
      this.gsMangoapp = false;
      this.gsExposeWayland = false;
      this.gsGrabCursor = false;

      this.enableProton = false;
      this.prLog = false;
      this.prLogDir = '';
      this.prNvapi = false;
      this.prDlssUpgrade = false;
      this.prHideNvidiaGpu = false;
      this.prWayland = false;
      this.prVkbasalt = false;
      this.prForceLaa = false;
      this.prUseWined3d = false;
      this.prNoEsync = false;
      this.prNoFsync = false;
      this.prUseNtsync = false;
      this.prDxvkHud = '';
      this.prDxvkFrameRate = '';
      this.prDxvkNoStateCache = false;
      this.prExtraArgs = '';

      this.enableDll = false;
      this.predefinedDlls.forEach(d => { d.checked = false; d.type = 'n,b'; });
      this.customDlls = [];
      this.customDllName = '';
      this.gameCommand = '%command%';
      this.copyStatus = '';
      m.redraw();
    }

    // Egyedi DLL hozzáadása
    addCustomDll() {
      let name = (this.customDllName || '').trim().toLowerCase();
      if (name.endsWith('.dll')) name = name.slice(0, -4);
      if (!name) return;

      const existsPre = this.predefinedDlls.some(d => d.name === name);
      const existsCust = this.customDlls.some(d => d.name === name);

      if (existsPre) {
        const found = this.predefinedDlls.find(d => d.name === name);
        if (found) found.checked = true;
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
        if (this.gsScaling) gsArgs.push('-S', this.gsScaling);
        if (this.gsUpscaler) gsArgs.push('-F', this.gsUpscaler);
        if (this.gsUpscaler === 'fsr' && this.gsFsrSharpness !== '' && this.gsFsrSharpness !== '2') {
          gsArgs.push('--fsr-sharpness', this.gsFsrSharpness);
        }
        if (this.gsHdr) gsArgs.push('--hdr-enabled');
        if (this.gsAdaptiveSync) gsArgs.push('--adaptive-sync');
        if (this.gsMangoapp) gsArgs.push('--mangoapp');
        if (this.gsExposeWayland) gsArgs.push('--expose-wayland');
        if (this.gsGrabCursor) gsArgs.push('--force-grab-cursor');

        parts.push('gamescope ' + gsArgs.join(' ') + ' --');
      }

      // 3. Környezeti változók (DLL overrides + Proton)
      const envVars = [];

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

      if (this.enableProton) {
        if (this.prLog) envVars.push('PROTON_LOG=1');
        if (this.prLogDir) envVars.push(`PROTON_LOG_DIR="${this.prLogDir}"`);
        if (this.prNvapi) envVars.push('PROTON_ENABLE_NVAPI=1');
        if (this.prDlssUpgrade) envVars.push('PROTON_DLSS_UPGRADE=1');
        if (this.prHideNvidiaGpu) envVars.push('PROTON_HIDE_NVIDIA_GPU=1');
        if (this.prWayland) envVars.push('PROTON_ENABLE_WAYLAND=1');
        if (this.prVkbasalt) envVars.push('ENABLE_VKBASALT=1');
        if (this.prForceLaa) envVars.push('PROTON_FORCE_LARGE_ADDRESS_AWARE=1');
        if (this.prUseWined3d) envVars.push('PROTON_USE_WINED3D=1');
        if (this.prNoEsync) envVars.push('PROTON_NO_ESYNC=1');
        if (this.prNoFsync) envVars.push('PROTON_NO_FSYNC=1');
        if (this.prUseNtsync) envVars.push('PROTON_USE_NTSYNC=1');
        if (this.prDxvkHud) envVars.push(`DXVK_HUD="${this.prDxvkHud}"`);
        if (this.prDxvkFrameRate) envVars.push(`DXVK_FRAME_RATE=${this.prDxvkFrameRate}`);
        if (this.prDxvkNoStateCache) envVars.push('DXVK_STATE_CACHE=0');
        if (this.prExtraArgs) envVars.push(this.prExtraArgs.trim());
      }

      if (envVars.length > 0) {
        parts.push(envVars.join(' '));
      }

      // 4. Játék indítási parancs
      parts.push(this.gameCommand.trim() || '%command%');

      return parts.join(' ').trim();
    }

    // Vágólapra másolás egy kattintással
    copyCommand() {
      const cmd = this.buildCommand();
      navigator.clipboard.writeText(cmd).then(() => {
        this.copyStatus = 'copied';
        m.redraw();
        setTimeout(() => {
          this.copyStatus = '';
          m.redraw();
        }, 2500);
      });
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

      // Másolás vágólapra is a biztonság kedvéért
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(bbcode).catch(() => {});
      }

      if (app && app.alerts && inserted) {
        const alertMsg = (app.translator ? app.translator.trans('gabeszm-linux-games-commands.forum.inserted_alert') : null) || 'Parancs sikeresen beillesztve a bejegyzésbe!';
        app.alerts.show({ type: 'success' }, alertMsg);
      }

      if (app && app.modal) {
        app.modal.close();
      }
    }

    // Fülváltó renderelés
    renderTabs() {
      const t = (k, def) => (app && app.translator ? app.translator.trans(k) : def);
      const tabs = [
        { id: 'quick', label: t('gabeszm-linux-games-commands.forum.tabs.quick', '⚡ Gyors eszközök') },
        { id: 'gamescope', label: t('gabeszm-linux-games-commands.forum.tabs.gamescope', '📺 Gamescope') },
        { id: 'proton', label: t('gabeszm-linux-games-commands.forum.tabs.proton', '⚙️ Proton & Grafika') },
        { id: 'dll', label: t('gabeszm-linux-games-commands.forum.tabs.dll', '🔗 DLL Felülbírálás') },
        { id: 'order', label: t('gabeszm-linux-games-commands.forum.tabs.order', '🔀 Sorrend & Parancs') }
      ];

      return m('.lgc-tabs-nav', tabs.map(tab => {
        return m('button.lgc-tab-btn', {
          type: 'button',
          className: this.activeTab === tab.id ? 'active' : '',
          onclick: () => { this.activeTab = tab.id; }
        }, tab.label);
      }));
    }

    // Gyors sablon gombok
    renderPresetsBar() {
      const t = (k, def) => (app && app.translator ? app.translator.trans(k) : def);
      return m('.lgc-presets-bar', [
        m('.lgc-presets-title', t('gabeszm-linux-games-commands.forum.presets.title', 'Gyors Sablonok:')),
        m('button.lgc-preset-pill', { type: 'button', onclick: () => this.applyPreset('steam_deck') }, t('gabeszm-linux-games-commands.forum.presets.steam_deck', '🚀 Steam Deck FSR')),
        m('button.lgc-preset-pill', { type: 'button', onclick: () => this.applyPreset('performance') }, t('gabeszm-linux-games-commands.forum.presets.performance', '⚡ Max Teljesítmény')),
        m('button.lgc-preset-pill', { type: 'button', onclick: () => this.applyPreset('modding') }, t('gabeszm-linux-games-commands.forum.presets.modding', '🛠️ Modding / ReShade')),
        m('button.lgc-preset-pill', { type: 'button', onclick: () => this.applyPreset('nvidia') }, t('gabeszm-linux-games-commands.forum.presets.nvidia', '🎮 Nvidia RTX & DLSS')),
        m('button.lgc-preset-pill', { type: 'button', onclick: () => this.applyPreset('debug') }, t('gabeszm-linux-games-commands.forum.presets.debug', '🐞 Hibakeresés'))
      ]);
    }

    // Kimeneti parancsdoboz renderelése (kizárólag postba illesztés és minden törlése gombokkal)
    renderOutputBox() {
      const cmd = this.buildCommand();
      const t = (k, def) => (app && app.translator ? app.translator.trans(k) : def);

      return m('.lgc-output-container', [
        m('.lgc-output-header', [
          m('.lgc-output-title-group', [
            m('.terminal-dots', [m('span'), m('span'), m('span')]),
            m('.lgc-output-label', t('gabeszm-linux-games-commands.forum.output_label', 'GENERÁLT STEAM INDÍTÁSI PARANCS:'))
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
              ' ' + t('gabeszm-linux-games-commands.forum.insert_to_post', 'Beillesztés a hozzászólásba')
            ])
          ]),
          m('button.btn-clear', {
            type: 'button',
            onclick: () => this.clearAll()
          }, [
            m('i.fas.fa-trash-alt', { style: 'margin-right: 6px;' }),
            t('gabeszm-linux-games-commands.forum.clear', 'Minden törlése')
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
      return m('.lgc-section', [
        m('.lgc-section-header', [m('i.fas.fa-bolt'), ' Általános Eszközök és Wrapperek']),
        m('label.lgc-checkbox-item', [
          m('input[type=checkbox]', {
            checked: this.useGamemode,
            onchange: e => { this.useGamemode = e.target.checked; }
          }),
          m('.lgc-checkbox-label', [
            m('strong', 'gamemoderun (Feral GameMode)'),
            m('span.desc', 'Optimalizálja a CPU frekvenciát, I/O prioritást és a GPU állapotot játék közben.')
          ])
        ]),
        m('label.lgc-checkbox-item', [
          m('input[type=checkbox]', {
            checked: this.useMangohud,
            onchange: e => { this.useMangohud = e.target.checked; }
          }),
          m('.lgc-checkbox-label', [
            m('strong', 'mangohud (Teljesítmény kijelző OSD)'),
            m('span.desc', 'Megjeleníti az FPS-t, CPU/GPU terhelést, hőmérsékletet és képkockaidőt a játék tetején.')
          ])
        ]),
        m('label.lgc-checkbox-item', [
          m('input[type=checkbox]', {
            checked: this.enableGamescope,
            onchange: e => { this.enableGamescope = e.target.checked; }
          }),
          m('.lgc-checkbox-label', [
            m('strong', 'Gamescope Kompozitor bekapcsolása'),
            m('span.desc', 'Felbontás skálázás (FSR/NIS), ablakkezelés és mikrowindow-manager használata.')
          ])
        ]),
        m('label.lgc-checkbox-item', [
          m('input[type=checkbox]', {
            checked: this.enableProton,
            onchange: e => { this.enableProton = e.target.checked; }
          }),
          m('.lgc-checkbox-label', [
            m('strong', 'Proton & Grafikai változók bekapcsolása'),
            m('span.desc', 'DXVK beállítások, Proton naplózás, NVAPI/DLSS és szinkronizációs flag-ek.')
          ])
        ]),
        m('label.lgc-checkbox-item', [
          m('input[type=checkbox]', {
            checked: this.enableDll,
            onchange: e => { this.enableDll = e.target.checked; }
          }),
          m('.lgc-checkbox-label', [
            m('strong', 'Wine DLL felülbírálások bekapcsolása (WINEDLLOVERRIDES)'),
            m('span.desc', 'Egyedi könyvtárak, ReShade (dxgi) vagy mod-loaderek (dinput8, version) betöltéséhez.')
          ])
        ])
      ]);
    }

    // 2. Gamescope fül
    tabGamescope() {
      return m('div', [
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-toggle-on'), ' Gamescope Állapot']),
          m('label.lgc-checkbox-item', [
            m('input[type=checkbox]', {
              checked: this.enableGamescope,
              onchange: e => { this.enableGamescope = e.target.checked; }
            }),
            m('.lgc-checkbox-label', [
              m('strong', 'Gamescope használata ebben a parancsban'),
              m('span.desc', 'Ha be van pipálva, a parancs a gamescope argumentumokkal és a -- határolóval indul.')
            ])
          ])
        ]),
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-desktop'), ' Felbontás és Képfrissítés']),
          m('.lgc-grid-2', [
            m('.lgc-field', [
              m('label', 'Belső Render Felbontás (-w x -h):'),
              m('.lgc-grid-nested-2', [
                m('input[type=number]', {
                  placeholder: 'Szélesség (1280)',
                  value: this.gsGameW,
                  oninput: e => { this.gsGameW = e.target.value; }
                }),
                m('input[type=number]', {
                  placeholder: 'Magasság (800)',
                  value: this.gsGameH,
                  oninput: e => { this.gsGameH = e.target.value; }
                })
              ])
            ]),
            m('.lgc-field', [
              m('label', 'Kimeneti Felbontás (-W x -H):'),
              m('.lgc-grid-nested-2', [
                m('input[type=number]', {
                  placeholder: 'Kijelző szél. (1920)',
                  value: this.gsOutW,
                  oninput: e => { this.gsOutW = e.target.value; }
                }),
                m('input[type=number]', {
                  placeholder: 'Kijelző mag. (1080)',
                  value: this.gsOutH,
                  oninput: e => { this.gsOutH = e.target.value; }
                })
              ])
            ])
          ]),
          m('.lgc-grid-2', { style: 'margin-top: 10px;' }, [
            m('.lgc-field', [
              m('label', 'FPS Korlát (-r):'),
              m('input[type=number]', {
                placeholder: 'pl. 60 vagy 144',
                value: this.gsFps,
                oninput: e => { this.gsFps = e.target.value; }
              })
            ]),
            m('.lgc-field', [
              m('label', 'Háttérbeli FPS korlát (-o):'),
              m('input[type=number]', {
                placeholder: 'pl. 30',
                value: this.gsFpsUnfocused,
                oninput: e => { this.gsFpsUnfocused = e.target.value; }
              })
            ])
          ])
        ]),
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-sliders'), ' Skálázás és Módok']),
          m('.lgc-grid-3', [
            m('.lgc-field', [
              m('label', 'Skálázó Motor (-F):'),
              m('select', {
                value: this.gsUpscaler,
                onchange: e => { this.gsUpscaler = e.target.value; }
              }, [
                m('option[value=fsr]', 'AMD FSR (FidelityFX)'),
                m('option[value=nis]', 'NVIDIA Image Scaling (NIS)'),
                m('option[value=linear]', 'Bilineáris (Linear)'),
                m('option[value=nearest]', 'Legközelebbi szomszéd (Pixel)'),
                m('option[value=integer]', 'Integer (Pixeles játékokhoz)')
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
                m('option[value=integer]', 'Integer (Egész szorzós)')
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
          m('.lgc-grid-2', { style: 'margin-top: 10px;' }, [
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.gsFullscreen,
                onchange: e => { this.gsFullscreen = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'Teljes képernyő (-f)'),
                m('span.desc', 'Gamescope teljes képernyős módban indul')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.gsAdaptiveSync,
                onchange: e => { this.gsAdaptiveSync = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'Adaptív szinkron (--adaptive-sync)'),
                m('span.desc', 'G-Sync / FreeSync / VRR engedélyezése')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.gsHdr,
                onchange: e => { this.gsHdr = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'HDR támogatás (--hdr-enabled)'),
                m('span.desc', 'Széles dinamikatartomány átadása a kijelzőre')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.gsMangoapp,
                onchange: e => { this.gsMangoapp = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'MangoApp overlay (--mangoapp)'),
                m('span.desc', 'MangoHud közvetlen beágyazása Gamescope alá')
              ])
            ])
          ])
        ])
      ]);
    }

    // 3. Proton fül
    tabProton() {
      return m('div', [
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-toggle-on'), ' Proton Modul Állapot']),
          m('label.lgc-checkbox-item', [
            m('input[type=checkbox]', {
              checked: this.enableProton,
              onchange: e => { this.enableProton = e.target.checked; }
            }),
            m('.lgc-checkbox-label', [
              m('strong', 'Proton környezeti változók hozzáadása a parancshoz'),
              m('span.desc', 'Akkor jelöld be, ha az alábbi beállításokat érvényesíteni szeretnéd.')
            ])
          ])
        ]),
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-file-lines'), ' Naplózás és Hibakeresés']),
          m('label.lgc-checkbox-item', [
            m('input[type=checkbox]', {
              checked: this.prLog,
              onchange: e => { this.prLog = e.target.checked; }
            }),
            m('.lgc-checkbox-label', [
              m('strong', 'PROTON_LOG=1'),
              m('span.desc', 'Hibakeresési naplófájlt generál a ~/steam-<appid>.log helyre.')
            ])
          ]),
          m('.lgc-field', [
            m('label', 'DXVK_HUD (Grafikai OSD mutatók):'),
            m('input[type=text]', {
              placeholder: 'pl. fps,devinfo,compiler vagy full',
              value: this.prDxvkHud,
              oninput: e => { this.prDxvkHud = e.target.value; }
            })
          ])
        ]),
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-microchip'), ' Teljesítmény és Kompatibilitás']),
          m('.lgc-grid-2', [
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.prNvapi,
                onchange: e => { this.prNvapi = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'PROTON_ENABLE_NVAPI=1'),
                m('span.desc', 'Nvidia DLSS, Reflex és sugárkövetés engedélyezése.')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.prDlssUpgrade,
                onchange: e => { this.prDlssUpgrade = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'PROTON_DLSS_UPGRADE=1'),
                m('span.desc', 'Proton beépített újabb DLSS könyvtárának kényszerítése.')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.prHideNvidiaGpu,
                onchange: e => { this.prHideNvidiaGpu = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'PROTON_HIDE_NVIDIA_GPU=1'),
                m('span.desc', 'Nvidia kártya elrejtése a hibás illesztő felismerésű játékok elől.')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.prWayland,
                onchange: e => { this.prWayland = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'PROTON_ENABLE_WAYLAND=1'),
                m('span.desc', 'Kísérleti natív Wayland illesztő Wine/Proton alatt.')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.prForceLaa,
                onchange: e => { this.prForceLaa = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'PROTON_FORCE_LARGE_ADDRESS_AWARE=1'),
                m('span.desc', '32 bites játékoknak engedélyezi a 4 GB memóriaterületet.')
              ])
            ]),
            m('label.lgc-checkbox-item', [
              m('input[type=checkbox]', {
                checked: this.prVkbasalt,
                onchange: e => { this.prVkbasalt = e.target.checked; }
              }),
              m('.lgc-checkbox-label', [
                m('strong', 'ENABLE_VKBASALT=1'),
                m('span.desc', 'vkBasalt Vulkan utófeldolgozó shader réteg aktiválása.')
              ])
            ])
          ]),
          m('.lgc-field', { style: 'margin-top: 10px;' }, [
            m('label', 'Egyéb egyedi környezeti változók / argumentumok:'),
            m('input[type=text]', {
              placeholder: 'pl. PROTON_NO_ESYNC=1 vagy WINEPREFIX=...',
              value: this.prExtraArgs,
              oninput: e => { this.prExtraArgs = e.target.value; }
            })
          ])
        ])
      ]);
    }

    // 4. Wine DLL Overrides fül
    tabDll() {
      const t = (k, def) => (app && app.translator ? app.translator.trans(k) : def);
      return m('div', [
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-toggle-on'), ' DLL Felülbírálás Modul Állapot']),
          m('label.lgc-checkbox-item', [
            m('input[type=checkbox]', {
              checked: this.enableDll,
              onchange: e => { this.enableDll = e.target.checked; }
            }),
            m('.lgc-checkbox-label', [
              m('strong', 'WINEDLLOVERRIDES beillesztése a parancsba'),
              m('span.desc', 'Szükséges ReShade (dxgi), ASI modok (dinput8, version) vagy egyedi DLL-ek betöltéséhez.')
            ])
          ])
        ]),
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-cube'), ' Gyakori Mod- és Grafikai DLL-ek']),
          m('.lgc-dll-list', this.predefinedDlls.map(dll => {
            return m('.lgc-dll-row', [
              m('.lgc-dll-info', [
                m('input[type=checkbox]', {
                  checked: dll.checked,
                  onchange: e => { dll.checked = e.target.checked; }
                }),
                m('strong', dll.name),
                m('span', dll.desc)
              ]),
              m('select', {
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
        ]),
        m('.lgc-section', [
          m('.lgc-section-header', [m('i.fas.fa-plus-circle'), ' Egyedi DLL hozzáadása']),
          m('.lgc-grid-3', [
            m('.lgc-field', [
              m('input[type=text]', {
                placeholder: t('gabeszm-linux-games-commands.forum.dll_name_placeholder', 'DLL neve (pl. version vagy dxgi)'),
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
            }, t('gabeszm-linux-games-commands.forum.add_custom_dll', '+ Egyedi DLL hozzáadása'))
          ]),
          this.customDlls.length > 0 ? m('.lgc-custom-dll-list', { style: 'margin-top: 10px;' }, this.customDlls.map((dll, idx) => {
            return m('.lgc-dll-row', [
              m('.lgc-dll-info', [
                m('input[type=checkbox]', {
                  checked: dll.checked,
                  onchange: e => { dll.checked = e.target.checked; }
                }),
                m('strong', dll.name),
                m('span', 'Egyedi DLL felülbírálás')
              ]),
              m('select', {
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
      ]);
    }

    // 5. Sorrend & Parancs fül
    tabOrder() {
      return m('.lgc-section', [
        m('.lgc-section-header', [m('i.fas.fa-arrow-down-short-wide'), ' Parancssorrend és Futtatás']),
        m('p', { style: 'color: #8b949e; font-size: 0.85rem;' },
          'A parancs automatikusan az alábbi helyes Linux hierarchia szerint kerül összefűzésre:'
        ),
        m('ol', { style: 'color: #c9d1d9; font-size: 0.85rem; padding-left: 20px; line-height: 1.8;' }, [
          m('li', [m('strong[style="color:#58a6ff"]', 'Wrapperek: '), 'gamemoderun, mangohud']),
          m('li', [m('strong[style="color:#d2a8ff"]', 'Kompozitor: '), 'gamescope [argumentumok] --']),
          m('li', [m('strong[style="color:#ffa657"]', 'Környezeti változók: '), 'WINEDLLOVERRIDES="..." PROTON_...=1 DXVK_...=1']),
          m('li', [m('strong[style="color:#7ee787"]', 'Futtató parancs: '), '%command% (vagy a megadott bináris)'])
        ]),
        m('.lgc-field', { style: 'margin-top: 14px;' }, [
          m('label', 'Futtatandó parancs / Steam helyettesítő változó:'),
          m('input[type=text]', {
            value: this.gameCommand,
            oninput: e => { this.gameCommand = e.target.value; },
            placeholder: '%command%'
          })
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

      // Segédfüggvény szövegekhez fallback-kel
      const trans = (k, def) => (app.translator ? app.translator.trans(k) : def);

      // 1. TextEditor (Hozzászólás- és témakészítő eszköztár)
      if (extend && TextEditor && TextEditor.prototype) {
        extend(TextEditor.prototype, 'toolbarItems', function (items) {
          if (app.forum && app.forum.attribute('linuxGamesShowInComposer') === false) return;

          const discussion = app.current ? app.current.get('discussion') : null;
          if (discussion && !isAllowedForDiscussion(discussion)) return;

          items.add('linux-games-commands', m(Button, {
            icon: 'fas fa-gamepad',
            className: 'Button Button--icon Button--link Button-linux-games-commands',
            title: trans('gabeszm-linux-games-commands.forum.toolbar_tooltip', 'Steam & Linux Indítási Parancskészítő'),
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
          }, trans('gabeszm-linux-games-commands.forum.sidebar_button', '🎮 Linux Launch Builder')), 60);
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
          }, trans('gabeszm-linux-games-commands.forum.hero_button', '🎮 Indítási Opciók')), 10);
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
          }, trans('gabeszm-linux-games-commands.forum.sidebar_button', '🎮 Linux Launch Builder')), 10);
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
