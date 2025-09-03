plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

kotlin {
    jvmToolchain(17)
}

android {
    namespace = "com.example.aliersample"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.example.aliersample"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    sourceSets {
        getByName("main") {
            assets.srcDirs(layout.buildDirectory.dir("extra-assets"))
        }
    }
}

dependencies {
    implementation(libs.material)
    implementation(libs.alier)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}

tasks.register<Sync>("syncAppRes") {
    from(layout.projectDirectory.dir("../../app_res"))
    into(layout.buildDirectory.dir("extra-assets/app_res"))
}

tasks.named("preBuild") {
    dependsOn(
        "syncAppRes"
    )
}