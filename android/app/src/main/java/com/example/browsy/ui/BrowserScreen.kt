package com.example.browsy.ui

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.example.browsy.data.Bookmark
import com.example.browsy.data.HistoryAndBookmarksManager
import com.example.browsy.data.HistoryItem
import com.example.browsy.expander.TextExpanderManager
import com.example.browsy.expander.TextSnippet
import com.example.browsy.tabs.TabData
import com.example.browsy.tabs.TabManager
import com.example.browsy.theme.BrowsyAccent
import com.example.browsy.theme.BrowsyBackground
import com.example.browsy.theme.BrowsyBorder
import com.example.browsy.theme.BrowsyBorderFocused
import com.example.browsy.theme.BrowsyBorderSubtle
import com.example.browsy.theme.BrowsyCard
import com.example.browsy.theme.BrowsyCardSelected
import com.example.browsy.theme.BrowsyDanger
import com.example.browsy.theme.BrowsyShieldGreen
import com.example.browsy.theme.BrowsySurface
import com.example.browsy.theme.BrowsyTextMuted
import com.example.browsy.theme.BrowsyTextPrimary
import com.example.browsy.theme.BrowsyTextSecondary
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserScreen(
  tabManager: TabManager,
  historyAndBookmarksManager: HistoryAndBookmarksManager,
  textExpanderManager: TextExpanderManager,
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

  // System Back button handling
  BackHandler(enabled = true) {
    when {
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

  Column(
    modifier = modifier
      .fillMaxSize()
      .background(BrowsyBackground)
  ) {
    // -------------------------------------------------------------
    // 1. Top Omnibox (Address Bar)
    // -------------------------------------------------------------
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .background(BrowsySurface)
    ) {
      Row(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        // Omnibox pill container
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
          // HTTPS lock icon
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
              onValueChange = { urlInputText = it },
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
                  isEditingUrl = false
                  focusManager.clearFocus()
                  tabManager.loadUrl(urlInputText)
                }
              )
            )
            if (urlInputText.isNotEmpty()) {
              IconButton(
                onClick = { urlInputText = "" },
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
            // Display URL / Domain
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
                .clickable {
                  urlInputText = activeTab?.url ?: ""
                  isEditingUrl = true
                }
            )
          }

          Spacer(modifier = Modifier.width(6.dp))

          // Shields Badge Pill
          val blocked = activeTab?.blockedCount ?: 0
          Row(
            modifier = Modifier
              .clip(RoundedCornerShape(12.dp))
              .background(if (blocked > 0) Color(0xFF1E293B) else Color(0xFF27272A))
              .clickable { showShieldsSheet = true }
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
              Text(
                text = blocked.toString(),
                color = BrowsyShieldGreen,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
              )
            }
          }

          Spacer(modifier = Modifier.width(6.dp))

          // Reload or Stop
          if (activeTab?.isLoading == true) {
            IconButton(
              onClick = { tabManager.stopCurrent() },
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
              onClick = { tabManager.reloadCurrent() },
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

      // Linear Progress Bar
      if (activeTab?.isLoading == true) {
        LinearProgressIndicator(
          progress = { (activeTab.progress / 100f).coerceIn(0f, 1f) },
          modifier = Modifier
            .fillMaxWidth()
            .height(2.dp),
          color = BrowsyAccent,
          trackColor = BrowsyBorder
        )
      } else {
        Spacer(
          modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(BrowsyBorder)
        )
      }
    }

    // -------------------------------------------------------------
    // 2. Main WebView Container
    // -------------------------------------------------------------
    Box(
      modifier = Modifier
        .weight(1f)
        .fillMaxWidth()
        .background(BrowsyBackground)
    ) {
      if (activeTab?.webView != null) {
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
    // 3. Bottom Navigation Bar
    // -------------------------------------------------------------
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .background(BrowsySurface)
        .border(1.dp, BrowsyBorder)
        .padding(horizontal = 8.dp, vertical = 4.dp),
      horizontalArrangement = Arrangement.SpaceAround,
      verticalAlignment = Alignment.CenterVertically
    ) {
      // Back
      IconButton(
        onClick = { tabManager.goBack() },
        enabled = activeTab?.canGoBack == true
      ) {
        Icon(
          Icons.Default.ArrowBack,
          contentDescription = "Zpět",
          tint = if (activeTab?.canGoBack == true) BrowsyTextPrimary else BrowsyTextMuted
        )
      }

      // Forward
      IconButton(
        onClick = { tabManager.goForward() },
        enabled = activeTab?.canGoForward == true
      ) {
        Icon(
          Icons.Default.ArrowForward,
          contentDescription = "Vpřed",
          tint = if (activeTab?.canGoForward == true) BrowsyTextPrimary else BrowsyTextMuted
        )
      }

      // New Tab (+)
      IconButton(
        onClick = {
          tabManager.createTab("https://duckduckgo.com", isIncognito = activeTab?.isIncognito ?: false)
        }
      ) {
        Icon(
          Icons.Default.Add,
          contentDescription = "Nová záložka",
          tint = BrowsyTextPrimary
        )
      }

      // Tab Switcher with count badge
      Box(
        modifier = Modifier
          .size(40.dp)
          .clip(RoundedCornerShape(8.dp))
          .clickable { showTabSwitcher = true },
        contentAlignment = Alignment.Center
      ) {
        Box(
          modifier = Modifier
            .size(24.dp)
            .border(1.5.dp, BrowsyTextPrimary, RoundedCornerShape(6.dp)),
          contentAlignment = Alignment.Center
        ) {
          Text(
            text = tabManager.tabs.size.toString(),
            color = BrowsyTextPrimary,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
          )
        }
      }

      // Menu
      IconButton(onClick = { showMenuSheet = true }) {
        Icon(
          Icons.Default.MoreVert,
          contentDescription = "Menu",
          tint = BrowsyTextPrimary
        )
      }
    }
  }

  // -------------------------------------------------------------
  // Tab Switcher Bottom Sheet / Grid
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

  // -------------------------------------------------------------
  // Shields Bottom Sheet
  // -------------------------------------------------------------
  if (showShieldsSheet) {
    ModalBottomSheet(
      onDismissRequest = { showShieldsSheet = false },
      containerColor = BrowsySurface,
      shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
      ShieldsSheetView(
        activeTab = activeTab,
        onClose = { showShieldsSheet = false }
      )
    }
  }

  // -------------------------------------------------------------
  // Overflow Menu Bottom Sheet
  // -------------------------------------------------------------
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
        onClose = { showMenuSheet = false }
      )
    }
  }

  // -------------------------------------------------------------
  // Bookmarks Sheet
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // History Sheet
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Text Expander Snippets Sheet
  // -------------------------------------------------------------
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
// Sub-views & Components
// -------------------------------------------------------------

@Composable
fun TabSwitcherView(
  tabManager: TabManager,
  onClose: () -> Unit
) {
  var selectedTabType by remember { mutableIntStateOf(0) } // 0 = Normální, 1 = Anonymní
  val normalTabs = tabManager.tabs.filter { !it.isIncognito }
  val incognitoTabs = tabManager.tabs.filter { it.isIncognito }
  val currentList = if (selectedTabType == 0) normalTabs else incognitoTabs

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .padding(16.dp)
  ) {
    // Header
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
            tabManager.createTab("https://duckduckgo.com", isIncognito = selectedTabType == 1)
            onClose()
          }
        ) {
          Icon(Icons.Default.Add, contentDescription = "Přidat", tint = BrowsyTextPrimary)
        }
      }
    }

    Spacer(modifier = Modifier.height(12.dp))

    // Tab Type Selector
    TabRow(
      selectedTabIndex = selectedTabType,
      containerColor = BrowsyCard,
      contentColor = BrowsyTextPrimary,
      indicator = { tabPositions ->
        TabRowDefaults.SecondaryIndicator(
          Modifier.tabIndicatorOffset(tabPositions[selectedTabType]),
          color = BrowsyAccent
        )
      }
    ) {
      Tab(
        selected = selectedTabType == 0,
        onClick = { selectedTabType = 0 },
        text = { Text("Standardní (${normalTabs.size})", color = if (selectedTabType == 0) BrowsyTextPrimary else BrowsyTextMuted) }
      )
      Tab(
        selected = selectedTabType == 1,
        onClick = { selectedTabType = 1 },
        text = { Text("Anonymní (${incognitoTabs.size})", color = if (selectedTabType == 1) BrowsyTextPrimary else BrowsyTextMuted) }
      )
    }

    Spacer(modifier = Modifier.height(16.dp))

    // Grid of Tab Cards
    if (currentList.isEmpty()) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .height(180.dp),
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
        items(currentList, key = { it.id }) { tab ->
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

@Composable
fun TabCard(
  tab: TabData,
  isSelected: Boolean,
  onSelect: () -> Unit,
  onClose: () -> Unit
) {
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .height(130.dp)
      .clip(RoundedCornerShape(12.dp))
      .background(if (isSelected) BrowsyCardSelected else BrowsyCard)
      .border(
        1.5.dp,
        if (isSelected) BrowsyAccent else BrowsyBorder,
        RoundedCornerShape(12.dp)
      )
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
          onClick = { onClose() },
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

@Composable
fun ShieldsSheetView(
  activeTab: TabData?,
  onClose: () -> Unit
) {
  var shieldsEnabled by remember { mutableStateOf(true) }
  var cosmeticEnabled by remember { mutableStateOf(true) }

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

    // Big Stats Card
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

    // Toggles
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Column {
        Text("Ochrana proti sledovačům", color = BrowsyTextPrimary, fontWeight = FontWeight.Medium)
        Text("Blokuje síťové požadavky na reklamní servery", color = BrowsyTextMuted, fontSize = 12.sp)
      }
      Switch(
        checked = shieldsEnabled,
        onCheckedChange = { shieldsEnabled = it },
        colors = SwitchDefaults.colors(
          checkedThumbColor = BrowsyAccent,
          checkedTrackColor = Color(0xFF27272A),
          uncheckedTrackColor = BrowsyCard
        )
      )
    }

    Spacer(modifier = Modifier.height(12.dp))
    Divider(color = BrowsyBorder)
    Spacer(modifier = Modifier.height(12.dp))

    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically
    ) {
      Column {
        Text("Kosmetické filtrování", color = BrowsyTextPrimary, fontWeight = FontWeight.Medium)
        Text("Skrývá prázdná místa po zablokovaných bannerech", color = BrowsyTextMuted, fontSize = 12.sp)
      }
      Switch(
        checked = cosmeticEnabled,
        onCheckedChange = { cosmeticEnabled = it },
        colors = SwitchDefaults.colors(
          checkedThumbColor = BrowsyAccent,
          checkedTrackColor = Color(0xFF27272A),
          uncheckedTrackColor = BrowsyCard
        )
      )
    }

    Spacer(modifier = Modifier.height(20.dp))
  }
}

@Composable
fun MenuSheetView(
  activeTab: TabData?,
  tabManager: TabManager,
  historyAndBookmarksManager: HistoryAndBookmarksManager,
  onOpenBookmarks: () -> Unit,
  onOpenHistory: () -> Unit,
  onOpenExpander: () -> Unit,
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
        tabManager.createTab("https://duckduckgo.com", isIncognito = false)
        onClose()
      }
    )
    MenuItem(
      icon = Icons.Default.Security,
      title = "Nová anonymní záložka",
      onClick = {
        tabManager.createTab("https://duckduckgo.com", isIncognito = true)
        onClose()
      }
    )
    Divider(color = BrowsyBorder, modifier = Modifier.padding(vertical = 6.dp))

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

    Divider(color = BrowsyBorder, modifier = Modifier.padding(vertical = 6.dp))

    MenuItem(
      icon = Icons.Default.Check,
      title = if (activeTab?.desktopMode == true) "✓ Verze pro počítač" else "Verze pro počítač",
      onClick = {
        tabManager.toggleDesktopMode()
        onClose()
      }
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
          Divider(color = BrowsyBorder)
        }
      }
    }
  }
}

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
          Divider(color = BrowsyBorder)
        }
      }
    }
  }
}

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

    // Input form to add a new snippet
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

    // List of Snippets
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
        Divider(color = BrowsyBorder)
      }
    }
  }
}

private fun formatDisplayUrl(raw: String): String {
  if (raw.isBlank() || raw == "about:blank") return "Vyhledejte nebo zadejte adresu"
  return raw
    .removePrefix("https://")
    .removePrefix("http://")
    .removePrefix("www.")
    .removeSuffix("/")
}
