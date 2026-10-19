package com.example.browsy

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.example.browsy.data.HistoryAndBookmarksManager
import com.example.browsy.data.SettingsManager
import com.example.browsy.expander.TextExpanderManager
import com.example.browsy.sync.SyncManager
import com.example.browsy.tabs.TabManager
import com.example.browsy.theme.BrowsyBackground
import com.example.browsy.theme.BrowsyTheme
import com.example.browsy.ui.BrowserScreen

class MainActivity : ComponentActivity() {

  private lateinit var settingsManager: SettingsManager
  private lateinit var historyAndBookmarksManager: HistoryAndBookmarksManager
  private lateinit var textExpanderManager: TextExpanderManager
  private lateinit var syncManager: SyncManager
  private lateinit var tabManager: TabManager

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    settingsManager = SettingsManager(this)
    historyAndBookmarksManager = HistoryAndBookmarksManager(this)
    textExpanderManager = TextExpanderManager(this)
    syncManager = SyncManager(this, historyAndBookmarksManager, settingsManager, textExpanderManager)
    tabManager = TabManager(this, historyAndBookmarksManager, textExpanderManager, settingsManager)

    handleIncomingIntent(intent)

    enableEdgeToEdge()
    setContent {
      BrowsyTheme {
        Surface(
          modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding(),
          color = BrowsyBackground
        ) {
          BrowserScreen(
            tabManager = tabManager,
            historyAndBookmarksManager = historyAndBookmarksManager,
            textExpanderManager = textExpanderManager,
            settingsManager = settingsManager,
            syncManager = syncManager
          )
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIncomingIntent(intent)
  }

  private fun handleIncomingIntent(intent: Intent?) {
    val dataUrl = intent?.dataString
    if (!dataUrl.isNullOrBlank()) {
      tabManager.loadUrl(dataUrl)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    if (::settingsManager.isInitialized && settingsManager.clearDataOnExit.value) {
      settingsManager.clearAllBrowsingData()
    }
  }
}

