# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Firebase (app + messaging + crashlytics) — already in deps
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Agora RTC (react-native-agora)
-keep class io.agora.** { *; }
-dontwarn io.agora.**

# Razorpay (uses heavy reflection)
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**
-keepclassmembers class * { @com.razorpay.* *; }
-keepattributes JavascriptInterface

# Vision Camera + face detector
-keep class com.mrousavy.camera.** { *; }
-keep class com.visioncamera.facedetector.** { *; }
-keep class com.google.mlkit.** { *; }
-dontwarn com.mrousavy.camera.**
-dontwarn com.google.mlkit.**

# SVGA player (@jayming/svga-player-rn)
-keep class com.opensource.svgaplayer.** { *; }
-keep class com.swmansion.** { *; }
-dontwarn com.opensource.svgaplayer.**

# Socket.IO + engine.io transports (uses Class.forName for transport negotiation)
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn io.socket.**

# Google Sign-In
-keep class com.google.android.gms.auth.** { *; }

# Hermes / React Native generic
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Generic safety net for native modules with @ReactMethod
-keepclasseswithmembers class * { @com.facebook.react.bridge.ReactMethod *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod *; }

# Keep annotation attributes used by reflection
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepattributes SourceFile,LineNumberTable

# Add any project specific keep options here:
