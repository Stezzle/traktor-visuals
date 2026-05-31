package com.traktorvisuals.app

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.os.PowerManager
import android.view.KeyEvent
import android.view.View
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.traktorvisuals.app.databinding.ActivityDisplayBinding

class DisplayActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDisplayBinding
    private lateinit var wakeLock: PowerManager.WakeLock
    private var serverIp: String = ""

    @SuppressLint("SetJavaScriptEnabled", "WakelockTimeout")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDisplayBinding.inflate(layoutInflater)
        setContentView(binding.root)

        serverIp = intent.getStringExtra("server_ip") ?: ""
        val url = "http://$serverIp:3000"

        // Keep screen on during a DJ set
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE,
            "TraktorVisuals:WakeLock"
        )
        wakeLock.acquire()

        setupWebView(url)

        // Retry button
        binding.btnRetry.setOnClickListener {
            binding.layoutError.visibility = View.GONE
            binding.webView.reload()
        }

        // Change server button — go back to connect screen
        binding.btnChangeServer.setOnClickListener {
            finish()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView(url: String) {
        binding.webView.apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false  // Allow autoplay
                loadWithOverviewMode = true
                useWideViewPort = true
                builtInZoomControls = false
                displayZoomControls = false
                cacheMode = WebSettings.LOAD_NO_CACHE
            }

            // Handle page load errors
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
                        showConnectionError(url)
                    }
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    binding.layoutLoading.visibility = View.GONE
                }
            }

            // Allow autoplay and fullscreen video
            webChromeClient = object : WebChromeClient() {
                override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                    // Handle YouTube fullscreen requests
                }
            }

            // Hide loading once page loads
            binding.layoutLoading.visibility = View.VISIBLE
            binding.layoutError.visibility = View.GONE

            loadUrl(url)
        }
    }

    private fun showConnectionError(url: String) {
        binding.layoutLoading.visibility = View.GONE
        binding.layoutError.visibility = View.VISIBLE
        binding.tvErrorMessage.text = "Could not connect to server at\n$url\n\nMake sure:\n• server.js is running on your PC\n• Both devices are on the same WiFi\n• Windows Firewall allows port 3000"
    }

    // TV remote: back button returns to connect screen
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finish()
            return true
        }
        // Pass D-pad and other keys through to WebView
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::wakeLock.isInitialized && wakeLock.isHeld) {
            wakeLock.release()
        }
        binding.webView.destroy()
    }

    override fun onPause() {
        super.onPause()
        binding.webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
    }
}
