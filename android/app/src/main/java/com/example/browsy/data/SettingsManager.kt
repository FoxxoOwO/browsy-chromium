package com.example.browsy.data

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.webkit.WebView
import androidx.compose.runtime.mutableStateOf

enum class SearchEngine(val id: String, val title: String, val queryTemplate: String, val homeUrl: String) {
  DUCKDUCKGO("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/?q=%s", "https://duckduckgo.com"),
  GOOGLE("google", "Google", "https://www.google.com/search?q=%s", "https://www.google.com"),
  BRAVE("brave", "Brave Search", "https://search.brave.com/search?q=%s", "https://search.brave.com"),
  ECOSIA("ecosia", "Ecosia", "https://www.ecosia.org/search?q=%s", "https://www.ecosia.org"),
  BING("bing", "Bing", "https://www.bing.com/search?q=%s", "https://www.bing.com");

  companion object {
    fun fromId(id: String): SearchEngine {
      return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: DUCKDUCKGO
    }
  }
}

enum class OmniboxPosition(val id: String, val title: String) {
  BOTTOM("bottom", "Dole (pohodlné ovládání jednou rukou)"),
  TOP("top", "Nahoře (klasické zobrazení)");

  companion object {
    fun fromId(id: String): OmniboxPosition {
      return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: BOTTOM
    }
  }
}

class SettingsManager(private val context: Context) {

  private val prefs: SharedPreferences = context.getSharedPreferences("browsy_settings", Context.MODE_PRIVATE)

  val searchEngine = mutableStateOf(SearchEngine.fromId(prefs.getString("search_engine", SearchEngine.DUCKDUCKGO.id) ?: SearchEngine.DUCKDUCKGO.id))
  val omniboxPosition = mutableStateOf(OmniboxPosition.fromId(prefs.getString("omnibox_position", OmniboxPosition.BOTTOM.id) ?: OmniboxPosition.BOTTOM.id))
  val shieldsEnabled = mutableStateOf(prefs.getBoolean("shields_enabled", true))
  val aggressiveBlocking = mutableStateOf(prefs.getBoolean("aggressive_blocking", false))
  val cosmeticFiltering = mutableStateOf(prefs.getBoolean("cosmetic_filtering", true))
  val popupBlockerEnabled = mutableStateOf(prefs.getBoolean("popup_blocker_enabled", true))
  val forceWebDarkMode = mutableStateOf(prefs.getBoolean("force_web_dark_mode", false))
  val javaScriptEnabled = mutableStateOf(prefs.getBoolean("javascript_enabled", true))
  val clearDataOnExit = mutableStateOf(prefs.getBoolean("clear_data_on_exit", false))

  fun setSearchEngine(engine: SearchEngine) {
    searchEngine.value = engine
    prefs.edit().putString("search_engine", engine.id).apply()
  }

  fun setOmniboxPosition(position: OmniboxPosition) {
    omniboxPosition.value = position
    prefs.edit().putString("omnibox_position", position.id).apply()
  }

  fun setShieldsEnabled(enabled: Boolean) {
    shieldsEnabled.value = enabled
    prefs.edit().putBoolean("shields_enabled", enabled).apply()
  }

  fun setAggressiveBlocking(enabled: Boolean) {
    aggressiveBlocking.value = enabled
    prefs.edit().putBoolean("aggressive_blocking", enabled).apply()
  }

  fun setCosmeticFiltering(enabled: Boolean) {
    cosmeticFiltering.value = enabled
    prefs.edit().putBoolean("cosmetic_filtering", enabled).apply()
  }

  fun setPopupBlockerEnabled(enabled: Boolean) {
    popupBlockerEnabled.value = enabled
    prefs.edit().putBoolean("popup_blocker_enabled", enabled).apply()
  }

  fun setForceWebDarkMode(enabled: Boolean) {
    forceWebDarkMode.value = enabled
    prefs.edit().putBoolean("force_web_dark_mode", enabled).apply()
  }

  fun setJavaScriptEnabled(enabled: Boolean) {
    javaScriptEnabled.value = enabled
    prefs.edit().putBoolean("javascript_enabled", enabled).apply()
  }

  fun setClearDataOnExit(enabled: Boolean) {
    clearDataOnExit.value = enabled
    prefs.edit().putBoolean("clear_data_on_exit", enabled).apply()
  }

  fun formatSearchUrl(query: String): String {
    val trimmed = query.trim()
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("about:") || trimmed.startsWith("file:")) {
      return trimmed
    }
    if (trimmed.contains(".") && !trimmed.contains(" ") && !trimmed.startsWith("?")) {
      return "https://$trimmed"
    }
    val encoded = Uri.encode(trimmed)
    return String.format(searchEngine.value.queryTemplate, encoded)
  }

  fun clearAllBrowsingData(onComplete: (() -> Unit)? = null) {
    try {
      // Clear WebStorage
      WebStorage.getInstance().deleteAllData()

      // Clear Cookies
      CookieManager.getInstance().removeAllCookies {
        CookieManager.getInstance().flush()
      }

      // Clear Cache
      val webView = WebView(context)
      webView.clearCache(true)
      webView.clearFormData()
      webView.clearHistory()
      webView.destroy()
    } catch (_: Exception) {}

    onComplete?.invoke()
  }
}
