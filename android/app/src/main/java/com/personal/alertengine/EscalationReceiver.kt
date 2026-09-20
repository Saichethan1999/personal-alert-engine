package com.personal.alertengine
import android.content.*
class EscalationReceiver:BroadcastReceiver(){override fun onReceive(c:Context,i:Intent?){if(!AlertController.active(c))return;val x=Intent(c,AlarmActivity::class.java).apply{addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP);putExtra("body",i?.getStringExtra("body")?:"Event requires attention.")};c.startActivity(x)}}
