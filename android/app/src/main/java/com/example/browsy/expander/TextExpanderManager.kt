package com.example.browsy.expander

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class TextSnippet(
  val shortcut: String,
  val expansion: String,
  val isBuiltin: Boolean = false
)

class TextExpanderManager(context: Context) {

  private val prefs: SharedPreferences = context.getSharedPreferences("browsy_expander", Context.MODE_PRIVATE)
  private val snippets = mutableListOf<TextSnippet>()

  init {
    loadSnippets()
  }

  private fun loadSnippets() {
    snippets.clear()
    // Built-in defaults
    snippets.add(TextSnippet("/shrug", "¯\\_(ツ)_/¯", true))
    snippets.add(TextSnippet("/lenny", "( ͡° ͜ʖ ͡°)", true))
    snippets.add(TextSnippet("/browsy", "Browsy Privacy Browser", true))
    snippets.add(TextSnippet("/date", "{date}", true))
    snippets.add(TextSnippet("/time", "{time}", true))

    val raw = prefs.getString("custom_snippets", null)
    if (raw != null) {
      try {
        val array = JSONArray(raw)
        for (i in 0 until array.length()) {
          val obj = array.getJSONObject(i)
          snippets.add(
            TextSnippet(
              shortcut = obj.getString("shortcut"),
              expansion = obj.getString("expansion"),
              isBuiltin = false
            )
          )
        }
      } catch (_: Exception) {}
    }
  }

  fun getSnippets(): List<TextSnippet> = snippets.toList()

  fun addSnippet(shortcut: String, expansion: String) {
    val cleanShortcut = if (shortcut.startsWith("/")) shortcut else "/$shortcut"
    snippets.removeAll { it.shortcut.equals(cleanShortcut, ignoreCase = true) }
    snippets.add(TextSnippet(cleanShortcut, expansion, false))
    saveCustomSnippets()
  }

  fun removeSnippet(shortcut: String) {
    snippets.removeAll { it.shortcut.equals(shortcut, ignoreCase = true) && !it.isBuiltin }
    saveCustomSnippets()
  }

  fun setCustomSnippets(list: List<Pair<String, String>>) {
    snippets.removeAll { !it.isBuiltin }
    for ((shortcut, expansion) in list) {
      val cleanShortcut = if (shortcut.startsWith("/")) shortcut else "/$shortcut"
      snippets.add(TextSnippet(cleanShortcut, expansion, false))
    }
    saveCustomSnippets()
  }

  private fun saveCustomSnippets() {
    val custom = snippets.filter { !it.isBuiltin }
    val array = JSONArray()
    for (item in custom) {
      val obj = JSONObject()
      obj.put("shortcut", item.shortcut)
      obj.put("expansion", item.expansion)
      array.put(obj)
    }
    prefs.edit().putString("custom_snippets", array.toString()).apply()
  }

  fun resolveExpansion(expansion: String): String {
    val now = Date()
    val dateFormat = SimpleDateFormat("dd. MM. yyyy", Locale.getDefault())
    val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    return expansion
      .replace("{date}", dateFormat.format(now))
      .replace("{time}", timeFormat.format(now))
  }

  /**
   * Generates client-side JavaScript that listens to web page inputs and expands snippets.
   */
  fun getInjectionScript(): String {
    val mapObj = JSONObject()
    for (s in snippets) {
      mapObj.put(s.shortcut, resolveExpansion(s.expansion))
    }

    return """
      (function() {
        if (window.__browsyExpanderInjected) return;
        window.__browsyExpanderInjected = true;
        
        var snippets = ${mapObj.toString()};
        
        document.addEventListener('input', function(e) {
          var target = e.target;
          if (!target) return;
          
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            var val = target.value;
            for (var shortcut in snippets) {
              if (val.endsWith(shortcut)) {
                var start = val.length - shortcut.length;
                target.value = val.substring(0, start) + snippets[shortcut];
                target.selectionStart = target.selectionEnd = target.value.length;
                break;
              }
            }
          }
        }, true);
      })();
    """.trimIndent()
  }
}
