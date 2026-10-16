# Browsy Chromium 🌐🚀

Moderní, rychlý a na soukromí zaměřený webový prohlížeč postavený na jádře **Chromium** s bohatou výbavou integrovaných nástrojů.

---

## 🌟 Klíčové vlastnosti

### 1. 🧩 Podpora Manifest V2 & Manifest V3
- Na rozdíl od běžného Google Chrome, kde byla podpora Manifest V2 ukončena, **Browsy Chromium** zachovává plnou nativní podporu pro doplňky **Manifest V2** i **Manifest V3**.
- Umožňuje bezproblémový běh pokročilých blokátorů a nástrojů vyžadujících neomezené WebRequest API.

### 2. 🛡️ Integrovaný uBlock Origin a Browsy Shields
- Přímo v prohlížeči je integrován **uBlock Origin (Manifest V2)** společně s nativním štítem na úrovni síťových požadavků.
- Blokuje:
  - Všechny typy webových reklam (bannery, video reklamy, textové reklamy).
  - Sledovací skripty, analytiku a fingerprinting (Google Analytics, Facebook Pixel, Hotjar atd.).
  - Těžební skripty (cryptominery) a škodlivé domény.
- Počítadlo zablokovaných prvků přímo v Omniboxu a přehledné statistiky.

### 3. 🚫 Integrovaný Pop-up Blocker
- Inteligentní zachytávání a blokování nevyžádaných vyskakovacích oken (`window.open`), popunder oken a přesměrování.
- Pokud stránka zkusí otevřít vyskakovací okno, v adresním řádku se zobrazí indikátor **🚫 Zablokováno**.
- Možnost jedním kliknutím zobrazit blokované adresy nebo povolit vyskakovací okna pro danou doménu.

### 4. 📹 Stahování webových videí (Media Sniffer)
- Vestavěný síťový a DOM detektor médií.
- Automaticky rozpoznává video streamy (MP4, WebM, HLS `.m3u8`, DASH `.mpd`).
- Ikona kamery v nástrojové liště zobrazuje počet nalezených videí na stránce.
- Nabízí stažení videa jedním kliknutím nebo zkopírování přímé URL adresy streamu.

### 5. 📝 Text Expander (Dynamické zkratky a šablony)
- Funguje v každém textovém poli na libovolné webové stránce (`<input>`, `<textarea>`, `contenteditable`).
- Napište zkratku a okamžitě se nahradí požadovaným textem:
  - `:date` &rarr; Aktuální datum (např. `16. 10. 2026`)
  - `:time` &rarr; Aktuální čas (např. `14:35`)
  - `:mail` &rarr; Vaše e-mailová adresa
  - `:shrug` &rarr; `¯\_(ツ)_/¯`
  - `:lenny` &rarr; `( ͡° ͜ʖ ͡°)`
  - `:greet` &rarr; Formální pozdrav a podpis
  - `:thx` &rarr; `Děkuji mnohokrát!`
- Možnost vytvářet a upravovat vlastní zkratky přímo v rozhraní prohlížeče.

### 6. 🦊 Podpora Firefox a Chrome doplňků
- **Chrome doplňky**: Instalace z rozbalených složek, souborů `.crx` a `.zip`.
- **Firefox doplňky**: Podpora instalace balíčků Mozilla Firefox (`.xpi`).
  - Automatická adaptace Firefox manifestu a injekce kompatibilního polyfillu pro API `browser.*`.
- Přehledná správcovská stránka doplňků `browsy://extensions`.

### 7. 📑 Vertikální i horizontální taby
- Okamžité přepínání stylu záložek jedním kliknutím na ikonu v nástrojové liště:
  - **Horizontální režim**: Klasická lišta tabů nahoře (styl Chrome).
  - **Vertikální režim**: Moderní postranní panel vlevo (styl MS Edge / Arc).
- Možnost sbalení vertikálního panelu na kompaktní ikony (58 px) nebo rozbalení na plný název (240 px).
- Podpora indikace přehrávání zvuku, ztlumení (mute) záložky a zavírání.

### 8. 🧘 Pracovní prostory (Workspaces ve stylu Zen Browser)
- Oddělte své taby do samostatných tematických prostorů (např. *👤 Osobní*, *💼 Práce*, *⚡ Vývoj*, *🎓 Škola*, *🎮 Hry*).
- **Zen Workspace Dock**: Kruhová tlačítka ve spodní části postranního panelu s vlastním barevným podsvícením a ikonami.
- **Okamžité přepínání**:
  - Kliknutím na ikonu v Zen docku.
  - Rolováním kolečkem myši nad spodním panelem prostorů.
  - Klávesovou zkratkou `Alt + 1`, `Alt + 2`, atd.
  - Přes rozbalovací menu na horní liště.
- **Přesouvání tabů**: Klikněte pravým tlačítkem myši na libovolnou záložku a zvolte *Přesunout do prostoru ❯*.
- **Vlastní přizpůsobení**: Vytváření nových prostorů s výběrem emoji ikony a barevného akcentu.

---

### 9. ⚡ Nativní Rust NAPI Core (Brave AdBlock Engine & Tokio)
- Klíčové výkonnostní části prohlížeče jsou napsány v **Rustu** a kompilovány do nativního Node API modulu (`browsy-core.node`):
  - **Brave Software `adblock-rust`**: Oficiální rychlý Rust engine používaný v prohlížeči Brave, provádí filtrování EasyList / uBlock pravidel v mikrosekundách.
  - **Asynchronní stream downloader**: Běží na multithreadovém Tokio runtime s efektivním chunk streamingem přes `reqwest`.
  - **Rust String Expander**: Bleskurychlá tokenizace a expanze šablon textového expandéru.

### 10. 🎨 Moderní UI v Svelte 5 (Runes)
- Uživatelské rozhraní prohlížeče je napsáno v **Svelte 5** s využitím moderních reaktivních run (`$state`, `$derived`, `$effect`) a bundlováno pomocí Vite.
- Okamžitá reaktivita při přepínání tabů, animace Zen docku a nízká paměťová stopa.

---

## 🛠️ Spuštění a kompilace prohlížeče

### Požadavky
- **Node.js** (v18+)
- **NPM**
- **Rust toolchain** (`cargo`, `rustc`) – volitelné, potřebné pouze pro kompilaci Rust jádra ze zdrojových kódů.

### 1. Spuštění prohlížeče
```bash
npm start
```

### 2. Sestavení Svelte 5 UI
```bash
npm run build:ui
```

### 3. Sestavení nativního jádra Rust NAPI
```bash
npm run build:native
```

### 4. Kompletní build projektu
```bash
npm run build
```

---

## 📂 Architektura projektu

```
browsy-chromium/
├── main.js                  # Hlavní proces Electronu (životní cyklus, IPC handlery)
├── preload.js               # Bezpečný IPC bridge pro UI prohlížeče
├── content-preload.js       # Preload injektovaný do každé webové stránky (Text Expander, Video sniffer)
├── browsy-core.node         # Zkompilovaný Rust NAPI modul (Brave adblocker & downloader)
├── package.json
├── vite.config.js           # Konfigurace Vite pro Svelte 5
├── src-native/              # 🦀 Rust NAPI jádro
│   ├── Cargo.toml           # Závislosti: adblock (Brave), napi, tokio, reqwest
│   └── src/
│       ├── lib.rs           # NAPI bridge a exporty
│       ├── adblocker.rs     # Implementace Brave adblock-rust enginu
│       ├── downloader.rs    # Tokio multithreadový downloader
│       ├── expander.rs      # Rust string template tokenizér
│       └── default_filters.txt # Bundlovaná EasyList pravidla
├── src-ui/                  # 🎨 Svelte 5 moderní rozhraní
│   ├── index.html
│   └── src/
│       ├── main.js          # Svelte 5 mount()
│       └── App.svelte       # Kompletní rozhraní (Zen dock, Omnibox, popovery, taby)
├── dist-ui/                 # Zkompilovaný produkční bundle Svelte 5 UI
├── src/
│   ├── main/
│   │   ├── tab-manager.js        # Správa záložek a WebContentsView instancí
│   │   ├── extension-manager.js  # Kompatibilita Chrome MV2/MV3 a Firefox (.xpi)
│   │   ├── adblocker.js          # Propojení s nativním Rust blokátorem
│   │   ├── popup-blocker.js      # Inteligentní blokování vyskakovacích oken
│   │   ├── video-downloader.js   # Sniffer síťových streamů a stahovač videí
│   │   ├── text-expander.js      # Zkratky a dynamické proměnné
│   │   └── settings.js           # Ukládání nastavení do JSON profilu
│   ├── ui/                       # Fallback / statické HTML rozhraní
│   └── extensions/
│       ├── ublock-origin/        # Integrovaný uBlock Origin (Manifest V2)
│       └── firefox-compat/       # WebExtensions polyfill pro Firefox doplňky
```

---

## ⌨️ Klávesové zkratky

| Zkratka | Akce |
|---------|------|
| `Ctrl + T` | Otevřít novou záložku |
| `Ctrl + W` | Zavřít aktivní záložku |
| `Ctrl + R` / `F5` | Obnovit stránku |
| `Ctrl + L` | Označit adresní řádek (Omnibox) |
| `Alt + Vlevo` | Přejít zpět |
| `Alt + Vpravo` | Přejít vpřed |
| `Alt + 1` až `9` | Rychlé přepnutí pracovního prostoru (Workspace) |
| `Kolečko myši` nad spodním panelem | Plynulé cyklování mezi pracovními prostory |
| `Esc` | Zavřít otevřené panely / nastavení |
