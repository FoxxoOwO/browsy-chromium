package com.example.browsy.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme =
  darkColorScheme(
    primary = BrowsyTextPrimary,
    onPrimary = BrowsyBackground,
    secondary = BrowsyTextSecondary,
    onSecondary = BrowsyBackground,
    tertiary = BrowsyAccent,
    background = BrowsyBackground,
    onBackground = BrowsyTextPrimary,
    surface = BrowsySurface,
    onSurface = BrowsyTextPrimary,
    surfaceVariant = BrowsyCard,
    onSurfaceVariant = BrowsyTextSecondary,
    outline = BrowsyBorder,
    outlineVariant = BrowsyBorderSubtle,
  )

@Composable
fun BrowsyTheme(
  content: @Composable () -> Unit,
) {
  MaterialTheme(
    colorScheme = DarkColorScheme,
    typography = Typography,
    content = content,
  )
}
