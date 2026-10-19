package com.example.browsy.tabs

import android.webkit.WebView
import java.util.UUID

data class TabData(
  val id: String = UUID.randomUUID().toString(),
  var url: String = "https://duckduckgo.com",
  var title: String = "Nová záložka",
  var isIncognito: Boolean = false,
  var isLoading: Boolean = false,
  var progress: Int = 0,
  var canGoBack: Boolean = false,
  var canGoForward: Boolean = false,
  var blockedCount: Int = 0,
  var desktopMode: Boolean = false,
  var webView: WebView? = null
)
