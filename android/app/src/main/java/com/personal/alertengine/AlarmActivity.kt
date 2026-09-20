package com.personal.alertengine
import android.media.*
import android.os.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
class AlarmActivity:AppCompatActivity(){private var ring:Ringtone?=null;private var vib:Vibrator?=null
 override fun onCreate(b:Bundle?){super.onCreate(b);setContentView(R.layout.activity_alarm);setShowWhenLocked(true);setTurnScreenOn(true);findViewById<TextView>(R.id.message).text=intent.getStringExtra("body")?:"Event requires attention.";val uri=RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);ring=RingtoneManager.getRingtone(this,uri)?.apply{audioAttributes=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();play()};vib=if(Build.VERSION.SDK_INT>=31)getSystemService(VibratorManager::class.java).defaultVibrator else @Suppress("DEPRECATION") (getSystemService(VIBRATOR_SERVICE) as Vibrator);vib?.vibrate(VibrationEffect.createWaveform(longArrayOf(0,500,250,500,250,1200),0));findViewById<Button>(R.id.ack).setOnClickListener{stopAlarm();AlertController.acknowledge(this);finish()}}
 private fun stopAlarm(){ring?.stop();vib?.cancel()};override fun onDestroy(){stopAlarm();super.onDestroy()}}
