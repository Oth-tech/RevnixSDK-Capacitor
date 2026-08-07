package com.revnix.capacitor

import com.getcapacitor.Logger

class Revnix {

    fun echo(value: String): String {
        Logger.info("Echo", value)

        return value
    }
}
