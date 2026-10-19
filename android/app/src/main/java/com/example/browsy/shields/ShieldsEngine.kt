package com.example.browsy.shields

import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.net.URI

object ShieldsEngine {

  private val blockedDomains: Set<String> = setOf(
    // Google Ads & Tracking
    "doubleclick.net",
    "googleadservices.com",
    "googlesyndication.com",
    "pagead2.googlesyndication.com",
    "adservice.google.com",
    "google-analytics.com",
    "analytics.google.com",
    "googletagmanager.com",
    "googletagservices.com",
    "googleadsserving.cn",

    // Major Ad Networks
    "taboola.com",
    "outbrain.com",
    "criteo.com",
    "criteo.net",
    "rubiconproject.com",
    "pubmatic.com",
    "openx.net",
    "adnxs.com",
    "smartadserver.com",
    "adroll.com",
    "popads.net",
    "popcash.net",
    "propellerads.com",
    "adsterra.com",
    "revcontent.com",
    "mgid.com",
    "media.net",
    "inmobi.com",
    "chartboost.com",
    "vungle.com",
    "unityads.unity3d.com",
    "applovin.com",
    "adcolony.com",
    "ironsrc.com",
    "amazon-adsystem.com",
    "bidswitch.net",
    "casalemedia.com",
    "sharethrough.com",
    "moatads.com",
    "serving-sys.com",
    "adform.net",
    "adtechus.com",
    "flashtalking.com",
    "tribalfusion.com",
    "yieldmo.com",
    "sovrn.com",
    "exponential.com",
    "zemanta.com",
    "lijit.com",
    "contextweb.com",
    "adblade.com",
    "zergnet.com",
    "content.ad",
    "chitika.com",
    "bidvertiser.com",

    // Trackers, Telemetry & Analytics
    "hotjar.com",
    "hotjar.io",
    "mouseflow.com",
    "crazyegg.com",
    "mixpanel.com",
    "segment.io",
    "segment.com",
    "quantserve.com",
    "scorecardresearch.com",
    "comscore.com",
    "chartbeat.com",
    "newrelic.com",
    "nr-data.net",
    "branch.io",
    "appsflyer.com",
    "adjust.com",
    "kochava.com",
    "facebook.net",
    "connect.facebook.net",
    "pixel.facebook.com",
    "ads.twitter.com",
    "analytics.twitter.com",
    "analytics.tiktok.com",
    "ads.linkedin.com",
    "stats.wp.com",
    "yandex.ru/metrika",
    "mc.yandex.ru",
    "clarity.ms",
    "optimizely.com",
    "amplitude.com",
    "heapanalytics.com"
  )

  /**
   * Evaluates if a given URL should be blocked by Browsy Shields.
   */
  fun shouldBlock(url: String): Boolean {
    if (url.isBlank()) return false
    val lower = url.lowercase()

    // Fast check for common data/blob or internal schemes
    if (lower.startsWith("data:") || lower.startsWith("blob:") || lower.startsWith("about:") || lower.startsWith("file:")) {
      return false
    }

    try {
      val uri = URI(lower)
      val host = uri.host ?: return false

      // Exact match or subdomain match
      for (domain in blockedDomains) {
        if (host == domain || host.endsWith(".$domain")) {
          return true
        }
      }
    } catch (_: Exception) {
      // Fallback substring matching
      for (domain in blockedDomains) {
        if (lower.contains(domain)) {
          return true
        }
      }
    }

    // Path pattern checks for explicit ad bundles
    if (lower.contains("/googleads/") ||
        lower.contains("/pagead/") ||
        lower.contains("/ads/banner") ||
        lower.contains("/popunder.js") ||
        lower.contains("/adserver.") ||
        lower.contains("&ad_type=") ||
        lower.contains("ad_channel=")
    ) {
      return true
    }

    return false
  }

  /**
   * Creates an empty WebResourceResponse to cancel blocked network requests with 0 bytes.
   */
  fun createEmptyResponse(): WebResourceResponse {
    return WebResourceResponse(
      "text/plain",
      "UTF-8",
      200,
      "OK",
      mapOf("Access-Control-Allow-Origin" to "*"),
      ByteArrayInputStream(ByteArray(0))
    )
  }

  private val customCosmeticSelectors = mutableSetOf<String>()

  fun addCustomCosmeticRule(selector: String) {
    if (selector.isNotBlank()) {
      customCosmeticSelectors.add(selector.trim())
    }
  }

  fun removeCustomCosmeticRule(selector: String) {
    customCosmeticSelectors.remove(selector.trim())
  }

  fun getCustomCosmeticRules(): List<String> {
    return customCosmeticSelectors.toList()
  }

  /**
   * Cosmetic filter script injected into WebViews to remove banner spaces,
   * user-selected elements (via Element Picker), and layout placeholders.
   */
  fun getCosmeticFilterScript(): String {
    val customPart = if (customCosmeticSelectors.isNotEmpty()) {
      customCosmeticSelectors.joinToString(", ") + " { display: none !important; }\n"
    } else ""

    return """
      (function() {
        var existing = document.getElementById('browsy-cosmetic-shield');
        if (existing) existing.remove();
        
        var style = document.createElement('style');
        style.id = 'browsy-cosmetic-shield';
        style.textContent = `
          $customPart
          [id*="google_ads"],
          [id*="ad-banner"],
          [class*="ad-banner"],
          [class*="ad_banner"],
          .ad-container,
          .ad-wrapper,
          .advertisement,
          .sponsored-post,
          div[id^="dfp-ad"],
          div[class*="dfp-ad"],
          iframe[src*="doubleclick"],
          iframe[src*="googlesyndication"],
          iframe[src*="adnxs"],
          div[data-ad-unit],
          .GoogleActiveViewElement {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            pointer-events: none !important;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      })();
    """.trimIndent()
  }
}
