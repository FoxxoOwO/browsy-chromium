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

---

## 🛠️ Spuštění prohlížeče

### Požadavky
- **Node.js** (v18+)
- **NPM**

### Spuštění ve vývojovém režimu:
```bash
npm start
```

---

## 📂 Architektura projektu

```
browsy-chromium/
├── main.js                  # Hlavní proces Electronu (životní cyklus, IPC handlery)
├── preload.js               # Bezpečný IPC bridge pro UI prohlížeče
├── content-preload.js       # Preload injektovaný do každé webové stránky (Text Expander, Video sniffer)
├── package.json
├── src/
│   ├── main/
│   │   ├── tab-manager.js        # Správa záložek a WebContentsView instancí
│   │   ├── extension-manager.js  # Kompatibilita Chrome MV2/MV3 a Firefox (.xpi)
│   │   ├── adblocker.js          # Síťový blokátor reklam a sledovačů (Shields)
│   │   ├── popup-blocker.js      # Inteligentní blokování vyskakovacích oken
│   │   ├── video-downloader.js   # Sniffer síťových streamů a stahovač videí
│   │   ├── text-expander.js      # Zkratky a dynamické proměnné
│   │   └── settings.js           # Ukládání nastavení do JSON profilu
│   ├── ui/
│   │   ├── index.html            # Hlavní rozhraní okna (navigace, taby, popovery)
│   │   ├── style.css             # Stylování v moderním tmavém designu
│   │   ├── renderer.js           # UI kontroler a obsluha událostí
│   │   ├── newtab.html / .js     # Úvodní stránka s rychlým přístupem (Speed Dial)
│   │   └── extensions.html / .js # Stránka pro správu doplňků (browsy://extensions)
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
| `Esc` | Zavřít otevřené panely / nastavení |
