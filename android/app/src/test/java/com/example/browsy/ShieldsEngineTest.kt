package com.example.browsy

import com.example.browsy.shields.ShieldsEngine
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShieldsEngineTest {

  @Test
  fun testBlocksKnownAdDomains() {
    assertTrue(ShieldsEngine.shouldBlock("https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub"))
    assertTrue(ShieldsEngine.shouldBlock("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"))
    assertTrue(ShieldsEngine.shouldBlock("https://cdn.taboola.com/libtrc/loader.js"))
    assertTrue(ShieldsEngine.shouldBlock("https://www.google-analytics.com/analytics.js"))
    assertTrue(ShieldsEngine.shouldBlock("https://static.criteo.net/js/ld/ld.js"))
    assertTrue(ShieldsEngine.shouldBlock("https://static.hotjar.com/c/hotjar-12345.js"))
  }

  @Test
  fun testAllowsBenignWebsites() {
    assertFalse(ShieldsEngine.shouldBlock("https://duckduckgo.com"))
    assertFalse(ShieldsEngine.shouldBlock("https://en.wikipedia.org/wiki/Main_Page"))
    assertFalse(ShieldsEngine.shouldBlock("https://github.com/FoxxoOwO/browsy-chromium"))
    assertFalse(ShieldsEngine.shouldBlock("https://news.ycombinator.com"))
    assertFalse(ShieldsEngine.shouldBlock("https://idnes.cz"))
  }

  @Test
  fun testCosmeticFilterScript() {
    val script = ShieldsEngine.getCosmeticFilterScript()
    assertTrue(script.contains("browsy-cosmetic-shield"))
    assertTrue(script.contains("display: none !important"))
  }
}
