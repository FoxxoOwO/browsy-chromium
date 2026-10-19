package com.example.browsy.ui

import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.example.browsy.data.HistoryAndBookmarksManager
import com.example.browsy.data.OmniboxPosition
import com.example.browsy.data.SearchEngine
import com.example.browsy.data.SettingsManager
import com.example.browsy.expander.TextExpanderManager
import com.example.browsy.sync.SyncConfig
import com.example.browsy.sync.SyncManager
import com.example.browsy.sync.SyncProvider
import com.example.browsy.tabs.TabData
import com.example.browsy.tabs.TabManager
import com.example.browsy.theme.BrowsyAccent
import com.example.browsy.theme.BrowsyBackground
import com.example.browsy.theme.BrowsyBorder
import com.example.browsy.theme.BrowsyBorderFocused
import com.example.browsy.theme.BrowsyCard
import com.example.browsy.theme.BrowsyCardSelected
import com.example.browsy.theme.BrowsyDanger
import com.example.browsy.theme.BrowsyShieldGreen
import com.example.browsy.theme.BrowsySurface
import com.example.browsy.theme.BrowsyTextMuted
import com.example.browsy.theme.BrowsyTextPrimary
import com.example.browsy.theme.BrowsyTextSecondary
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.text.input.PasswordVisualTransformation
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserScreen(
  tabManager: TabManager,
  historyAndBookmarksManager: HistoryAndBookmarksManager,
  textExpanderManager: TextExpanderManager,
  settingsManager: SettingsManager,
  syncManager: SyncManager,
  modifier: Modifier = Modifier
) {
  val activeTab = tabManager.activeTab
  var isEditingUrl by remember { mutableStateOf(false) }
  var urlInputText by remember { mutableStateOf("") }
  val focusManager = LocalFocusManager.current

  // Dialog & Sheet States
  var showTabSwitcher by remember { mutableStateOf(false) }
  var showShieldsSheet by remember { mutableStateOf(false) }
  var showMenuSheet by remember { mutableStateOf(false) }
  var showBookmarksSheet by remember { mutableStateOf(false) }
  var showHistorySheet by remember { mutableStateOf(false) }
  var showExpanderSheet by remember { mutableStateOf(false) }
  var showSettingsSheet by remember { mutableStateOf(false) }

  // Element picker confirmation dialog
  var pendingElementSelector by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(tabManager) {
    tabManager.onElementPickedCallback = { selector ->
      pendingElementSelector = selector
    }
  }

  // System Back button handling
  BackHandler(enabled = true) {
    when {
      activeTab?.isReaderMode == true -> activeTab.isReaderMode = false
      activeTab?.isFindingInPage == true -> tabManager.clearFind()
      activeTab?.isElementPickerActive == true -> tabManager.cancelElementPicker()
      showSettingsSheet -> showSettingsSheet = false
      showTabSwitcher -> showTabSwitcher = false
      showShieldsSheet -> showShieldsSheet = false
      showMenuSheet -> showMenuSheet = false
      showBookmarksSheet -> showBookmarksSheet = false
      showHistorySheet -> showHistorySheet = false
      showExpanderSheet -> showExpanderSheet = false
      isEditingUrl -> isEditingUrl = false
      tabManager.activeTab?.canGoBack == true -> tabManager.goBack()
      tabManager.tabs.size > 1 -> tabManager.closeTab(tabManager.activeTabId.value)
    }
  }

  val isOmniboxTop = settingsManager.omniboxPosition.value == OmniboxPosition.TOP
  val isHomeTab = activeTab == null || activeTab.url == "about:blank" || activeTab.url == "browsy://newtab" || activeTab.url.isBlank()

  Column(
    modifier = modifier
      .fillMaxSize()
      .background(BrowsyBackground)
  ) {
    // -------------------------------------------------------------
    // Top Bar (if Omnibox is positioned at top)
    // -------------------------------------------------------------
    if (isOmniboxTop) {
      OmniboxBar(
        activeTab = activeTab,
        isEditingUrl = isEditingUrl,
        urlInputText = urlInputText,
        onUrlChange = { urlInputText = it },
        onStartEditing = {
          urlInputText = if (isHomeTab) "" else (activeTab?.url ?: "")
          isEditingUrl = true
        },
        onSubmitUrl = { url ->
          isEditingUrl = false
          tabManager.loadUrl(url)
        },
        onClearUrl = { urlInputText = "" },
        onOpenShields = { showShieldsSheet = true },
        onReload = { tabManager.reloadCurrent() },
        onStop = { tabManager.stopCurrent() },
        focusManager = focusManager
      )
      AnimatedProgressBar(
        isLoading = activeTab?.isLoading == true,
        progress = activeTab?.progress ?: 0
      )
    } else {
      AnimatedProgressBar(
        isLoading = activeTab?.isLoading == true,
        progress = activeTab?.progress ?: 0
      )
    }

    // Find in Page Bar
    if (activeTab?.isFindingInPage == true) {
      FindInPageBar(
        query = activeTab.findQuery,
        activeMatch = activeTab.findActiveOrdinal,
        totalMatches = activeTab.findTotalMatches,
        onQueryChange = { tabManager.findInPage(it) },
        onPrevious = { tabManager.findNext(false) },
        onNext = { tabManager.findNext(true) },
        onClose = { tabManager.clearFind() }
      )
    }

    // Element Picker active banner
    if (activeTab?.isElementPickerActive == true) {
      ElementPickerBanner(onCancel = { tabManager.cancelElementPicker() })
    }

    // -------------------------------------------------------------
    // Main Content: Reader Mode OR Speed Dial OR WebView
    // -------------------------------------------------------------
    Box(
      modifier = Modifier
        .weight(1f)
        .fillMaxWidth()
        .background(BrowsyBackground)
    ) {
      if (activeTab?.isReaderMode == true) {
        ReaderModeView(
          title = activeTab.readerTitle,
          content = activeTab.readerContent,
          onClose = { activeTab.isReaderMode = false }
        )
      } else if (isHomeTab) {
        SpeedDialView(
          onOpenUrl = { url -> tabManager.loadUrl(url) }
        )
      } else if (activeTab?.webView != null) {
        AndroidView(
          factory = { ctx ->
            FrameLayout(ctx).apply {
              layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
              )
              addView(activeTab.webView)
            }
          },
          update = { container ->
            val currentWeb = activeTab.webView
            if (currentWeb != null && container.indexOfChild(currentWeb) == -1) {
              container.removeAllViews()
              (currentWeb.parent as? ViewGroup)?.removeView(currentWeb)
              container.addView(currentWeb)
            }
          },
          modifier = Modifier.fillMaxSize()
        )
      }
    }

    // -------------------------------------------------------------
    // Bottom Omnibox (if Omnibox is positioned at bottom)
    // -------------------------------------------------------------
    if (!isOmniboxTop) {
      OmniboxBar(
        activeTab = activeTab,
        isEditingUrl = isEditingUrl,
        urlInputText = urlInputText,
        onUrlChange = { urlInputText = it },
        onStartEditing = {
          urlInputText = if (isHomeTab) "" else (activeTab?.url ?: "")
          isEditingUrl = true
        },
        onSubmitUrl = { url ->
          isEditingUrl = false
          tabManager.loadUrl(url)
        },
        onClearUrl = { urlInputText = "" },
        onOpenShields = { showShieldsSheet = true },
        onReload = { tabManager.reloadCurrent() },
        onStop = { tabManager.stopCurrent() },
        focusManager = focusManager
      )
    }

    // -------------------------------------------------------------
    // Bottom Navigation Bar
    // -------------------------------------------------------------
    BottomNavBar(
      activeTab = activeTab,
      tabCount = tabManager.tabs.size,
      onGoBack = { tabManager.goBack() },
      onGoForward = { tabManager.goForward() },
      onNewTab = {
        tabManager.createTab(
          "about:blank",
          isIncognito = activeTab?.isIncognito ?: false
        )
      },
      onOpenTabSwitcher = { showTabSwitcher = true },
      onOpenMenu = { showMenuSheet = true }
    )
  }

  // Element Picker Confirmation Dialog
  if (pendingElementSelector != null) {
    val selector = pendingElementSelector ?: ""
    AlertDialog(
      onDismissRequest = { pendingElementSelector = null },
      containerColor = BrowsyCard,
      title = { Text("Trvale skrýt prvek?", color = BrowsyTextPrimary) },
      text = {
        Text(
          "Byl vybrán prvek:\n$selector\n\nChcete tento prvek trvale zablokovat a skrýt na tomto webu?",
          color = BrowsyTextSecondary,
          fontSize = 13.sp
        )
      },
      confirmButton = {
        TextButton(
          onClick = {
            pendingElementSelector = null
            tabManager.permanentlyRemoveElement(selector)
          }
        ) {
          Text("Trvale skrýt", color = BrowsyDanger, fontWeight = FontWeight.Bold)
        }
      },
      dismissButton = {
        TextButton(onClick = { pendingElementSelector = null }) {
          Text("Zrušit", color = BrowsyTextSecondary)
        }
      }
    )
  }

  // -------------------------------------------------------------
  // Modals & Bottom Sheets
  // -------------------------------------------------------------

  if (showTabSwitcher) {
    ModalBottomSheet(
      onDismissRequest = { showTabSwitcher = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      TabSwitcherView(
        tabManager = tabManager,
        onClose = { showTabSwitcher = false }
      )
    }
  }

  if (showShieldsSheet) {
    ModalBottomSheet(
      onDismissRequest = { showShieldsSheet = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      ShieldsSheetView(
        activeTab = activeTab,
        settingsManager = settingsManager,
        onClose = { showShieldsSheet = false }
      )
    }
  }

  if (showMenuSheet) {
    ModalBottomSheet(
      onDismissRequest = { showMenuSheet = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      MenuSheetView(
        activeTab = activeTab,
        tabManager = tabManager,
        historyAndBookmarksManager = historyAndBookmarksManager,
        onOpenBookmarks = { showMenuSheet = false; showBookmarksSheet = true },
        onOpenHistory = { showMenuSheet = false; showHistorySheet = true },
        onOpenExpander = { showMenuSheet = false; showExpanderSheet = true },
        onOpenSettings = { showMenuSheet = false; showSettingsSheet = true },
        onFindInPage = {
          showMenuSheet = false
          tabManager.startFindInPage()
        },
        onToggleReaderMode = {
          showMenuSheet = false
          tabManager.toggleReaderMode()
        },
        onStartElementPicker = {
          showMenuSheet = false
          tabManager.startElementPicker()
        },
        onShare = {
          showMenuSheet = false
          tabManager.shareCurrentPage()
        },
        onPrint = {
          showMenuSheet = false
          tabManager.printCurrentPage()
        },
        onClose = { showMenuSheet = false }
      )
    }
  }

  if (showSettingsSheet) {
    ModalBottomSheet(
      onDismissRequest = { showSettingsSheet = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      SettingsSheetView(
        settingsManager = settingsManager,
        tabManager = tabManager,
        syncManager = syncManager,
        onOpenExpander = {
          showSettingsSheet = false
          showExpanderSheet = true
        },
        onClose = { showSettingsSheet = false }
      )
    }
  }

  if (showBookmarksSheet) {
    ModalBottomSheet(
      onDismissRequest = { showBookmarksSheet = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      BookmarksSheetView(
        historyAndBookmarksManager = historyAndBookmarksManager,
        onSelectUrl = { url ->
          tabManager.loadUrl(url)
          showBookmarksSheet = false
        },
        onClose = { showBookmarksSheet = false }
      )
    }
  }

  if (showHistorySheet) {
    ModalBottomSheet(
      onDismissRequest = { showHistorySheet = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      HistorySheetView(
        historyAndBookmarksManager = historyAndBookmarksManager,
        onSelectUrl = { url ->
          tabManager.loadUrl(url)
          showHistorySheet = false
        },
        onClose = { showHistorySheet = false }
      )
    }
  }

  if (showExpanderSheet) {
    ModalBottomSheet(
      onDismissRequest = { showExpanderSheet = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      TextExpanderSheetView(
        textExpanderManager = textExpanderManager,
        onClose = { showExpanderSheet = false }
      )
    }
  }
}

// -------------------------------------------------------------
// Speed Dial View (Home Screen on New Tab)
// -------------------------------------------------------------

@Composable
fun SpeedDialView(
  onOpenUrl: (String) -> Unit
) {
  val shortcuts = remember {
    listOf(
      Pair("DuckDuckGo", "https://duckduckgo.com"),
      Pair("Google", "https://google.com"),
      Pair("GitHub", "https://github.com"),
      Pair("Wikipedia", "https://wikipedia.org"),
      Pair("Reddit", "https://reddit.com"),
      Pair("Hacker News", "https://news.ycombinator.com"),
      Pair("iDnes.cz", "https://idnes.cz"),
      Pair("YouTube", "https://youtube.com")
    )
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(BrowsyBackground)
      .padding(horizontal = 24.dp, vertical = 32.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Box(
      modifier = Modifier
        .size(60.dp)
        .clip(RoundedCornerShape(16.dp))
        .background(BrowsyCard)
        .border(1.dp, BrowsyBorder, RoundedCornerShape(16.dp)),
      contentAlignment = Alignment.Center
    ) {
      Icon(
        imageVector = Icons.Default.Security,
        contentDescription = "Browsy",
        tint = BrowsyAccent,
        modifier = Modifier.size(32.dp)
      )
    }

    Spacer(modifier = Modifier.height(12.dp))

    Text(
      text = "Browsy",
      color = BrowsyTextPrimary,
      fontSize = 22.sp,
      fontWeight = FontWeight.Bold,
      letterSpacing = 1.sp
    )
    Text(
      text = "Rychlý, soukromý a bez reklam",
      color = BrowsyTextMuted,
      fontSize = 12.sp
    )

    Spacer(modifier = Modifier.height(28.dp))

    LazyVerticalGrid(
      columns = GridCells.Fixed(4),
      horizontalArrangement = Arrangement.spacedBy(10.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
      modifier = Modifier.fillMaxWidth()
    ) {
      gridItems(shortcuts) { (title, url) ->
        Column(
          horizontalAlignment = Alignment.CenterHorizontally,
          modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable { onOpenUrl(url) }
            .padding(vertical = 6.dp)
        ) {
          Box(
            modifier = Modifier
              .size(46.dp)
              .clip(RoundedCornerShape(12.dp))
              .background(BrowsyCard)
              .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
          ) {
            Text(
              text = title.take(1).uppercase(),
              color = BrowsyTextPrimary,
              fontSize = 16.sp,
              fontWeight = FontWeight.Bold
            )
          }
          Spacer(modifier = Modifier.height(6.dp))
          Text(
            text = title,
            color = BrowsyTextSecondary,
            fontSize = 11.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
        }
      }
    }
  }
}

// -------------------------------------------------------------
// Reader Mode View Component
// -------------------------------------------------------------

@Composable
fun ReaderModeView(
  title: String,
  content: String,
  onClose: () -> Unit
) {
  var fontSize by remember { mutableIntStateOf(16) }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .background(BrowsyBackground)
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .background(BrowsySurface)
        .border(1.dp, BrowsyBorder)
        .padding(horizontal = 16.dp, vertical = 8.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Article, contentDescription = "Čtečka", tint = BrowsyAccent, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text("Režim čtení", color = BrowsyTextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
      }
      Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(
          onClick = { if (fontSize > 12) fontSize -= 2 },
          modifier = Modifier.size(32.dp)
        ) {
          Text("A-", color = BrowsyTextPrimary, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
        Spacer(modifier = Modifier.width(4.dp))
        IconButton(
          onClick = { if (fontSize < 28) fontSize += 2 },
          modifier = Modifier.size(32.dp)
        ) {
          Text("A+", color = BrowsyTextPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
        Spacer(modifier = Modifier.width(8.dp))
        IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
          Icon(Icons.Default.Close, contentDescription = "Zavřít čtečku", tint = BrowsyTextMuted)
        }
      }
    }

    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
      item {
        Text(
          text = title,
          color = BrowsyTextPrimary,
          fontSize = (fontSize + 6).sp,
          fontWeight = FontWeight.Bold,
          lineHeight = (fontSize + 12).sp
        )
        Spacer(modifier = Modifier.height(14.dp))
        HorizontalDivider(color = BrowsyBorder)
        Spacer(modifier = Modifier.height(16.dp))
      }
      item {
        Text(
          text = content,
          color = BrowsyTextSecondary,
          fontSize = fontSize.sp,
          lineHeight = (fontSize * 1.6f).sp,
          letterSpacing = 0.3.sp
        )
        Spacer(modifier = Modifier.height(40.dp))
      }
    }
  }
}

// -------------------------------------------------------------
// Find In Page Bar Component
// -------------------------------------------------------------

@Composable
fun FindInPageBar(
  query: String,
  activeMatch: Int,
  totalMatches: Int,
  onQueryChange: (String) -> Unit,
  onPrevious: () -> Unit,
  onNext: () -> Unit,
  onClose: () -> Unit
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .background(BrowsySurface)
      .border(1.dp, BrowsyBorder)
      .padding(horizontal = 12.dp, vertical = 6.dp),
    verticalAlignment = Alignment.CenterVertically
  ) {
    Icon(Icons.Default.Search, contentDescription = "Hledat", tint = BrowsyTextMuted, modifier = Modifier.size(18.dp))
    Spacer(modifier = Modifier.width(8.dp))
    BasicTextField(
      value = query,
      onValueChange = onQueryChange,
      modifier = Modifier.weight(1f),
      textStyle = TextStyle(color = BrowsyTextPrimary, fontSize = 14.sp),
      cursorBrush = SolidColor(BrowsyAccent),
      singleLine = true,
      decorationBox = { inner ->
        if (query.isEmpty()) Text("Najít na stránce...", color = BrowsyTextMuted, fontSize = 14.sp)
        inner()
      }
    )
    if (query.isNotEmpty()) {
      Text(
        text = if (totalMatches > 0) "${activeMatch + 1} / $totalMatches" else "0 / 0",
        color = if (totalMatches > 0) BrowsyAccent else BrowsyTextMuted,
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(horizontal = 6.dp)
      )
    }
    IconButton(onClick = onPrevious, modifier = Modifier.size(30.dp)) {
      Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Předchozí", tint = BrowsyTextSecondary, modifier = Modifier.size(16.dp))
    }
    IconButton(onClick = onNext, modifier = Modifier.size(30.dp)) {
      Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Další", tint = BrowsyTextSecondary, modifier = Modifier.size(16.dp))
    }
    IconButton(onClick = onClose, modifier = Modifier.size(30.dp)) {
      Icon(Icons.Default.Close, contentDescription = "Zavřít", tint = BrowsyTextMuted, modifier = Modifier.size(16.dp))
    }
  }
}

// -------------------------------------------------------------
// Element Picker Banner Component
// -------------------------------------------------------------

@Composable
fun ElementPickerBanner(onCancel: () -> Unit) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .background(Color(0xFF271515))
      .border(1.dp, Color(0xFF7F1D1D))
      .padding(horizontal = 16.dp, vertical = 8.dp),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Icon(Icons.Default.DeleteSweep, contentDescription = null, tint = BrowsyDanger, modifier = Modifier.size(18.dp))
      Spacer(modifier = Modifier.width(8.dp))
      Text("Klepněte na prvek k odstranění", color = BrowsyTextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
    Text(
      text = "Zrušit",
      color = BrowsyDanger,
      fontWeight = FontWeight.Bold,
      fontSize = 13.sp,
      modifier = Modifier
        .clickable { onCancel() }
        .padding(4.dp)
    )
  }
}

// -------------------------------------------------------------
// Omnibox Bar Component
// -------------------------------------------------------------

@Composable
fun OmniboxBar(
  activeTab: TabData?,
  isEditingUrl: Boolean,
  urlInputText: String,
  onUrlChange: (String) -> Unit,
  onStartEditing: () -> Unit,
  onSubmitUrl: (String) -> Unit,
  onClearUrl: () -> Unit,
  onOpenShields: () -> Unit,
  onReload: () -> Unit,
  onStop: () -> Unit,
  focusManager: androidx.compose.ui.focus.FocusManager
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .background(BrowsySurface)
      .padding(horizontal = 12.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically
  ) {
    Row(
      modifier = Modifier
        .weight(1f)
        .height(44.dp)
        .clip(RoundedCornerShape(22.dp))
        .background(BrowsyCard)
        .border(
          1.dp,
          if (isEditingUrl) BrowsyBorderFocused else BrowsyBorder,
          RoundedCornerShape(22.dp)
        )
        .padding(horizontal = 12.dp),
      verticalAlignment = Alignment.CenterVertically
    ) {
      val isHttps = activeTab?.url?.startsWith("https://") == true
      Icon(
        imageVector = if (isHttps) Icons.Default.Lock else Icons.Default.Security,
        contentDescription = "Security",
        tint = if (isHttps) BrowsyTextSecondary else BrowsyTextMuted,
        modifier = Modifier.size(16.dp)
      )

      Spacer(modifier = Modifier.width(8.dp))

      if (isEditingUrl) {
        BasicTextField(
          value = urlInputText,
          onValueChange = onUrlChange,
          modifier = Modifier.weight(1f),
          textStyle = TextStyle(
            color = BrowsyTextPrimary,
            fontSize = 14.sp,
            fontFamily = FontFamily.Default
          ),
          cursorBrush = SolidColor(BrowsyAccent),
          singleLine = true,
          keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
          keyboardActions = KeyboardActions(
            onGo = {
              focusManager.clearFocus()
              onSubmitUrl(urlInputText)
            }
          )
        )
        AnimatedVisibility(
          visible = urlInputText.isNotEmpty(),
          enter = fadeIn() + scaleIn(),
          exit = fadeOut() + scaleOut()
        ) {
          IconButton(
            onClick = onClearUrl,
            modifier = Modifier.size(24.dp)
          ) {
            Icon(
              Icons.Default.Close,
              contentDescription = "Clear",
              tint = BrowsyTextMuted,
              modifier = Modifier.size(16.dp)
            )
          }
        }
      } else {
        val displayUrl = formatDisplayUrl(activeTab?.url ?: "")
        Text(
          text = displayUrl,
          color = BrowsyTextPrimary,
          fontSize = 14.sp,
          fontWeight = FontWeight.Medium,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier
            .weight(1f)
            .clickable { onStartEditing() }
        )
      }

      Spacer(modifier = Modifier.width(6.dp))

      // Shields Badge with Animated Counter
      val blocked = activeTab?.blockedCount ?: 0
      Row(
        modifier = Modifier
          .clip(RoundedCornerShape(12.dp))
          .background(if (blocked > 0) Color(0xFF1E293B) else Color(0xFF27272A))
          .clickable { onOpenShields() }
          .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        Icon(
          Icons.Default.Security,
          contentDescription = "Shields",
          tint = if (blocked > 0) BrowsyShieldGreen else BrowsyTextSecondary,
          modifier = Modifier.size(13.dp)
        )
        if (blocked > 0) {
          Spacer(modifier = Modifier.width(4.dp))
          AnimatedContent(
            targetState = blocked,
            transitionSpec = {
              (slideInVertically { -it } + fadeIn()).togetherWith(slideOutVertically { it } + fadeOut())
            },
            label = "ShieldsCounter"
          ) { count ->
            Text(
              text = count.toString(),
              color = BrowsyShieldGreen,
              fontSize = 11.sp,
              fontWeight = FontWeight.Bold
            )
          }
        }
      }

      Spacer(modifier = Modifier.width(6.dp))

      // Reload or Stop
      if (activeTab?.isLoading == true) {
        IconButton(
          onClick = onStop,
          modifier = Modifier.size(28.dp)
        ) {
          Icon(
            Icons.Default.Close,
            contentDescription = "Stop",
            tint = BrowsyTextSecondary,
            modifier = Modifier.size(16.dp)
          )
        }
      } else {
        IconButton(
          onClick = onReload,
          modifier = Modifier.size(28.dp)
        ) {
          Icon(
            Icons.Default.Refresh,
            contentDescription = "Reload",
            tint = BrowsyTextSecondary,
            modifier = Modifier.size(16.dp)
          )
        }
      }
    }
  }
}

// -------------------------------------------------------------
// Animated Progress Bar Component
// -------------------------------------------------------------

@Composable
fun AnimatedProgressBar(
  isLoading: Boolean,
  progress: Int
) {
  val animatedProgress by animateFloatAsState(
    targetValue = (progress / 100f).coerceIn(0f, 1f),
    animationSpec = tween(durationMillis = 280, easing = FastOutSlowInEasing),
    label = "SmoothLoadingProgress"
  )

  AnimatedVisibility(
    visible = isLoading,
    enter = fadeIn(animationSpec = tween(120)) + expandVertically(),
    exit = fadeOut(animationSpec = tween(250)) + shrinkVertically()
  ) {
    LinearProgressIndicator(
      progress = { animatedProgress },
      modifier = Modifier
        .fillMaxWidth()
        .height(2.5.dp),
      color = BrowsyAccent,
      trackColor = BrowsyBorder
    )
  }
}

// -------------------------------------------------------------
// Bottom Navigation Bar Component
// -------------------------------------------------------------

@Composable
fun BottomNavBar(
  activeTab: TabData?,
  tabCount: Int,
  onGoBack: () -> Unit,
  onGoForward: () -> Unit,
  onNewTab: () -> Unit,
  onOpenTabSwitcher: () -> Unit,
  onOpenMenu: () -> Unit
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .background(BrowsySurface)
      .border(1.dp, BrowsyBorder)
      .padding(horizontal = 8.dp, vertical = 4.dp),
    horizontalArrangement = Arrangement.SpaceAround,
    verticalAlignment = Alignment.CenterVertically
  ) {
    IconButton(
      onClick = onGoBack,
      enabled = activeTab?.canGoBack == true
    ) {
      Icon(
        Icons.AutoMirrored.Filled.ArrowBack,
        contentDescription = "Zpět",
        tint = if (activeTab?.canGoBack == true) BrowsyTextPrimary else BrowsyTextMuted
      )
    }

    IconButton(
      onClick = onGoForward,
      enabled = activeTab?.canGoForward == true
    ) {
      Icon(
        Icons.AutoMirrored.Filled.ArrowForward,
        contentDescription = "Vpřed",
        tint = if (activeTab?.canGoForward == true) BrowsyTextPrimary else BrowsyTextMuted
      )
    }

    IconButton(onClick = onNewTab) {
      Icon(
        Icons.Default.Add,
        contentDescription = "Nová záložka",
        tint = BrowsyTextPrimary
      )
    }

    Box(
      modifier = Modifier
        .size(40.dp)
        .clip(RoundedCornerShape(8.dp))
        .clickable { onOpenTabSwitcher() },
      contentAlignment = Alignment.Center
    ) {
      Box(
        modifier = Modifier
          .size(24.dp)
          .border(1.5.dp, BrowsyTextPrimary, RoundedCornerShape(6.dp)),
        contentAlignment = Alignment.Center
      ) {
        AnimatedContent(
          targetState = tabCount,
          transitionSpec = {
            (slideInVertically { -it } + fadeIn()).togetherWith(slideOutVertically { it } + fadeOut())
          },
          label = "TabCountBadge"
        ) { count ->
          Text(
            text = count.toString(),
            color = BrowsyTextPrimary,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
          )
        }
      }
    }

    IconButton(onClick = onOpenMenu) {
      Icon(
        Icons.Default.MoreVert,
        contentDescription = "Menu",
        tint = BrowsyTextPrimary
      )
    }
  }
}

// -------------------------------------------------------------
// Tab Switcher View with Category Animations
// -------------------------------------------------------------

@Composable
fun TabSwitcherView(
  tabManager: TabManager,
  onClose: () -> Unit
) {
  var selectedTabType by remember { mutableIntStateOf(0) }
  val normalTabs = tabManager.tabs.filter { !it.isIncognito }
  val incognitoTabs = tabManager.tabs.filter { it.isIncognito }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(16.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text(
        text = "Záložky (${tabManager.tabs.size})",
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
        color = BrowsyTextPrimary
      )
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
          text = "Zavřít vše",
          color = BrowsyDanger,
          fontSize = 13.sp,
          fontWeight = FontWeight.Medium,
          modifier = Modifier
            .clickable { tabManager.closeAllTabs(incognitoOnly = selectedTabType == 1) }
            .padding(8.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        IconButton(
          onClick = {
            tabManager.createTab(isIncognito = selectedTabType == 1)
            onClose()
          }
        ) {
          Icon(Icons.Default.Add, contentDescription = "Přidat", tint = BrowsyTextPrimary)
        }
      }
    }

    Spacer(modifier = Modifier.height(12.dp))

    PrimaryTabRow(
      selectedTabIndex = selectedTabType,
      containerColor = BrowsyCard,
      contentColor = BrowsyTextPrimary
    ) {
      Tab(
        selected = selectedTabType == 0,
        onClick = { selectedTabType = 0 },
        text = { Text("Standardní (${normalTabs.count()})", color = if (selectedTabType == 0) BrowsyTextPrimary else BrowsyTextMuted) }
      )
      Tab(
        selected = selectedTabType == 1,
        onClick = { selectedTabType = 1 },
        text = { Text("Anonymní (${incognitoTabs.count()})", color = if (selectedTabType == 1) BrowsyTextPrimary else BrowsyTextMuted) }
      )
    }

    Spacer(modifier = Modifier.height(16.dp))

    AnimatedContent(
      targetState = selectedTabType,
      transitionSpec = {
        if (targetState > initialState) {
          (slideInHorizontally { width -> width } + fadeIn()).togetherWith(slideOutHorizontally { width -> -width } + fadeOut())
        } else {
          (slideInHorizontally { width -> -width } + fadeIn()).togetherWith(slideOutHorizontally { width -> width } + fadeOut())
        }
      },
      label = "TabSwitcherCategoryTransition"
    ) { tabType ->
      val listToShow = if (tabType == 0) normalTabs else incognitoTabs
      if (listToShow.isEmpty()) {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .height(200.dp),
          contentAlignment = Alignment.Center
        ) {
          Text("Žádné otevřené záložky", color = BrowsyTextMuted, fontSize = 14.sp)
        }
      } else {
        LazyVerticalGrid(
          columns = GridCells.Fixed(2),
          horizontalArrangement = Arrangement.spacedBy(10.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp),
          modifier = Modifier.height(380.dp)
        ) {
          gridItems(listToShow, key = { it.id }) { tab ->
            val isSelected = tab.id == tabManager.activeTabId.value
            TabCard(
              tab = tab,
              isSelected = isSelected,
              onSelect = {
                tabManager.selectTab(tab.id)
                onClose()
              },
              onClose = {
                tabManager.closeTab(tab.id)
              }
            )
          }
        }
      }
    }
  }
}

@Composable
fun TabCard(
  tab: TabData,
  isSelected: Boolean,
  onSelect: () -> Unit,
  onClose: () -> Unit
) {
  val borderColor by animateColorAsState(
    targetValue = if (isSelected) BrowsyAccent else BrowsyBorder,
    animationSpec = tween(200),
    label = "TabCardBorder"
  )
  val backgroundColor by animateColorAsState(
    targetValue = if (isSelected) BrowsyCardSelected else BrowsyCard,
    animationSpec = tween(200),
    label = "TabCardBg"
  )

  Box(
    modifier = Modifier
      .fillMaxWidth()
      .height(130.dp)
      .clip(RoundedCornerShape(12.dp))
      .background(backgroundColor)
      .border(1.5.dp, borderColor, RoundedCornerShape(12.dp))
      .clickable { onSelect() }
      .padding(10.dp)
  ) {
    Column(
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.SpaceBetween
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
      ) {
        Text(
          text = tab.title.ifBlank { "Nová záložka" },
          color = BrowsyTextPrimary,
          fontSize = 13.sp,
          fontWeight = FontWeight.SemiBold,
          maxLines = 2,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier.weight(1f)
        )
        IconButton(
          onClick = onClose,
          modifier = Modifier.size(24.dp)
        ) {
          Icon(
            Icons.Default.Close,
            contentDescription = "Zavřít záložku",
            tint = BrowsyTextSecondary,
            modifier = Modifier.size(16.dp)
          )
        }
      }

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = formatDisplayUrl(tab.url),
          color = BrowsyTextMuted,
          fontSize = 11.sp,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          modifier = Modifier.weight(1f)
        )
        if (tab.blockedCount > 0) {
          Text(
            text = "🛡 ${tab.blockedCount}",
            color = BrowsyShieldGreen,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold
          )
        }
      }
    }
  }
}

// -------------------------------------------------------------
// Shields Sheet View
// -------------------------------------------------------------

@Composable
fun ShieldsSheetView(
  activeTab: TabData?,
  settingsManager: SettingsManager,
  onClose: () -> Unit
) {
  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(20.dp)
  ) {
    Row(
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.SpaceBetween,
      modifier = Modifier.fillMaxWidth()
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
          Icons.Default.Security,
          contentDescription = "Shields",
          tint = BrowsyShieldGreen,
          modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
          text = "Browsy Shields",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          color = BrowsyTextPrimary
        )
      }
      IconButton(onClick = onClose) {
        Icon(Icons.Default.Close, contentDescription = "Zavřít", tint = BrowsyTextMuted)
      }
    }

    Spacer(modifier = Modifier.height(16.dp))

    Box(
      modifier = Modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(12.dp))
        .background(BrowsyCard)
        .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
        .padding(16.dp)
    ) {
      Column {
        Text(
          text = "${activeTab?.blockedCount ?: 0}",
          fontSize = 32.sp,
          fontWeight = FontWeight.ExtraBold,
          color = BrowsyShieldGreen
        )
        Text(
          text = "Zablokovaných reklam a sledovačů na této stránce",
          fontSize = 13.sp,
          color = BrowsyTextSecondary
        )
      }
    }

    Spacer(modifier = Modifier.height(16.dp))

    SettingsToggle(
      title = "Ochrana proti sledovačům",
      subtitle = "Blokuje síťové požadavky na reklamní servery",
      checked = settingsManager.shieldsEnabled.value,
      onCheckedChange = { settingsManager.setShieldsEnabled(it) }
    )

    Spacer(modifier = Modifier.height(12.dp))
    HorizontalDivider(color = BrowsyBorder)
    Spacer(modifier = Modifier.height(12.dp))

    SettingsToggle(
      title = "Kosmetické filtrování",
      subtitle = "Skrývá prázdná místa po zablokovaných bannerech",
      checked = settingsManager.cosmeticFiltering.value,
      onCheckedChange = { settingsManager.setCosmeticFiltering(it) }
    )

    Spacer(modifier = Modifier.height(20.dp))
  }
}

// -------------------------------------------------------------
// Settings Sheet View
// -------------------------------------------------------------

@Composable
fun SettingsSheetView(
  settingsManager: SettingsManager,
  tabManager: TabManager,
  syncManager: SyncManager,
  onOpenExpander: () -> Unit,
  onClose: () -> Unit
) {
  val context = LocalContext.current
  val coroutineScope = rememberCoroutineScope()
  var showClearConfirmDialog by remember { mutableStateOf(false) }

  var selectedProvider by remember { mutableStateOf(syncManager.currentProvider.value) }
  var serverUrl by remember { mutableStateOf(syncManager.currentServerUrl.value) }
  var token by remember { mutableStateOf(syncManager.currentToken.value) }
  var username by remember { mutableStateOf(syncManager.currentUsername.value) }
  var passphrase by remember { mutableStateOf(syncManager.currentPassphrase.value) }
  var isTestingSync by remember { mutableStateOf(false) }
  var isSyncing by remember { mutableStateOf(false) }
  var syncStatusMessage by remember {
    mutableStateOf(
      if (syncManager.lastSyncTimestamp.longValue > 0) {
        val sdf = SimpleDateFormat("dd. MM. yyyy HH:mm", Locale.getDefault())
        "Poslední synchronizace: " + sdf.format(Date(syncManager.lastSyncTimestamp.longValue))
      } else ""
    )
  }
  var isSyncError by remember { mutableStateOf(false) }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 20.dp, vertical = 16.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
          Icons.Default.Settings,
          contentDescription = "Nastavení",
          tint = BrowsyAccent,
          modifier = Modifier.size(22.dp)
        )
        Spacer(modifier = Modifier.width(10.dp))
        Text(
          text = "Nastavení",
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
          color = BrowsyTextPrimary
        )
      }
      IconButton(onClick = onClose) {
        Icon(Icons.Default.Close, contentDescription = "Zavřít", tint = BrowsyTextMuted)
      }
    }

    Spacer(modifier = Modifier.height(14.dp))

    LazyColumn(
      modifier = Modifier
        .fillMaxWidth()
        .height(480.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      // 1. Vyhledávač
      item {
        SettingsSectionHeader("Výchozí vyhledávač")
        Spacer(modifier = Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrowsyCard)
            .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
        ) {
          SearchEngine.entries.forEachIndexed { index, engine ->
            val isSelected = settingsManager.searchEngine.value == engine
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .clickable { settingsManager.setSearchEngine(engine) }
                .padding(horizontal = 14.dp, vertical = 12.dp),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Text(
                text = engine.title,
                color = if (isSelected) BrowsyAccent else BrowsyTextPrimary,
                fontSize = 14.sp,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal
              )
              if (isSelected) {
                Icon(
                  Icons.Default.Check,
                  contentDescription = "Vybráno",
                  tint = BrowsyAccent,
                  modifier = Modifier.size(18.dp)
                )
              }
            }
            if (index < SearchEngine.entries.size - 1) {
              HorizontalDivider(color = BrowsyBorder)
            }
          }
        }
      }

      // 2. Rozvržení adresního řádku
      item {
        SettingsSectionHeader("Pozice adresního řádku")
        Spacer(modifier = Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrowsyCard)
            .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
        ) {
          OmniboxPosition.entries.forEachIndexed { index, pos ->
            val isSelected = settingsManager.omniboxPosition.value == pos
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .clickable { settingsManager.setOmniboxPosition(pos) }
                .padding(horizontal = 14.dp, vertical = 12.dp),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Text(
                text = pos.title,
                color = if (isSelected) BrowsyAccent else BrowsyTextPrimary,
                fontSize = 14.sp,
                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal
              )
              if (isSelected) {
                Icon(
                  Icons.Default.Check,
                  contentDescription = "Vybráno",
                  tint = BrowsyAccent,
                  modifier = Modifier.size(18.dp)
                )
              }
            }
            if (index < OmniboxPosition.entries.size - 1) {
              HorizontalDivider(color = BrowsyBorder)
            }
          }
        }
      }

      // 3. Ochrana soukromí a štíty
      item {
        SettingsSectionHeader("Ochrana soukromí a štíty")
        Spacer(modifier = Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrowsyCard)
            .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
            .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
          SettingsToggle(
            title = "Aktivní Browsy Shields",
            subtitle = "Blokuje reklamní skripty a sledovací prvky",
            checked = settingsManager.shieldsEnabled.value,
            onCheckedChange = { settingsManager.setShieldsEnabled(it) }
          )
          HorizontalDivider(color = BrowsyBorder)
          SettingsToggle(
            title = "Kosmetické filtrování",
            subtitle = "Odstraňuje prázdná místa a layout bannery",
            checked = settingsManager.cosmeticFiltering.value,
            onCheckedChange = { settingsManager.setCosmeticFiltering(it) }
          )
          HorizontalDivider(color = BrowsyBorder)
          SettingsToggle(
            title = "Blokování vyskakovacích oken",
            subtitle = "Zabraňuje nevyžádaným pop-up oknům",
            checked = settingsManager.popupBlockerEnabled.value,
            onCheckedChange = { settingsManager.setPopupBlockerEnabled(it) }
          )
        }
      }

      // 4. Vzhled a chování webu
      item {
        SettingsSectionHeader("Vzhled a chování stránek")
        Spacer(modifier = Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrowsyCard)
            .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
            .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
          SettingsToggle(
            title = "Vynutit tmavý režim webů",
            subtitle = "Invertuje světlé weby do šetrného tmavého vzhledu",
            checked = settingsManager.forceWebDarkMode.value,
            onCheckedChange = {
              settingsManager.setForceWebDarkMode(it)
              tabManager.applySettingsToWebViews()
            }
          )
          HorizontalDivider(color = BrowsyBorder)
          SettingsToggle(
            title = "Povolit JavaScript",
            subtitle = "Vypnutí zrychlí načítání, ale může omezit funkce",
            checked = settingsManager.javaScriptEnabled.value,
            onCheckedChange = {
              settingsManager.setJavaScriptEnabled(it)
              tabManager.applySettingsToWebViews()
            }
          )
          HorizontalDivider(color = BrowsyBorder)
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .clickable { onOpenExpander() }
              .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column {
              Text("Zkratky textu (Text Expander)", color = BrowsyTextPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
              Text("Spravovat zkratky automatického nahrazování textu", color = BrowsyTextMuted, fontSize = 12.sp)
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Přejít", tint = BrowsyTextMuted, modifier = Modifier.size(18.dp))
          }
        }
      }

      // 5. Synchronizace dat (Self-hosted & WebDAV)
      item {
        SettingsSectionHeader("Synchronizace dat (E2E šifrování)")
        Spacer(modifier = Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrowsyCard)
            .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
            .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
          Text(
            text = "Zabezpečená synchronizace záložek, historie, nastavení a filtrů s počítačem přes Zero-Knowledge AES-256-GCM.",
            fontSize = 12.sp,
            color = BrowsyTextMuted,
            lineHeight = 16.sp
          )

          // Provider selector
          Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Poskytovatel synchronizace", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = BrowsyTextPrimary)
            SyncProvider.entries.forEach { p ->
              val isSelected = selectedProvider == p
              Row(
                modifier = Modifier
                  .fillMaxWidth()
                  .clip(RoundedCornerShape(8.dp))
                  .background(if (isSelected) BrowsyCardSelected else Color(0xFF101014))
                  .border(1.dp, if (isSelected) BrowsyAccent else BrowsyBorder, RoundedCornerShape(8.dp))
                  .clickable { selectedProvider = p }
                  .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Text(p.title, fontSize = 13.sp, color = if (isSelected) BrowsyAccent else BrowsyTextPrimary)
                if (isSelected) {
                  Icon(Icons.Default.Check, contentDescription = null, tint = BrowsyAccent, modifier = Modifier.size(16.dp))
                }
              }
            }
          }

          if (selectedProvider != SyncProvider.NONE) {
            // Server URL
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
              Text("URL adresa serveru / úložiště", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = BrowsyTextPrimary)
              BasicTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                textStyle = TextStyle(color = BrowsyTextPrimary, fontSize = 13.sp, fontFamily = FontFamily.Monospace),
                cursorBrush = SolidColor(BrowsyAccent),
                modifier = Modifier
                  .fillMaxWidth()
                  .clip(RoundedCornerShape(8.dp))
                  .background(Color(0xFF09090B))
                  .border(1.dp, BrowsyBorder, RoundedCornerShape(8.dp))
                  .padding(10.dp),
                decorationBox = { innerTextField ->
                  if (serverUrl.isEmpty()) {
                    Text(
                      if (selectedProvider == SyncProvider.SELF_HOSTED) "http://192.168.1.50:8080" else "https://nextcloud.example.com/remote.php/dav/files/user/",
                      color = BrowsyTextMuted,
                      fontSize = 13.sp
                    )
                  }
                  innerTextField()
                }
              )
            }

            // WebDAV username if WEBDAV
            if (selectedProvider == SyncProvider.WEBDAV) {
              Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Uživatelské jméno", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = BrowsyTextPrimary)
                BasicTextField(
                  value = username,
                  onValueChange = { username = it },
                  textStyle = TextStyle(color = BrowsyTextPrimary, fontSize = 13.sp),
                  cursorBrush = SolidColor(BrowsyAccent),
                  modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF09090B))
                    .border(1.dp, BrowsyBorder, RoundedCornerShape(8.dp))
                    .padding(10.dp),
                  decorationBox = { innerTextField ->
                    if (username.isEmpty()) {
                      Text("Uživatelské jméno WebDAV", color = BrowsyTextMuted, fontSize = 13.sp)
                    }
                    innerTextField()
                  }
                )
              }
            }

            // Token / Password
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
              Text(
                if (selectedProvider == SyncProvider.SELF_HOSTED) "Přístupový token serveru (Master Token)" else "Heslo nebo App Token",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = BrowsyTextPrimary
              )
              BasicTextField(
                value = token,
                onValueChange = { token = it },
                textStyle = TextStyle(color = BrowsyTextPrimary, fontSize = 13.sp),
                cursorBrush = SolidColor(BrowsyAccent),
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier
                  .fillMaxWidth()
                  .clip(RoundedCornerShape(8.dp))
                  .background(Color(0xFF09090B))
                  .border(1.dp, BrowsyBorder, RoundedCornerShape(8.dp))
                  .padding(10.dp),
                decorationBox = { innerTextField ->
                  if (token.isEmpty()) {
                    Text("Zadejte autorizační token nebo heslo", color = BrowsyTextMuted, fontSize = 13.sp)
                  }
                  innerTextField()
                }
              )
            }

            // Passphrase
            Column(
              modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF141418))
                .border(1.dp, Color(0xFF27272A), RoundedCornerShape(8.dp))
                .padding(10.dp),
              verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
              Text("Bezpečnostní fráze pro E2E šifrování", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = BrowsyAccent)
              Text(
                "Data jsou na zařízení zašifrována pomocí AES-256-GCM dříve, než opustí prohlížeč. Zadejte stejnou frázi jako na vašem PC.",
                fontSize = 11.sp,
                color = BrowsyTextMuted,
                lineHeight = 15.sp
              )
              BasicTextField(
                value = passphrase,
                onValueChange = { passphrase = it },
                textStyle = TextStyle(color = BrowsyTextPrimary, fontSize = 13.sp),
                cursorBrush = SolidColor(BrowsyAccent),
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier
                  .fillMaxWidth()
                  .clip(RoundedCornerShape(6.dp))
                  .background(Color(0xFF09090B))
                  .border(1.dp, BrowsyBorder, RoundedCornerShape(6.dp))
                  .padding(8.dp),
                decorationBox = { innerTextField ->
                  if (passphrase.isEmpty()) {
                    Text("Zadejte tajnou synchronizační frázi", color = BrowsyTextMuted, fontSize = 12.sp)
                  }
                  innerTextField()
                }
              )
            }

            // Buttons
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
              // Test button
              Box(
                modifier = Modifier
                  .weight(1f)
                  .clip(RoundedCornerShape(8.dp))
                  .background(Color(0xFF202026))
                  .border(1.dp, BrowsyBorder, RoundedCornerShape(8.dp))
                  .clickable(enabled = !isTestingSync && !isSyncing) {
                    coroutineScope.launch {
                      isTestingSync = true
                      syncStatusMessage = "Testuji připojení..."
                      isSyncError = false
                      val cfg = SyncConfig(selectedProvider, serverUrl, token, username, passphrase)
                      val res = syncManager.testConnection(cfg)
                      isTestingSync = false
                      if (res.success) {
                        syncStatusMessage = "✔ ${res.message}"
                        isSyncError = false
                      } else {
                        syncStatusMessage = "✖ ${res.error}"
                        isSyncError = true
                      }
                    }
                  }
                  .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
              ) {
                Text(if (isTestingSync) "..." else "Test", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = BrowsyTextPrimary)
              }

              // Save button
              Box(
                modifier = Modifier
                  .weight(1f)
                  .clip(RoundedCornerShape(8.dp))
                  .background(Color(0xFF202026))
                  .border(1.dp, BrowsyBorder, RoundedCornerShape(8.dp))
                  .clickable(enabled = !isTestingSync && !isSyncing) {
                    val cfg = SyncConfig(selectedProvider, serverUrl, token, username, passphrase, syncManager.lastSyncTimestamp.longValue)
                    syncManager.saveConfig(cfg)
                    syncStatusMessage = "✔ Nastavení uloženo"
                    isSyncError = false
                  }
                  .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
              ) {
                Text("Uložit", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = BrowsyTextPrimary)
              }

              // Sync Now button
              Box(
                modifier = Modifier
                  .weight(1.5f)
                  .clip(RoundedCornerShape(8.dp))
                  .background(BrowsyAccent)
                  .clickable(enabled = !isTestingSync && !isSyncing) {
                    coroutineScope.launch {
                      isSyncing = true
                      syncStatusMessage = "Probíhá synchronizace..."
                      isSyncError = false
                      val cfg = SyncConfig(selectedProvider, serverUrl, token, username, passphrase, syncManager.lastSyncTimestamp.longValue)
                      syncManager.saveConfig(cfg)
                      val res = syncManager.syncNow(cfg)
                      isSyncing = false
                      if (res.success) {
                        val sdf = SimpleDateFormat("HH:mm", Locale.getDefault())
                        syncStatusMessage = "✔ Hotovo v ${sdf.format(Date())} (${res.bookmarksCount} záložek, ${res.historyCount} historie)"
                        isSyncError = false
                      } else {
                        syncStatusMessage = "✖ ${res.error}"
                        isSyncError = true
                      }
                    }
                  }
                  .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
              ) {
                Text(if (isSyncing) "Syncing..." else "Synchronizovat", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF09090B))
              }
            }

            // Status message
            if (syncStatusMessage.isNotBlank()) {
              Box(
                modifier = Modifier
                  .fillMaxWidth()
                  .clip(RoundedCornerShape(8.dp))
                  .background(if (isSyncError) Color(0xFF271515) else Color(0xFF142718))
                  .border(1.dp, if (isSyncError) Color(0xFF7F1D1D) else Color(0xFF166534), RoundedCornerShape(8.dp))
                  .padding(10.dp)
              ) {
                Text(
                  text = syncStatusMessage,
                  color = if (isSyncError) BrowsyDanger else BrowsyShieldGreen,
                  fontSize = 12.sp
                )
              }
            }
          }
        }
      }

      // 6. Data procházení a mezipaměť
      item {
        SettingsSectionHeader("Data procházení a mezipaměť")
        Spacer(modifier = Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrowsyCard)
            .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
            .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
          SettingsToggle(
            title = "Vymazat data při ukončení",
            subtitle = "Automaticky promaže mezipaměť a cookies při opuštění prohlížeče",
            checked = settingsManager.clearDataOnExit.value,
            onCheckedChange = { settingsManager.setClearDataOnExit(it) }
          )
          HorizontalDivider(color = BrowsyBorder)
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .clip(RoundedCornerShape(8.dp))
              .background(Color(0xFF271515))
              .border(1.dp, Color(0xFF7F1D1D), RoundedCornerShape(8.dp))
              .clickable { showClearConfirmDialog = true }
              .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Icon(Icons.Default.Delete, contentDescription = "Smazat", tint = BrowsyDanger, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Vymazat mezipaměť a cookies", color = BrowsyDanger, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
          }
        }
      }

      // 6. O aplikaci
      item {
        SettingsSectionHeader("O aplikaci")
        Spacer(modifier = Modifier.height(8.dp))
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(BrowsyCard)
            .border(1.dp, BrowsyBorder, RoundedCornerShape(12.dp))
            .padding(14.dp)
        ) {
          Text("Browsy pro Android", color = BrowsyTextPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
          Text("Verze 1.0.0 (Chromium-grade privacy)", color = BrowsyTextMuted, fontSize = 12.sp)
          Spacer(modifier = Modifier.height(6.dp))
          Text(
            "Monochromatický prohlížeč navržený pro nulový vizuální šum, maximální rychlost a nekompromisní soukromí.",
            color = BrowsyTextSecondary,
            fontSize = 12.sp
          )
        }
      }
    }
  }

  if (showClearConfirmDialog) {
    AlertDialog(
      onDismissRequest = { showClearConfirmDialog = false },
      containerColor = BrowsyCard,
      title = { Text("Vymazat data procházení?", color = BrowsyTextPrimary) },
      text = { Text("Tato akce trvale odstraní mezipaměť, uložené cookies a data webů.", color = BrowsyTextSecondary) },
      confirmButton = {
        TextButton(
          onClick = {
            showClearConfirmDialog = false
            settingsManager.clearAllBrowsingData {
              Toast.makeText(context, "Data prohlížení byla vymazána", Toast.LENGTH_SHORT).show()
            }
          }
        ) {
          Text("Vymazat", color = BrowsyDanger, fontWeight = FontWeight.Bold)
        }
      },
      dismissButton = {
        TextButton(onClick = { showClearConfirmDialog = false }) {
          Text("Zrušit", color = BrowsyTextSecondary)
        }
      }
    )
  }
}

@Composable
private fun SettingsSectionHeader(title: String) {
  Text(
    text = title.uppercase(),
    color = BrowsyTextMuted,
    fontSize = 11.sp,
    fontWeight = FontWeight.Bold,
    letterSpacing = 0.5.sp
  )
}

@Composable
private fun SettingsToggle(
  title: String,
  subtitle: String,
  checked: Boolean,
  onCheckedChange: (Boolean) -> Unit
) {
  Row(
    modifier = Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.CenterVertically
  ) {
    Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
      Text(title, color = BrowsyTextPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
      Text(subtitle, color = BrowsyTextMuted, fontSize = 12.sp)
    }
    Switch(
      checked = checked,
      onCheckedChange = onCheckedChange,
      colors = SwitchDefaults.colors(
        checkedThumbColor = BrowsyAccent,
        checkedTrackColor = Color(0xFF27272A),
        uncheckedTrackColor = BrowsySurface
      )
    )
  }
}

// -------------------------------------------------------------
// Overflow Menu Sheet View
// -------------------------------------------------------------

@Composable
fun MenuSheetView(
  activeTab: TabData?,
  tabManager: TabManager,
  historyAndBookmarksManager: HistoryAndBookmarksManager,
  onOpenBookmarks: () -> Unit,
  onOpenHistory: () -> Unit,
  onOpenExpander: () -> Unit,
  onOpenSettings: () -> Unit,
  onFindInPage: () -> Unit,
  onToggleReaderMode: () -> Unit,
  onStartElementPicker: () -> Unit,
  onShare: () -> Unit,
  onPrint: () -> Unit,
  onClose: () -> Unit
) {
  val isBookmarked = historyAndBookmarksManager.isBookmarked(activeTab?.url ?: "")

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(vertical = 12.dp)
  ) {
    MenuItem(
      icon = Icons.Default.Add,
      title = "Nová záložka",
      onClick = {
        tabManager.createTab(isIncognito = false)
        onClose()
      }
    )
    MenuItem(
      icon = Icons.Default.Security,
      title = "Nová anonymní záložka",
      onClick = {
        tabManager.createTab(isIncognito = true)
        onClose()
      }
    )
    HorizontalDivider(color = BrowsyBorder, modifier = Modifier.padding(vertical = 6.dp))

    MenuItem(
      icon = Icons.Default.Search,
      title = "Najít na stránce",
      onClick = onFindInPage
    )
    MenuItem(
      icon = Icons.Default.Article,
      title = if (activeTab?.isReaderMode == true) "Ukončit režim čtení" else "Režim čtení",
      onClick = onToggleReaderMode
    )
    MenuItem(
      icon = Icons.Default.DeleteSweep,
      title = "Odstranit prvek z webu",
      textColor = BrowsyDanger,
      onClick = onStartElementPicker
    )
    MenuItem(
      icon = Icons.Default.Share,
      title = "Sdílet odkaz",
      onClick = onShare
    )
    MenuItem(
      icon = Icons.Default.Print,
      title = "Tisk / Uložit jako PDF",
      onClick = onPrint
    )

    HorizontalDivider(color = BrowsyBorder, modifier = Modifier.padding(vertical = 6.dp))

    MenuItem(
      icon = if (isBookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
      title = if (isBookmarked) "Odstranit ze záložek" else "Přidat do záložek",
      onClick = {
        activeTab?.let { historyAndBookmarksManager.toggleBookmark(it.title, it.url) }
        onClose()
      }
    )
    MenuItem(
      icon = Icons.Default.Bookmark,
      title = "Záložky",
      onClick = onOpenBookmarks
    )
    MenuItem(
      icon = Icons.Default.History,
      title = "Historie prohlížení",
      onClick = onOpenHistory
    )
    MenuItem(
      icon = Icons.Default.Search,
      title = "Zkratky textu (Text Expander)",
      onClick = onOpenExpander
    )

    HorizontalDivider(color = BrowsyBorder, modifier = Modifier.padding(vertical = 6.dp))

    MenuItem(
      icon = Icons.Default.Check,
      title = if (activeTab?.desktopMode == true) "✓ Verze pro počítač" else "Verze pro počítač",
      onClick = {
        tabManager.toggleDesktopMode()
        onClose()
      }
    )
    MenuItem(
      icon = Icons.Default.Settings,
      title = "Nastavení",
      onClick = onOpenSettings
    )
    MenuItem(
      icon = Icons.Default.Delete,
      title = "Vymazat historii prohlížení",
      textColor = BrowsyDanger,
      onClick = {
        historyAndBookmarksManager.clearHistory()
        onClose()
      }
    )
  }
}

@Composable
fun MenuItem(
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  title: String,
  textColor: Color = BrowsyTextPrimary,
  onClick: () -> Unit
) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .clickable { onClick() }
      .padding(horizontal = 20.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically
  ) {
    Icon(icon, contentDescription = title, tint = textColor, modifier = Modifier.size(20.dp))
    Spacer(modifier = Modifier.width(16.dp))
    Text(text = title, color = textColor, fontSize = 15.sp, fontWeight = FontWeight.Medium)
  }
}

// -------------------------------------------------------------
// Bookmarks Sheet View
// -------------------------------------------------------------

@Composable
fun BookmarksSheetView(
  historyAndBookmarksManager: HistoryAndBookmarksManager,
  onSelectUrl: (String) -> Unit,
  onClose: () -> Unit
) {
  val bookmarks = historyAndBookmarksManager.getBookmarks()

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(20.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text("Záložky", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = BrowsyTextPrimary)
      IconButton(onClick = onClose) {
        Icon(Icons.Default.Close, contentDescription = "Zavřít", tint = BrowsyTextMuted)
      }
    }

    Spacer(modifier = Modifier.height(12.dp))

    if (bookmarks.isEmpty()) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .height(160.dp),
        contentAlignment = Alignment.Center
      ) {
        Text("Nemáte uloženy žádné záložky.", color = BrowsyTextMuted, fontSize = 14.sp)
      }
    } else {
      LazyColumn(modifier = Modifier.height(350.dp)) {
        items(bookmarks, key = { it.id }) { item ->
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .clickable { onSelectUrl(item.url) }
              .padding(vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column(modifier = Modifier.weight(1f)) {
              Text(item.title, color = BrowsyTextPrimary, fontWeight = FontWeight.Medium, maxLines = 1)
              Text(item.url, color = BrowsyTextMuted, fontSize = 12.sp, maxLines = 1)
            }
            IconButton(onClick = { historyAndBookmarksManager.removeBookmark(item.id) }) {
              Icon(Icons.Default.Delete, contentDescription = "Smazat", tint = BrowsyTextMuted, modifier = Modifier.size(18.dp))
            }
          }
          HorizontalDivider(color = BrowsyBorder)
        }
      }
    }
  }
}

// -------------------------------------------------------------
// History Sheet View
// -------------------------------------------------------------

@Composable
fun HistorySheetView(
  historyAndBookmarksManager: HistoryAndBookmarksManager,
  onSelectUrl: (String) -> Unit,
  onClose: () -> Unit
) {
  val history = historyAndBookmarksManager.getHistory()
  val dateFormat = remember { SimpleDateFormat("dd. MM. HH:mm", Locale.getDefault()) }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(20.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Text("Historie (${history.size})", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = BrowsyTextPrimary)
      Row(verticalAlignment = Alignment.CenterVertically) {
        if (history.isNotEmpty()) {
          Text(
            text = "Smazat",
            color = BrowsyDanger,
            fontSize = 13.sp,
            modifier = Modifier
              .clickable { historyAndBookmarksManager.clearHistory() }
              .padding(8.dp)
          )
        }
        IconButton(onClick = onClose) {
          Icon(Icons.Default.Close, contentDescription = "Zavřít", tint = BrowsyTextMuted)
        }
      }
    }

    Spacer(modifier = Modifier.height(12.dp))

    if (history.isEmpty()) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .height(160.dp),
        contentAlignment = Alignment.Center
      ) {
        Text("Historie procházení je prázdná.", color = BrowsyTextMuted, fontSize = 14.sp)
      }
    } else {
      LazyColumn(modifier = Modifier.height(350.dp)) {
        items(history, key = { it.id }) { item ->
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .clickable { onSelectUrl(item.url) }
              .padding(vertical = 8.dp)
          ) {
            Text(item.title, color = BrowsyTextPrimary, fontWeight = FontWeight.Medium, maxLines = 1)
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween
            ) {
              Text(item.url, color = BrowsyTextMuted, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
              Text(dateFormat.format(Date(item.visitedAt)), color = BrowsyTextMuted, fontSize = 11.sp)
            }
          }
          HorizontalDivider(color = BrowsyBorder)
        }
      }
    }
  }
}

// -------------------------------------------------------------
// Text Expander Snippets Sheet View
// -------------------------------------------------------------

@Composable
fun TextExpanderSheetView(
  textExpanderManager: TextExpanderManager,
  onClose: () -> Unit
) {
  val snippets = textExpanderManager.getSnippets()
  var newShortcut by remember { mutableStateOf("") }
  var newExpansion by remember { mutableStateOf("") }

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(20.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Column {
        Text("Text Expander", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = BrowsyTextPrimary)
        Text("Při psaní na webu automaticky nahradí zkratky", fontSize = 12.sp, color = BrowsyTextMuted)
      }
      IconButton(onClick = onClose) {
        Icon(Icons.Default.Close, contentDescription = "Zavřít", tint = BrowsyTextMuted)
      }
    }

    Spacer(modifier = Modifier.height(14.dp))

    Row(
      modifier = Modifier.fillMaxWidth(),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
      BasicTextField(
        value = newShortcut,
        onValueChange = { newShortcut = it },
        modifier = Modifier
          .weight(1f)
          .height(40.dp)
          .clip(RoundedCornerShape(8.dp))
          .background(BrowsyCard)
          .border(1.dp, BrowsyBorder, RoundedCornerShape(8.dp))
          .padding(horizontal = 10.dp, vertical = 10.dp),
        textStyle = TextStyle(color = BrowsyTextPrimary, fontSize = 13.sp),
        cursorBrush = SolidColor(BrowsyAccent),
        decorationBox = { inner ->
          if (newShortcut.isEmpty()) Text("/zkratka", color = BrowsyTextMuted, fontSize = 13.sp)
          inner()
        }
      )

      BasicTextField(
        value = newExpansion,
        onValueChange = { newExpansion = it },
        modifier = Modifier
          .weight(1.5f)
          .height(40.dp)
          .clip(RoundedCornerShape(8.dp))
          .background(BrowsyCard)
          .border(1.dp, BrowsyBorder, RoundedCornerShape(8.dp))
          .padding(horizontal = 10.dp, vertical = 10.dp),
        textStyle = TextStyle(color = BrowsyTextPrimary, fontSize = 13.sp),
        cursorBrush = SolidColor(BrowsyAccent),
        decorationBox = { inner ->
          if (newExpansion.isEmpty()) Text("Rozšířený text", color = BrowsyTextMuted, fontSize = 13.sp)
          inner()
        }
      )

      IconButton(
        onClick = {
          if (newShortcut.isNotBlank() && newExpansion.isNotBlank()) {
            textExpanderManager.addSnippet(newShortcut, newExpansion)
            newShortcut = ""
            newExpansion = ""
          }
        },
        modifier = Modifier
          .size(40.dp)
          .clip(RoundedCornerShape(8.dp))
          .background(BrowsyAccent)
      ) {
        Icon(Icons.Default.Add, contentDescription = "Přidat", tint = BrowsyBackground)
      }
    }

    Spacer(modifier = Modifier.height(16.dp))

    LazyColumn(modifier = Modifier.height(280.dp)) {
      items(snippets) { item ->
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(item.shortcut, color = BrowsyTextPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            Text(textExpanderManager.resolveExpansion(item.expansion), color = BrowsyTextSecondary, fontSize = 13.sp)
          }
          if (!item.isBuiltin) {
            IconButton(
              onClick = { textExpanderManager.removeSnippet(item.shortcut) },
              modifier = Modifier.size(28.dp)
            ) {
              Icon(Icons.Default.Delete, contentDescription = "Smazat", tint = BrowsyTextMuted, modifier = Modifier.size(16.dp))
            }
          } else {
            Text("Vestavěná", color = BrowsyTextMuted, fontSize = 10.sp, modifier = Modifier.padding(end = 8.dp))
          }
        }
        HorizontalDivider(color = BrowsyBorder)
      }
    }
  }
}

private fun formatDisplayUrl(raw: String): String {
  if (raw.isBlank() || raw == "about:blank" || raw == "browsy://newtab") return "Vyhledejte nebo zadejte adresu"
  return raw
    .removePrefix("https://")
    .removePrefix("http://")
    .removePrefix("www.")
    .removeSuffix("/")
}
