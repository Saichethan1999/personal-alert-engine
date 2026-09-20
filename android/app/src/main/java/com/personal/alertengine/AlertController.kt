package com.personal.alertengine

import android.app.*
import android.content.*
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object AlertController {
    const val EVENT_CHANNEL="event"; const val EVENT_ID=4001; const val ESCALATION_CODE=4002
    private const val PREFS="alert_state"; private const val ACTIVE="active"
    fun channels(c:Context){ if(Build.VERSION.SDK_INT<26)return; val nm=c.getSystemService(NotificationManager::class.java)
        val event=NotificationChannel(EVENT_CHANNEL,"Event alerts",NotificationManager.IMPORTANCE_HIGH).apply{enableVibration(true);lockscreenVisibility=Notification.VISIBILITY_PUBLIC}
        nm.createNotificationChannel(event)
    }
    fun trigger(c:Context,title:String,body:String){ channels(c); setActive(c,true)
        val ack=PendingIntent.getBroadcast(c,4003,Intent(c,AckReceiver::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n=NotificationCompat.Builder(c,EVENT_CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_alert).setContentTitle(title).setContentText(body).setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(false).addAction(android.R.drawable.ic_menu_close_clear_cancel,"ACKNOWLEDGE",ack).build()
        if(Build.VERSION.SDK_INT<33||c.checkSelfPermission("android.permission.POST_NOTIFICATIONS")==android.content.pm.PackageManager.PERMISSION_GRANTED) NotificationManagerCompat.from(c).notify(EVENT_ID,n)
        val i=Intent(c,EscalationReceiver::class.java).apply{putExtra("title",title);putExtra("body",body)}
        val pi=PendingIntent.getBroadcast(c,ESCALATION_CODE,i,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        c.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,SystemClock.elapsedRealtime()+30_000,pi)
    }
    fun acknowledge(c:Context){setActive(c,false);val pi=PendingIntent.getBroadcast(c,ESCALATION_CODE,Intent(c,EscalationReceiver::class.java),PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE);pi?.let{c.getSystemService(AlarmManager::class.java).cancel(it);it.cancel()};NotificationManagerCompat.from(c).cancel(EVENT_ID)}
    fun active(c:Context)=c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getBoolean(ACTIVE,false)
    private fun setActive(c:Context,v:Boolean){c.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putBoolean(ACTIVE,v).apply()}
}
