document.addEventListener('DOMContentLoaded', async () => {
  const powerBtn = document.getElementById('power-btn');
  const statusText = document.getElementById('status-text');
  const domainText = document.getElementById('domain-text');
  const tabBlockedEl = document.getElementById('tab-blocked-count');
  const totalBlockedEl = document.getElementById('total-blocked-count');
  const whitelistBtn = document.getElementById('whitelist-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  let currentTab = null;
  let currentHostname = '';

  // Get active tab info
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        currentTab = tabs[0];
        try {
          const url = new URL(currentTab.url);
          currentHostname = url.hostname;
          domainText.textContent = currentHostname || 'Lokální stránka';
        } catch (e) {
          domainText.textContent = 'Prohlížeč';
        }
        updateView();
      }
    });
  } else {
    updateView();
  }

  function updateView() {
    chrome.runtime.sendMessage(
      {
        action: 'getStats',
        tabId: currentTab ? currentTab.id : null,
        url: currentTab ? currentTab.url : null
      },
      (res) => {
        if (!res) return;

        if (res.enabled) {
          powerBtn.classList.add('active');
          statusText.textContent = res.whitelisted ? 'Vypnuto na tomto webu' : 'Ochrana je aktivní';
          statusText.style.color = res.whitelisted ? '#ffb74d' : '#00e676';
        } else {
          powerBtn.classList.remove('active');
          statusText.textContent = 'Globálně vypnuto';
          statusText.style.color = '#ff5252';
        }

        tabBlockedEl.textContent = res.tabBlocked || 0;
        totalBlockedEl.textContent = res.totalBlocked || 0;

        if (res.whitelisted) {
          whitelistBtn.classList.add('active');
          whitelistBtn.querySelector('.label').textContent = 'Povoleno';
        } else {
          whitelistBtn.classList.remove('active');
          whitelistBtn.querySelector('.label').textContent = 'Povolit web';
        }
      }
    );
  }

  powerBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'toggleEnable' }, () => {
      updateView();
    });
  });

  whitelistBtn.addEventListener('click', () => {
    if (!currentHostname) return;
    chrome.runtime.sendMessage({ action: 'toggleWhitelist', hostname: currentHostname }, () => {
      updateView();
    });
  });

  refreshBtn.addEventListener('click', () => {
    if (chrome.tabs && currentTab) {
      chrome.tabs.reload(currentTab.id);
    }
  });
});
