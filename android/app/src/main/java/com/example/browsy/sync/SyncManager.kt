package com.example.browsy.sync

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import com.example.browsy.data.Bookmark
import com.example.browsy.data.HistoryAndBookmarksManager
import com.example.browsy.data.HistoryItem
import com.example.browsy.data.SearchEngine
import com.example.browsy.data.SettingsManager
import com.example.browsy.expander.TextExpanderManager
import com.example.browsy.shields.ShieldsEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

enum class SyncProvider(val id: String, val title: String) {
  NONE("NONE", "Vypnuto"),
  SELF_HOSTED("SELF_HOSTED", "Self-Hosted Browsy Sync Server"),
  WEBDAV("WEBDAV", "Cloudové úložiště WebDAV");

  companion object {
    fun fromId(id: String): SyncProvider {
      return entries.firstOrNull { it.id.equals(id, ignoreCase = true) } ?: NONE
    }
  }
}

data class SyncConfig(
  val provider: SyncProvider = SyncProvider.NONE,
  val serverUrl: String = "",
  val token: String = "",
  val username: String = "",
  val passphrase: String = "",
  val lastSyncTime: Long = 0L
)

data class SyncResult(
  val success: Boolean,
  val message: String = "",
  val error: String = "",
  val lastSyncTime: Long = 0L,
  val bookmarksCount: Int = 0,
  val historyCount: Int = 0,
  val filtersCount: Int = 0,
  val snippetsCount: Int = 0
)

class SyncManager(
  private val context: Context,
  private val historyAndBookmarksManager: HistoryAndBookmarksManager,
  private val settingsManager: SettingsManager,
  private val textExpanderManager: TextExpanderManager
) {

  private val prefs: SharedPreferences = context.getSharedPreferences("browsy_sync", Context.MODE_PRIVATE)

  val currentProvider = mutableStateOf(SyncProvider.fromId(prefs.getString("provider", SyncProvider.NONE.id) ?: SyncProvider.NONE.id))
  val currentServerUrl = mutableStateOf(prefs.getString("server_url", "") ?: "")
  val currentToken = mutableStateOf(prefs.getString("token", "") ?: "")
  val currentUsername = mutableStateOf(prefs.getString("username", "") ?: "")
  val currentPassphrase = mutableStateOf(prefs.getString("passphrase", "") ?: "")
  val lastSyncTimestamp = mutableLongStateOf(prefs.getLong("last_sync_time", 0L))

  fun getConfig(): SyncConfig {
    return SyncConfig(
      provider = currentProvider.value,
      serverUrl = currentServerUrl.value,
      token = currentToken.value,
      username = currentUsername.value,
      passphrase = currentPassphrase.value,
      lastSyncTime = lastSyncTimestamp.longValue
    )
  }

  fun saveConfig(config: SyncConfig) {
    currentProvider.value = config.provider
    currentServerUrl.value = config.serverUrl
    currentToken.value = config.token
    currentUsername.value = config.username
    currentPassphrase.value = config.passphrase
    lastSyncTimestamp.longValue = config.lastSyncTime

    prefs.edit()
      .putString("provider", config.provider.id)
      .putString("server_url", config.serverUrl)
      .putString("token", config.token)
      .putString("username", config.username)
      .putString("passphrase", config.passphrase)
      .putLong("last_sync_time", config.lastSyncTime)
      .apply()
  }

  // -------------------------------------------------------------
  // Cryptography (AES-256-GCM + PBKDF2 Zero-Knowledge)
  // -------------------------------------------------------------

  fun deriveKey(passphrase: String, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(passphrase.toCharArray(), salt, 10000, 256)
    val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
    return factory.generateSecret(spec).encoded
  }

  fun encryptPayload(jsonStr: String, passphrase: String): JSONObject {
    if (passphrase.isBlank()) {
      throw IllegalArgumentException("Bezpečnostní fráze (passphrase) nesmí být prázdná")
    }

    val salt = ByteArray(16).apply { SecureRandom().nextBytes(this) }
    val iv = ByteArray(12).apply { SecureRandom().nextBytes(this) }
    val keyBytes = deriveKey(passphrase, salt)
    val keySpec = SecretKeySpec(keyBytes, "AES")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    val gcmSpec = GCMParameterSpec(128, iv)
    cipher.init(Cipher.ENCRYPT_MODE, keySpec, gcmSpec)

    val cipherWithTag = cipher.doFinal(jsonStr.toByteArray(Charsets.UTF_8))
    val cipherTextLen = cipherWithTag.size - 16
    val cipherTextBytes = cipherWithTag.copyOfRange(0, cipherTextLen)
    val tagBytes = cipherWithTag.copyOfRange(cipherTextLen, cipherWithTag.size)

    return JSONObject().apply {
      put("version", 1)
      put("timestamp", System.currentTimeMillis())
      put("salt", salt.toHex())
      put("iv", iv.toHex())
      put("tag", tagBytes.toHex())
      put("cipherText", cipherTextBytes.toHex())
    }
  }

  fun decryptPayload(pkg: JSONObject, passphrase: String): String {
    if (passphrase.isBlank()) {
      throw IllegalArgumentException("Bezpečnostní fráze nesmí být prázdná")
    }

    val salt = pkg.getString("salt").hexToByteArray()
    val iv = pkg.getString("iv").hexToByteArray()
    val tag = pkg.getString("tag").hexToByteArray()
    val cipherText = pkg.getString("cipherText").hexToByteArray()

    val keyBytes = deriveKey(passphrase, salt)
    val keySpec = SecretKeySpec(keyBytes, "AES")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    val gcmSpec = GCMParameterSpec(128, iv)
    cipher.init(Cipher.DECRYPT_MODE, keySpec, gcmSpec)

    val combined = ByteArray(cipherText.size + tag.size)
    System.arraycopy(cipherText, 0, combined, 0, cipherText.size)
    System.arraycopy(tag, 0, combined, cipherText.size, tag.size)

    val decryptedBytes = cipher.doFinal(combined)
    return String(decryptedBytes, Charsets.UTF_8)
  }

  // -------------------------------------------------------------
  // Networking
  // -------------------------------------------------------------

  private fun cleanUrl(raw: String): String {
    var s = raw.trim()
    if (!s.startsWith("http://", ignoreCase = true) && !s.startsWith("https://", ignoreCase = true)) {
      s = "http://$s"
    }
    return s.trimEnd('/')
  }

  private fun openConnection(
    urlString: String,
    method: String,
    config: SyncConfig,
    timeoutMs: Int = 15000
  ): HttpURLConnection {
    val url = URL(urlString)
    val conn = url.openConnection() as HttpURLConnection
    conn.requestMethod = method
    conn.connectTimeout = timeoutMs
    conn.readTimeout = timeoutMs
    conn.setRequestProperty("User-Agent", "Browsy-Android-Sync/1.0")

    if (config.provider == SyncProvider.SELF_HOSTED) {
      if (config.token.isNotBlank()) {
        conn.setRequestProperty("Authorization", "Bearer ${config.token.trim()}")
      }
    } else if (config.provider == SyncProvider.WEBDAV) {
      if (config.username.isNotBlank() && config.token.isNotBlank()) {
        val creds = "${config.username.trim()}:${config.token.trim()}"
        val encoded = Base64.getEncoder().encodeToString(creds.toByteArray(Charsets.UTF_8))
        conn.setRequestProperty("Authorization", "Basic $encoded")
      } else if (config.token.isNotBlank()) {
        conn.setRequestProperty("Authorization", "Bearer ${config.token.trim()}")
      }
    }

    return conn
  }

  // -------------------------------------------------------------
  // Test Connection
  // -------------------------------------------------------------

  suspend fun testConnection(config: SyncConfig = getConfig()): SyncResult = withContext(Dispatchers.IO) {
    if (config.provider == SyncProvider.NONE) {
      return@withContext SyncResult(false, error = "Synchronizace je vypnuta")
    }
    if (config.serverUrl.isBlank()) {
      return@withContext SyncResult(false, error = "Zadejte URL adresu serveru")
    }

    val baseUrl = cleanUrl(config.serverUrl)

    try {
      if (config.provider == SyncProvider.SELF_HOSTED) {
        val conn = openConnection("$baseUrl/api/sync/status", "GET", config, 7000)
        val code = conn.responseCode
        if (code == 200) {
          val reader = BufferedReader(InputStreamReader(conn.inputStream))
          val text = reader.readText()
          reader.close()
          val json = JSONObject(text)
          val ver = json.optString("version", "1.0.0")
          return@withContext SyncResult(true, message = "Připojeno k Browsy Sync Serveru v$ver")
        } else if (code == 401) {
          return@withContext SyncResult(false, error = "Neplatný přístupový token serveru (HTTP 401)")
        } else {
          return@withContext SyncResult(false, error = "Server vrátil neočekávaný kód: HTTP $code")
        }
      }

      if (config.provider == SyncProvider.WEBDAV) {
        val targetUrl = if (baseUrl.endsWith(".json")) baseUrl else "$baseUrl/browsy-sync.json"
        val conn = openConnection(targetUrl, "PROPFIND", config, 7000)
        conn.setRequestProperty("Depth", "0")
        val code = try {
          conn.responseCode
        } catch (_: Exception) {
          // Some WebDAV servers reject PROPFIND method, retry with HEAD or GET
          val headConn = openConnection(targetUrl, "HEAD", config, 7000)
          headConn.responseCode
        }

        if (code in listOf(200, 204, 207, 404, 405)) {
          return@withContext SyncResult(true, message = "WebDAV úložiště je dostupné (HTTP $code)")
        } else if (code in listOf(401, 403)) {
          return@withContext SyncResult(false, error = "Chyba ověření WebDAV: Neplatné přihlašovací údaje (HTTP $code)")
        } else {
          return@withContext SyncResult(false, error = "WebDAV server vrátil kód HTTP $code")
        }
      }

      SyncResult(false, error = "Neznámý poskytovatel")
    } catch (e: Exception) {
      SyncResult(false, error = "Chyba síťového spojení: ${e.message}")
    }
  }

  // -------------------------------------------------------------
  // Data Gathering & Merging
  // -------------------------------------------------------------

  fun getLocalData(): JSONObject {
    val root = JSONObject()
    root.put("version", 1)
    root.put("deviceId", "browsy-android-" + UUID.randomUUID().toString().substring(0, 8))
    root.put("timestamp", System.currentTimeMillis())

    // 1. Settings
    val settingsObj = JSONObject().apply {
      put("shieldsEnabled", settingsManager.shieldsEnabled.value)
      put("cosmeticFiltering", settingsManager.cosmeticFiltering.value)
      put("popupBlockerEnabled", settingsManager.popupBlockerEnabled.value)
      put("forceWebDarkMode", settingsManager.forceWebDarkMode.value)
      put("defaultSearchEngine", settingsManager.searchEngine.value.id)
    }
    root.put("settings", settingsObj)

    // 2. Bookmarks
    val bookmarksArray = JSONArray()
    for (b in historyAndBookmarksManager.getBookmarks()) {
      bookmarksArray.put(JSONObject().apply {
        put("id", b.id)
        put("title", b.title)
        put("url", b.url)
        put("createdAt", b.createdAt)
      })
    }
    root.put("bookmarks", bookmarksArray)

    // 3. History
    val historyArray = JSONArray()
    for (h in historyAndBookmarksManager.getHistory()) {
      historyArray.put(JSONObject().apply {
        put("id", h.id)
        put("title", h.title)
        put("url", h.url)
        put("visitedAt", h.visitedAt)
      })
    }
    root.put("history", historyArray)

    // 4. Custom Filters
    val filtersArray = JSONArray()
    for (f in ShieldsEngine.getCustomCosmeticRules()) {
      filtersArray.put(f)
    }
    root.put("customFilters", filtersArray)

    // 5. Text Expander Snippets
    val snippetsArray = JSONArray()
    for (s in textExpanderManager.getSnippets().filter { !it.isBuiltin }) {
      snippetsArray.put(JSONObject().apply {
        put("trigger", s.shortcut)
        put("replacement", s.expansion)
        put("label", s.shortcut)
      })
    }
    root.put("textExpanderSnippets", snippetsArray)

    return root
  }

  fun mergeData(local: JSONObject, remote: JSONObject): JSONObject {
    val merged = JSONObject()
    merged.put("version", 1)
    merged.put("deviceId", local.optString("deviceId", "browsy-android"))
    merged.put("timestamp", System.currentTimeMillis())

    // 1. Bookmarks merge
    val bookmarkMap = mutableMapOf<String, Bookmark>()
    val rBookmarks = remote.optJSONArray("bookmarks") ?: JSONArray()
    for (i in 0 until rBookmarks.length()) {
      val obj = rBookmarks.getJSONObject(i)
      val url = obj.getString("url").trim()
      bookmarkMap[url.lowercase()] = Bookmark(
        id = obj.optString("id", UUID.randomUUID().toString()),
        title = obj.optString("title", url),
        url = url,
        createdAt = obj.optLong("createdAt", System.currentTimeMillis())
      )
    }
    val lBookmarks = local.optJSONArray("bookmarks") ?: JSONArray()
    for (i in 0 until lBookmarks.length()) {
      val obj = lBookmarks.getJSONObject(i)
      val url = obj.getString("url").trim()
      val key = url.lowercase()
      val existing = bookmarkMap[key]
      val created = obj.optLong("createdAt", System.currentTimeMillis())
      if (existing == null || created > existing.createdAt) {
        bookmarkMap[key] = Bookmark(
          id = obj.optString("id", UUID.randomUUID().toString()),
          title = obj.optString("title", url),
          url = url,
          createdAt = created
        )
      }
    }
    val mergedBookmarks = JSONArray()
    for (b in bookmarkMap.values) {
      mergedBookmarks.put(JSONObject().apply {
        put("id", b.id)
        put("title", b.title)
        put("url", b.url)
        put("createdAt", b.createdAt)
      })
    }
    merged.put("bookmarks", mergedBookmarks)

    // 2. History merge (take latest visit, limit 500)
    val historyMap = mutableMapOf<String, HistoryItem>()
    val rHistory = remote.optJSONArray("history") ?: JSONArray()
    for (i in 0 until rHistory.length()) {
      val obj = rHistory.getJSONObject(i)
      val url = obj.getString("url").trim()
      historyMap[url.lowercase()] = HistoryItem(
        id = obj.optString("id", UUID.randomUUID().toString()),
        title = obj.optString("title", url),
        url = url,
        visitedAt = obj.optLong("visitedAt", System.currentTimeMillis())
      )
    }
    val lHistory = local.optJSONArray("history") ?: JSONArray()
    for (i in 0 until lHistory.length()) {
      val obj = lHistory.getJSONObject(i)
      val url = obj.getString("url").trim()
      val key = url.lowercase()
      val existing = historyMap[key]
      val visited = obj.optLong("visitedAt", System.currentTimeMillis())
      if (existing == null || visited > existing.visitedAt) {
        historyMap[key] = HistoryItem(
          id = obj.optString("id", UUID.randomUUID().toString()),
          title = obj.optString("title", url),
          url = url,
          visitedAt = visited
        )
      }
    }
    val sortedHistory = historyMap.values.sortedByDescending { it.visitedAt }.take(500)
    val mergedHistory = JSONArray()
    for (h in sortedHistory) {
      mergedHistory.put(JSONObject().apply {
        put("id", h.id)
        put("title", h.title)
        put("url", h.url)
        put("visitedAt", h.visitedAt)
      })
    }
    merged.put("history", mergedHistory)

    // 3. Custom Filters (Union)
    val filtersSet = mutableSetOf<String>()
    val rFilters = remote.optJSONArray("customFilters") ?: JSONArray()
    for (i in 0 until rFilters.length()) {
      filtersSet.add(rFilters.getString(i).trim())
    }
    val lFilters = local.optJSONArray("customFilters") ?: JSONArray()
    for (i in 0 until lFilters.length()) {
      filtersSet.add(lFilters.getString(i).trim())
    }
    val mergedFilters = JSONArray()
    for (f in filtersSet) {
      if (f.isNotBlank()) mergedFilters.put(f)
    }
    merged.put("customFilters", mergedFilters)

    // 4. Text Expander Snippets (Union by trigger)
    val snippetMap = mutableMapOf<String, Pair<String, String>>()
    val rSnippets = remote.optJSONArray("textExpanderSnippets") ?: JSONArray()
    for (i in 0 until rSnippets.length()) {
      val obj = rSnippets.getJSONObject(i)
      val trigger = obj.optString("trigger", "").ifBlank { obj.optString("shortcut", "") }
      val rep = obj.optString("replacement", "").ifBlank { obj.optString("expansion", "") }
      if (trigger.isNotBlank()) {
        snippetMap[trigger.lowercase()] = Pair(trigger, rep)
      }
    }
    val lSnippets = local.optJSONArray("textExpanderSnippets") ?: JSONArray()
    for (i in 0 until lSnippets.length()) {
      val obj = lSnippets.getJSONObject(i)
      val trigger = obj.optString("trigger", "").ifBlank { obj.optString("shortcut", "") }
      val rep = obj.optString("replacement", "").ifBlank { obj.optString("expansion", "") }
      if (trigger.isNotBlank()) {
        snippetMap[trigger.lowercase()] = Pair(trigger, rep)
      }
    }
    val mergedSnippets = JSONArray()
    for ((trig, rep) in snippetMap.values) {
      mergedSnippets.put(JSONObject().apply {
        put("trigger", trig)
        put("replacement", rep)
        put("label", trig)
      })
    }
    merged.put("textExpanderSnippets", mergedSnippets)

    // 5. Settings: newest wins
    val remoteTime = remote.optLong("timestamp", 0L)
    val localTime = local.optLong("timestamp", 0L)
    val winner = if (remoteTime > localTime) remote else local
    merged.put("settings", winner.optJSONObject("settings") ?: local.optJSONObject("settings") ?: JSONObject())

    return merged
  }

  fun applyMergedToLocal(data: JSONObject) {
    // 1. Apply Bookmarks
    val bookmarksArray = data.optJSONArray("bookmarks")
    if (bookmarksArray != null) {
      val list = mutableListOf<Bookmark>()
      for (i in 0 until bookmarksArray.length()) {
        val obj = bookmarksArray.getJSONObject(i)
        list.add(
          Bookmark(
            id = obj.optString("id", UUID.randomUUID().toString()),
            title = obj.optString("title", ""),
            url = obj.getString("url"),
            createdAt = obj.optLong("createdAt", System.currentTimeMillis())
          )
        )
      }
      historyAndBookmarksManager.setBookmarks(list)
    }

    // 2. Apply History
    val historyArray = data.optJSONArray("history")
    if (historyArray != null) {
      val list = mutableListOf<HistoryItem>()
      for (i in 0 until historyArray.length()) {
        val obj = historyArray.getJSONObject(i)
        list.add(
          HistoryItem(
            id = obj.optString("id", UUID.randomUUID().toString()),
            title = obj.optString("title", ""),
            url = obj.getString("url"),
            visitedAt = obj.optLong("visitedAt", System.currentTimeMillis())
          )
        )
      }
      historyAndBookmarksManager.setHistory(list)
    }

    // 3. Apply Custom Filters
    val filtersArray = data.optJSONArray("customFilters")
    if (filtersArray != null) {
      val list = mutableListOf<String>()
      for (i in 0 until filtersArray.length()) {
        list.add(filtersArray.getString(i))
      }
      ShieldsEngine.setCustomCosmeticRules(list)
    }

    // 4. Apply Snippets
    val snippetsArray = data.optJSONArray("textExpanderSnippets")
    if (snippetsArray != null) {
      val list = mutableListOf<Pair<String, String>>()
      for (i in 0 until snippetsArray.length()) {
        val obj = snippetsArray.getJSONObject(i)
        val trig = obj.optString("trigger", "").ifBlank { obj.optString("shortcut", "") }
        val rep = obj.optString("replacement", "").ifBlank { obj.optString("expansion", "") }
        if (trig.isNotBlank()) list.add(Pair(trig, rep))
      }
      textExpanderManager.setCustomSnippets(list)
    }

    // 5. Apply Settings
    val settingsObj = data.optJSONObject("settings")
    if (settingsObj != null) {
      if (settingsObj.has("shieldsEnabled")) {
        settingsManager.setShieldsEnabled(settingsObj.getBoolean("shieldsEnabled"))
      }
      if (settingsObj.has("cosmeticFiltering")) {
        settingsManager.setCosmeticFiltering(settingsObj.getBoolean("cosmeticFiltering"))
      }
      if (settingsObj.has("popupBlockerEnabled")) {
        settingsManager.setPopupBlockerEnabled(settingsObj.getBoolean("popupBlockerEnabled"))
      }
      if (settingsObj.has("forceWebDarkMode")) {
        settingsManager.setForceWebDarkMode(settingsObj.getBoolean("forceWebDarkMode"))
      }
      if (settingsObj.has("defaultSearchEngine")) {
        settingsManager.setSearchEngine(SearchEngine.fromId(settingsObj.getString("defaultSearchEngine")))
      }
    }
  }

  // -------------------------------------------------------------
  // Full Synchronize Cycle
  // -------------------------------------------------------------

  suspend fun syncNow(config: SyncConfig = getConfig()): SyncResult = withContext(Dispatchers.IO) {
    if (config.provider == SyncProvider.NONE) {
      return@withContext SyncResult(false, error = "Synchronizace je vypnuta")
    }
    if (config.serverUrl.isBlank()) {
      return@withContext SyncResult(false, error = "Zadejte URL adresu synchronizačního serveru")
    }
    if (config.passphrase.isBlank()) {
      return@withContext SyncResult(false, error = "Zadejte bezpečnostní frázi (passphrase) pro E2E šifrování")
    }

    val baseUrl = cleanUrl(config.serverUrl)

    try {
      // 1. Gather local state
      val localData = getLocalData()

      // 2. Pull remote payload
      var remoteData: JSONObject? = null

      if (config.provider == SyncProvider.SELF_HOSTED) {
        val conn = openConnection("$baseUrl/api/sync/pull", "GET", config)
        val code = conn.responseCode
        if (code == 200) {
          val reader = BufferedReader(InputStreamReader(conn.inputStream))
          val text = reader.readText()
          reader.close()
          val resJson = JSONObject(text)
          val payloadJson = resJson.getJSONObject("payload")
          val decryptedStr = decryptPayload(payloadJson, config.passphrase)
          remoteData = JSONObject(decryptedStr)
        } else if (code != 404) {
          return@withContext SyncResult(false, error = "Chyba stahování ze serveru: HTTP $code")
        }
      } else if (config.provider == SyncProvider.WEBDAV) {
        val targetUrl = if (baseUrl.endsWith(".json")) baseUrl else "$baseUrl/browsy-sync.json"
        val conn = openConnection(targetUrl, "GET", config)
        val code = conn.responseCode
        if (code == 200) {
          val reader = BufferedReader(InputStreamReader(conn.inputStream))
          val text = reader.readText()
          reader.close()
          val payloadJson = JSONObject(text)
          val decryptedStr = decryptPayload(payloadJson, config.passphrase)
          remoteData = JSONObject(decryptedStr)
        } else if (code != 404) {
          return@withContext SyncResult(false, error = "Chyba stahování z WebDAV: HTTP $code")
        }
      }

      // 3. Merge data
      val mergedData = if (remoteData != null) mergeData(localData, remoteData) else localData

      // 4. Apply to local state
      applyMergedToLocal(mergedData)

      // 5. Encrypt merged state
      val encryptedPkg = encryptPayload(mergedData.toString(), config.passphrase)

      // 6. Push back to server
      if (config.provider == SyncProvider.SELF_HOSTED) {
        val conn = openConnection("$baseUrl/api/sync/push", "POST", config)
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        val writer = OutputStreamWriter(conn.outputStream)
        writer.write(encryptedPkg.toString())
        writer.flush()
        writer.close()

        val code = conn.responseCode
        if (code != 200) {
          return@withContext SyncResult(false, error = "Chyba ukládání na server: HTTP $code")
        }
      } else if (config.provider == SyncProvider.WEBDAV) {
        val targetUrl = if (baseUrl.endsWith(".json")) baseUrl else "$baseUrl/browsy-sync.json"
        val conn = openConnection(targetUrl, "PUT", config)
        conn.doOutput = true
        conn.setRequestProperty("Content-Type", "application/json")
        val writer = OutputStreamWriter(conn.outputStream)
        writer.write(encryptedPkg.toString())
        writer.flush()
        writer.close()

        val code = conn.responseCode
        if (code !in listOf(200, 201, 204)) {
          return@withContext SyncResult(false, error = "Chyba zápisu na WebDAV: HTTP $code")
        }
      }

      // 7. Update timestamp and save
      val now = System.currentTimeMillis()
      saveConfig(config.copy(lastSyncTime = now))

      SyncResult(
        success = true,
        message = "Synchronizace proběhla úspěšně",
        lastSyncTime = now,
        bookmarksCount = mergedData.getJSONArray("bookmarks").length(),
        historyCount = mergedData.getJSONArray("history").length(),
        filtersCount = mergedData.getJSONArray("customFilters").length(),
        snippetsCount = mergedData.getJSONArray("textExpanderSnippets").length()
      )
    } catch (e: Exception) {
      SyncResult(false, error = "Chyba synchronizace: ${e.message}")
    }
  }
}

// -------------------------------------------------------------
// Hex Conversion Extensions
// -------------------------------------------------------------

fun ByteArray.toHex(): String {
  val hexChars = "0123456789abcdef"
  val result = StringBuilder(size * 2)
  for (b in this) {
    val i = b.toInt() and 0xFF
    result.append(hexChars[i shr 4])
    result.append(hexChars[i and 0x0F])
  }
  return result.toString()
}

fun String.hexToByteArray(): ByteArray {
  val len = length
  val data = ByteArray(len / 2)
  var i = 0
  while (i < len) {
    data[i / 2] = ((Character.digit(this[i], 16) shl 4) + Character.digit(this[i + 1], 16)).toByte()
    i += 2
  }
  return data
}
