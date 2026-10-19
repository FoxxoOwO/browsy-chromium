package com.example.browsy.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class Bookmark(
  val id: String = UUID.randomUUID().toString(),
  val title: String,
  val url: String,
  val createdAt: Long = System.currentTimeMillis()
)

data class HistoryItem(
  val id: String = UUID.randomUUID().toString(),
  val title: String,
  val url: String,
  val visitedAt: Long = System.currentTimeMillis()
)

class HistoryAndBookmarksManager(context: Context) {

  private val prefs: SharedPreferences = context.getSharedPreferences("browsy_data", Context.MODE_PRIVATE)

  fun getBookmarks(): List<Bookmark> {
    val raw = prefs.getString("bookmarks", "[]") ?: "[]"
    val list = mutableListOf<Bookmark>()
    try {
      val array = JSONArray(raw)
      for (i in 0 until array.length()) {
        val obj = array.getJSONObject(i)
        list.add(
          Bookmark(
            id = obj.optString("id", UUID.randomUUID().toString()),
            title = obj.getString("title"),
            url = obj.getString("url"),
            createdAt = obj.optLong("createdAt", System.currentTimeMillis())
          )
        )
      }
    } catch (_: Exception) {}
    return list
  }

  fun isBookmarked(url: String): Boolean {
    val clean = url.trim()
    return getBookmarks().any { it.url.equals(clean, ignoreCase = true) }
  }

  fun toggleBookmark(title: String, url: String): Boolean {
    val list = getBookmarks().toMutableList()
    val exists = list.any { it.url.equals(url, ignoreCase = true) }
    if (exists) {
      list.removeAll { it.url.equals(url, ignoreCase = true) }
      saveBookmarks(list)
      return false
    } else {
      list.add(0, Bookmark(title = title.ifBlank { url }, url = url))
      saveBookmarks(list)
      return true
    }
  }

  fun removeBookmark(id: String) {
    val list = getBookmarks().toMutableList()
    list.removeAll { it.id == id }
    saveBookmarks(list)
  }

  fun setBookmarks(list: List<Bookmark>) {
    saveBookmarks(list)
  }

  fun setHistory(list: List<HistoryItem>) {
    saveHistory(list)
  }

  fun saveBookmarks(list: List<Bookmark>) {
    val array = JSONArray()
    for (b in list) {
      val obj = JSONObject()
      obj.put("id", b.id)
      obj.put("title", b.title)
      obj.put("url", b.url)
      obj.put("createdAt", b.createdAt)
      array.put(obj)
    }
    prefs.edit().putString("bookmarks", array.toString()).apply()
  }

  fun getHistory(): List<HistoryItem> {
    val raw = prefs.getString("history", "[]") ?: "[]"
    val list = mutableListOf<HistoryItem>()
    try {
      val array = JSONArray(raw)
      for (i in 0 until array.length()) {
        val obj = array.getJSONObject(i)
        list.add(
          HistoryItem(
            id = obj.optString("id", UUID.randomUUID().toString()),
            title = obj.getString("title"),
            url = obj.getString("url"),
            visitedAt = obj.optLong("visitedAt", System.currentTimeMillis())
          )
        )
      }
    } catch (_: Exception) {}
    return list
  }

  fun addHistory(title: String, url: String, isIncognito: Boolean) {
    if (isIncognito || url.isBlank() || url.startsWith("about:") || url.startsWith("chrome:")) return

    val list = getHistory().toMutableList()
    // Remove duplicate entry if it was visited recently
    list.removeAll { it.url.equals(url, ignoreCase = true) }
    list.add(0, HistoryItem(title = title.ifBlank { url }, url = url))

    // Cap history at 500 items
    if (list.size > 500) {
      list.subList(500, list.size).clear()
    }
    saveHistory(list)
  }

  fun clearHistory() {
    prefs.edit().putString("history", "[]").apply()
  }

  fun saveHistory(list: List<HistoryItem>) {
    val array = JSONArray()
    for (h in list) {
      val obj = JSONObject()
      obj.put("id", h.id)
      obj.put("title", h.title)
      obj.put("url", h.url)
      obj.put("visitedAt", h.visitedAt)
      array.put(obj)
    }
    prefs.edit().putString("history", array.toString()).apply()
  }
}
