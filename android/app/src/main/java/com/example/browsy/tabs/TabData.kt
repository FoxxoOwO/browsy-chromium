package com.example.browsy.tabs

import android.webkit.WebView
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.UUID

class TabData(
  val id: String = UUID.randomUUID().toString(),
  url: String = "about:blank",
  title: String = "Nová záložka",
  val isIncognito: Boolean = false
) {
  var url by mutableStateOf(url)
  var title by mutableStateOf(title)
  var isLoading by mutableStateOf(false)
  var progress by mutableIntStateOf(0)
  var canGoBack by mutableStateOf(false)
  var canGoForward by mutableStateOf(false)
  var blockedCount by mutableIntStateOf(0)
  var desktopMode by mutableStateOf(false)
  var webView: WebView? = null

  // Find in page state
  var isFindingInPage by mutableStateOf(false)
  var findQuery by mutableStateOf("")
  var findActiveOrdinal by mutableIntStateOf(0)
  var findTotalMatches by mutableIntStateOf(0)

  // Reader mode state
  var isReaderMode by mutableStateOf(false)
  var readerTitle by mutableStateOf("")
  var readerContent by mutableStateOf("")
  var readerLoading by mutableStateOf(false)

  // Element picker state
  var isElementPickerActive by mutableStateOf(false)
}
