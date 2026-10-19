package com.example.browsy.tabs

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Environment
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.JavascriptInterface
import com.example.browsy.data.HistoryAndBookmarksManager
import com.example.browsy.data.SettingsManager
import com.example.browsy.expander.TextExpanderManager
import com.example.browsy.shields.ShieldsEngine
import org.json.JSONObject
import org.json.JSONTokener

class TabManager(
  private val context: Context,
  private val historyAndBookmarksManager: HistoryAndBookmarksManager,
  private val textExpanderManager: TextExpanderManager,
  private val settingsManager: SettingsManager
) {

  val tabs = mutableStateListOf<TabData>()
  val activeTabId = mutableStateOf<String>("")
  var onElementPickedCallback: ((String) -> Unit)? = null

  val activeTab: TabData?
    get() = tabs.firstOrNull { it.id == activeTabId.value }

  init {
    // Open default first tab
    createTab(settingsManager.searchEngine.value.homeUrl, isIncognito = false)
  }

  @SuppressLint("SetJavaScriptEnabled")
  fun createTab(initialUrl: String? = null, isIncognito: Boolean = false): TabData {
    val startUrl = if (!initialUrl.isNullOrBlank()) initialUrl else settingsManager.searchEngine.value.homeUrl
    val tab = TabData(
      url = startUrl,
      title = if (isIncognito) "Anonymní záložka" else "Nová záložka",
      isIncognito = isIncognito
    )

    val webView = WebView(context).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )

      settings.apply {
        javaScriptEnabled = settingsManager.javaScriptEnabled.value
        domStorageEnabled = true
        databaseEnabled = true
        loadWithOverviewMode = true
        useWideViewPort = true
        setSupportZoom(true)
        builtInZoomControls = true
        displayZoomControls = false
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        allowFileAccess = false
        allowContentAccess = true
        setSupportMultipleWindows(true)
      }

      if (isIncognito) {
        CookieManager.getInstance().setAcceptCookie(false)
        settings.cacheMode = WebSettings.LOAD_NO_CACHE
      } else {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
      }

      setFindListener { activeMatchOrdinal, numberOfMatches, _ ->
        tab.findActiveOrdinal = activeMatchOrdinal
        tab.findTotalMatches = numberOfMatches
      }
      addJavascriptInterface(BrowsyBridge(tab), "BrowsyBridge")

      webViewClient = object : WebViewClient() {
        override fun shouldInterceptRequest(
          view: WebView?,
          request: WebResourceRequest?
        ): WebResourceResponse? {
          val reqUrl = request?.url?.toString() ?: return null
          if (settingsManager.shieldsEnabled.value && ShieldsEngine.shouldBlock(reqUrl)) {
            tab.blockedCount++
            return ShieldsEngine.createEmptyResponse()
          }
          return super.shouldInterceptRequest(view, request)
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
          super.onPageStarted(view, url, favicon)
          tab.isLoading = true
          tab.progress = 10
          tab.isFindingInPage = false
          tab.isReaderMode = false
          tab.isElementPickerActive = false
          if (url != null) {
            tab.url = url
          }
          tab.canGoBack = view?.canGoBack() == true
          tab.canGoForward = view?.canGoForward() == true
        }

        override fun onPageFinished(view: WebView?, url: String?) {
          super.onPageFinished(view, url)
          tab.isLoading = false
          tab.progress = 100
          if (url != null && url != "about:blank" && url != "browsy://newtab") {
            tab.url = url
            val title = view?.title ?: url
            tab.title = title
            historyAndBookmarksManager.addHistory(title, url, tab.isIncognito)
          }
          tab.canGoBack = view?.canGoBack() == true
          tab.canGoForward = view?.canGoForward() == true

          // Inject Shields cosmetic filter if enabled
          if (settingsManager.shieldsEnabled.value && settingsManager.cosmeticFiltering.value) {
            view?.evaluateJavascript(ShieldsEngine.getCosmeticFilterScript(), null)
          }

          // Inject Force Dark Mode if enabled
          if (settingsManager.forceWebDarkMode.value) {
            view?.evaluateJavascript(
              "(function(){ if(!document.getElementById('browsy-dark-mode-style')){ var s=document.createElement('style'); s.id='browsy-dark-mode-style'; s.textContent='html{filter:invert(90%) hue-rotate(180deg)!important;background-color:#121212!important;} img,video,canvas,svg{filter:invert(100%) hue-rotate(180deg)!important;}'; (document.head||document.documentElement).appendChild(s); }})();",
              null
            )
          }

          // Inject Text Expander
          view?.evaluateJavascript(textExpanderManager.getInjectionScript(), null)
        }

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
          val uri = request?.url ?: return false
          val scheme = uri.scheme ?: return false

          if (scheme == "http" || scheme == "https") {
            return false // Let WebView handle standard web links
          }

          // External schemes (tel:, mailto:, intent:, etc.)
          try {
            val intent = Intent(Intent.ACTION_VIEW, uri)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return true
          } catch (_: Exception) {
            return true
          }
        }
      }

      webChromeClient = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView?, newProgress: Int) {
          tab.progress = newProgress
          tab.isLoading = newProgress < 100
        }

        override fun onReceivedTitle(view: WebView?, title: String?) {
          if (!title.isNullOrBlank()) {
            tab.title = title
          }
        }

        override fun onCreateWindow(
          view: WebView?,
          isDialog: Boolean,
          isUserGesture: Boolean,
          resultMsg: android.os.Message?
        ): Boolean {
          // If popup blocker is enabled, only allow user-initiated window creations
          if (settingsManager.popupBlockerEnabled.value && !isUserGesture) {
            return false // Block unprompted popups
          }
          val newTab = createTab("about:blank", tab.isIncognito)
          val transport = resultMsg?.obj as? WebView.WebViewTransport
          transport?.webView = newTab.webView
          resultMsg?.sendToTarget()
          selectTab(newTab.id)
          return true
        }
      }

      setDownloadListener { downloadUrl, userAgent, contentDisposition, mimetype, _ ->
        try {
          val request = DownloadManager.Request(Uri.parse(downloadUrl)).apply {
            setMimeType(mimetype)
            addRequestHeader("User-Agent", userAgent)
            setDescription("Stahování souboru z Browsy")
            setTitle(URLUtil.guessFileName(downloadUrl, contentDisposition, mimetype))
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(
              Environment.DIRECTORY_DOWNLOADS,
              URLUtil.guessFileName(downloadUrl, contentDisposition, mimetype)
            )
          }
          val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
          dm.enqueue(request)
          Toast.makeText(context, "Stahování zahájeno...", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
          Toast.makeText(context, "Chyba při stahování: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }

      loadUrl(startUrl)
    }

    tab.webView = webView
    tabs.add(tab)
    activeTabId.value = tab.id
    return tab
  }

  fun selectTab(id: String) {
    if (tabs.any { it.id == id }) {
      activeTabId.value = id
    }
  }

  fun closeTab(id: String) {
    val index = tabs.indexOfFirst { it.id == id }
    if (index != -1) {
      val removed = tabs.removeAt(index)
      removed.webView?.destroy()
      removed.webView = null

      if (tabs.isEmpty()) {
        createTab(settingsManager.searchEngine.value.homeUrl, isIncognito = false)
      } else if (activeTabId.value == id) {
        val nextIndex = (index - 1).coerceAtLeast(0)
        activeTabId.value = tabs[nextIndex].id
      }
    }
  }

  fun closeAllTabs(incognitoOnly: Boolean = false) {
    val toClose = if (incognitoOnly) tabs.filter { it.isIncognito } else tabs.toList()
    for (t in toClose) {
      closeTab(t.id)
    }
  }

  fun reloadCurrent() {
    activeTab?.webView?.reload()
  }

  fun stopCurrent() {
    activeTab?.webView?.stopLoading()
  }

  fun goBack(): Boolean {
    val tab = activeTab ?: return false
    if (tab.webView?.canGoBack() == true) {
      tab.webView?.goBack()
      return true
    }
    return false
  }

  fun goForward(): Boolean {
    val tab = activeTab ?: return false
    if (tab.webView?.canGoForward() == true) {
      tab.webView?.goForward()
      return true
    }
    return false
  }

  fun loadUrl(url: String) {
    val tab = activeTab ?: return
    val target = formatUrl(url)
    tab.webView?.loadUrl(target)
  }

  fun toggleDesktopMode() {
    val tab = activeTab ?: return
    tab.desktopMode = !tab.desktopMode
    val ws = tab.webView?.settings ?: return
    if (tab.desktopMode) {
      ws.userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
      ws.useWideViewPort = true
      ws.loadWithOverviewMode = true
    } else {
      ws.userAgentString = null // Reset to default mobile user-agent
    }
    tab.webView?.reload()
  }

  fun formatUrl(input: String): String {
    return settingsManager.formatSearchUrl(input)
  }

  fun applySettingsToWebViews() {
    tabs.forEach { tab ->
      tab.webView?.settings?.javaScriptEnabled = settingsManager.javaScriptEnabled.value
      if (settingsManager.forceWebDarkMode.value) {
        tab.webView?.evaluateJavascript(
          "(function(){ if(!document.getElementById('browsy-dark-mode-style')){ var s=document.createElement('style'); s.id='browsy-dark-mode-style'; s.textContent='html{filter:invert(90%) hue-rotate(180deg)!important;background-color:#121212!important;} img,video,canvas,svg{filter:invert(100%) hue-rotate(180deg)!important;}'; (document.head||document.documentElement).appendChild(s); }})();",
          null
        )
      } else {
        tab.webView?.evaluateJavascript(
          "(function(){ var s=document.getElementById('browsy-dark-mode-style'); if(s) s.remove(); })();",
          null
        )
      }
    }
  }

  inner class BrowsyBridge(private val tab: TabData) {
    @JavascriptInterface
    fun onElementSelected(selector: String) {
      Handler(Looper.getMainLooper()).post {
        tab.isElementPickerActive = false
        onElementPickedCallback?.invoke(selector)
      }
    }
  }

  // --- Find in Page ---
  fun startFindInPage() {
    val tab = activeTab ?: return
    tab.isFindingInPage = true
  }

  fun findInPage(query: String) {
    val tab = activeTab ?: return
    tab.findQuery = query
    if (query.isNotBlank()) {
      tab.webView?.findAllAsync(query)
    } else {
      tab.webView?.clearMatches()
      tab.findTotalMatches = 0
      tab.findActiveOrdinal = 0
    }
  }

  fun findNext(forward: Boolean) {
    val tab = activeTab ?: return
    tab.webView?.findNext(forward)
  }

  fun clearFind() {
    val tab = activeTab ?: return
    tab.isFindingInPage = false
    tab.findQuery = ""
    tab.findActiveOrdinal = 0
    tab.findTotalMatches = 0
    tab.webView?.clearMatches()
  }

  // --- Reader Mode ---
  fun toggleReaderMode() {
    val tab = activeTab ?: return
    if (tab.isReaderMode) {
      tab.isReaderMode = false
      return
    }
    tab.readerLoading = true
    val script = """
      (function() {
        var article = document.querySelector('article') || document.querySelector('main') || document.querySelector('.post-content') || document.querySelector('.article-content') || document.body;
        var title = (document.querySelector('h1') ? document.querySelector('h1').innerText : document.title) || '';
        var clone = article.cloneNode(true);
        var junk = clone.querySelectorAll('script, style, iframe, [id*="ad"], [class*="ad"], [class*="banner"], nav, footer, header');
        for (var i = 0; i < junk.length; i++) junk[i].remove();
        return JSON.stringify({
          title: title.trim(),
          content: clone.innerText.trim()
        });
      })();
    """.trimIndent()

    tab.webView?.evaluateJavascript(script) { result ->
      tab.readerLoading = false
      if (!result.isNullOrBlank() && result != "null") {
        try {
          val jsonStr = if (result.startsWith("\"") && result.endsWith("\"")) {
            JSONTokener(result).nextValue().toString()
          } else result
          val obj = JSONObject(jsonStr)
          val parsedTitle = obj.optString("title", tab.title)
          val parsedContent = obj.optString("content", "")
          if (parsedContent.isNotBlank()) {
            tab.readerTitle = parsedTitle
            tab.readerContent = parsedContent
            tab.isReaderMode = true
          } else {
            Toast.makeText(context, "Na této stránce nebyl nalezen žádný článek.", Toast.LENGTH_SHORT).show()
          }
        } catch (_: Exception) {
          tab.readerTitle = tab.title
          tab.readerContent = "Obsah článku se nepodařilo extrahovat."
          tab.isReaderMode = true
        }
      } else {
        Toast.makeText(context, "Na této stránce nebyl nalezen žádný článek.", Toast.LENGTH_SHORT).show()
      }
    }
  }

  // --- Element Remover ---
  fun startElementPicker() {
    val tab = activeTab ?: return
    tab.isElementPickerActive = true
    val script = """
      (function() {
        if (window.__browsyPicker) return;
        window.__browsyPicker = true;
        var overlay = document.createElement('div');
        overlay.id = '__browsy_ov';
        overlay.style.cssText = 'position:fixed;pointer-events:none;border:2.5px solid #ef4444;background:rgba(239,68,68,0.25);z-index:2147483647;display:none;transition:all 0.05s ease;';
        document.body.appendChild(overlay);
        var targetEl = null;
        function getSel(el) {
          if (!el || el === document.body || el === document.documentElement) return '';
          if (el.id) return '#' + CSS.escape(el.id);
          var tag = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') {
            var c = el.className.trim().split(/\s+/).filter(function(x) { return x && !x.startsWith('__'); });
            if (c.length > 0) return tag + '.' + c.slice(0, 2).map(CSS.escape).join('.');
          }
          return tag;
        }
        function onTouch(e) {
          var t = e.touches[0];
          var el = document.elementFromPoint(t.clientX, t.clientY);
          if (el && el !== overlay) {
            targetEl = el;
            var r = el.getBoundingClientRect();
            overlay.style.display = 'block';
            overlay.style.top = r.top + 'px';
            overlay.style.left = r.left + 'px';
            overlay.style.width = r.width + 'px';
            overlay.style.height = r.height + 'px';
          }
        }
        function onClick(e) {
          e.preventDefault(); e.stopPropagation();
          var el = targetEl || e.target;
          var sel = getSel(el);
          cleanup();
          if (window.BrowsyBridge && sel) window.BrowsyBridge.onElementSelected(sel);
        }
        function cleanup() {
          window.__browsyPicker = false;
          document.removeEventListener('touchmove', onTouch, true);
          document.removeEventListener('click', onClick, true);
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        document.addEventListener('touchmove', onTouch, { passive: true, capture: true });
        document.addEventListener('click', onClick, { capture: true });
      })();
    """.trimIndent()
    tab.webView?.evaluateJavascript(script, null)
    Toast.makeText(context, "Klepněte na prvek, který chcete trvale odstranit", Toast.LENGTH_SHORT).show()
  }

  fun cancelElementPicker() {
    val tab = activeTab ?: return
    tab.isElementPickerActive = false
    tab.webView?.evaluateJavascript(
      "(function(){ var o = document.getElementById('__browsy_ov'); if(o) o.remove(); window.__browsyPicker = false; })();",
      null
    )
  }

  fun permanentlyRemoveElement(selector: String) {
    ShieldsEngine.addCustomCosmeticRule(selector)
    val tab = activeTab ?: return
    tab.webView?.evaluateJavascript(
      "(function(){ var els = document.querySelectorAll('$selector'); els.forEach(function(e){ e.style.display = 'none'; }); })();",
      null
    )
    Toast.makeText(context, "Prvek byl trvale odstraněn a přidán do filtrů.", Toast.LENGTH_SHORT).show()
  }

  // --- Share & Print ---
  fun shareCurrentPage() {
    val tab = activeTab ?: return
    val intent = Intent(Intent.ACTION_SEND).apply {
      type = "text/plain"
      putExtra(Intent.EXTRA_SUBJECT, tab.title)
      putExtra(Intent.EXTRA_TEXT, tab.url)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }
    context.startActivity(Intent.createChooser(intent, "Sdílet stránku přes").apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    })
  }

  fun printCurrentPage() {
    val tab = activeTab ?: return
    val web = tab.webView ?: return
    val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
    val jobName = "Browsy_${tab.title.take(20).replace(" ", "_")}"
    val adapter = web.createPrintDocumentAdapter(jobName)
    printManager.print(jobName, adapter, PrintAttributes.Builder().build())
  }
}
