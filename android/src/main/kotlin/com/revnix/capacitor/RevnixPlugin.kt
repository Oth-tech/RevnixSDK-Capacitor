package com.revnix.capacitor

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.PluginMethod

@CapacitorPlugin(name = "Revnix")
class RevnixPlugin : Plugin() {

    private val implementation = Revnix()

    @PluginMethod
    fun echo(call: PluginCall) {
        val value = call.getString("value") ?: ""

        val ret = JSObject().apply {
            put("value", implementation.echo(value))
        }
        call.resolve(ret)
    }
}
