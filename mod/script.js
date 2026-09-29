(() => {
  const idb = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;

  // Gyakori DLL-ek listája (közös a main és winedlloverrides oldalak között)
  const PREDEFINED_DLLS = [
    { name: 'd3d11', desc: 'DirectX 11 kompatibilitási könyvtár. DXVK használatakor native,builtin override kell neki.' },
    { name: 'dxgi', desc: 'DirectX Graphics Infrastructure. ReShade, SpecialK és grafikai modok betöltéséhez elengedhetetlen.' },
    { name: 'dinput8', desc: 'DirectInput 8 beviteli modul. Gyakori ASI mod-loader injektorok (pl. GTA, Skyrim modok) használják.' },
    { name: 'version', desc: 'Fájlverzió lekérdező könyvtár. Nagyon népszerű mod-injektorok és ASI betöltők DLL fájljaként.' },
    { name: 'd3d9', desc: 'DirectX 9 kompatibilitási könyvtár (pl. D9VK vagy régebbi grafikai kiegészítők esetében).' },
    { name: 'd3d12', desc: 'DirectX 12 kompatibilitási könyvtár. VKD3D-Proton esetén használatos.' },
    { name: 'd3d12core', desc: 'Direct3D 12 Core könyvtár. Egyes újabb DX12 játékok és mod-loaderek felülbírálásához szükséges.' },
    { name: 'dsound', desc: 'DirectSound hangkönyvtár. Régi hangmodokhoz és 3D audio kiegészítőkhöz használatos.' },
    { name: 'xinput1_3', desc: 'Xbox kontroller API v1.3. Egyedi gamepad emulátorokhoz és kiegészítőkhöz.' },
    { name: 'winmm', desc: 'Windows multimédiás API. Régebbi játékok (pl. zene és média modok) felülbírálásaként használt.' },
    { name: 'openvr_api', desc: 'OpenVR API könyvtár. VR modok (pl. UEVR) betöltéséhez.' },
    { name: 'nvapi64', desc: 'Nvidia 64-bites NVAPI. DLSS és sugárkövetés felülbírálásokhoz Nvidia kártyákon.' }
  ];

  // =========================================================================
  // 1. WINE DLL OVERRIDES PAGE LOGIC
  // =========================================================================
  function initWineDllOverridesPage() {
    // DOM elemek
    const predefinedListContainer = document.getElementById('predefined-dlls-list');
    const customListContainer = document.getElementById('custom-dlls-list');
    const emptyCustomMsg = document.getElementById('empty-custom-msg');
    const outputFormatSelect = document.getElementById('output-format');
    const commandDisplay = document.getElementById('command-display');
    const copyStatus = document.getElementById('copy-status');
    const srAnnouncer = document.getElementById('sr-announcer');
    const activePresetIndicator = document.getElementById('active-preset-indicator');

    const customDllNameInput = document.getElementById('custom-dll-name');
    const customDllTypeSelect = document.getElementById('custom-dll-type');
    const addCustomDllBtn = document.getElementById('add-custom-dll-btn');

    const presetNameInput = document.getElementById('preset-name-input');
    const savePresetBtn = document.getElementById('save-preset-btn');
    const presetsContainer = document.getElementById('presets-container');
    const emptyPresetsMsg = document.getElementById('empty-presets-msg');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const exampleBtn = document.getElementById('example-btn');

    // Állapotkezelők
    let customDlls = []; // [{ name: '...', type: '...', checked: true }]
    let currentPresetName = '';
    let isModified = false;
    let db = null;
    let announceTimeout = null;

    // 1. DINAMIKUS FELÜLET GENERÁLÁS (Gyakori DLL-ek)
    function renderPredefinedDlls() {
      predefinedListContainer.innerHTML = '';
      PREDEFINED_DLLS.forEach(dll => {
        const row = document.createElement('div');
        row.className = 'dll-item-row';
        row.innerHTML = `
          <div class="dll-item-row-header">
            <label class="checkbox-label" style="font-weight: 600;">
              <input type="checkbox" id="chk-pre-${dll.name}" data-dll="${dll.name}" class="predefined-checkbox">
              <span>${dll.name}</span>
              <div class="help-tip">
                <span class="help-tip__trigger" tabindex="0">?</span>
                <span role="tooltip" class="help-tip__content">${dll.desc}</span>
              </div>
            </label>
          </div>
          <div class="dll-item-select-wrapper" id="select-wrapper-pre-${dll.name}">
            <select id="select-pre-${dll.name}" data-dll="${dll.name}" class="predefined-select">
              <option value="n,b" selected>n,b (Native, utána Builtin - ajánlott)</option>
              <option value="b,n">b,n (Builtin, utána Native)</option>
              <option value="n">n (Csak Native)</option>
              <option value="b">b (Csak Builtin)</option>
              <option value="d">d (Disabled / Letiltva)</option>
            </select>
          </div>
        `;
        predefinedListContainer.appendChild(row);

        // Eseménykezelők a megjelenítésre
        const checkbox = row.querySelector('.predefined-checkbox');
        const selectWrapper = row.querySelector('.dll-item-select-wrapper');
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            selectWrapper.classList.add('open');
          } else {
            selectWrapper.classList.remove('open');
          }
          triggerUpdate();
        });

        row.querySelector('.predefined-select').addEventListener('change', triggerUpdate);
      });
    }

    // 2. EGYEDI DLL-EK GENERÁLÁSA ÉS KEZELÉSE
    function renderCustomDlls() {
      customListContainer.innerHTML = '';
      if (customDlls.length === 0) {
        customListContainer.appendChild(emptyCustomMsg);
        return;
      }

      customDlls.forEach((dll, index) => {
        const row = document.createElement('div');
        row.className = 'dll-item-row';
        row.innerHTML = `
          <div class="dll-item-row-header">
            <label class="checkbox-label" style="font-weight: 600;">
              <input type="checkbox" id="chk-cust-${index}" class="custom-checkbox" ${dll.checked ? 'checked' : ''}>
              <span>${dll.name}</span>
            </label>
            <button type="button" class="dll-delete-btn" data-index="${index}">Törlés</button>
          </div>
          <div class="dll-item-select-wrapper ${dll.checked ? 'open' : ''}">
            <select id="select-cust-${index}" class="custom-select">
              <option value="n,b" ${dll.type === 'n,b' ? 'selected' : ''}>n,b (Native, utána Builtin)</option>
              <option value="b,n" ${dll.type === 'b,n' ? 'selected' : ''}>b,n (Builtin, utána Native)</option>
              <option value="n" ${dll.type === 'n' ? 'selected' : ''}>n (Csak Native)</option>
              <option value="b" ${dll.type === 'b' ? 'selected' : ''}>b (Csak Builtin)</option>
              <option value="d" ${dll.type === 'd' ? 'selected' : ''}>d (Disabled / Letiltva)</option>
            </select>
          </div>
        `;
        customListContainer.appendChild(row);

        const checkbox = row.querySelector('.custom-checkbox');
        const selectWrapper = row.querySelector('.dll-item-select-wrapper');
        const select = row.querySelector('.custom-select');
        const deleteBtn = row.querySelector('.dll-delete-btn');

        checkbox.addEventListener('change', () => {
          dll.checked = checkbox.checked;
          if (dll.checked) {
            selectWrapper.classList.add('open');
          } else {
            selectWrapper.classList.remove('open');
          }
          triggerUpdate();
        });

        select.addEventListener('change', () => {
          dll.type = select.value;
          triggerUpdate();
        });

        deleteBtn.addEventListener('click', () => {
          customDlls.splice(index, 1);
          renderCustomDlls();
          triggerUpdate();
        });
      });
    }

    addCustomDllBtn.addEventListener('click', () => {
      let name = customDllNameInput.value.trim().toLowerCase();
      if (name.endsWith('.dll')) {
        name = name.slice(0, -4);
      }

      if (!name) {
        alert('Kérlek adj meg egy DLL nevet!');
        return;
      }

      const existsPredefined = PREDEFINED_DLLS.some(dll => dll.name === name);
      const existsCustom = customDlls.some(dll => dll.name === name);

      if (existsPredefined) {
        alert(`A(z) "${name}" már szerepel a gyakori DLL-ek listáján. Jelöld be ott!`);
        customDllNameInput.value = '';
        return;
      }

      if (existsCustom) {
        alert(`A(z) "${name}" már hozzá van adva az egyedi DLL-ekhez!`);
        customDllNameInput.value = '';
        return;
      }

      const type = customDllTypeSelect.value;
      customDlls.push({ name: name, type: type, checked: true });
      
      customDllNameInput.value = '';
      renderCustomDlls();
      triggerUpdate();
    });

    // 3. PARANCS GENERÁLÁS
    function buildCommand() {
      const overrides = [];

      PREDEFINED_DLLS.forEach(dll => {
        const chk = document.getElementById(`chk-pre-${dll.name}`);
        const sel = document.getElementById(`select-pre-${dll.name}`);
        if (chk && chk.checked && sel) {
          overrides.push(`${dll.name}=${sel.value}`);
        }
      });

      customDlls.forEach(dll => {
        if (dll.checked) {
          overrides.push(`${dll.name}=${dll.type}`);
        }
      });

      const overrideStr = overrides.join(';');
      const format = outputFormatSelect.value;

      if (format === 'steam-command') {
        return overrideStr ? `WINEDLLOVERRIDES="${overrideStr}" %command%` : '%command%';
      } else {
        return overrideStr ? `WINEDLLOVERRIDES="${overrideStr}"` : '';
      }
    }

    function updateCommand() {
      const cmd = buildCommand();
      commandDisplay.textContent = cmd || '(nincs aktív felülbírálás)';
      copyStatus.textContent = '';

      if (announceTimeout) clearTimeout(announceTimeout);
      announceTimeout = setTimeout(() => {
        srAnnouncer.textContent = 'A generált változó frissült.';
      }, 250);

      if (currentPresetName) {
        setModifiedStatus(true);
      }
    }

    function triggerUpdate() {
      updateCommand();
    }

    outputFormatSelect.addEventListener('change', triggerUpdate);

    // 4. SABLON ÁLLAPOT ÉS DEFAULT ÉRTÉKEK
    function setPresetName(name) {
      currentPresetName = name;
      if (name) {
        activePresetIndicator.textContent = ` - Sablon: ${name}`;
      } else {
        activePresetIndicator.textContent = '';
      }
    }

    function setModifiedStatus(modified) {
      isModified = modified;
      if (currentPresetName) {
        activePresetIndicator.textContent = ` - Sablon: ${currentPresetName}${modified ? ' *' : ''}`;
      }
    }

    function resetPresetState() {
      setPresetName('');
      isModified = false;
    }

    function clearForm() {
      PREDEFINED_DLLS.forEach(dll => {
        const chk = document.getElementById(`chk-pre-${dll.name}`);
        const sel = document.getElementById(`select-pre-${dll.name}`);
        const selectWrapper = document.getElementById(`select-wrapper-pre-${dll.name}`);
        if (chk) chk.checked = false;
        if (sel) sel.value = 'n,b';
        if (selectWrapper) selectWrapper.classList.remove('open');
      });

      customDlls = [];
      renderCustomDlls();

      outputFormatSelect.value = 'steam-command';
      resetPresetState();
      updateCommand();
    }

    clearBtn.addEventListener('click', () => {
      if (confirm('Biztosan kiüríted az összes beállítást? A mentett sablonjaid megmaradnak.')) {
        clearForm();
        srAnnouncer.textContent = 'Minden mező alaphelyzetbe állítva.';
      }
    });

    // 5. INDEXEDDB SABLON ADATBÁZIS KEZELÉSE
    if (!idb) {
      console.warn('A böngésző nem támogatja az IndexedDB-t.');
    } else {
      const dbRequest = idb.open('WinedlloverridesPresets', 1);

      dbRequest.onupgradeneeded = (event) => {
        const activeDb = event.target.result;
        if (!activeDb.objectStoreNames.contains('presets')) {
          activeDb.createObjectStore('presets', { keyPath: 'name' });
        }
      };

      dbRequest.onsuccess = (event) => {
        db = event.target.result;
        loadPresetsList();
      };

      dbRequest.onerror = (event) => {
        console.error('Nem sikerült megnyitni a sablon adatbázist:', event.target.error);
      };
    }

    function getPresetsFromDb(callback) {
      if (!db) return callback([]);
      const transaction = db.transaction(['presets'], 'readonly');
      const store = transaction.objectStore('presets');
      const req = store.getAll();
      req.onsuccess = () => callback(req.result);
      req.onerror = () => console.error('Hiba a sablonok lekérésekor');
    }

    function savePresetToDb(presetObj, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      const req = store.put(presetObj);
      req.onsuccess = () => callback();
      req.onerror = () => alert('Hiba történt a sablon mentése során.');
    }

    function deletePresetFromDb(name, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      const req = store.delete(name);
      req.onsuccess = () => callback();
      req.onerror = () => console.error('Hiba a sablon törlésekor:', name);
    }

    function saveMultiplePresetsToDb(presetsArray, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      
      presetsArray.forEach(preset => {
        store.put(preset);
      });

      transaction.oncomplete = () => callback();
      transaction.onerror = () => alert('Hiba történt az importálás során.');
    }

    function applyPresetValues(presetData) {
      PREDEFINED_DLLS.forEach(dll => {
        const chk = document.getElementById(`chk-pre-${dll.name}`);
        const sel = document.getElementById(`select-pre-${dll.name}`);
        const wrapper = document.getElementById(`select-wrapper-pre-${dll.name}`);
        
        const presetDll = presetData.builtinDlls && presetData.builtinDlls[dll.name];
        if (presetDll) {
          if (chk) chk.checked = presetDll.checked;
          if (sel) sel.value = presetDll.type || 'n,b';
          if (wrapper) {
            if (presetDll.checked) wrapper.classList.add('open');
            else wrapper.classList.remove('open');
          }
        } else {
          if (chk) chk.checked = false;
          if (sel) sel.value = 'n,b';
          if (wrapper) wrapper.classList.remove('open');
        }
      });

      customDlls = presetData.customDlls ? JSON.parse(JSON.stringify(presetData.customDlls)) : [];
      renderCustomDlls();

      outputFormatSelect.value = presetData.outputFormat || 'steam-command';
      updateCommand();
    }

    function getPresetDataFromForm() {
      const builtinDlls = {};
      PREDEFINED_DLLS.forEach(dll => {
        const chk = document.getElementById(`chk-pre-${dll.name}`);
        const sel = document.getElementById(`select-pre-${dll.name}`);
        builtinDlls[dll.name] = {
          checked: chk ? chk.checked : false,
          type: sel ? sel.value : 'n,b'
        };
      });

      return {
        builtinDlls: builtinDlls,
        customDlls: customDlls,
        outputFormat: outputFormatSelect.value
      };
    }

    function loadPresetsList() {
      getPresetsFromDb((presets) => {
        presetsContainer.innerHTML = '';
        if (presets.length === 0) {
          presetsContainer.appendChild(emptyPresetsMsg);
          return;
        }

        presets.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'preset-item';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'preset-item-name';
          nameSpan.textContent = item.name;
          nameSpan.title = item.name;

          const actions = document.createElement('div');
          actions.className = 'preset-item-actions';

          const loadBtn = document.createElement('button');
          loadBtn.className = 'btn btn-primary';
          loadBtn.textContent = 'Betöltés';
          loadBtn.setAttribute('aria-label', `Betöltés: ${item.name}`);
          loadBtn.addEventListener('click', () => {
            applyPresetValues(item.preset);
            setPresetName(item.name);
            setModifiedStatus(false);
            srAnnouncer.textContent = `A(z) "${item.name}" sablon sikeresen betöltve.`;
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn btn-danger';
          deleteBtn.textContent = 'Törlés';
          deleteBtn.setAttribute('aria-label', `Törlés: ${item.name}`);
          deleteBtn.addEventListener('click', () => {
            if (confirm(`Biztosan törölni szeretnéd a(z) "${item.name}" nevű sablont?`)) {
              deletePresetFromDb(item.name, () => {
                loadPresetsList();
                if (currentPresetName === item.name) {
                  resetPresetState();
                }
                srAnnouncer.textContent = `A(z) "${item.name}" sablon törölve lett.`;
              });
            }
          });

          actions.appendChild(loadBtn);
          actions.appendChild(deleteBtn);
          row.appendChild(nameSpan);
          row.appendChild(actions);
          presetsContainer.appendChild(row);
        });
      });
    }

    savePresetBtn.addEventListener('click', () => {
      const name = presetNameInput.value.trim();
      if (!name) {
        alert('Kérjük, adj meg egy nevet a sablonnak!');
        return;
      }

      const presetData = getPresetDataFromForm();
      
      savePresetToDb({ name: name, preset: presetData }, () => {
        presetNameInput.value = '';
        loadPresetsList();
        setPresetName(name);
        setModifiedStatus(false);
        srAnnouncer.textContent = `A(z) "${name}" sablon elmentve.`;
      });
    });

    exportBtn.addEventListener('click', () => {
      getPresetsFromDb((presets) => {
        if (presets.length === 0) {
          alert('Nincsenek mentett sablonok az exportáláshoz.');
          return;
        }

        const jsonString = JSON.stringify(presets, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'winedll_sablonok.json';
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        srAnnouncer.textContent = 'A sablonok exportálva JSON fájlba.';
      });
    });

    importBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      
      fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importedData = JSON.parse(e.target.result);
            
            const isValid = Array.isArray(importedData) && importedData.every(item => 
              item && typeof item === 'object' && typeof item.name === 'string' && typeof item.preset === 'object'
            );

            if (!isValid) {
              alert('Érvénytelen fájlformátum.');
              return;
            }

            saveMultiplePresetsToDb(importedData, () => {
              loadPresetsList();
              alert('A sablonok sikeresen importálva!');
              srAnnouncer.textContent = 'Sablonok importálva.';
            });

          } catch (err) {
            alert('Hiba történt a JSON beolvasásakor: ' + err.message);
          }
        };
        reader.readAsText(file);
      });

      fileInput.click();
    });

    const DEMO_PRESET = {
      builtinDlls: {
        d3d11: { checked: true, type: 'n,b' },
        dxgi: { checked: true, type: 'n,b' },
        dinput8: { checked: true, type: 'n' },
        version: { checked: false, type: 'n,b' },
        d3d9: { checked: false, type: 'n,b' },
        d3d12: { checked: false, type: 'n,b' },
        d3d12core: { checked: false, type: 'n,b' },
        dsound: { checked: false, type: 'n,b' },
        xinput1_3: { checked: false, type: 'n,b' },
        winmm: { checked: false, type: 'n,b' },
        openvr_api: { checked: false, type: 'n,b' },
        nvapi64: { checked: false, type: 'n,b' }
      },
      customDlls: [
        { name: 'winhttp', type: 'n,b', checked: true },
        { name: 'ddraw', type: 'd', checked: true }
      ],
      outputFormat: 'steam-command'
    };

    exampleBtn.addEventListener('click', () => {
      applyPresetValues(DEMO_PRESET);
      resetPresetState();
      srAnnouncer.textContent = 'Példa beállítások betöltve.';
    });

    copyBtn.addEventListener('click', async () => {
      const cmdText = buildCommand();
      if (!cmdText || cmdText === '%command%') {
        copyStatus.textContent = 'Nincs aktív felülbírálás a másoláshoz!';
        copyStatus.style.color = 'var(--danger)';
        return;
      }
      try {
        await navigator.clipboard.writeText(cmdText);
        copyStatus.textContent = 'Felülbírálás sikeresen a vágólapra másolva!';
        copyStatus.style.color = 'var(--success)';
        srAnnouncer.textContent = 'Másolva a vágólapra.';
      } catch (err) {
        copyStatus.textContent = 'Hiba a másoláskor. Jelöld ki és másold le manuálisan!';
        copyStatus.style.color = 'var(--danger)';
        console.error('Nem sikerült a vágólapra írni:', err);
      }
    });

    // Inicializálás
    renderPredefinedDlls();
    renderCustomDlls();
    updateCommand();
  }

  // =========================================================================
  // 2. PROTON BUILDER PAGE LOGIC
  // =========================================================================
  function initProtonPage() {
    const fields = {
      protonLogDir: document.getElementById('proton-log-dir'),
      winedebug: document.getElementById('winedebug'),
      dxvkHud: document.getElementById('dxvk-hud'),
      dxvkFrameRate: document.getElementById('dxvk-frame-rate'),
      
      flagProtonLog: document.getElementById('flag-proton-log'),
      flagUseWined3d: document.getElementById('flag-use-wined3d'),
      flagEnableHdr: document.getElementById('flag-enable-hdr'),
      flagEnableNvapi: document.getElementById('flag-enable-nvapi'),
      
      vkd3dConfig: document.getElementById('vkd3d-config'),
      vkd3dDebug: document.getElementById('vkd3d-debug'),
      vkd3dFeatureLevel: document.getElementById('vkd3d-feature-level'),
      dxvkConfigFile: document.getElementById('dxvk-config-file'),
      
      flagNoD3d10: document.getElementById('flag-no-d3d10'),
      flagNoD3d11: document.getElementById('flag-no-d3d11'),
      flagNoD3d12: document.getElementById('flag-no-d3d12'),
      flagNoStateCache: document.getElementById('flag-no-state-cache'),

      mesaVkDeviceSelect: document.getElementById('mesa-vk-device-select'),
      flagNoEsync: document.getElementById('flag-no-esync'),
      flagNoFsync: document.getElementById('flag-no-fsync'),
      flagUseNtsync: document.getElementById('flag-use-ntsync'),
      flagForceLaa: document.getElementById('flag-force-laa'),
      flagHeapDelayFree: document.getElementById('flag-heap-delay-free'),

      wineprefix: document.getElementById('wineprefix'),
      flagGamemoderun: document.getElementById('flag-gamemoderun'),
      flagMangohud: document.getElementById('flag-mangohud'),
      flagVkbasalt: document.getElementById('flag-vkbasalt'),
      flagEnableWayland: document.getElementById('flag-enable-wayland'),
      flagHideNvidiaGpu: document.getElementById('flag-hide-nvidia-gpu'),
      flagDlssUpgrade: document.getElementById('flag-dlss-upgrade'),
      flagDumpDebugCommands: document.getElementById('flag-dump-debug-commands'),

      userLaunchArgs: document.getElementById('user-launch-args'),
      launchCommand: document.getElementById('launch-command')
    };

    const commandDisplay = document.getElementById('command-display');
    const copyStatus = document.getElementById('copy-status');
    const srAnnouncer = document.getElementById('sr-announcer');
    const activePresetIndicator = document.getElementById('active-preset-indicator');

    const presetNameInput = document.getElementById('preset-name-input');
    const savePresetBtn = document.getElementById('save-preset-btn');
    const presetsContainer = document.getElementById('presets-container');
    const emptyPresetsMsg = document.getElementById('empty-presets-msg');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const exampleBtn = document.getElementById('example-btn');

    let currentPresetName = '';
    let isModified = false;
    let db = null;
    let announceTimeout = null;

    document.querySelectorAll('.accordion-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.getAttribute('aria-controls');
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !expanded);
        panel.classList.toggle('open', !expanded);
        
        const accordionWrapper = btn.closest('.accordion');
        if (accordionWrapper) {
          accordionWrapper.classList.toggle('open', !expanded);
        }
      });
    });

    function pushEnvVar(parts, key, value) {
      const clean = String(value || '').trim();
      if (clean) {
        parts.push(`${key}=${clean}`);
      }
    }

    function buildCommand() {
      const parts = [];

      if (fields.flagProtonLog.checked) {
        parts.push('PROTON_LOG=1');
      }
      pushEnvVar(parts, 'PROTON_LOG_DIR', fields.protonLogDir.value);
      pushEnvVar(parts, 'WINEDEBUG', fields.winedebug.value);

      if (fields.flagUseWined3d.checked) {
        parts.push('PROTON_USE_WINED3D=1');
      }
      if (fields.flagEnableHdr.checked) {
        parts.push('PROTON_ENABLE_HDR=1');
      }
      if (fields.flagEnableNvapi.checked) {
        parts.push('PROTON_ENABLE_NVAPI=1');
      }
      pushEnvVar(parts, 'DXVK_HUD', fields.dxvkHud.value);
      pushEnvVar(parts, 'DXVK_FRAME_RATE', fields.dxvkFrameRate.value);

      if (fields.flagNoD3d10.checked) {
        parts.push('PROTON_NO_D3D10=1');
      }
      if (fields.flagNoD3d11.checked) {
        parts.push('PROTON_NO_D3D11=1');
      }
      if (fields.flagNoD3d12.checked) {
        parts.push('PROTON_NO_D3D12=1');
      }
      if (fields.flagNoStateCache.checked) {
        parts.push('DXVK_STATE_CACHE=0');
      }
      pushEnvVar(parts, 'DXVK_CONFIG_FILE', fields.dxvkConfigFile.value);
      pushEnvVar(parts, 'VKD3D_CONFIG', fields.vkd3dConfig.value);
      pushEnvVar(parts, 'VKD3D_DEBUG', fields.vkd3dDebug.value);
      pushEnvVar(parts, 'VKD3D_FEATURE_LEVEL', fields.vkd3dFeatureLevel.value);

      if (fields.flagNoEsync.checked) {
        parts.push('PROTON_NO_ESYNC=1');
      }
      if (fields.flagNoFsync.checked) {
        parts.push('PROTON_NO_FSYNC=1');
      }
      if (fields.flagUseNtsync.checked) {
        parts.push('PROTON_USE_NTSYNC=1');
      }
      if (fields.flagForceLaa.checked) {
        parts.push('PROTON_FORCE_LARGE_ADDRESS_AWARE=1');
      }
      if (fields.flagHeapDelayFree.checked) {
        parts.push('PROTON_HEAP_DELAY_FREE=1');
      }
      pushEnvVar(parts, 'MESA_VK_DEVICE_SELECT', fields.mesaVkDeviceSelect.value);

      if (fields.flagHideNvidiaGpu.checked) {
        parts.push('PROTON_HIDE_NVIDIA_GPU=1');
      }
      if (fields.flagDlssUpgrade.checked) {
        parts.push('PROTON_DLSS_UPGRADE=1');
      }
      if (fields.flagDumpDebugCommands.checked) {
        parts.push('PROTON_DUMP_DEBUG_COMMANDS=1');
      }
      if (fields.flagEnableWayland.checked) {
        parts.push('PROTON_ENABLE_WAYLAND=1');
      }
      pushEnvVar(parts, 'WINEPREFIX', fields.wineprefix.value);
      
      if (fields.flagVkbasalt.checked) {
        parts.push('ENABLE_VKBASALT=1');
      }

      const userLaunch = String(fields.userLaunchArgs.value || '').trim();
      if (userLaunch) {
        parts.push(userLaunch);
      }

      if (fields.flagGamemoderun.checked) {
        parts.push('gamemoderun');
      }
      if (fields.flagMangohud.checked) {
        parts.push('mangohud');
      }

      const gameCmd = String(fields.launchCommand.value || '').trim() || '%command%';
      parts.push(gameCmd);

      return parts.join(' ');
    }

    function updateCommand() {
      const cmd = buildCommand();
      commandDisplay.textContent = cmd;
      copyStatus.textContent = '';

      if (announceTimeout) clearTimeout(announceTimeout);
      announceTimeout = setTimeout(() => {
        srAnnouncer.textContent = 'A generált parancs frissült.';
      }, 250);

      if (currentPresetName) {
        setModifiedStatus(true);
      }
    }

    function triggerUpdate() {
      updateCommand();
    }

    const allInputs = document.querySelectorAll('#builder-form input, #builder-form select, #builder-form textarea');
    allInputs.forEach(input => {
      input.addEventListener('input', triggerUpdate);
      input.addEventListener('change', triggerUpdate);
    });

    function setPresetName(name) {
      currentPresetName = name;
      if (name) {
        activePresetIndicator.textContent = ` - Sablon: ${name}`;
      } else {
        activePresetIndicator.textContent = '';
      }
    }

    function setModifiedStatus(modified) {
      isModified = modified;
      if (currentPresetName) {
        activePresetIndicator.textContent = ` - Sablon: ${currentPresetName}${modified ? ' *' : ''}`;
      }
    }

    function resetPresetState() {
      setPresetName('');
      isModified = false;
    }

    const DEFAULT_VALUES = {
      protonLogDir: '',
      winedebug: '',
      dxvkHud: '',
      dxvkFrameRate: '',
      flagProtonLog: false,
      flagUseWined3d: false,
      flagEnableHdr: false,
      flagEnableNvapi: false,
      vkd3dConfig: '',
      vkd3dDebug: '',
      vkd3dFeatureLevel: '',
      dxvkConfigFile: '',
      flagNoD3d10: false,
      flagNoD3d11: false,
      flagNoD3d12: false,
      flagNoStateCache: false,
      mesaVkDeviceSelect: '',
      flagNoEsync: false,
      flagNoFsync: false,
      flagUseNtsync: false,
      flagForceLaa: false,
      flagHeapDelayFree: false,
      wineprefix: '',
      flagGamemoderun: false,
      flagMangohud: false,
      flagVkbasalt: false,
      flagEnableWayland: false,
      flagHideNvidiaGpu: false,
      flagDlssUpgrade: false,
      flagDumpDebugCommands: false,
      userLaunchArgs: '',
      launchCommand: '%command%'
    };

    if (!idb) {
      console.warn('A böngésző nem támogatja az IndexedDB-t. A mentési funkciók korlátozottak lesznek.');
    } else {
      const dbRequest = idb.open('ProtonPresets', 1);

      dbRequest.onupgradeneeded = (event) => {
        const activeDb = event.target.result;
        if (!activeDb.objectStoreNames.contains('presets')) {
          activeDb.createObjectStore('presets', { keyPath: 'name' });
        }
      };

      dbRequest.onsuccess = (event) => {
        db = event.target.result;
        loadPresetsList();
      };

      dbRequest.onerror = (event) => {
        console.error('Nem sikerült megnyitni a sablon adatbázist:', event.target.error);
      };
    }

    function getPresetsFromDb(callback) {
      if (!db) return callback([]);
      const transaction = db.transaction(['presets'], 'readonly');
      const store = transaction.objectStore('presets');
      const req = store.getAll();
      req.onsuccess = () => callback(req.result);
      req.onerror = () => console.error('Hiba a sablonok lekérésekor');
    }

    function savePresetToDb(presetObj, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      const req = store.put(presetObj);
      req.onsuccess = () => callback();
      req.onerror = () => alert('Hiba történt a sablon mentése során.');
    }

    function deletePresetFromDb(name, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      const req = store.delete(name);
      req.onsuccess = () => callback();
      req.onerror = () => console.error('Hiba a sablon törlésekor:', name);
    }

    function saveMultiplePresetsToDb(presetsArray, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      
      presetsArray.forEach(preset => {
        store.put(preset);
      });

      transaction.oncomplete = () => callback();
      transaction.onerror = () => alert('Hiba történt az importálás során.');
    }

    function applyPresetValues(presetData) {
      const merged = { ...DEFAULT_VALUES, ...presetData };

      fields.protonLogDir.value = merged.protonLogDir;
      fields.winedebug.value = merged.winedebug;
      fields.dxvkHud.value = merged.dxvkHud;
      fields.dxvkFrameRate.value = merged.dxvkFrameRate;
      
      fields.flagProtonLog.checked = Boolean(merged.flagProtonLog);
      fields.flagUseWined3d.checked = Boolean(merged.flagUseWined3d);
      fields.flagEnableHdr.checked = Boolean(merged.flagEnableHdr);
      fields.flagEnableNvapi.checked = Boolean(merged.flagEnableNvapi);
      
      fields.vkd3dConfig.value = merged.vkd3dConfig;
      fields.vkd3dDebug.value = merged.vkd3dDebug;
      fields.vkd3dFeatureLevel.value = merged.vkd3dFeatureLevel;
      fields.dxvkConfigFile.value = merged.dxvkConfigFile;
      
      fields.flagNoD3d10.checked = Boolean(merged.flagNoD3d10);
      fields.flagNoD3d11.checked = Boolean(merged.flagNoD3d11);
      fields.flagNoD3d12.checked = Boolean(merged.flagNoD3d12);
      fields.flagNoStateCache.checked = Boolean(merged.flagNoStateCache);

      fields.mesaVkDeviceSelect.value = merged.mesaVkDeviceSelect;
      fields.flagNoEsync.checked = Boolean(merged.flagNoEsync);
      fields.flagNoFsync.checked = Boolean(merged.flagNoFsync);
      fields.flagUseNtsync.checked = Boolean(merged.flagUseNtsync);
      fields.flagForceLaa.checked = Boolean(merged.flagForceLaa);
      fields.flagHeapDelayFree.checked = Boolean(merged.flagHeapDelayFree);

      fields.wineprefix.value = merged.wineprefix;
      fields.flagGamemoderun.checked = Boolean(merged.flagGamemoderun);
      fields.flagMangohud.checked = Boolean(merged.flagMangohud);
      fields.flagVkbasalt.checked = Boolean(merged.flagVkbasalt);
      fields.flagEnableWayland.checked = Boolean(merged.flagEnableWayland);
      fields.flagHideNvidiaGpu.checked = Boolean(merged.flagHideNvidiaGpu);
      fields.flagDlssUpgrade.checked = Boolean(merged.flagDlssUpgrade);
      fields.flagDumpDebugCommands.checked = Boolean(merged.flagDumpDebugCommands);

      fields.userLaunchArgs.value = merged.userLaunchArgs;
      fields.launchCommand.value = merged.launchCommand;

      updateCommand();
    }

    function getPresetDataFromForm() {
      return {
        protonLogDir: fields.protonLogDir.value,
        winedebug: fields.winedebug.value,
        dxvkHud: fields.dxvkHud.value,
        dxvkFrameRate: fields.dxvkFrameRate.value,
        
        flagProtonLog: fields.flagProtonLog.checked,
        flagUseWined3d: fields.flagUseWined3d.checked,
        flagEnableHdr: fields.flagEnableHdr.checked,
        flagEnableNvapi: fields.flagEnableNvapi.checked,
        
        vkd3dConfig: fields.vkd3dConfig.value,
        vkd3dDebug: fields.vkd3dDebug.value,
        vkd3dFeatureLevel: fields.vkd3dFeatureLevel.value,
        dxvkConfigFile: fields.dxvkConfigFile.value,
        
        flagNoD3d10: fields.flagNoD3d10.checked,
        flagNoD3d11: fields.flagNoD3d11.checked,
        flagNoD3d12: fields.flagNoD3d12.checked,
        flagNoStateCache: fields.flagNoStateCache.checked,

        mesaVkDeviceSelect: fields.mesaVkDeviceSelect.value,
        flagNoEsync: fields.flagNoEsync.checked,
        flagNoFsync: fields.flagNoFsync.checked,
        flagUseNtsync: fields.flagUseNtsync.checked,
        flagForceLaa: fields.flagForceLaa.checked,
        flagHeapDelayFree: fields.flagHeapDelayFree.checked,

        wineprefix: fields.wineprefix.value,
        flagGamemoderun: fields.flagGamemoderun.checked,
        flagMangohud: fields.flagMangohud.checked,
        flagVkbasalt: fields.flagVkbasalt.checked,
        flagEnableWayland: fields.flagEnableWayland.checked,
        flagHideNvidiaGpu: fields.flagHideNvidiaGpu.checked,
        flagDlssUpgrade: fields.flagDlssUpgrade.checked,
        flagDumpDebugCommands: fields.flagDumpDebugCommands.checked,

        userLaunchArgs: fields.userLaunchArgs.value,
        launchCommand: fields.launchCommand.value
      };
    }

    function loadPresetsList() {
      getPresetsFromDb((presets) => {
        presetsContainer.innerHTML = '';

        if (presets.length === 0) {
          presetsContainer.appendChild(emptyPresetsMsg);
          return;
        }

        presets.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'preset-item';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'preset-item-name';
          nameSpan.textContent = item.name;
          nameSpan.title = item.name;

          const actions = document.createElement('div');
          actions.className = 'preset-item-actions';

          const loadBtn = document.createElement('button');
          loadBtn.className = 'btn btn-primary';
          loadBtn.textContent = 'Betöltés';
          loadBtn.setAttribute('aria-label', `Betöltés: ${item.name}`);
          loadBtn.addEventListener('click', () => {
            applyPresetValues(item.preset);
            setPresetName(item.name);
            setModifiedStatus(false);
            srAnnouncer.textContent = `A(z) "${item.name}" sablon sikeresen betöltve.`;
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn btn-danger';
          deleteBtn.textContent = 'Törlés';
          deleteBtn.setAttribute('aria-label', `Törlés: ${item.name}`);
          deleteBtn.addEventListener('click', () => {
            if (confirm(`Biztosan törölni szeretnéd a(z) "${item.name}" nevű sablont?`)) {
              deletePresetFromDb(item.name, () => {
                loadPresetsList();
                if (currentPresetName === item.name) {
                  resetPresetState();
                }
                srAnnouncer.textContent = `A(z) "${item.name}" sablon törölve lett.`;
              });
            }
          });

          actions.appendChild(loadBtn);
          actions.appendChild(deleteBtn);
          row.appendChild(nameSpan);
          row.appendChild(actions);
          presetsContainer.appendChild(row);
        });
      });
    }

    savePresetBtn.addEventListener('click', () => {
      const name = presetNameInput.value.trim();
      if (!name) {
        alert('Kérjük, adj meg egy nevet a sablonnak!');
        return;
      }

      const presetData = getPresetDataFromForm();
      
      savePresetToDb({ name: name, preset: presetData }, () => {
        presetNameInput.value = '';
        loadPresetsList();
        setPresetName(name);
        setModifiedStatus(false);
        srAnnouncer.textContent = `A(z) "${name}" sablon sikeresen elmentve.`;
      });
    });

    clearBtn.addEventListener('click', () => {
      if (confirm('Biztosan kiüríted az összes mezőt? A mentett sablonjaid nem fognak törlődni.')) {
        applyPresetValues(DEFAULT_VALUES);
        resetPresetState();
        srAnnouncer.textContent = 'Minden mező alapértelmezett értékre állítva.';
      }
    });

    exportBtn.addEventListener('click', () => {
      getPresetsFromDb((presets) => {
        if (presets.length === 0) {
          alert('Nincsenek mentett sablonok az exportáláshoz.');
          return;
        }

        const jsonString = JSON.stringify(presets, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'proton_sablonok.json';
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        srAnnouncer.textContent = 'A sablonok sikeresen exportálva JSON fájlba.';
      });
    });

    importBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      
      fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importedData = JSON.parse(e.target.result);
            
            const isValid = Array.isArray(importedData) && importedData.every(item => 
              item && typeof item === 'object' && typeof item.name === 'string' && typeof item.preset === 'object'
            );

            if (!isValid) {
              alert('Érvénytelen fájlformátum. Az importálandó fájlnak egy sablon-tömböt kell tartalmaznia.');
              return;
            }

            saveMultiplePresetsToDb(importedData, () => {
              loadPresetsList();
              alert('A sablonok sikeresen importálva!');
              srAnnouncer.textContent = 'Sablonok sikeresen importálva.';
            });

          } catch (err) {
            alert('Hiba történt a JSON fájl beolvasása során: ' + err.message);
          }
        };
        reader.readAsText(file);
      });

      fileInput.click();
    });

    const DEMO_PRESET = {
      protonLogDir: '/tmp',
      winedebug: '-all',
      dxvkHud: 'fps',
      dxvkFrameRate: '144',
      flagProtonLog: true,
      flagUseWined3d: false,
      flagEnableHdr: true,
      flagEnableNvapi: true,
      vkd3dConfig: 'dxr11,dxr',
      vkd3dDebug: 'none',
      vkd3dFeatureLevel: '12_1',
      dxvkConfigFile: '',
      flagNoD3d10: false,
      flagNoD3d11: false,
      flagNoD3d12: false,
      flagNoStateCache: false,
      mesaVkDeviceSelect: '1002:7300',
      flagNoEsync: false,
      flagNoFsync: false,
      flagUseNtsync: true,
      flagForceLaa: false,
      flagHeapDelayFree: false,
      wineprefix: '',
      flagGamemoderun: true,
      flagMangohud: true,
      flagVkbasalt: false,
      flagEnableWayland: false,
      flagHideNvidiaGpu: false,
      flagDlssUpgrade: true,
      flagDumpDebugCommands: false,
      userLaunchArgs: 'PROTON_NO_WRITE_WATCH=1',
      launchCommand: '%command%'
    };

    exampleBtn.addEventListener('click', () => {
      applyPresetValues(DEMO_PRESET);
      resetPresetState();
      srAnnouncer.textContent = 'Példa beállítások betöltve.';
    });

    copyBtn.addEventListener('click', async () => {
      const cmdText = buildCommand();
      try {
        await navigator.clipboard.writeText(cmdText);
        copyStatus.textContent = 'Parancs sikeresen a vágólapra másolva!';
        copyStatus.style.color = 'var(--success)';
        srAnnouncer.textContent = 'A parancs másolva a vágólapra.';
      } catch (err) {
        copyStatus.textContent = 'Hiba a másoláskor. Jelöld ki és másold le manuálisan!';
        copyStatus.style.color = 'var(--danger)';
        console.error('Nem sikerült a vágólapra írni:', err);
      }
    });

    applyPresetValues(DEFAULT_VALUES);
    resetPresetState();
  }

  // =========================================================================
  // 3. GAMESCOPE BUILDER PAGE LOGIC
  // =========================================================================
  function initGamescopePage() {
    const fields = {
      gameWidth: document.getElementById('game-width'),
      gameHeight: document.getElementById('game-height'),
      outputWidth: document.getElementById('output-width'),
      outputHeight: document.getElementById('output-height'),
      fpsLimit: document.getElementById('fps-limit'),
      fpsUnfocused: document.getElementById('fps-unfocused'),
      scalingMode: document.getElementById('scaling-mode'),
      upscalerType: document.getElementById('upscaler-type'),
      displayIndex: document.getElementById('display-index'),
      
      flagFullscreen: document.getElementById('flag-fullscreen'),
      flagBorderless: document.getElementById('flag-borderless'),
      flagImmediate: document.getElementById('flag-immediate'),
      flagMangoapp: document.getElementById('flag-mangoapp'),
      flagExposeWayland: document.getElementById('flag-expose-wayland'),
      flagHdr: document.getElementById('flag-hdr'),
      flagAdaptiveSync: document.getElementById('flag-adaptive-sync'),
      flagGrabCursor: document.getElementById('flag-grab-cursor'),
      flagGrabKeyboard: document.getElementById('flag-grab-keyboard'),
      
      prependedValues: document.getElementById('prepended-values'),
      extraArgs: document.getElementById('extra-args'),
      launchCommand: document.getElementById('launch-command'),

      maxScale: document.getElementById('max-scale'),
      fsrSharpness: document.getElementById('fsr-sharpness'),
      readyFd: document.getElementById('ready-fd'),
      flagRt: document.getElementById('flag-rt'),
      flagSteam: document.getElementById('flag-steam'),

      resolutionPreset: document.getElementById('resolution-preset'),
      outputPreset: document.getElementById('output-preset'),

      mouseSensitivity: document.getElementById('mouse-sensitivity'),
      backend: document.getElementById('backend'),
      cursorPath: document.getElementById('cursor-path'),
      statsPath: document.getElementById('stats-path'),
      hideCursorDelay: document.getElementById('hide-cursor-delay'),
      xwaylandCount: document.getElementById('xwayland-count'),
      preferVkDevice: document.getElementById('prefer-vk-device'),
      forceOrientation: document.getElementById('force-orientation'),
      flagForceWindowsFullscreen: document.getElementById('flag-force-windows-fullscreen'),
      cursorScaleHeight: document.getElementById('cursor-scale-height'),
      virtualConnectorStrategy: document.getElementById('virtual-connector-strategy'),
      framerateLimit: document.getElementById('framerate-limit'),
      flagDisableKeybinds: document.getElementById('flag-disable-keybinds'),
      flagTouchGestureTranslation: document.getElementById('flag-touch-gesture-translation'),

      sdrGamutWideness: document.getElementById('sdr-gamut-wideness'),
      hdrSdrContentNits: document.getElementById('hdr-sdr-content-nits'),
      flagHdrItmEnabled: document.getElementById('flag-hdr-itm-enabled'),
      hdrItmSdrNits: document.getElementById('hdr-itm-sdr-nits'),
      hdrItmTargetNits: document.getElementById('hdr-itm-target-nits'),

      preferOutput: document.getElementById('prefer-output'),
      defaultTouchMode: document.getElementById('default-touch-mode'),
      generateDrmMode: document.getElementById('generate-drm-mode'),

      vrOverlayKey: document.getElementById('vr-overlay-key'),
      vrAppOverlayKey: document.getElementById('vr-app-overlay-key'),
      vrOverlayExplicitName: document.getElementById('vr-overlay-explicit-name'),
      vrOverlayDefaultName: document.getElementById('vr-overlay-default-name'),
      vrOverlayIcon: document.getElementById('vr-overlay-icon'),
      vrScrollsSpeed: document.getElementById('vr-scrolls-speed'),
      flagVrOverlayShowImmediately: document.getElementById('flag-vr-overlay-show-immediately'),
      flagVrOverlayEnableControlBar: document.getElementById('flag-vr-overlay-enable-control-bar'),
      flagVrOverlayEnableControlBarKeyboard: document.getElementById('flag-vr-overlay-enable-control-bar-keyboard'),
      flagVrOverlayEnableControlBarClose: document.getElementById('flag-vr-overlay-enable-control-bar-close'),
      flagVrOverlayEnableClickStabilization: document.getElementById('flag-vr-overlay-enable-click-stabilization'),
      flagVrOverlayModal: document.getElementById('flag-vr-overlay-modal'),
      vrOverlayPhysicalWidth: document.getElementById('vr-overlay-physical-width'),
      vrOverlayPhysicalCurvature: document.getElementById('vr-overlay-physical-curvature'),
      vrOverlayPhysicalPreCurvePitch: document.getElementById('vr-overlay-physical-pre-curve-pitch'),

      flagDisableLayers: document.getElementById('flag-disable-layers'),
      flagDebugLayers: document.getElementById('flag-debug-layers'),
      flagDebugFocus: document.getElementById('flag-debug-focus'),
      flagSynchronousX11: document.getElementById('flag-synchronous-x11'),
      flagDebugHud: document.getElementById('flag-debug-hud'),
      flagDebugEvents: document.getElementById('flag-debug-events'),
      flagForceComposition: document.getElementById('flag-force-composition'),
      flagCompositeDebug: document.getElementById('flag-composite-debug'),
      flagDisableColorManagement: document.getElementById('flag-disable-color-management'),
      flagDisableXres: document.getElementById('flag-disable-xres'),
      flagHdrDebugForceSupport: document.getElementById('flag-hdr-debug-force-support'),
      flagHdrDebugForceOutput: document.getElementById('flag-hdr-debug-force-output'),
      flagHdrDebugHeatmap: document.getElementById('flag-hdr-debug-heatmap'),

      reshadeEffect: document.getElementById('reshade-effect'),
      reshadeTechniqueIdx: document.getElementById('reshade-technique-idx'),

      muraMap: document.getElementById('mura-map'),

      flagAllowDeferredBackend: document.getElementById('flag-allow-deferred-backend'),
      flagKeepAlive: document.getElementById('flag-keep-alive')
    };

    const commandDisplay = document.getElementById('command-display');
    const copyStatus = document.getElementById('copy-status');
    const srAnnouncer = document.getElementById('sr-announcer');
    const activePresetIndicator = document.getElementById('active-preset-indicator');

    const maxScaleValDisplay = document.getElementById('max-scale-val');
    const fsrSharpnessValDisplay = document.getElementById('fsr-sharpness-val');

    const presetNameInput = document.getElementById('preset-name-input');
    const savePresetBtn = document.getElementById('save-preset-btn');
    const presetsContainer = document.getElementById('presets-container');
    const emptyPresetsMsg = document.getElementById('empty-presets-msg');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const exampleBtn = document.getElementById('example-btn');

    let currentPresetName = '';
    let isModified = false;
    let db = null;
    let announceTimeout = null;

    document.querySelectorAll('.accordion-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.getAttribute('aria-controls');
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !expanded);
        panel.classList.toggle('open', !expanded);
        
        const accordionWrapper = btn.closest('.accordion');
        if (accordionWrapper) {
          accordionWrapper.classList.toggle('open', !expanded);
        }
      });
    });

    fields.maxScale.addEventListener('input', () => {
      const val = fields.maxScale.value;
      maxScaleValDisplay.textContent = val === '0' ? 'Kikapcsolva' : `${val}x`;
      triggerUpdate();
    });

    fields.fsrSharpness.addEventListener('input', () => {
      fsrSharpnessValDisplay.textContent = fields.fsrSharpness.value;
      triggerUpdate();
    });

    function pushPair(parts, flag, value) {
      const clean = String(value || '').trim();
      if (clean) {
        parts.push(flag, clean);
      }
    }

    function pushFlag(parts, flag, enabled) {
      if (enabled) {
        parts.push(flag);
      }
    }

    function buildCommand() {
      const parts = ['gamescope'];

      pushPair(parts, '-w', fields.gameWidth.value);
      pushPair(parts, '-h', fields.gameHeight.value);
      pushPair(parts, '-W', fields.outputWidth.value);
      pushPair(parts, '-H', fields.outputHeight.value);
      
      pushPair(parts, '-r', fields.fpsLimit.value);
      pushPair(parts, '-o', fields.fpsUnfocused.value);
      
      pushPair(parts, '-S', fields.scalingMode.value);
      pushPair(parts, '-F', fields.upscalerType.value);

      const dispIdx = String(fields.displayIndex.value || '').trim();
      if (dispIdx && dispIdx !== '-1') {
        pushPair(parts, '--display-index', dispIdx);
      }

      pushFlag(parts, '-f', fields.flagFullscreen.checked);
      pushFlag(parts, '-b', fields.flagBorderless.checked);
      pushFlag(parts, '--immediate-flips', fields.flagImmediate.checked);
      pushFlag(parts, '--mangoapp', fields.flagMangoapp.checked);
      pushFlag(parts, '--expose-wayland', fields.flagExposeWayland.checked);
      pushFlag(parts, '--hdr-enabled', fields.flagHdr.checked);
      pushFlag(parts, '--adaptive-sync', fields.flagAdaptiveSync.checked);
      pushFlag(parts, '--force-grab-cursor', fields.flagGrabCursor.checked);
      pushFlag(parts, '--grab', fields.flagGrabKeyboard.checked);

      const maxScaleVal = Number(fields.maxScale.value || 0);
      if (maxScaleVal > 0) {
        pushPair(parts, '--max-scale', maxScaleVal);
      }

      const sharpnessVal = String(fields.fsrSharpness.value || '').trim();
      if (sharpnessVal && sharpnessVal !== '2') {
        pushPair(parts, '--fsr-sharpness', sharpnessVal);
      }

      const fdVal = String(fields.readyFd.value || '').trim();
      if (fdVal && fdVal !== '-1') {
        pushPair(parts, '--ready-fd', fdVal);
      }

      pushFlag(parts, '--rt', fields.flagRt.checked);
      pushFlag(parts, '-e', fields.flagSteam.checked);

      pushPair(parts, '-s', fields.mouseSensitivity.value);
      pushPair(parts, '--backend', fields.backend.value);
      pushPair(parts, '--cursor', fields.cursorPath.value);
      pushPair(parts, '-T', fields.statsPath.value);
      pushPair(parts, '-C', fields.hideCursorDelay.value);
      pushPair(parts, '--xwayland-count', fields.xwaylandCount.value);
      pushPair(parts, '--prefer-vk-device', fields.preferVkDevice.value);
      pushPair(parts, '--force-orientation', fields.forceOrientation.value);
      pushFlag(parts, '--force-windows-fullscreen', fields.flagForceWindowsFullscreen.checked);
      pushPair(parts, '--cursor-scale-height', fields.cursorScaleHeight.value);
      pushPair(parts, '--virtual-connector-strategy', fields.virtualConnectorStrategy.value);
      pushPair(parts, '--framerate-limit', fields.framerateLimit.value);
      pushFlag(parts, '-k', fields.flagDisableKeybinds.checked);
      pushFlag(parts, '--touch-gesture-translation', fields.flagTouchGestureTranslation.checked);

      pushPair(parts, '--sdr-gamut-wideness', fields.sdrGamutWideness.value);
      pushPair(parts, '--hdr-sdr-content-nits', fields.hdrSdrContentNits.value);
      pushFlag(parts, '--hdr-itm-enabled', fields.flagHdrItmEnabled.checked);
      pushPair(parts, '--hdr-itm-sdr-nits', fields.hdrItmSdrNits.value);
      pushPair(parts, '--hdr-itm-target-nits', fields.hdrItmTargetNits.value);

      pushPair(parts, '-O', fields.preferOutput.value);
      pushPair(parts, '--default-touch-mode', fields.defaultTouchMode.value);
      pushPair(parts, '--generate-drm-mode', fields.generateDrmMode.value);

      pushPair(parts, '--vr-overlay-key', fields.vrOverlayKey.value);
      pushPair(parts, '--vr-app-overlay-key', fields.vrAppOverlayKey.value);
      pushPair(parts, '--vr-overlay-explicit-name', fields.vrOverlayExplicitName.value);
      pushPair(parts, '--vr-overlay-default-name', fields.vrOverlayDefaultName.value);
      pushPair(parts, '--vr-overlay-icon', fields.vrOverlayIcon.value);
      pushPair(parts, '--vr-scrolls-speed', fields.vrScrollsSpeed.value);
      pushFlag(parts, '--vr-overlay-show-immediately', fields.flagVrOverlayShowImmediately.checked);
      pushFlag(parts, '--vr-overlay-enable-control-bar', fields.flagVrOverlayEnableControlBar.checked);
      pushFlag(parts, '--vr-overlay-enable-control-bar-keyboard', fields.flagVrOverlayEnableControlBarKeyboard.checked);
      pushFlag(parts, '--vr-overlay-enable-control-bar-close', fields.flagVrOverlayEnableControlBarClose.checked);
      pushFlag(parts, '--vr-overlay-enable-click-stabilization', fields.flagVrOverlayEnableClickStabilization.checked);
      pushFlag(parts, '--vr-overlay-modal', fields.flagVrOverlayModal.checked);
      pushPair(parts, '--vr-overlay-physical-width', fields.vrOverlayPhysicalWidth.value);
      pushPair(parts, '--vr-overlay-physical-curvature', fields.vrOverlayPhysicalCurvature.value);
      pushPair(parts, '--vr-overlay-physical-pre-curve-pitch', fields.vrOverlayPhysicalPreCurvePitch.value);

      pushFlag(parts, '--disable-layers', fields.flagDisableLayers.checked);
      pushFlag(parts, '--debug-layers', fields.flagDebugLayers.checked);
      pushFlag(parts, '--debug-focus', fields.flagDebugFocus.checked);
      pushFlag(parts, '--synchronous-x11', fields.flagSynchronousX11.checked);
      pushFlag(parts, '--debug-hud', fields.flagDebugHud.checked);
      pushFlag(parts, '--debug-events', fields.flagDebugEvents.checked);
      pushFlag(parts, '--force-composition', fields.flagForceComposition.checked);
      pushFlag(parts, '--composite-debug', fields.flagCompositeDebug.checked);
      pushFlag(parts, '--disable-color-management', fields.flagDisableColorManagement.checked);
      pushFlag(parts, '--disable-xres', fields.flagDisableXres.checked);
      pushFlag(parts, '--hdr-debug-force-support', fields.flagHdrDebugForceSupport.checked);
      pushFlag(parts, '--hdr-debug-force-output', fields.flagHdrDebugForceOutput.checked);
      pushFlag(parts, '--hdr-debug-heatmap', fields.flagHdrDebugHeatmap.checked);

      pushPair(parts, '--reshade-effect', fields.reshadeEffect.value);
      pushPair(parts, '--reshade-technique-idx', fields.reshadeTechniqueIdx.value);

      pushPair(parts, '--mura-map', fields.muraMap.value);

      pushFlag(parts, '--allow-deferred-backend', fields.flagAllowDeferredBackend.checked);
      pushFlag(parts, '--keep-alive', fields.flagKeepAlive.checked);

      const prependVal = String(fields.prependedValues.value || '').trim();
      if (prependVal) {
        parts.unshift(...prependVal.split(/\s+/));
      }

      const extraVal = String(fields.extraArgs.value || '').trim();
      if (extraVal) {
        parts.push(...extraVal.split(/\s+/));
      }

      const gameCmd = String(fields.launchCommand.value || '').trim() || '%command%';
      parts.push('--', gameCmd);

      return parts.join(' ');
    }

    function updateCommand() {
      const cmd = buildCommand();
      commandDisplay.textContent = cmd;
      copyStatus.textContent = '';

      if (announceTimeout) clearTimeout(announceTimeout);
      announceTimeout = setTimeout(() => {
        srAnnouncer.textContent = 'A generált parancs frissült.';
      }, 250);

      if (currentPresetName) {
        setModifiedStatus(true);
      }
    }

    function triggerUpdate() {
      updateCommand();
    }

    const allInputs = document.querySelectorAll('#builder-form input, #builder-form select, #builder-form textarea');
    allInputs.forEach(input => {
      input.addEventListener('input', triggerUpdate);
      input.addEventListener('change', triggerUpdate);
    });

    fields.resolutionPreset.addEventListener('change', function() {
      if (this.value) {
        const [w, h] = this.value.split('x');
        fields.gameWidth.value = w;
        fields.gameHeight.value = h;
        triggerUpdate();
      }
    });

    fields.outputPreset.addEventListener('change', function() {
      if (this.value) {
        const [w, h] = this.value.split('x');
        fields.outputWidth.value = w;
        fields.outputHeight.value = h;
        triggerUpdate();
      }
    });

    function setPresetName(name) {
      currentPresetName = name;
      if (name) {
        activePresetIndicator.textContent = ` - Sablon: ${name}`;
      } else {
        activePresetIndicator.textContent = '';
      }
    }

    function setModifiedStatus(modified) {
      isModified = modified;
      if (currentPresetName) {
        activePresetIndicator.textContent = ` - Sablon: ${currentPresetName}${modified ? ' *' : ''}`;
      }
    }

    function resetPresetState() {
      setPresetName('');
      isModified = false;
    }

    const DEFAULT_VALUES = {
      gameWidth: '',
      gameHeight: '',
      outputWidth: '',
      outputHeight: '',
      fpsLimit: '',
      fpsUnfocused: '',
      scalingMode: '',
      upscalerType: '',
      displayIndex: '-1',
      flagFullscreen: false,
      flagBorderless: false,
      flagImmediate: false,
      flagMangoapp: false,
      flagExposeWayland: false,
      flagHdr: false,
      flagAdaptiveSync: false,
      flagGrabCursor: false,
      flagGrabKeyboard: false,
      prependedValues: '',
      extraArgs: '',
      launchCommand: '%command%',
      maxScale: '0',
      fsrSharpness: '2',
      readyFd: '-1',
      flagRt: false,
      flagSteam: false,

      mouseSensitivity: '',
      backend: '',
      cursorPath: '',
      statsPath: '',
      hideCursorDelay: '',
      xwaylandCount: '',
      preferVkDevice: '',
      forceOrientation: '',
      flagForceWindowsFullscreen: false,
      cursorScaleHeight: '',
      virtualConnectorStrategy: '',
      framerateLimit: '',
      flagDisableKeybinds: false,
      flagTouchGestureTranslation: false,

      sdrGamutWideness: '',
      hdrSdrContentNits: '',
      flagHdrItmEnabled: false,
      hdrItmSdrNits: '',
      hdrItmTargetNits: '',

      preferOutput: '',
      defaultTouchMode: '',
      generateDrmMode: '',

      vrOverlayKey: '',
      vrAppOverlayKey: '',
      vrOverlayExplicitName: '',
      vrOverlayDefaultName: '',
      vrOverlayIcon: '',
      vrScrollsSpeed: '',
      flagVrOverlayShowImmediately: false,
      flagVrOverlayEnableControlBar: false,
      flagVrOverlayEnableControlBarKeyboard: false,
      flagVrOverlayEnableControlBarClose: false,
      flagVrOverlayEnableClickStabilization: false,
      flagVrOverlayModal: false,
      vrOverlayPhysicalWidth: '',
      vrOverlayPhysicalCurvature: '',
      vrOverlayPhysicalPreCurvePitch: '',

      flagDisableLayers: false,
      flagDebugLayers: false,
      flagDebugFocus: false,
      flagSynchronousX11: false,
      flagDebugHud: false,
      flagDebugEvents: false,
      flagForceComposition: false,
      flagCompositeDebug: false,
      flagDisableColorManagement: false,
      flagDisableXres: false,
      flagHdrDebugForceSupport: false,
      flagHdrDebugForceOutput: false,
      flagHdrDebugHeatmap: false,

      reshadeEffect: '',
      reshadeTechniqueIdx: '',

      muraMap: '',

      flagAllowDeferredBackend: false,
      flagKeepAlive: false
    };

    if (!idb) {
      console.warn('A böngésző nem támogatja az IndexedDB-t. A mentési funkciók korlátozottak lesznek.');
    } else {
      const dbRequest = idb.open('GamescopePresets', 1);

      dbRequest.onupgradeneeded = (event) => {
        const activeDb = event.target.result;
        if (!activeDb.objectStoreNames.contains('presets')) {
          activeDb.createObjectStore('presets', { keyPath: 'name' });
        }
      };

      dbRequest.onsuccess = (event) => {
        db = event.target.result;
        loadPresetsList();
      };

      dbRequest.onerror = (event) => {
        console.error('Nem sikerült megnyitni a sablon adatbázist:', event.target.error);
      };
    }

    function getPresetsFromDb(callback) {
      if (!db) return callback([]);
      const transaction = db.transaction(['presets'], 'readonly');
      const store = transaction.objectStore('presets');
      const req = store.getAll();
      req.onsuccess = () => callback(req.result);
      req.onerror = () => console.error('Hiba a sablonok lekérésekor');
    }

    function savePresetToDb(presetObj, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      const req = store.put(presetObj);
      req.onsuccess = () => callback();
      req.onerror = () => alert('Hiba történt a sablon mentése során.');
    }

    function deletePresetFromDb(name, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      const req = store.delete(name);
      req.onsuccess = () => callback();
      req.onerror = () => console.error('Hiba a sablon törlésekor:', name);
    }

    function saveMultiplePresetsToDb(presetsArray, callback) {
      if (!db) return callback();
      const transaction = db.transaction(['presets'], 'readwrite');
      const store = transaction.objectStore('presets');
      
      presetsArray.forEach(preset => {
        store.put(preset);
      });

      transaction.oncomplete = () => callback();
      transaction.onerror = () => alert('Hiba történt az importálás során.');
    }

    function applyPresetValues(presetData) {
      const merged = { ...DEFAULT_VALUES, ...presetData };

      fields.gameWidth.value = merged.gameWidth;
      fields.gameHeight.value = merged.gameHeight;
      fields.outputWidth.value = merged.outputWidth;
      fields.outputHeight.value = merged.outputHeight;
      fields.fpsLimit.value = merged.fpsLimit;
      fields.fpsUnfocused.value = merged.fpsUnfocused;
      fields.scalingMode.value = merged.scalingMode;
      fields.upscalerType.value = merged.upscalerType;
      fields.displayIndex.value = merged.displayIndex;
      
      fields.flagFullscreen.checked = Boolean(merged.flagFullscreen);
      fields.flagBorderless.checked = Boolean(merged.flagBorderless);
      fields.flagImmediate.checked = Boolean(merged.flagImmediate);
      fields.flagMangoapp.checked = Boolean(merged.flagMangoapp);
      fields.flagExposeWayland.checked = Boolean(merged.flagExposeWayland);
      fields.flagHdr.checked = Boolean(merged.flagHdr);
      fields.flagAdaptiveSync.checked = Boolean(merged.flagAdaptiveSync);
      fields.flagGrabCursor.checked = Boolean(merged.flagGrabCursor);
      fields.flagGrabKeyboard.checked = Boolean(merged.flagGrabKeyboard);

      fields.prependedValues.value = merged.prependedValues;
      fields.extraArgs.value = merged.extraArgs;
      fields.launchCommand.value = merged.launchCommand;

      fields.maxScale.value = merged.maxScale;
      maxScaleValDisplay.textContent = merged.maxScale === '0' ? 'Kikapcsolva' : `${merged.maxScale}x`;

      fields.fsrSharpness.value = merged.fsrSharpness;
      fsrSharpnessValDisplay.textContent = merged.fsrSharpness;

      fields.readyFd.value = merged.readyFd;
      fields.flagRt.checked = Boolean(merged.flagRt);
      fields.flagSteam.checked = Boolean(merged.flagSteam);

      fields.mouseSensitivity.value = merged.mouseSensitivity;
      fields.backend.value = merged.backend;
      fields.cursorPath.value = merged.cursorPath;
      fields.statsPath.value = merged.statsPath;
      fields.hideCursorDelay.value = merged.hideCursorDelay;
      fields.xwaylandCount.value = merged.xwaylandCount;
      fields.preferVkDevice.value = merged.preferVkDevice;
      fields.forceOrientation.value = merged.forceOrientation;
      fields.flagForceWindowsFullscreen.checked = Boolean(merged.flagForceWindowsFullscreen);
      fields.cursorScaleHeight.value = merged.cursorScaleHeight;
      fields.virtualConnectorStrategy.value = merged.virtualConnectorStrategy;
      fields.framerateLimit.value = merged.framerateLimit;
      fields.flagDisableKeybinds.checked = Boolean(merged.flagDisableKeybinds);
      fields.flagTouchGestureTranslation.checked = Boolean(merged.flagTouchGestureTranslation);

      fields.sdrGamutWideness.value = merged.sdrGamutWideness;
      fields.hdrSdrContentNits.value = merged.hdrSdrContentNits;
      fields.flagHdrItmEnabled.checked = Boolean(merged.flagHdrItmEnabled);
      fields.hdrItmSdrNits.value = merged.hdrItmSdrNits;
      fields.hdrItmTargetNits.value = merged.hdrItmTargetNits;

      fields.preferOutput.value = merged.preferOutput;
      fields.defaultTouchMode.value = merged.defaultTouchMode;
      fields.generateDrmMode.value = merged.generateDrmMode;

      fields.vrOverlayKey.value = merged.vrOverlayKey;
      fields.vrAppOverlayKey.value = merged.vrAppOverlayKey;
      fields.vrOverlayExplicitName.value = merged.vrOverlayExplicitName;
      fields.vrOverlayDefaultName.value = merged.vrOverlayDefaultName;
      fields.vrOverlayIcon.value = merged.vrOverlayIcon;
      fields.vrScrollsSpeed.value = merged.vrScrollsSpeed;
      fields.flagVrOverlayShowImmediately.checked = Boolean(merged.flagVrOverlayShowImmediately);
      fields.flagVrOverlayEnableControlBar.checked = Boolean(merged.flagVrOverlayEnableControlBar);
      fields.flagVrOverlayEnableControlBarKeyboard.checked = Boolean(merged.flagVrOverlayEnableControlBarKeyboard);
      fields.flagVrOverlayEnableControlBarClose.checked = Boolean(merged.flagVrOverlayEnableControlBarClose);
      fields.flagVrOverlayEnableClickStabilization.checked = Boolean(merged.flagVrOverlayEnableClickStabilization);
      fields.flagVrOverlayModal.checked = Boolean(merged.flagVrOverlayModal);
      fields.vrOverlayPhysicalWidth.value = merged.vrOverlayPhysicalWidth;
      fields.vrOverlayPhysicalCurvature.value = merged.vrOverlayPhysicalCurvature;
      fields.vrOverlayPhysicalPreCurvePitch.value = merged.vrOverlayPhysicalPreCurvePitch;

      fields.flagDisableLayers.checked = Boolean(merged.flagDisableLayers);
      fields.flagDebugLayers.checked = Boolean(merged.flagDebugLayers);
      fields.flagDebugFocus.checked = Boolean(merged.flagDebugFocus);
      fields.flagSynchronousX11.checked = Boolean(merged.flagSynchronousX11);
      fields.flagDebugHud.checked = Boolean(merged.flagDebugHud);
      fields.flagDebugEvents.checked = Boolean(merged.flagDebugEvents);
      fields.flagForceComposition.checked = Boolean(merged.flagForceComposition);
      fields.flagCompositeDebug.checked = Boolean(merged.flagCompositeDebug);
      fields.flagDisableColorManagement.checked = Boolean(merged.flagDisableColorManagement);
      fields.flagDisableXres.checked = Boolean(merged.flagDisableXres);
      fields.flagHdrDebugForceSupport.checked = Boolean(merged.flagHdrDebugForceSupport);
      fields.flagHdrDebugForceOutput.checked = Boolean(merged.flagHdrDebugForceOutput);
      fields.flagHdrDebugHeatmap.checked = Boolean(merged.flagHdrDebugHeatmap);

      fields.reshadeEffect.value = merged.reshadeEffect;
      fields.reshadeTechniqueIdx.value = merged.reshadeTechniqueIdx;

      fields.muraMap.value = merged.muraMap;

      fields.flagAllowDeferredBackend.checked = Boolean(merged.flagAllowDeferredBackend);
      fields.flagKeepAlive.checked = Boolean(merged.flagKeepAlive);

      fields.resolutionPreset.value = "";
      fields.outputPreset.value = "";

      updateCommand();
    }

    function getPresetDataFromForm() {
      return {
        gameWidth: fields.gameWidth.value,
        gameHeight: fields.gameHeight.value,
        outputWidth: fields.outputWidth.value,
        outputHeight: fields.outputHeight.value,
        fpsLimit: fields.fpsLimit.value,
        fpsUnfocused: fields.fpsUnfocused.value,
        scalingMode: fields.scalingMode.value,
        upscalerType: fields.upscalerType.value,
        displayIndex: fields.displayIndex.value,
        
        flagFullscreen: fields.flagFullscreen.checked,
        flagBorderless: fields.flagBorderless.checked,
        flagImmediate: fields.flagImmediate.checked,
        flagMangoapp: fields.flagMangoapp.checked,
        flagExposeWayland: fields.flagExposeWayland.checked,
        flagHdr: fields.flagHdr.checked,
        flagAdaptiveSync: fields.flagAdaptiveSync.checked,
        flagGrabCursor: fields.flagGrabCursor.checked,
        flagGrabKeyboard: fields.flagGrabKeyboard.checked,

        prependedValues: fields.prependedValues.value,
        extraArgs: fields.extraArgs.value,
        launchCommand: fields.launchCommand.value,

        maxScale: fields.maxScale.value,
        fsrSharpness: fields.fsrSharpness.value,
        readyFd: fields.readyFd.value,
        flagRt: fields.flagRt.checked,
        flagSteam: fields.flagSteam.checked,

        mouseSensitivity: fields.mouseSensitivity.value,
        backend: fields.backend.value,
        cursorPath: fields.cursorPath.value,
        statsPath: fields.statsPath.value,
        hideCursorDelay: fields.hideCursorDelay.value,
        xwaylandCount: fields.xwaylandCount.value,
        preferVkDevice: fields.preferVkDevice.value,
        forceOrientation: fields.forceOrientation.value,
        flagForceWindowsFullscreen: fields.flagForceWindowsFullscreen.checked,
        cursorScaleHeight: fields.cursorScaleHeight.value,
        virtualConnectorStrategy: fields.virtualConnectorStrategy.value,
        framerateLimit: fields.framerateLimit.value,
        flagDisableKeybinds: fields.flagDisableKeybinds.checked,
        flagTouchGestureTranslation: fields.flagTouchGestureTranslation.checked,

        sdrGamutWideness: fields.sdrGamutWideness.value,
        hdrSdrContentNits: fields.hdrSdrContentNits.value,
        flagHdrItmEnabled: fields.flagHdrItmEnabled.checked,
        hdrItmSdrNits: fields.hdrItmSdrNits.value,
        hdrItmTargetNits: fields.hdrItmTargetNits.value,

        preferOutput: fields.preferOutput.value,
        defaultTouchMode: fields.defaultTouchMode.value,
        generateDrmMode: fields.generateDrmMode.value,

        vrOverlayKey: fields.vrOverlayKey.value,
        vrAppOverlayKey: fields.vrAppOverlayKey.value,
        vrOverlayExplicitName: fields.vrOverlayExplicitName.value,
        vrOverlayDefaultName: fields.vrOverlayDefaultName.value,
        vrOverlayIcon: fields.vrOverlayIcon.value,
        vrScrollsSpeed: fields.vrScrollsSpeed.value,
        flagVrOverlayShowImmediately: fields.flagVrOverlayShowImmediately.checked,
        flagVrOverlayEnableControlBar: fields.flagVrOverlayEnableControlBar.checked,
        flagVrOverlayEnableControlBarKeyboard: fields.flagVrOverlayEnableControlBarKeyboard.checked,
        flagVrOverlayEnableControlBarClose: fields.flagVrOverlayEnableControlBarClose.checked,
        flagVrOverlayEnableClickStabilization: fields.flagVrOverlayEnableClickStabilization.checked,
        flagVrOverlayModal: fields.flagVrOverlayModal.checked,
        vrOverlayPhysicalWidth: fields.vrOverlayPhysicalWidth.value,
        vrOverlayPhysicalCurvature: fields.vrOverlayPhysicalCurvature.value,
        vrOverlayPhysicalPreCurvePitch: fields.vrOverlayPhysicalPreCurvePitch.value,

        flagDisableLayers: fields.flagDisableLayers.checked,
        flagDebugLayers: fields.flagDebugLayers.checked,
        flagDebugFocus: fields.flagDebugFocus.checked,
        flagSynchronousX11: fields.flagSynchronousX11.checked,
        flagDebugHud: fields.flagDebugHud.checked,
        flagDebugEvents: fields.flagDebugEvents.checked,
        flagForceComposition: fields.flagForceComposition.checked,
        flagCompositeDebug: fields.flagCompositeDebug.checked,
        flagDisableColorManagement: fields.flagDisableColorManagement.checked,
        flagDisableXres: fields.flagDisableXres.checked,
        flagHdrDebugForceSupport: fields.flagHdrDebugForceSupport.checked,
        flagHdrDebugForceOutput: fields.flagHdrDebugForceOutput.checked,
        flagHdrDebugHeatmap: fields.flagHdrDebugHeatmap.checked,

        reshadeEffect: fields.reshadeEffect.value,
        reshadeTechniqueIdx: fields.reshadeTechniqueIdx.value,

        muraMap: fields.muraMap.value,

        flagAllowDeferredBackend: fields.flagAllowDeferredBackend.checked,
        flagKeepAlive: fields.flagKeepAlive.checked
      };
    }

    function loadPresetsList() {
      getPresetsFromDb((presets) => {
        presetsContainer.innerHTML = '';

        if (presets.length === 0) {
          presetsContainer.appendChild(emptyPresetsMsg);
          return;
        }

        presets.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'preset-item';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'preset-item-name';
          nameSpan.textContent = item.name;
          nameSpan.title = item.name;

          const actions = document.createElement('div');
          actions.className = 'preset-item-actions';

          const loadBtn = document.createElement('button');
          loadBtn.className = 'btn btn-primary';
          loadBtn.textContent = 'Betöltés';
          loadBtn.setAttribute('aria-label', `Betöltés: ${item.name}`);
          loadBtn.addEventListener('click', () => {
            applyPresetValues(item.preset);
            setPresetName(item.name);
            setModifiedStatus(false);
            srAnnouncer.textContent = `A(z) "${item.name}" sablon sikeresen betöltve.`;
          });

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn btn-danger';
          deleteBtn.textContent = 'Törlés';
          deleteBtn.setAttribute('aria-label', `Törlés: ${item.name}`);
          deleteBtn.addEventListener('click', () => {
            if (confirm(`Biztosan törölni szeretnéd a(z) "${item.name}" nevű sablont?`)) {
              deletePresetFromDb(item.name, () => {
                loadPresetsList();
                if (currentPresetName === item.name) {
                  resetPresetState();
                }
                srAnnouncer.textContent = `A(z) "${item.name}" sablon törölve lett.`;
              });
            }
          });

          actions.appendChild(loadBtn);
          actions.appendChild(deleteBtn);
          row.appendChild(nameSpan);
          row.appendChild(actions);
          presetsContainer.appendChild(row);
        });
      });
    }

    savePresetBtn.addEventListener('click', () => {
      const name = presetNameInput.value.trim();
      if (!name) {
        alert('Kérjük, adj meg egy nevet a sablonnak!');
        return;
      }

      const presetData = getPresetDataFromForm();
      
      savePresetToDb({ name: name, preset: presetData }, () => {
        presetNameInput.value = '';
        loadPresetsList();
        setPresetName(name);
        setModifiedStatus(false);
        srAnnouncer.textContent = `A(z) "${name}" sablon sikeresen elmentve.`;
      });
    });

    clearBtn.addEventListener('click', () => {
      if (confirm('Biztosan kiüríted az összes mezőt? A mentett sablonjaid nem fognak törlődni.')) {
        applyPresetValues(DEFAULT_VALUES);
        resetPresetState();
        srAnnouncer.textContent = 'Minden mező alapértelmezett értékre állítva.';
      }
    });

    exportBtn.addEventListener('click', () => {
      getPresetsFromDb((presets) => {
        if (presets.length === 0) {
          alert('Nincsenek mentett sablonok az exportáláshoz.');
          return;
        }

        const jsonString = JSON.stringify(presets, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gamescope_sablonok.json';
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        srAnnouncer.textContent = 'A sablonok sikeresen exportálva JSON fájlba.';
      });
    });

    importBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      
      fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importedData = JSON.parse(e.target.result);
            
            const isValid = Array.isArray(importedData) && importedData.every(item => 
              item && typeof item === 'object' && typeof item.name === 'string' && typeof item.preset === 'object'
            );

            if (!isValid) {
              alert('Érvénytelen fájlformátum. Az importálandó fájlnak egy sablon-tömböt kell tartalmaznia.');
              return;
            }

            saveMultiplePresetsToDb(importedData, () => {
              loadPresetsList();
              alert('A sablonok sikeresen importálva!');
              srAnnouncer.textContent = 'Sablonok sikeresen importálva.';
            });

          } catch (err) {
            alert('Hiba történt a JSON fájl beolvasása során: ' + err.message);
          }
        };
        reader.readAsText(file);
      });

      fileInput.click();
    });

    const DEMO_PRESET = {
      gameWidth: '1280',
      gameHeight: '720',
      outputWidth: '1920',
      outputHeight: '1080',
      fpsLimit: '60',
      fpsUnfocused: '30',
      scalingMode: 'integer',
      upscalerType: 'fsr',
      displayIndex: '-1',
      flagFullscreen: true,
      flagBorderless: false,
      flagImmediate: false,
      flagMangoapp: true,
      flagExposeWayland: false,
      flagHdr: true,
      flagAdaptiveSync: true,
      flagGrabCursor: false,
      flagGrabKeyboard: false,
      prependedValues: 'LD_PRELOAD=/usr/lib/libtcmalloc.so',
      extraArgs: '--prefer-output-width 1920',
      launchCommand: '%command%',
      maxScale: '0',
      fsrSharpness: '2',
      readyFd: '-1',
      flagRt: false,
      flagSteam: false,

      mouseSensitivity: '1.2',
      backend: 'wayland',
      cursorPath: '',
      statsPath: '',
      hideCursorDelay: '2000',
      xwaylandCount: '',
      preferVkDevice: '1002:7300',
      forceOrientation: 'normal',
      flagForceWindowsFullscreen: false,
      cursorScaleHeight: '',
      virtualConnectorStrategy: '',
      framerateLimit: '',
      flagDisableKeybinds: false,
      flagTouchGestureTranslation: false,

      sdrGamutWideness: '0.4',
      hdrSdrContentNits: '400',
      flagHdrItmEnabled: true,
      hdrItmSdrNits: '100',
      hdrItmTargetNits: '1000',

      preferOutput: 'DP-1,HDMI-A-1',
      defaultTouchMode: '1',
      generateDrmMode: 'cvt',

      vrOverlayKey: '',
      vrAppOverlayKey: '',
      vrOverlayExplicitName: '',
      vrOverlayDefaultName: '',
      vrOverlayIcon: '',
      vrScrollsSpeed: '',
      flagVrOverlayShowImmediately: false,
      flagVrOverlayEnableControlBar: false,
      flagVrOverlayEnableControlBarKeyboard: false,
      flagVrOverlayEnableControlBarClose: false,
      flagVrOverlayEnableClickStabilization: false,
      flagVrOverlayModal: false,
      vrOverlayPhysicalWidth: '',
      vrOverlayPhysicalCurvature: '',
      vrOverlayPhysicalPreCurvePitch: '',

      flagDisableLayers: false,
      flagDebugLayers: false,
      flagDebugFocus: false,
      flagSynchronousX11: false,
      flagDebugHud: false,
      flagDebugEvents: false,
      flagForceComposition: false,
      flagCompositeDebug: false,
      flagDisableColorManagement: false,
      flagDisableXres: false,
      flagHdrDebugForceSupport: false,
      flagHdrDebugForceOutput: false,
      flagHdrDebugHeatmap: false,

      reshadeEffect: 'CAS.fx',
      reshadeTechniqueIdx: '0',

      muraMap: '',

      flagAllowDeferredBackend: false,
      flagKeepAlive: true
    };

    exampleBtn.addEventListener('click', () => {
      applyPresetValues(DEMO_PRESET);
      resetPresetState();
      srAnnouncer.textContent = 'Példa beállítások betöltve.';
    });

    copyBtn.addEventListener('click', async () => {
      const cmdText = buildCommand();
      try {
        await navigator.clipboard.writeText(cmdText);
        copyStatus.textContent = 'Parancs sikeresen a vágólapra másolva!';
        copyStatus.style.color = 'var(--success)';
        srAnnouncer.textContent = 'A parancs másolva a vágólapra.';
      } catch (err) {
        copyStatus.textContent = 'Hiba a másoláskor. Jelöld ki és másold le manuálisan!';
        copyStatus.style.color = 'var(--danger)';
        console.error('Nem sikerült a vágólapra írni:', err);
      }
    });

    applyPresetValues(DEFAULT_VALUES);
    resetPresetState();
  }

  // =========================================================================
  // 4. MAIN PAGE LOGIC (Steam Launcher Suite)
  // =========================================================================
  function initMainPage() {
    const predefinedListContainer = document.getElementById('predefined-dlls-list');
    const customListContainer = document.getElementById('custom-dlls-list');
    const emptyCustomMsg = document.getElementById('empty-custom-msg');
    const globalLaunchCommand = document.getElementById('global-launch-command');
    
    const enableDllModule = document.getElementById('enable-dll-module');
    const enableProtonModule = document.getElementById('enable-proton-module');
    const enableGamescopeModule = document.getElementById('enable-gamescope-module');

    const commandDisplay = document.getElementById('command-display');
    const copyStatus = document.getElementById('copy-status');
    const srAnnouncer = document.getElementById('sr-announcer');
    const activePresetIndicator = document.getElementById('active-preset-indicator');

    const customDllNameInput = document.getElementById('custom-dll-name');
    const customDllTypeSelect = document.getElementById('custom-dll-type');
    const addCustomDllBtn = document.getElementById('add-custom-dll-btn');

    const presetNameInput = document.getElementById('preset-name-input');
    const savePresetBtn = document.getElementById('save-preset-btn');
    const presetsContainer = document.getElementById('presets-container');
    const emptyPresetsMsg = document.getElementById('empty-presets-msg');
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const exampleBtn = document.getElementById('example-btn');

    const fields = {
      // Gamescope
      gsGameWidth: document.getElementById('game-width'),
      gsGameHeight: document.getElementById('game-height'),
      gsOutputWidth: document.getElementById('output-width'),
      gsOutputHeight: document.getElementById('output-height'),
      gsFpsLimit: document.getElementById('fps-limit'),
      gsFpsUnfocused: document.getElementById('fps-unfocused'),
      gsScalingMode: document.getElementById('scaling-mode'),
      gsUpscalerType: document.getElementById('upscaler-type'),
      gsDisplayIndex: document.getElementById('display-index'),
      gsFlagFullscreen: document.getElementById('flag-fullscreen'),
      gsFlagBorderless: document.getElementById('flag-borderless'),
      gsFlagImmediate: document.getElementById('flag-immediate'),
      gsFlagMangoapp: document.getElementById('flag-mangoapp'),
      gsFlagExposeWayland: document.getElementById('flag-expose-wayland'),
      gsFlagHdr: document.getElementById('flag-hdr'),
      gsFlagAdaptiveSync: document.getElementById('flag-adaptive-sync'),
      gsFlagGrabCursor: document.getElementById('flag-grab-cursor'),
      gsFlagGrabKeyboard: document.getElementById('flag-grab-keyboard'),
      gsPrependedValues: document.getElementById('prepended-values'),
      gsExtraArgs: document.getElementById('extra-args'),
      gsMaxScale: document.getElementById('max-scale'),
      gsFsrSharpness: document.getElementById('fsr-sharpness'),
      gsReadyFd: document.getElementById('ready-fd'),
      gsFlagRt: document.getElementById('flag-rt'),
      gsFlagSteam: document.getElementById('flag-steam'),
      gsMouseSensitivity: document.getElementById('mouse-sensitivity'),
      gsBackend: document.getElementById('backend'),
      gsCursorPath: document.getElementById('cursor-path'),
      gsStatsPath: document.getElementById('stats-path'),
      gsHideCursorDelay: document.getElementById('hide-cursor-delay'),
      gsXwaylandCount: document.getElementById('xwayland-count'),
      gsPreferVkDevice: document.getElementById('prefer-vk-device'),
      gsForceOrientation: document.getElementById('force-orientation'),
      gsFlagForceWindowsFullscreen: document.getElementById('flag-force-windows-fullscreen'),
      gsCursorScaleHeight: document.getElementById('cursor-scale-height'),
      gsVirtualConnectorStrategy: document.getElementById('virtual-connector-strategy'),
      gsFramerateLimit: document.getElementById('framerate-limit'),
      gsFlagDisableKeybinds: document.getElementById('flag-disable-keybinds'),
      gsFlagTouchGestureTranslation: document.getElementById('flag-touch-gesture-translation'),
      gsSdrGamutWideness: document.getElementById('sdr-gamut-wideness'),
      gsHdrSdrContentNits: document.getElementById('hdr-sdr-content-nits'),
      gsFlagHdrItmEnabled: document.getElementById('flag-hdr-itm-enabled'),
      gsHdrItmSdrNits: document.getElementById('hdr-itm-sdr-nits'),
      gsHdrItmTargetNits: document.getElementById('hdr-itm-target-nits'),
      gsPreferOutput: document.getElementById('prefer-output'),
      gsDefaultTouchMode: document.getElementById('default-touch-mode'),
      gsGenerateDrmMode: document.getElementById('generate-drm-mode'),
      gsVrOverlayKey: document.getElementById('vr-overlay-key'),
      gsVrAppOverlayKey: document.getElementById('vr-app-overlay-key'),
      gsVrOverlayExplicitName: document.getElementById('vr-overlay-explicit-name'),
      gsVrOverlayDefaultName: document.getElementById('vr-overlay-default-name'),
      gsVrOverlayIcon: document.getElementById('vr-overlay-icon'),
      gsVrScrollsSpeed: document.getElementById('vr-scrolls-speed'),
      gsFlagVrOverlayShowImmediately: document.getElementById('flag-vr-overlay-show-immediately'),
      gsFlagVrOverlayEnableControlBar: document.getElementById('flag-vr-overlay-enable-control-bar'),
      gsFlagVrOverlayEnableControlBarKeyboard: document.getElementById('flag-vr-overlay-enable-control-bar-keyboard'),
      gsFlagVrOverlayEnableControlBarClose: document.getElementById('flag-vr-overlay-enable-control-bar-close'),
      gsFlagVrOverlayEnableClickStabilization: document.getElementById('flag-vr-overlay-enable-click-stabilization'),
      gsFlagVrOverlayModal: document.getElementById('flag-vr-overlay-modal'),
      gsVrOverlayPhysicalWidth: document.getElementById('vr-overlay-physical-width'),
      gsVrOverlayPhysicalCurvature: document.getElementById('vr-overlay-physical-curvature'),
      gsVrOverlayPhysicalPreCurvePitch: document.getElementById('vr-overlay-physical-pre-curve-pitch'),
      gsFlagDisableLayers: document.getElementById('flag-disable-layers'),
      gsFlagDebugLayers: document.getElementById('flag-debug-layers'),
      gsFlagDebugFocus: document.getElementById('flag-debug-focus'),
      gsFlagSynchronousX11: document.getElementById('flag-synchronous-x11'),
      gsFlagDebugHud: document.getElementById('flag-debug-hud'),
      gsFlagDebugEvents: document.getElementById('flag-debug-events'),
      gsFlagForceComposition: document.getElementById('flag-force-composition'),
      gsFlagCompositeDebug: document.getElementById('flag-composite-debug'),
      gsFlagDisableColorManagement: document.getElementById('flag-disable-color-management'),
      gsFlagDisableXres: document.getElementById('flag-disable-xres'),
      gsFlagHdrDebugForceSupport: document.getElementById('flag-hdr-debug-force-support'),
      gsFlagHdrDebugForceOutput: document.getElementById('flag-hdr-debug-force-output'),
      gsFlagHdrDebugHeatmap: document.getElementById('flag-hdr-debug-heatmap'),
      gsReshadeEffect: document.getElementById('reshade-effect'),
      gsReshadeTechniqueIdx: document.getElementById('reshade-technique-idx'),
      gsMuraMap: document.getElementById('mura-map'),
      gsFlagAllowDeferredBackend: document.getElementById('flag-allow-deferred-backend'),
      gsFlagKeepAlive: document.getElementById('flag-keep-alive'),
      gsResolutionPreset: document.getElementById('resolution-preset'),
      gsOutputPreset: document.getElementById('output-preset'),

      // Proton
      prFlagProtonLog: document.getElementById('flag-proton-log'),
      prProtonLogDir: document.getElementById('proton-log-dir'),
      prWinedebug: document.getElementById('winedebug'),
      prDxvkHud: document.getElementById('dxvk-hud'),
      prDxvkFrameRate: document.getElementById('dxvk-frame-rate'),
      prFlagUseWined3d: document.getElementById('flag-use-wined3d'),
      prFlagEnableHdr: document.getElementById('flag-enable-hdr'),
      prFlagEnableNvapi: document.getElementById('flag-enable-nvapi'),
      prVkd3dConfig: document.getElementById('vkd3d-config'),
      prVkd3dDebug: document.getElementById('vkd3d-debug'),
      prVkd3dFeatureLevel: document.getElementById('vkd3d-feature-level'),
      prDxvkConfigFile: document.getElementById('dxvk-config-file'),
      prFlagNoD3d10: document.getElementById('flag-no-d3d10'),
      prFlagNoD3d11: document.getElementById('flag-no-d3d11'),
      prFlagNoD3d12: document.getElementById('flag-no-d3d12'),
      prFlagNoStateCache: document.getElementById('flag-no-state-cache'),
      prMesaVkDeviceSelect: document.getElementById('mesa-vk-device-select'),
      prFlagNoEsync: document.getElementById('flag-no-esync'),
      prFlagNoFsync: document.getElementById('flag-no-fsync'),
      prFlagUseNtsync: document.getElementById('flag-use-ntsync'),
      prFlagForceLaa: document.getElementById('flag-force-laa'),
      prFlagHeapDelayFree: document.getElementById('flag-heap-delay-free'),
      prWineprefix: document.getElementById('wineprefix'),
      prUserLaunchArgs: document.getElementById('user-launch-args'),
      prFlagGamemoderun: document.getElementById('flag-gamemoderun'),
      prFlagMangohud: document.getElementById('flag-mangohud'),
      prFlagVkbasalt: document.getElementById('flag-vkbasalt'),
      prFlagEnableWayland: document.getElementById('flag-enable-wayland'),
      prFlagHideNvidiaGpu: document.getElementById('flag-hide-nvidia-gpu'),
      prFlagDlssUpgrade: document.getElementById('flag-dlss-upgrade'),
      prFlagDumpDebugCommands: document.getElementById('flag-dump-debug-commands'),

      // DLL Overrides
      dllOutputFormat: document.getElementById('output-format')
    };

    let customDlls = [];
    let currentPresetName = '';
    let isModified = false;
    let db = null;
    let announceTimeout = null;

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const contentId = btn.getAttribute('aria-controls');
        document.getElementById(contentId).classList.add('active');
      });
    });

    document.querySelectorAll('.accordion-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.getAttribute('aria-controls');
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', !expanded);
        panel.classList.toggle('open', !expanded);
        
        const accordionWrapper = btn.closest('.accordion');
        if (accordionWrapper) {
          accordionWrapper.classList.toggle('open', !expanded);
        }
      });
    });

    fields.gsFsrSharpness.addEventListener('input', () => {
      document.getElementById('fsr-sharpness-val').textContent = fields.gsFsrSharpness.value;
    });

    const maxScaleInput = document.getElementById('max-scale');
    if (maxScaleInput) {
      maxScaleInput.addEventListener('input', () => {
        const val = maxScaleInput.value;
        document.getElementById('max-scale-val').textContent = val === '0' ? 'Kikapcsolva' : val;
      });
    }

    function renderPredefinedDlls() {
      predefinedListContainer.innerHTML = '';
      PREDEFINED_DLLS.forEach(dll => {
        const row = document.createElement('div');
        row.className = 'dll-item-row';
        row.innerHTML = `
          <div class="dll-item-row-header">
            <label class="checkbox-label" style="font-weight: 600;">
              <input type="checkbox" id="chk-pre-${dll.name}" data-dll="${dll.name}" class="predefined-checkbox">
              <span>${dll.name}</span>
              <div class="help-tip">
                <span class="help-tip__trigger" tabindex="0">?</span>
                <span role="tooltip" class="help-tip__content">${dll.desc}</span>
              </div>
            </label>
          </div>
          <div class="dll-item-select-wrapper" id="select-wrapper-pre-${dll.name}">
            <select id="select-pre-${dll.name}" data-dll="${dll.name}" class="predefined-select">
              <option value="n,b" selected>n,b (Native, utána Builtin - ajánlott)</option>
              <option value="b,n">b,n (Builtin, utána Native)</option>
              <option value="n">n (Csak Native)</option>
              <option value="b">b (Csak Builtin)</option>
              <option value="d">d (Disabled / Letiltva)</option>
            </select>
          </div>
        `;
        predefinedListContainer.appendChild(row);

        const checkbox = row.querySelector('.predefined-checkbox');
        const selectWrapper = row.querySelector('.dll-item-select-wrapper');
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            selectWrapper.classList.add('open');
          } else {
            selectWrapper.classList.remove('open');
          }
          triggerUpdate();
        });

        row.querySelector('.predefined-select').addEventListener('change', triggerUpdate);
      });
    }

    function renderCustomDlls() {
      customListContainer.innerHTML = '';
      if (customDlls.length === 0) {
        customListContainer.appendChild(emptyCustomMsg);
        return;
      }

      customDlls.forEach((dll, index) => {
        const row = document.createElement('div');
        row.className = 'dll-item-row';
        row.innerHTML = `
          <div class="dll-item-row-header">
            <label class="checkbox-label" style="font-weight: 600;">
              <input type="checkbox" id="chk-cust-${index}" class="custom-checkbox" ${dll.checked ? 'checked' : ''}>
              <span>${dll.name}</span>
            </label>
            <button type="button" class="dll-delete-btn" data-index="${index}">Törlés</button>
          </div>
          <div class="dll-item-select-wrapper ${dll.checked ? 'open' : ''}">
            <select id="select-cust-${index}" class="custom-select">
              <option value="n,b" ${dll.type === 'n,b' ? 'selected' : ''}>n,b (Native, utána Builtin)</option>
              <option value="b,n" ${dll.type === 'b,n' ? 'selected' : ''}>b,n (Builtin, utána Native)</option>
              <option value="n" ${dll.type === 'n' ? 'selected' : ''}>n (Csak Native)</option>
              <option value="b" ${dll.type === 'b' ? 'selected' : ''}>b (Csak Builtin)</option>
              <option value="d" ${dll.type === 'd' ? 'selected' : ''}>d (Disabled / Letiltva)</option>
            </select>
          </div>
        `;
        customListContainer.appendChild(row);

        const checkbox = row.querySelector('.custom-checkbox');
        const selectWrapper = row.querySelector('.dll-item-select-wrapper');
        const select = row.querySelector('.custom-select');
        const deleteBtn = row.querySelector('.dll-delete-btn');

        checkbox.addEventListener('change', () => {
          dll.checked = checkbox.checked;
          if (dll.checked) {
            selectWrapper.classList.add('open');
          } else {
            selectWrapper.classList.remove('open');
          }
          triggerUpdate();
        });

        select.addEventListener('change', () => {
          dll.type = select.value;
          triggerUpdate();
        });

        deleteBtn.addEventListener('click', () => {
          customDlls.splice(index, 1);
          renderCustomDlls();
          triggerUpdate();
        });
      });
    }

    addCustomDllBtn.addEventListener('click', () => {
      let name = customDllNameInput.value.trim().toLowerCase();
      if (name.endsWith('.dll')) {
        name = name.slice(0, -4);
      }

      if (!name) {
        alert('Kérlek adj meg egy DLL nevet!');
        return;
      }

      const existsPredefined = PREDEFINED_DLLS.some(dll => dll.name === name);
      const existsCustom = customDlls.some(dll => dll.name === name);

      if (existsPredefined) {
        alert(`A(z) "${name}" már szerepel a gyakori listán. Jelöld be ott!`);
        customDllNameInput.value = '';
        return;
      }

      if (existsCustom) {
        alert(`A(z) "${name}" már hozzá van adva!`);
        customDllNameInput.value = '';
        return;
      }

      const type = customDllTypeSelect.value;
      customDlls.push({ name: name, type: type, checked: true });
      
      customDllNameInput.value = '';
      renderCustomDlls();
      triggerUpdate();
    });

    function pushEnvVar(parts, key, value) {
      const clean = String(value || '').trim();
      if (clean) {
        parts.push(`${key}=${clean}`);
      }
    }

    function buildCommand() {
      const cmdParts = [];

      // 1. DLL Overrides (WINEDLLOVERRIDES)
      if (enableDllModule.checked) {
        const overrides = [];
        
        PREDEFINED_DLLS.forEach(dll => {
          const chk = document.getElementById(`chk-pre-${dll.name}`);
          const sel = document.getElementById(`select-pre-${dll.name}`);
          if (chk && chk.checked && sel) {
            overrides.push(`${dll.name}=${sel.value}`);
          }
        });

        customDlls.forEach(dll => {
          if (dll.checked) {
            overrides.push(`${dll.name}=${dll.type}`);
          }
        });

        if (overrides.length > 0) {
          cmdParts.push(`WINEDLLOVERRIDES="${overrides.join(';')}"`);
        }
      }

      // 2. Proton környezeti változók
      if (enableProtonModule.checked) {
        if (fields.prFlagProtonLog.checked) {
          cmdParts.push('PROTON_LOG=1');
        }
        pushEnvVar(cmdParts, 'PROTON_LOG_DIR', fields.prProtonLogDir.value);
        pushEnvVar(cmdParts, 'WINEDEBUG', fields.prWinedebug.value);

        if (fields.prFlagUseWined3d.checked) {
          cmdParts.push('PROTON_USE_WINED3D=1');
        }
        if (fields.prFlagEnableHdr.checked) {
          cmdParts.push('PROTON_ENABLE_HDR=1');
        }
        if (fields.prFlagEnableNvapi.checked) {
          cmdParts.push('PROTON_ENABLE_NVAPI=1');
        }
        pushEnvVar(cmdParts, 'DXVK_HUD', fields.prDxvkHud.value);
        pushEnvVar(cmdParts, 'DXVK_FRAME_RATE', fields.prDxvkFrameRate.value);

        if (fields.prFlagNoD3d10.checked) {
          cmdParts.push('PROTON_NO_D3D10=1');
        }
        if (fields.prFlagNoD3d11.checked) {
          cmdParts.push('PROTON_NO_D3D11=1');
        }
        if (fields.prFlagNoD3d12.checked) {
          cmdParts.push('PROTON_NO_D3D12=1');
        }
        if (fields.prFlagNoStateCache.checked) {
          cmdParts.push('DXVK_STATE_CACHE=0');
        }
        pushEnvVar(cmdParts, 'DXVK_CONFIG_FILE', fields.prDxvkConfigFile.value);
        pushEnvVar(cmdParts, 'VKD3D_CONFIG', fields.prVkd3dConfig.value);
        pushEnvVar(cmdParts, 'VKD3D_DEBUG', fields.prVkd3dDebug.value);
        pushEnvVar(cmdParts, 'VKD3D_FEATURE_LEVEL', fields.prVkd3dFeatureLevel.value);

        if (fields.prFlagNoEsync.checked) {
          cmdParts.push('PROTON_NO_ESYNC=1');
        }
        if (fields.prFlagNoFsync.checked) {
          cmdParts.push('PROTON_NO_FSYNC=1');
        }
        if (fields.prFlagUseNtsync.checked) {
          cmdParts.push('PROTON_USE_NTSYNC=1');
        }
        if (fields.prFlagForceLaa.checked) {
          cmdParts.push('PROTON_FORCE_LARGE_ADDRESS_AWARE=1');
        }
        if (fields.prFlagHeapDelayFree.checked) {
          cmdParts.push('PROTON_HEAP_DELAY_FREE=1');
        }
        pushEnvVar(cmdParts, 'MESA_VK_DEVICE_SELECT', fields.prMesaVkDeviceSelect.value);

        if (fields.prFlagHideNvidiaGpu.checked) {
          cmdParts.push('PROTON_HIDE_NVIDIA_GPU=1');
        }
        if (fields.prFlagDlssUpgrade.checked) {
          cmdParts.push('PROTON_DLSS_UPGRADE=1');
        }
        if (fields.prFlagDumpDebugCommands.checked) {
          cmdParts.push('PROTON_DUMP_DEBUG_COMMANDS=1');
        }
        if (fields.prFlagEnableWayland.checked) {
          cmdParts.push('PROTON_ENABLE_WAYLAND=1');
        }
        pushEnvVar(cmdParts, 'WINEPREFIX', fields.prWineprefix.value);
        
        if (fields.prFlagVkbasalt.checked) {
          cmdParts.push('ENABLE_VKBASALT=1');
        }

        const userLaunch = String(fields.prUserLaunchArgs.value || '').trim();
        if (userLaunch) {
          cmdParts.push(userLaunch);
        }
      }

      // 3. Wrappers (GameMode és MangoHUD)
      const useGamemode = enableProtonModule.checked && fields.prFlagGamemoderun.checked;
      const useMangohud = enableProtonModule.checked && fields.prFlagMangohud.checked;

      if (useGamemode) cmdParts.push('gamemoderun');
      if (useMangohud) cmdParts.push('mangohud');

      // 4. Gamescope kompozitor
      if (enableGamescopeModule.checked) {
        const gsArgs = [];

        function pushPair(parts, flag, value) {
          const clean = String(value || '').trim();
          if (clean) {
            parts.push(flag, clean);
          }
        }

        function pushFlag(parts, flag, enabled) {
          if (enabled) {
            parts.push(flag);
          }
        }

        pushPair(gsArgs, '-w', fields.gsGameWidth.value);
        pushPair(gsArgs, '-h', fields.gsGameHeight.value);
        pushPair(gsArgs, '-W', fields.gsOutputWidth.value);
        pushPair(gsArgs, '-H', fields.gsOutputHeight.value);
        
        pushPair(gsArgs, '-r', fields.gsFpsLimit.value);
        pushPair(gsArgs, '-o', fields.gsFpsUnfocused.value);
        
        pushPair(gsArgs, '-S', fields.gsScalingMode.value);
        pushPair(gsArgs, '-F', fields.gsUpscalerType.value);

        const dispIdx = String(fields.gsDisplayIndex.value || '').trim();
        if (dispIdx && dispIdx !== '-1') {
          pushPair(gsArgs, '--display-index', dispIdx);
        }

        pushFlag(gsArgs, '-f', fields.gsFlagFullscreen.checked);
        pushFlag(gsArgs, '-b', fields.gsFlagBorderless.checked);
        pushFlag(gsArgs, '--immediate-flips', fields.gsFlagImmediate.checked);
        pushFlag(gsArgs, '--mangoapp', fields.gsFlagMangoapp.checked);
        pushFlag(gsArgs, '--expose-wayland', fields.gsFlagExposeWayland.checked);
        pushFlag(gsArgs, '--hdr-enabled', fields.gsFlagHdr.checked);
        pushFlag(gsArgs, '--adaptive-sync', fields.gsFlagAdaptiveSync.checked);
        pushFlag(gsArgs, '--force-grab-cursor', fields.gsFlagGrabCursor.checked);
        pushFlag(gsArgs, '--grab', fields.gsFlagGrabKeyboard.checked);

        const maxScaleVal = Number(fields.gsMaxScale.value || 0);
        if (maxScaleVal > 0) {
          pushPair(gsArgs, '--max-scale', maxScaleVal);
        }

        const sharpnessVal = String(fields.gsFsrSharpness.value || '').trim();
        if (sharpnessVal && sharpnessVal !== '2') {
          pushPair(gsArgs, '--fsr-sharpness', sharpnessVal);
        }

        const fdVal = String(fields.gsReadyFd.value || '').trim();
        if (fdVal && fdVal !== '-1') {
          pushPair(gsArgs, '--ready-fd', fdVal);
        }

        pushFlag(gsArgs, '--rt', fields.gsFlagRt.checked);
        pushFlag(gsArgs, '-e', fields.gsFlagSteam.checked);

        pushPair(gsArgs, '-s', fields.gsMouseSensitivity.value);
        pushPair(gsArgs, '--backend', fields.gsBackend.value);
        pushPair(gsArgs, '--cursor', fields.gsCursorPath.value);
        pushPair(gsArgs, '-T', fields.gsStatsPath.value);
        pushPair(gsArgs, '-C', fields.gsHideCursorDelay.value);
        pushPair(gsArgs, '--xwayland-count', fields.gsXwaylandCount.value);
        pushPair(gsArgs, '--prefer-vk-device', fields.gsPreferVkDevice.value);
        pushPair(gsArgs, '--force-orientation', fields.gsForceOrientation.value);
        pushFlag(gsArgs, '--force-windows-fullscreen', fields.gsFlagForceWindowsFullscreen.checked);
        pushPair(gsArgs, '--cursor-scale-height', fields.gsCursorScaleHeight.value);
        pushPair(gsArgs, '--virtual-connector-strategy', fields.gsVirtualConnectorStrategy.value);
        pushPair(gsArgs, '--framerate-limit', fields.gsFramerateLimit.value);
        pushFlag(gsArgs, '-k', fields.gsFlagDisableKeybinds.checked);
        pushFlag(gsArgs, '--touch-gesture-translation', fields.gsFlagTouchGestureTranslation.checked);

        pushPair(gsArgs, '--sdr-gamut-wideness', fields.gsSdrGamutWideness.value);
        pushPair(gsArgs, '--hdr-sdr-content-nits', fields.gsHdrSdrContentNits.value);
        pushFlag(gsArgs, '--hdr-itm-enabled', fields.gsFlagHdrItmEnabled.checked);
        pushPair(gsArgs, '--hdr-itm-sdr-nits', fields.gsHdrItmSdrNits.value);
        pushPair(gsArgs, '--hdr-itm-target-nits', fields.gsHdrItmTargetNits.value);

        pushPair(gsArgs, '-O', fields.gsPreferOutput.value);
        pushPair(gsArgs, '--default-touch-mode', fields.gsDefaultTouchMode.value);
        pushPair(gsArgs, '--generate-drm-mode', fields.gsGenerateDrmMode.value);

        pushPair(gsArgs, '--vr-overlay-key', fields.gsVrOverlayKey.value);
        pushPair(gsArgs, '--vr-app-overlay-key', fields.gsVrAppOverlayKey.value);
        pushPair(gsArgs, '--vr-overlay-explicit-name', fields.gsVrOverlayExplicitName.value);
        pushPair(gsArgs, '--vr-overlay-default-name', fields.gsVrOverlayDefaultName.value);
        pushPair(gsArgs, '--vr-overlay-icon', fields.gsVrOverlayIcon.value);
        pushPair(gsArgs, '--vr-scrolls-speed', fields.gsVrScrollsSpeed.value);
        pushFlag(gsArgs, '--vr-overlay-show-immediately', fields.gsFlagVrOverlayShowImmediately.checked);
        pushFlag(gsArgs, '--vr-overlay-enable-control-bar', fields.gsFlagVrOverlayEnableControlBar.checked);
        pushFlag(gsArgs, '--vr-overlay-enable-control-bar-keyboard', fields.gsFlagVrOverlayEnableControlBarKeyboard.checked);
        pushFlag(gsArgs, '--vr-overlay-enable-control-bar-close', fields.gsFlagVrOverlayEnableControlBarClose.checked);
        pushFlag(gsArgs, '--vr-overlay-enable-click-stabilization', fields.gsFlagVrOverlayEnableClickStabilization.checked);
        pushFlag(gsArgs, '--vr-overlay-modal', fields.gsFlagVrOverlayModal.checked);
        pushPair(gsArgs, '--vr-overlay-physical-width', fields.gsVrOverlayPhysicalWidth.value);
        pushPair(gsArgs, '--vr-overlay-physical-curvature', fields.gsVrOverlayPhysicalCurvature.value);
        pushPair(gsArgs, '--vr-overlay-physical-pre-curve-pitch', fields.gsVrOverlayPhysicalPreCurvePitch.value);

        pushFlag(gsArgs, '--disable-layers', fields.gsFlagDisableLayers.checked);
        pushFlag(gsArgs, '--debug-layers', fields.gsFlagDebugLayers.checked);
        pushFlag(gsArgs, '--debug-focus', fields.gsFlagDebugFocus.checked);
        pushFlag(gsArgs, '--synchronous-x11', fields.gsFlagSynchronousX11.checked);
        pushFlag(gsArgs, '--debug-hud', fields.gsFlagDebugHud.checked);
        pushFlag(gsArgs, '--debug-events', fields.gsFlagDebugEvents.checked);
        pushFlag(gsArgs, '--force-composition', fields.gsFlagForceComposition.checked);
        pushFlag(gsArgs, '--composite-debug', fields.gsFlagCompositeDebug.checked);
        pushFlag(gsArgs, '--disable-color-management', fields.gsFlagDisableColorManagement.checked);
        pushFlag(gsArgs, '--disable-xres', fields.gsFlagDisableXres.checked);
        pushFlag(gsArgs, '--hdr-debug-force-support', fields.gsFlagHdrDebugForceSupport.checked);
        pushFlag(gsArgs, '--hdr-debug-force-output', fields.gsFlagHdrDebugForceOutput.checked);
        pushFlag(gsArgs, '--hdr-debug-heatmap', fields.gsFlagHdrDebugHeatmap.checked);

        pushPair(gsArgs, '--reshade-effect', fields.gsReshadeEffect.value);
        pushPair(gsArgs, '--reshade-technique-idx', fields.gsReshadeTechniqueIdx.value);

        pushPair(gsArgs, '--mura-map', fields.gsMuraMap.value);

        pushFlag(gsArgs, '--allow-deferred-backend', fields.gsFlagAllowDeferredBackend.checked);
        pushFlag(gsArgs, '--keep-alive', fields.gsFlagKeepAlive.checked);

        const prependVal = String(fields.gsPrependedValues.value || '').trim();
        const extraVal = String(fields.gsExtraArgs.value || '').trim();

        if (gsArgs.length > 0 || prependVal || extraVal) {
          let gamescopeStr = 'gamescope ' + gsArgs.join(' ') + ' --';
          if (prependVal) {
            gamescopeStr = prependVal + ' ' + gamescopeStr;
          }
          if (extraVal) {
            gamescopeStr = gamescopeStr.replace(' --', ' ' + extraVal + ' --');
          }
          cmdParts.push(gamescopeStr);
        }
      }

      // 5. Játék futtatandó parancsa
      const showGameCmd = !(enableDllModule.checked && fields.dllOutputFormat && fields.dllOutputFormat.value === 'env-only');
      if (showGameCmd) {
        const gameCmd = globalLaunchCommand.value.trim() || '%command%';
        cmdParts.push(gameCmd);
      }

      return cmdParts.join(' ');
    }

    function updateCommand() {
      const cmd = buildCommand();
      commandDisplay.textContent = cmd;
      copyStatus.textContent = '';

      if (announceTimeout) clearTimeout(announceTimeout);
      announceTimeout = setTimeout(() => {
        srAnnouncer.textContent = 'Az egyesített parancs frissült.';
      }, 250);

      if (currentPresetName) {
        setModifiedStatus(true);
      }
    }

    function triggerUpdate() {
      updateCommand();
    }

    const allInputs = document.querySelectorAll('#builder-form input, #builder-form select, #builder-form textarea, #global-launch-command');
    allInputs.forEach(input => {
      input.addEventListener('input', triggerUpdate);
      input.addEventListener('change', triggerUpdate);
    });

    enableDllModule.addEventListener('change', triggerUpdate);
    enableProtonModule.addEventListener('change', triggerUpdate);
    enableGamescopeModule.addEventListener('change', triggerUpdate);

    fields.gsResolutionPreset.addEventListener('change', function() {
      if (this.value) {
        const [w, h] = this.value.split('x');
        fields.gsGameWidth.value = w;
        fields.gsGameHeight.value = h;
        triggerUpdate();
      }
    });

    fields.gsOutputPreset.addEventListener('change', function() {
      if (this.value) {
        const [w, h] = this.value.split('x');
        fields.gsOutputWidth.value = w;
        fields.gsOutputHeight.value = h;
        triggerUpdate();
      }
    });

    function loadExternalPresets() {
      if (!idb) return;

      // Gamescope Presets
      try {
        const gsReq = idb.open('GamescopePresets', 1);
        gsReq.onsuccess = (e) => {
          const gsDb = e.target.result;
          if (!gsDb.objectStoreNames.contains('presets')) return;
          const tx = gsDb.transaction(['presets'], 'readonly');
          const store = tx.objectStore('presets');
          store.getAll().onsuccess = (ev) => {
            populateExternalDropdown('merge-gamescope-preset', ev.target.result);
          };
        };
      } catch(err) { console.warn('Hiba a Gamescope DB megnyitásakor:', err); }

      // Proton Presets
      try {
        const prReq = idb.open('ProtonPresets', 1);
        prReq.onsuccess = (e) => {
          const prDb = e.target.result;
          if (!prDb.objectStoreNames.contains('presets')) return;
          const tx = prDb.transaction(['presets'], 'readonly');
          const store = tx.objectStore('presets');
          store.getAll().onsuccess = (ev) => {
            populateExternalDropdown('merge-proton-preset', ev.target.result);
          };
        };
      } catch(err) { console.warn('Hiba a Proton DB megnyitásakor:', err); }

      // DLL Overrides Presets
      try {
        const dllReq = idb.open('WinedlloverridesPresets', 1);
        dllReq.onsuccess = (e) => {
          const dllDb = e.target.result;
          if (!dllDb.objectStoreNames.contains('presets')) return;
          const tx = dllDb.transaction(['presets'], 'readonly');
          const store = tx.objectStore('presets');
          store.getAll().onsuccess = (ev) => {
            populateExternalDropdown('merge-dll-preset', ev.target.result);
          };
        };
      } catch(err) { console.warn('Hiba a DLL DB megnyitásakor:', err); }
    }

    function populateExternalDropdown(elementId, presetsList) {
      const select = document.getElementById(elementId);
      if (!select) return;
      
      select.innerHTML = '<option value="" selected>-- Válassz sablont --</option>';
      if (presetsList.length === 0) {
        select.innerHTML = '<option value="">Nincsenek mentett sablonok</option>';
        return;
      }
      
      presetsList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
      
      select.presetsData = presetsList;
    }

    document.getElementById('btn-load-ext-gamescope').addEventListener('click', () => {
      const select = document.getElementById('merge-gamescope-preset');
      const name = select.value;
      if (!name || !select.presetsData) return;
      const item = select.presetsData.find(p => p.name === name);
      if (item) {
        applyGamescopePreset(item.preset);
        enableGamescopeModule.checked = true;
        triggerUpdate();
        alert(`Gamescope "${name}" sablon betöltve a fülre!`);
      }
    });

    document.getElementById('btn-load-ext-proton').addEventListener('click', () => {
      const select = document.getElementById('merge-proton-preset');
      const name = select.value;
      if (!name || !select.presetsData) return;
      const item = select.presetsData.find(p => p.name === name);
      if (item) {
        applyProtonPreset(item.preset);
        enableProtonModule.checked = true;
        triggerUpdate();
        alert(`Proton "${name}" sablon betöltve a fülre!`);
      }
    });

    document.getElementById('btn-load-ext-dll').addEventListener('click', () => {
      const select = document.getElementById('merge-dll-preset');
      const name = select.value;
      if (!name || !select.presetsData) return;
      const item = select.presetsData.find(p => p.name === name);
      if (item) {
        applyDllPreset(item.preset);
        enableDllModule.checked = true;
        triggerUpdate();
        alert(`DLL Overrides "${name}" sablon betöltve a fülre!`);
      }
    });

    function applyGamescopePreset(gsData) {
      fields.gsGameWidth.value = gsData.gameWidth || '';
      fields.gsGameHeight.value = gsData.gameHeight || '';
      fields.gsOutputWidth.value = gsData.outputWidth || '';
      fields.gsOutputHeight.value = gsData.outputHeight || '';
      fields.gsFpsLimit.value = gsData.fpsLimit || '';
      fields.gsFpsUnfocused.value = gsData.fpsUnfocused || '';
      fields.gsScalingMode.value = gsData.scalingMode || '';
      fields.gsUpscalerType.value = gsData.upscalerType || '';
      fields.gsDisplayIndex.value = gsData.displayIndex || '-1';
      fields.gsFlagFullscreen.checked = Boolean(gsData.flagFullscreen);
      fields.gsFlagBorderless.checked = Boolean(gsData.flagBorderless);
      fields.gsFlagImmediate.checked = Boolean(gsData.flagImmediate);
      fields.gsFlagMangoapp.checked = Boolean(gsData.flagMangoapp);
      fields.gsFlagExposeWayland.checked = Boolean(gsData.flagExposeWayland);
      fields.gsFlagHdr.checked = Boolean(gsData.flagHdr);
      fields.gsFlagAdaptiveSync.checked = Boolean(gsData.flagAdaptiveSync);
      fields.gsFlagGrabCursor.checked = Boolean(gsData.flagGrabCursor);
      fields.gsFlagGrabKeyboard.checked = Boolean(gsData.flagGrabKeyboard);
      fields.gsPrependedValues.value = gsData.prependedValues || '';
      fields.gsExtraArgs.value = gsData.extraArgs || '';
      fields.gsMaxScale.value = gsData.maxScale || '0';
      const maxScaleValSpan = document.getElementById('max-scale-val');
      if (maxScaleValSpan) {
        maxScaleValSpan.textContent = gsData.maxScale && gsData.maxScale !== '0' ? gsData.maxScale : 'Kikapcsolva';
      }
      fields.gsFsrSharpness.value = gsData.fsrSharpness || '2';
      const fsrSharpnessValSpan = document.getElementById('fsr-sharpness-val');
      if (fsrSharpnessValSpan) {
        fsrSharpnessValSpan.textContent = fields.gsFsrSharpness.value;
      }
      fields.gsReadyFd.value = gsData.readyFd || '-1';
      fields.gsFlagRt.checked = Boolean(gsData.flagRt);
      fields.gsFlagSteam.checked = Boolean(gsData.flagSteam);
      fields.gsMouseSensitivity.value = gsData.mouseSensitivity || '';
      fields.gsBackend.value = gsData.backend || '';
      fields.gsCursorPath.value = gsData.cursorPath || '';
      fields.gsStatsPath.value = gsData.statsPath || '';
      fields.gsHideCursorDelay.value = gsData.hideCursorDelay || '';
      fields.gsXwaylandCount.value = gsData.xwaylandCount || '';
      fields.gsPreferVkDevice.value = gsData.preferVkDevice || '';
      fields.gsForceOrientation.value = gsData.forceOrientation || '';
      fields.gsFlagForceWindowsFullscreen.checked = Boolean(gsData.flagForceWindowsFullscreen);
      fields.gsCursorScaleHeight.value = gsData.cursorScaleHeight || '';
      fields.gsVirtualConnectorStrategy.value = gsData.virtualConnectorStrategy || '';
      fields.gsFramerateLimit.value = gsData.framerateLimit || '';
      fields.gsFlagDisableKeybinds.checked = Boolean(gsData.flagDisableKeybinds);
      fields.gsFlagTouchGestureTranslation.checked = Boolean(gsData.flagTouchGestureTranslation);
      fields.gsSdrGamutWideness.value = gsData.sdrGamutWideness || '';
      fields.gsHdrSdrContentNits.value = gsData.hdrSdrContentNits || '';
      fields.gsFlagHdrItmEnabled.checked = Boolean(gsData.flagHdrItmEnabled);
      fields.gsHdrItmSdrNits.value = gsData.hdrItmSdrNits || '';
      fields.gsHdrItmTargetNits.value = gsData.hdrItmTargetNits || '';
      fields.gsPreferOutput.value = gsData.preferOutput || '';
      fields.gsDefaultTouchMode.value = gsData.defaultTouchMode || '';
      fields.gsGenerateDrmMode.value = gsData.generateDrmMode || '';
      fields.gsVrOverlayKey.value = gsData.vrOverlayKey || '';
      fields.gsVrAppOverlayKey.value = gsData.vrAppOverlayKey || '';
      fields.gsVrOverlayExplicitName.value = gsData.vrOverlayExplicitName || '';
      fields.gsVrOverlayDefaultName.value = gsData.vrOverlayDefaultName || '';
      fields.gsVrOverlayIcon.value = gsData.vrOverlayIcon || '';
      fields.gsVrScrollsSpeed.value = gsData.vrScrollsSpeed || '';
      fields.gsFlagVrOverlayShowImmediately.checked = Boolean(gsData.flagVrOverlayShowImmediately);
      fields.gsFlagVrOverlayEnableControlBar.checked = Boolean(gsData.flagVrOverlayEnableControlBar);
      fields.gsFlagVrOverlayEnableControlBarKeyboard.checked = Boolean(gsData.flagVrOverlayEnableControlBarKeyboard);
      fields.gsFlagVrOverlayEnableControlBarClose.checked = Boolean(gsData.flagVrOverlayEnableControlBarClose);
      fields.gsFlagVrOverlayEnableClickStabilization.checked = Boolean(gsData.flagVrOverlayEnableClickStabilization);
      fields.gsFlagVrOverlayModal.checked = Boolean(gsData.flagVrOverlayModal);
      fields.gsVrOverlayPhysicalWidth.value = gsData.vrOverlayPhysicalWidth || '';
      fields.gsVrOverlayPhysicalCurvature.value = gsData.vrOverlayPhysicalCurvature || '';
      fields.gsVrOverlayPhysicalPreCurvePitch.value = gsData.vrOverlayPhysicalPreCurvePitch || '';
      fields.gsFlagDisableLayers.checked = Boolean(gsData.flagDisableLayers);
      fields.gsFlagDebugLayers.checked = Boolean(gsData.flagDebugLayers);
      fields.gsFlagDebugFocus.checked = Boolean(gsData.flagDebugFocus);
      fields.gsFlagSynchronousX11.checked = Boolean(gsData.flagSynchronousX11);
      fields.gsFlagDebugHud.checked = Boolean(gsData.flagDebugHud);
      fields.gsFlagDebugEvents.checked = Boolean(gsData.flagDebugEvents);
      fields.gsFlagForceComposition.checked = Boolean(gsData.flagForceComposition);
      fields.gsFlagCompositeDebug.checked = Boolean(gsData.flagCompositeDebug);
      fields.gsFlagDisableColorManagement.checked = Boolean(gsData.flagDisableColorManagement);
      fields.gsFlagDisableXres.checked = Boolean(gsData.flagDisableXres);
      fields.gsFlagHdrDebugForceSupport.checked = Boolean(gsData.flagHdrDebugForceSupport);
      fields.gsFlagHdrDebugForceOutput.checked = Boolean(gsData.flagHdrDebugForceOutput);
      fields.gsFlagHdrDebugHeatmap.checked = Boolean(gsData.flagHdrDebugHeatmap);
      fields.gsReshadeEffect.value = gsData.reshadeEffect || '';
      fields.gsReshadeTechniqueIdx.value = gsData.reshadeTechniqueIdx || '';
      fields.gsMuraMap.value = gsData.muraMap || '';
      fields.gsFlagAllowDeferredBackend.checked = Boolean(gsData.flagAllowDeferredBackend);
      fields.gsFlagKeepAlive.checked = Boolean(gsData.flagKeepAlive);
    }

    function applyProtonPreset(prData) {
      fields.prFlagProtonLog.checked = Boolean(prData.flagProtonLog);
      fields.prProtonLogDir.value = prData.protonLogDir || '';
      fields.prWinedebug.value = prData.winedebug || '';
      fields.prDxvkHud.value = prData.dxvkHud || '';
      fields.prDxvkFrameRate.value = prData.dxvkFrameRate || '';
      fields.prFlagUseWined3d.checked = Boolean(prData.flagUseWined3d);
      fields.prFlagEnableHdr.checked = Boolean(prData.flagEnableHdr);
      fields.prFlagEnableNvapi.checked = Boolean(prData.flagEnableNvapi);
      
      fields.prVkd3dConfig.value = prData.vkd3dConfig || '';
      fields.prVkd3dDebug.value = prData.vkd3dDebug || '';
      fields.prVkd3dFeatureLevel.value = prData.vkd3dFeatureLevel || '';
      fields.prDxvkConfigFile.value = prData.dxvkConfigFile || '';
      fields.prFlagNoD3d10.checked = Boolean(prData.flagNoD3d10);
      fields.prFlagNoD3d11.checked = Boolean(prData.flagNoD3d11);
      fields.prFlagNoD3d12.checked = Boolean(prData.flagNoD3d12);
      fields.prFlagNoStateCache.checked = Boolean(prData.flagNoStateCache);

      fields.prMesaVkDeviceSelect.value = prData.mesaVkDeviceSelect || '';
      fields.prFlagNoEsync.checked = Boolean(prData.flagNoEsync);
      fields.prFlagNoFsync.checked = Boolean(prData.flagNoFsync);
      fields.prFlagUseNtsync.checked = Boolean(prData.flagUseNtsync);
      fields.prFlagForceLaa.checked = Boolean(prData.flagForceLaa);
      fields.prFlagHeapDelayFree.checked = Boolean(prData.flagHeapDelayFree);

      fields.prWineprefix.value = prData.wineprefix || '';
      fields.prUserLaunchArgs.value = prData.userLaunchArgs || '';
      fields.prFlagGamemoderun.checked = Boolean(prData.flagGamemoderun);
      fields.prFlagMangohud.checked = Boolean(prData.flagMangohud);
      fields.prFlagVkbasalt.checked = Boolean(prData.flagVkbasalt);
      fields.prFlagEnableWayland.checked = Boolean(prData.flagEnableWayland);
      fields.prFlagHideNvidiaGpu.checked = Boolean(prData.flagHideNvidiaGpu);
      fields.prFlagDlssUpgrade.checked = Boolean(prData.flagDlssUpgrade);
      fields.prFlagDumpDebugCommands.checked = Boolean(prData.flagDumpDebugCommands);
    }

    function applyDllPreset(dllData) {
      PREDEFINED_DLLS.forEach(dll => {
        const chk = document.getElementById(`chk-pre-${dll.name}`);
        const sel = document.getElementById(`select-pre-${dll.name}`);
        const wrapper = document.getElementById(`select-wrapper-pre-${dll.name}`);
        
        const presetDll = dllData.builtinDlls && dllData.builtinDlls[dll.name];
        if (presetDll) {
          if (chk) chk.checked = presetDll.checked;
          if (sel) sel.value = presetDll.type || 'n,b';
          if (wrapper) {
            if (presetDll.checked) wrapper.classList.add('open');
            else wrapper.classList.remove('open');
          }
        } else {
          if (chk) chk.checked = false;
          if (sel) sel.value = 'n,b';
          if (wrapper) wrapper.classList.remove('open');
        }
      });

      customDlls = dllData.customDlls ? JSON.parse(JSON.stringify(dllData.customDlls)) : [];
      renderCustomDlls();

      if (fields.dllOutputFormat) {
        fields.dllOutputFormat.value = dllData.outputFormat || 'steam-command';
      }
    }

    function setPresetName(name) {
      currentPresetName = name;
      if (name) {
        activePresetIndicator.textContent = ` - Sablon: ${name}`;
      } else {
        activePresetIndicator.textContent = '';
      }
    }

    function setModifiedStatus(modified) {
      isModified = modified;
      if (currentPresetName) {
        activePresetIndicator.textContent = ` - Sablon: ${currentPresetName}${modified ? ' *' : ''}`;
      }
    }

    function resetPresetState() {
      setPresetName('');
      isModified = false;
    }

    function clearForm() {
      allInputs.forEach(input => {
        if (input.type === 'checkbox') input.checked = false;
        else if (input.type === 'range') {
          if (input.id === 'max-scale') {
            input.value = '0';
            const span = document.getElementById('max-scale-val');
            if (span) span.textContent = 'Kikapcsolva';
          } else {
            input.value = '2';
            const span = document.getElementById('fsr-sharpness-val');
            if (span) span.textContent = '2';
          }
        }
        else if (input.id === 'global-launch-command') input.value = '%command%';
        else if (input.id === 'display-index') input.value = '-1';
        else if (input.id === 'ready-fd') input.value = '-1';
        else if (input.id === 'output-format') input.value = 'steam-command';
        else input.value = '';
      });

      customDlls = [];
      renderCustomDlls();
      
      enableDllModule.checked = true;
      enableProtonModule.checked = true;
      enableGamescopeModule.checked = true;

      PREDEFINED_DLLS.forEach(dll => {
        const wrapper = document.getElementById(`select-wrapper-pre-${dll.name}`);
        if (wrapper) wrapper.classList.remove('open');
      });

      resetPresetState();
      triggerUpdate();
    }

    if (idb) {
      const suiteReq = idb.open('SuitePresets', 1);
      suiteReq.onupgradeneeded = (e) => {
        const activeDb = e.target.result;
        if (!activeDb.objectStoreNames.contains('presets')) {
          activeDb.createObjectStore('presets', { keyPath: 'name' });
        }
      };
      suiteReq.onsuccess = (e) => {
        db = e.target.result;
        loadPresetsList();
      };
    }

    function getPresetsFromDb(callback) {
      if (!db) return callback([]);
      const tx = db.transaction(['presets'], 'readonly');
      const store = tx.objectStore('presets');
      const req = store.getAll();
      req.onsuccess = () => callback(req.result);
    }

    function savePresetToDb(presetObj, callback) {
      if (!db) return callback();
      const tx = db.transaction(['presets'], 'readwrite');
      const store = tx.objectStore('presets');
      const req = store.put(presetObj);
      req.onsuccess = () => callback();
    }

    function deletePresetFromDb(name, callback) {
      if (!db) return callback();
      const tx = db.transaction(['presets'], 'readwrite');
      const store = tx.objectStore('presets');
      const req = store.delete(name);
      req.onsuccess = () => callback();
    }

    function loadPresetsList() {
      getPresetsFromDb((presets) => {
        presetsContainer.innerHTML = '';
        if (presets.length === 0) {
          presetsContainer.appendChild(emptyPresetsMsg);
          return;
        }

        presets.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'preset-item';
          row.innerHTML = `
            <span class="preset-item-name" title="${item.name}">${item.name}</span>
            <div class="preset-item-actions">
              <button class="btn btn-primary btn-load" data-name="${item.name}">Betöltés</button>
              <button class="btn btn-danger btn-delete" data-name="${item.name}">Törlés</button>
            </div>
          `;
          presetsContainer.appendChild(row);

          row.querySelector('.btn-load').addEventListener('click', () => {
            applySuitePreset(item.preset);
            setPresetName(item.name);
            setModifiedStatus(false);
            srAnnouncer.textContent = `A(z) "${item.name}" egyesített sablon betöltve.`;
          });

          row.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm(`Biztosan törlöd a(z) "${item.name}" egyesített sablont?`)) {
              deletePresetFromDb(item.name, () => {
                loadPresetsList();
                if (currentPresetName === item.name) resetPresetState();
              });
            }
          });
        });
      });
    }

    function applySuitePreset(suiteData) {
      enableDllModule.checked = Boolean(suiteData.enableDll);
      enableProtonModule.checked = Boolean(suiteData.enableProton);
      enableGamescopeModule.checked = Boolean(suiteData.enableGamescope);
      globalLaunchCommand.value = suiteData.globalLaunchCommand || '%command%';

      if (suiteData.gamescope) applyGamescopePreset(suiteData.gamescope);
      if (suiteData.proton) applyProtonPreset(suiteData.proton);
      if (suiteData.dll) applyDllPreset(suiteData.dll);

      triggerUpdate();
    }

    function getSuitePresetData() {
      const gsData = {};
      Object.keys(fields).forEach(k => {
        if (k.startsWith('gs')) {
          const el = fields[k];
          const name = k.slice(2).charAt(0).toLowerCase() + k.slice(3);
          gsData[name] = el.type === 'checkbox' ? el.checked : el.value;
        }
      });

      const prData = {};
      Object.keys(fields).forEach(k => {
        if (k.startsWith('pr')) {
          const el = fields[k];
          const name = k.slice(2).charAt(0).toLowerCase() + k.slice(3);
          prData[name] = el.type === 'checkbox' ? el.checked : el.value;
        }
      });

      const builtinDlls = {};
      PREDEFINED_DLLS.forEach(dll => {
        const chk = document.getElementById(`chk-pre-${dll.name}`);
        const sel = document.getElementById(`select-pre-${dll.name}`);
        builtinDlls[dll.name] = {
          checked: chk ? chk.checked : false,
          type: sel ? sel.value : 'n,b'
        };
      });

      return {
        enableDll: enableDllModule.checked,
        enableProton: enableProtonModule.checked,
        enableGamescope: enableGamescopeModule.checked,
        globalLaunchCommand: globalLaunchCommand.value,
        gamescope: gsData,
        proton: prData,
        dll: {
          builtinDlls: builtinDlls,
          customDlls: customDlls,
          outputFormat: fields.dllOutputFormat ? fields.dllOutputFormat.value : 'steam-command'
        }
      };
    }

    savePresetBtn.addEventListener('click', () => {
      const name = presetNameInput.value.trim();
      if (!name) {
        alert('Kérlek adj meg egy nevet a sablonnak!');
        return;
      }

      const data = getSuitePresetData();
      savePresetToDb({ name: name, preset: data }, () => {
        presetNameInput.value = '';
        loadPresetsList();
        setPresetName(name);
        setModifiedStatus(false);
      });
    });

    clearBtn.addEventListener('click', () => {
      if (confirm('Biztosan kiüríted a teljes űrlapot?')) {
        clearForm();
      }
    });

    exportBtn.addEventListener('click', () => {
      getPresetsFromDb((presets) => {
        if (presets.length === 0) {
          alert('Nincsenek mentett sablonok.');
          return;
        }
        const blob = new Blob([JSON.stringify(presets, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'steam_launcher_suite_sablonok.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    });

    importBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const imported = JSON.parse(ev.target.result);
            const isValid = Array.isArray(imported) && imported.every(item => 
              item && typeof item === 'object' && typeof item.name === 'string' && typeof item.preset === 'object'
            );

            if (!isValid) {
              alert('Érvénytelen JSON fájl.');
              return;
            }

            if (db) {
              const tx = db.transaction(['presets'], 'readwrite');
              const store = tx.objectStore('presets');
              imported.forEach(p => store.put(p));
              tx.oncomplete = () => {
                loadPresetsList();
                alert('Egyesített sablonok sikeresen importálva!');
              };
            }
          } catch (err) {
            alert('Hiba történt a JSON beolvasásakor: ' + err.message);
          }
        };
        reader.readAsText(file);
      });
      fileInput.click();
    });

    const DEMO_PRESET = {
      enableDll: true,
      enableProton: true,
      enableGamescope: true,
      globalLaunchCommand: '%command%',
      gamescope: {
        gameWidth: '1280',
        gameHeight: '720',
        outputWidth: '1920',
        outputHeight: '1080',
        scalingMode: 'fsr',
        fsrSharpness: '2',
        refreshRate: '144',
        framerateLimit: '144',
        vrrMode: '--eatt',
        vsyncMode: 'mailbox',
        flagFull: true,
        flagBorderless: false,
        flagGrabInput: true,
        backend: '',
        forceOrientation: '',
        preferVkDevice: '',
        mouseSensitivity: '',
        hdrMode: '--hdr-enabled',
        sdrGamutWideness: '',
        hdrSdrContentNits: ''
      },
      proton: {
        flagProtonLog: true,
        protonLogDir: '/tmp',
        winedebug: '-all',
        dxvkHud: 'fps',
        dxvkFrameRate: '',
        flagUseWined3d: false,
        flagEnableHdr: true,
        flagEnableNvapi: true,
        vkd3dConfig: 'dxr11,dxr',
        mesaVkDeviceSelect: '',
        flagNoEsync: false,
        flagNoFsync: false,
        flagUseNtsync: true,
        wineprefix: '',
        userLaunchArgs: 'PROTON_NO_WRITE_WATCH=1',
        flagGamemoderun: true,
        flagMangohud: true,
        flagVkbasalt: false
      },
      dll: {
        builtinDlls: {
          d3d11: { checked: true, type: 'n,b' },
          dxgi: { checked: true, type: 'n,b' },
          dinput8: { checked: true, type: 'n' },
          version: { checked: false, type: 'n,b' },
          d3d9: { checked: false, type: 'n,b' },
          d3d12: { checked: false, type: 'n,b' },
          d3d12core: { checked: false, type: 'n,b' },
          dsound: { checked: false, type: 'n,b' }
        },
        customDlls: [
          { name: 'winhttp', type: 'n,b', checked: true }
        ]
      }
    };

    exampleBtn.addEventListener('click', () => {
      applySuitePreset(DEMO_PRESET);
      resetPresetState();
    });

    copyBtn.addEventListener('click', async () => {
      const cmdText = buildCommand();
      if (!cmdText) {
        copyStatus.textContent = 'Üres parancs!';
        return;
      }
      try {
        await navigator.clipboard.writeText(cmdText);
        copyStatus.textContent = 'Parancs sikeresen a vágólapra másolva!';
        copyStatus.style.color = 'var(--success)';
      } catch (err) {
        copyStatus.textContent = 'Hiba a másoláskor. Másold manuálisan!';
        copyStatus.style.color = 'var(--danger)';
      }
    });

    renderPredefinedDlls();
    renderCustomDlls();
    setTimeout(loadExternalPresets, 200);
    updateCommand();
  }

  // =========================================================================
  // DISPATCH INITIALIZATION BASED ON PAGE TYPE
  // =========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'winedlloverrides') {
      initWineDllOverridesPage();
    } else if (page === 'proton') {
      initProtonPage();
    } else if (page === 'gamescope') {
      initGamescopePage();
    } else if (page === 'main') {
      initMainPage();
    }
  });
})();
