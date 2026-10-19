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
import com.example.browsy.data.HistoryAndBookmarksManager
import com.example.browsy.expander.TextExpanderManager
import com.example.browsy.shields.ShieldsEngine

class TabManager(
  private val context: Context,
  private val historyAndBookmarksManager: HistoryAndBookmarksManager,
  private val textExpanderManager: TextExpanderManager
) {

  val tabs = mutableStateListOf<TabData>()
  val activeTabId = mutableStateOf<String>("")

  val activeTab: TabData?
    get() = tabs.firstOrNull { it.id == activeTabId.value }

  init {
    // Open default first tab
    createTab("https://duckduckgo.com", isIncognito = false)
  }

  @SuppressLint("SetJavaScriptEnabled")
  fun createTab(initialUrl: String = "https://duckduckgo.com", isIncognito: Boolean = false): TabData {
    val tab = TabData(
      url = initialUrl,
      title = if (isIncognito) "Anonymní záložka" else "Nová záložka",
      isIncognito = isIncognito
    )

    val webView = WebView(context).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )

      settings.apply {
        javaScriptEnabled = true
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

      webViewClient = object : WebViewClient() {
        override fun shouldInterceptRequest(
          view: WebView?,
          request: WebResourceRequest?
        ): WebResourceResponse? {
          val reqUrl = request?.url?.toString() ?: return null
          if (ShieldsEngine.shouldBlock(reqUrl)) {
            tab.blockedCount++
            return ShieldsEngine.createEmptyResponse()
          }
          return super.shouldInterceptRequest(view, request)
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
          super.onPageStarted(view, url, favicon)
          tab.isLoading = true
          tab.progress = 10
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
          if (url != null) {
            tab.url = url
            val title = view?.title ?: url
            tab.title = title
            historyAndBookmarksManager.addHistory(title, url, tab.isIncognito)
          }
          tab.canGoBack = view?.canGoBack() == true
          tab.canGoForward = view?.canGoForward() == true

          // Inject Shields cosmetic filter and Text Expander
          view?.evaluateJavascript(ShieldsEngine.getCosmeticFilterScript(), null)
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
          // Popup blocker logic: only allow user-initiated window creations in a new Browsy tab
          if (isUserGesture) {
            val newTab = createTab("about:blank", tab.isIncognito)
            val transport = resultMsg?.obj as? WebView.WebViewTransport
            transport?.webView = newTab.webView
            resultMsg?.sendToTarget()
            selectTab(newTab.id)
            return true
          }
          return false // Block unprompted popups
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

      loadUrl(initialUrl)
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
        createTab("https://duckduckgo.com", isIncognito = false)
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

  private fun formatUrl(input: String): String {
    val trimmed = input.trim()
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("about:") || trimmed.startsWith("file:")) {
      return trimmed
    }
    // Check if it's a domain name (e.g. google.com, idnes.cz, github.com)
    if (trimmed.contains(".") && !trimmed.contains(" ") && !trimmed.startsWith("?")) {
      return "https://$trimmed"
    }
    // Otherwise execute search via DuckDuckGo
    return "https://duckduckgo.com/?q=${Uri.encode(trimmed)}"
  }
}
