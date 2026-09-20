package com.personal.alertengine
import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity:AppCompatActivity(){private lateinit var backend:EditText;private lateinit var key:EditText;private lateinit var target:EditText;private lateinit var interval:EditText;private lateinit var status:TextView
 override fun onCreate(b:Bundle?){super.onCreate(b);setContentView(R.layout.activity_main);backend=findViewById(R.id.backendUrl);key=findViewById(R.id.apiKey);target=findViewById(R.id.targetUrl);interval=findViewById(R.id.interval);status=findViewById(R.id.status);backend.setText("http://192.168.1.10:8787");target.setText("https://in.bookmyshow.com/movies/warangal/toxic-a-fairy-tale-for-grown-ups/ET00378770");AlertController.channels(this);if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)ActivityCompat.requestPermissions(this,arrayOf(Manifest.permission.POST_NOTIFICATIONS),10);findViewById<Button>(R.id.test).setOnClickListener{test()};findViewById<Button>(R.id.start).setOnClickListener{start()};findViewById<Button>(R.id.stop).setOnClickListener{stopService(Intent(this,MonitorService::class.java));status.text="Stopped"}}
 private fun start(){val m=interval.text.toString().toLongOrNull()?:15;if(m<15){status.text="Minimum interval is 15 minutes";return};val i=Intent(this,MonitorService::class.java).apply{action=MonitorService.START;putExtra(MonitorService.BACKEND,backend.text.toString().trim().trimEnd('/'));putExtra(MonitorService.KEY,key.text.toString().trim());putExtra(MonitorService.TARGET,target.text.toString().trim());putExtra(MonitorService.INTERVAL,m*60000L)};ContextCompat.startForegroundService(this,i);status.text="🟢 Monitoring every $m minutes"}
 private fun test(){val u=backend.text.toString().trim().trimEnd('/')+"/check";val t=target.text.toString().trim();val k=key.text.toString().trim();status.text="Checking…";Thread{try{val c=URL(u).openConnection() as HttpURLConnection;c.requestMethod="POST";c.connectTimeout=30000;c.readTimeout=90000;c.doOutput=true;c.setRequestProperty("Content-Type","application/json");if(k.isNotBlank())c.setRequestProperty("Authorization","Bearer $k");c.outputStream.use{it.write(JSONObject().put("url",t).toString().toByteArray())};val code=c.responseCode;val s=if(code in 200..299)c.inputStream else c.errorStream;val text=s?.bufferedReader()?.use{it.readText()}?:"";c.disconnect();runOnUiThread{if(code in 200..299)status.text="Result: bookTicketsVisible="+JSONObject(text).optBoolean("bookTicketsVisible") else status.text="Backend HTTP $code: $text"}}catch(e:Exception){runOnUiThread{status.text="Error: ${e.message}"}}}.start()}
}
