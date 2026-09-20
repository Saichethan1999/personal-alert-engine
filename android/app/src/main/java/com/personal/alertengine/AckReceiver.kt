package com.personal.alertengine
import android.content.*
class AckReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent?){AlertController.acknowledge(c)}}
