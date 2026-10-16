document.addEventListener('DOMContentLoaded', async () => {
  const api = window.browsyExtAPI;
  const container = document.getElementById('extensions-container');
  const btnInstall = document.getElementById('btn-install');

  async function loadExtensions() {
    if (!api) {
      container.innerHTML = '<div style="color:#ef4444; padding:20px;">API pro správu doplňků není k dispozici.</div>';
      return;
    }

    try {
      const list = await api.getAll();
      renderExtensions(list);
    } catch (e) {
      container.innerHTML = `<div style="color:#ef4444; padding:20px;">Chyba při načítání doplňků: ${e.message}</div>`;
    }
  }

  function renderExtensions(list) {
    container.innerHTML = '';

    if (!list || list.length === 0) {
      container.innerHTML = '<div style="color:#8b8ea4; padding:20px; grid-column: 1 / -1;">Zatím nejsou nainstalovány žádné další doplňky.</div>';
      return;
    }

    list.forEach(ext => {
      const card = document.createElement('div');
      card.className = 'ext-card';

      // Source and MV tags
      let sourceTag = `<span class="tag tag-chrome">Chrome</span>`;
      if (ext.source === 'builtin') {
        sourceTag = `<span class="tag tag-builtin">Integrovaný</span>`;
      } else if (ext.source === 'firefox') {
        sourceTag = `<span class="tag tag-firefox">Firefox (.xpi)</span>`;
      }

      const mvTag = ext.manifestVersion === 2
        ? `<span class="tag tag-mv2">Manifest V2</span>`
        : `<span class="tag tag-chrome">Manifest V3</span>`;

      card.innerHTML = `
        <div class="ext-card-top">
          <div class="ext-icon">${ext.isBuiltin ? '🛡️' : '🧩'}</div>
          <div class="ext-meta">
            <div class="ext-title-row">
              <span class="ext-name" title="${ext.name}">${ext.name}</span>
              <span class="ext-ver">v${ext.version}</span>
            </div>
            <div class="ext-desc">${ext.description || 'Bez popisu.'}</div>
            <div class="ext-tags">
              ${sourceTag}
              ${mvTag}
            </div>
          </div>
        </div>
        <div class="ext-card-bottom">
          <label class="switch">
            <input type="checkbox" class="ext-toggle" data-id="${ext.id}" ${ext.enabled ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
          ${!ext.isBuiltin ? `<button class="btn-danger btn-remove-ext" data-id="${ext.id}">Odstranit</button>` : '<span style="font-size:11px; color:#10b981;">Chráněný doplněk</span>'}
        </div>
      `;

      // Event listeners
      const toggle = card.querySelector('.ext-toggle');
      toggle.addEventListener('change', async (e) => {
        try {
          await api.toggle(ext.id, e.target.checked);
        } catch (err) {
          alert('Chyba při změně stavu doplňku: ' + err.message);
          e.target.checked = !e.target.checked;
        }
      });

      const removeBtn = card.querySelector('.btn-remove-ext');
      if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
          if (confirm(`Opravdu chcete odebrat doplněk "${ext.name}"?`)) {
            try {
              await api.remove(ext.id);
              loadExtensions();
            } catch (err) {
              alert('Chyba při odebírání: ' + err.message);
            }
          }
        });
      }

      container.appendChild(card);
    });
  }

  btnInstall.addEventListener('click', async () => {
    if (!api) return;
    try {
      const res = await api.install();
      if (res && res.success) {
        alert(`Doplněk "${res.extension.name}" byl úspěšně nainstalován!`);
        loadExtensions();
      } else if (res && res.error) {
        alert(`Chyba při instalaci: ${res.error}`);
      }
    } catch (e) {
      alert(`Chyba: ${e.message}`);
    }
  });

  loadExtensions();
});
