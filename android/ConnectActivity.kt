package com.traktorvisuals.app

import android.content.Context
import android.content.Intent
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.traktorvisuals.app.databinding.ActivityConnectBinding

class ConnectActivity : AppCompatActivity() {

    private lateinit var binding: ActivityConnectBinding
    private val prefs by lazy { getSharedPreferences("traktor_visuals", Context.MODE_PRIVATE) }
    private val mainHandler = Handler(Looper.getMainLooper())

    private var nsdManager: NsdManager? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var scanning = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityConnectBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Pre-fill last used IP
        val lastIp = prefs.getString("last_ip", "") ?: ""
        if (lastIp.isNotEmpty()) {
            binding.etIpAddress.setText(lastIp)
        }

        // Connect button
        binding.btnConnect.setOnClickListener { attemptConnect() }

        // Scan button
        binding.btnScan.setOnClickListener { startScan() }

        // Connect on keyboard done action
        binding.etIpAddress.setOnEditorActionListener { _, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_DONE ||
                (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)) {
                attemptConnect()
                true
            } else false
        }
    }

    private fun attemptConnect() {
        val ip = binding.etIpAddress.text.toString().trim()
        if (ip.isEmpty()) {
            showError("Please enter the server IP address")
            return
        }

        // Basic IP validation
        val ipRegex = Regex("""^(\d{1,3}\.){3}\d{1,3}$""")
        if (!ipRegex.matches(ip)) {
            showError("Invalid IP address format (e.g. 192.168.1.50)")
            return
        }

        // Save for next time
        prefs.edit().putString("last_ip", ip).apply()

        // Launch display screen
        val intent = Intent(this, DisplayActivity::class.java)
        intent.putExtra("server_ip", ip)
        startActivity(intent)
    }

    // ── mDNS / NSD Discovery ──────────────────────────────────────────────────
    private fun startScan() {
        if (scanning) {
            stopScan()
            return
        }

        scanning = true
        binding.btnScan.text = "Scanning..."
        binding.btnScan.isEnabled = false
        binding.tvStatus.text = "Searching for Traktor Visuals on your network..."
        binding.tvStatus.visibility = View.VISIBLE

        nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager

        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                mainHandler.post {
                    showError("Network scan failed (error $errorCode)")
                    stopScan()
                }
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}

            override fun onDiscoveryStarted(serviceType: String) {}

            override fun onDiscoveryStopped(serviceType: String) {}

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (serviceInfo.serviceName.contains("TraktorVisuals", ignoreCase = true) ||
                    serviceInfo.serviceName.contains("Traktor Visuals", ignoreCase = true)) {
                    resolveService(serviceInfo)
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
        }

        nsdManager?.discoverServices("_http._tcp.", NsdManager.PROTOCOL_DNS_SD, discoveryListener)

        // Auto-stop scan after 10 seconds
        mainHandler.postDelayed({
            if (scanning) {
                stopScan()
                mainHandler.post {
                    binding.tvStatus.text = "No server found. Make sure server.js is running on your PC."
                }
            }
        }, 10000)
    }

    private fun resolveService(serviceInfo: NsdServiceInfo) {
        nsdManager?.resolveService(serviceInfo, object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                mainHandler.post { showError("Could not resolve server address") }
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                val host = serviceInfo.host.hostAddress ?: return
                mainHandler.post {
                    binding.etIpAddress.setText(host)
                    binding.tvStatus.text = "Found server at $host — tap Connect!"
                    stopScan()
                }
            }
        })
    }

    private fun stopScan() {
        scanning = false
        mainHandler.post {
            binding.btnScan.text = "Scan Network"
            binding.btnScan.isEnabled = true
        }
        try {
            discoveryListener?.let { nsdManager?.stopServiceDiscovery(it) }
        } catch (_: Exception) {}
        discoveryListener = null
    }

    private fun showError(msg: String) {
        binding.tvStatus.text = msg
        binding.tvStatus.visibility = View.VISIBLE
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    override fun onPause() {
        super.onPause()
        stopScan()
    }
}
