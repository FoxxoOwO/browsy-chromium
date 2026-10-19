package com.example.browsy

import com.example.browsy.sync.SyncProvider
import com.example.browsy.sync.hexToByteArray
import com.example.browsy.sync.toHex
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

class SyncManagerTest {

  @Test
  fun testSyncProviderFromId() {
    assertEquals(SyncProvider.NONE, SyncProvider.fromId("NONE"))
    assertEquals(SyncProvider.SELF_HOSTED, SyncProvider.fromId("SELF_HOSTED"))
    assertEquals(SyncProvider.WEBDAV, SyncProvider.fromId("WEBDAV"))
    assertEquals(SyncProvider.NONE, SyncProvider.fromId("invalid"))
  }

  @Test
  fun testHexConversion() {
    val sample = byteArrayOf(0x00, 0x01, 0x0f, 0x10, 0x7f, 0x80.toByte(), 0xff.toByte())
    val hex = sample.toHex()
    assertEquals("00010f107f80ff", hex)
    val roundtrip = hex.hexToByteArray()
    assertEquals(sample.size, roundtrip.size)
    for (i in sample.indices) {
      assertEquals(sample[i], roundtrip[i])
    }
  }

  @Test
  fun testAes256GcmEncryptionAndDecryption() {
    val passphrase = "MySuperSecretPassphrase2026!"
    val rawJson = """{"bookmarks":[{"title":"GitHub","url":"https://github.com"}],"shields":true}"""

    val salt = ByteArray(16).apply { SecureRandom().nextBytes(this) }
    val iv = ByteArray(12).apply { SecureRandom().nextBytes(this) }

    // Derive key
    val spec = PBEKeySpec(passphrase.toCharArray(), salt, 10000, 256)
    val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
    val keyBytes = factory.generateSecret(spec).encoded
    val keySpec = SecretKeySpec(keyBytes, "AES")

    // Encrypt
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, keySpec, GCMParameterSpec(128, iv))
    val cipherWithTag = cipher.doFinal(rawJson.toByteArray(Charsets.UTF_8))

    val cipherTextLen = cipherWithTag.size - 16
    val cipherTextBytes = cipherWithTag.copyOfRange(0, cipherTextLen)
    val tagBytes = cipherWithTag.copyOfRange(cipherTextLen, cipherWithTag.size)

    val saltHex = salt.toHex()
    val ivHex = iv.toHex()
    val tagHex = tagBytes.toHex()
    val cipherHex = cipherTextBytes.toHex()

    // Decrypt
    val decSalt = saltHex.hexToByteArray()
    val decIv = ivHex.hexToByteArray()
    val decTag = tagHex.hexToByteArray()
    val decCipherText = cipherHex.hexToByteArray()

    val decKeyBytes = factory.generateSecret(PBEKeySpec(passphrase.toCharArray(), decSalt, 10000, 256)).encoded
    val decCipher = Cipher.getInstance("AES/GCM/NoPadding")
    decCipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(decKeyBytes, "AES"), GCMParameterSpec(128, decIv))

    val combined = ByteArray(decCipherText.size + decTag.size)
    System.arraycopy(decCipherText, 0, combined, 0, decCipherText.size)
    System.arraycopy(decTag, 0, combined, decCipherText.size, decTag.size)

    val decryptedText = String(decCipher.doFinal(combined), Charsets.UTF_8)
    assertEquals(rawJson, decryptedText)
    assertTrue(decryptedText.contains("https://github.com"))
  }
}
