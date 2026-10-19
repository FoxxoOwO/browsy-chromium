package com.example.browsy

import com.example.browsy.data.OmniboxPosition
import com.example.browsy.data.SearchEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsManagerTest {

  @Test
  fun testSearchEngineFromId() {
    assertEquals(SearchEngine.DUCKDUCKGO, SearchEngine.fromId("duckduckgo"))
    assertEquals(SearchEngine.GOOGLE, SearchEngine.fromId("google"))
    assertEquals(SearchEngine.BRAVE, SearchEngine.fromId("brave"))
    assertEquals(SearchEngine.ECOSIA, SearchEngine.fromId("ecosia"))
    assertEquals(SearchEngine.BING, SearchEngine.fromId("bing"))
    assertEquals(SearchEngine.DUCKDUCKGO, SearchEngine.fromId("unknown_engine"))
  }

  @Test
  fun testOmniboxPositionFromId() {
    assertEquals(OmniboxPosition.BOTTOM, OmniboxPosition.fromId("bottom"))
    assertEquals(OmniboxPosition.TOP, OmniboxPosition.fromId("top"))
    assertEquals(OmniboxPosition.BOTTOM, OmniboxPosition.fromId("unknown_position"))
  }

  @Test
  fun testSearchEngineTemplates() {
    val ddg = SearchEngine.DUCKDUCKGO
    assertTrue(String.format(ddg.queryTemplate, "kotlin").contains("duckduckgo.com/?q=kotlin"))

    val google = SearchEngine.GOOGLE
    assertTrue(String.format(google.queryTemplate, "browsy").contains("google.com/search?q=browsy"))

    val brave = SearchEngine.BRAVE
    assertTrue(String.format(brave.queryTemplate, "test").contains("search.brave.com/search?q=test"))
  }
}
