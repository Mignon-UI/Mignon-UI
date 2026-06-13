package com.tauri.dev

import android.os.Bundle

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
  }

  fun setSystemBarsColor(colorHex: String, darkIcons: Boolean) {
    val window = this.window
    this.runOnUiThread {
      try {
        val color = android.graphics.Color.parseColor(colorHex)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.statusBarColor = color
        window.navigationBarColor = color
        
        val decorView = window.decorView
        val controller = androidx.core.view.WindowCompat.getInsetsController(window, decorView)
        controller.isAppearanceLightStatusBars = darkIcons
        controller.isAppearanceLightNavigationBars = darkIcons
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
  }
}
