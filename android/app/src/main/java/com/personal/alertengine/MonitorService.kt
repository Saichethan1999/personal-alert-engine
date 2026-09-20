package com.personal.alertengine
import android.app.*
import android.content.*
import android.os.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MonitorService:Service(){
 companion object{const val START="START";const val STOP="STOP";const val CHANNEL="monitoring";const val ID=5001;const val BACKEND="backend";const val KEY="key";const val TARGET="target";const val INTERVAL="interval"}
 private val h=Handler(Looper.getMainLooper());private var backend="";private var key="";private var target="";private var interval=15*60*1000L
 private val task=object:Runnable{override fun run(){Thread{check()}.start();h.postDelayed(this,interval)}}
 override fun onCreate(){super.onCreate();channel()}
 override fun onStartCommand(i:Intent?,flags:Int,id:Int):Int{if(i?.action==STOP){stopNow();return START_NOT_STICKY};backend=i?.getStringExtra(BACKEND)?:backend;key=i?.getStringExtra(KEY)?:key;target=i?.getStringExtra(TARGET)?:target;interval=(i?.getLongExtra(INTERVAL,interval)?:interval).coerceAtLeast(15*60*1000L);startForeground(ID,notification());h.removeCallbacks(task);h.post(task);return START_STICKY}
 private fun check(){try{val c=URL("$backend/check").openConnection() as HttpURLConnection;c.requestMethod="POST";c.connectTimeout=30000;c.readTimeout=90000;c.doOutput=true;c.setRequestProperty("Content-Type","application/json");if(key.isNotBlank())c.setRequestProperty("Authorization","Bearer $key");c.outputStream.use{it.write(JSONObject().put("url",target).toString().toByteArray())};val code=c.responseCode;val s=if(code in 200..299)c.inputStream else c.errorStream;val text=s?.bufferedReader()?.use{it.readText()}?:"";c.disconnect();if(code in 200..299&&JSONObject(text).optBoolean("bookTicketsVisible",false))AlertController.trigger(this,"🚨 BookMyShow Alert","Book tickets is available now.")}catch(_:Exception){}}
 private fun notification()=NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_popup_sync).setContentTitle("Personal Alert Engine").setContentText("Monitoring every ${interval/60000} minutes").setOngoing(true).setPriority(NotificationCompat.PRIORITY_LOW).build()
 private fun channel(){if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"Monitoring service",NotificationManager.IMPORTANCE_LOW))}
 private fun stopNow(){h.removeCallbacksAndMessages(null);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()};override fun onDestroy(){h.removeCallbacksAndMessages(null);super.onDestroy()};override fun onBind(i:Intent?)=null
}
