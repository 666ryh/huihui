param(
    [string]$SdkRoot = $env:HUIHUI_ANDROID_SDK,
    [string]$JavaRoot = 'C:\Program Files\Java\jdk-17',
    [string]$KeyPath = $env:HUIHUI_ANDROID_KEYSTORE
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (!$SdkRoot) { $SdkRoot = Join-Path (Split-Path $projectRoot -Parent) 'teacher\work\sdk' }
if (!$KeyPath) { $KeyPath = Join-Path $projectRoot 'work\huihui-local.keystore' }
$toolsRoot = Join-Path $SdkRoot 'tools\android-14'
$platformJar = Join-Path $SdkRoot 'platform\android-34\android.jar'
$buildRoot = Join-Path $projectRoot ('build\apk-' + [Guid]::NewGuid().ToString('N'))
$sourceRoot = Join-Path $projectRoot 'android\app\src\main'
function Run-Checked([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $exe ($LASTEXITCODE)" }
}
if (!(Test-Path -LiteralPath $platformJar)) { throw 'Android SDK missing: see docs/android-build.md' }
New-Item -ItemType Directory -Force -Path "$buildRoot\compiled", "$buildRoot\classes", "$buildRoot\dex", "$buildRoot\route-tests", "$projectRoot\releases", (Split-Path $KeyPath -Parent) | Out-Null
Run-Checked "$JavaRoot\bin\javac.exe" @('-encoding','UTF-8','--release','8','-d',"$buildRoot\route-tests", "$sourceRoot\java\cn\huihui\support\AndroidRoutes.java", "$projectRoot\tests\AndroidRoutesTest.java")
Run-Checked "$JavaRoot\bin\java.exe" @('-cp',"$buildRoot\route-tests",'cn.huihui.support.AndroidRoutesTest')
Run-Checked "$toolsRoot\aapt2.exe" @('compile','--dir',"$sourceRoot\res",'-o',"$buildRoot\compiled\resources.zip")
Run-Checked "$toolsRoot\aapt2.exe" @('link','-o',"$buildRoot\unsigned.apk",'-I',$platformJar,'--manifest',"$sourceRoot\AndroidManifest.xml",'--min-sdk-version','26','--target-sdk-version','34', "$buildRoot\compiled\resources.zip")
Run-Checked "$JavaRoot\bin\javac.exe" @('-encoding','UTF-8','--release','8','-classpath',$platformJar,'-d',"$buildRoot\classes", "$sourceRoot\java\cn\huihui\support\MainActivity.java", "$sourceRoot\java\cn\huihui\support\AndroidRoutes.java")
Run-Checked "$JavaRoot\bin\jar.exe" @('cf',"$buildRoot\classes.jar",'-C',"$buildRoot\classes",'.')
$previousJavaHome = $env:JAVA_HOME
try {
    $env:JAVA_HOME = $JavaRoot
    Run-Checked "$toolsRoot\d8.bat" @('--lib',$platformJar,'--min-api','26','--output',"$buildRoot\dex", "$buildRoot\classes.jar")
    Push-Location "$buildRoot\dex"
    try { Run-Checked "$toolsRoot\aapt.exe" @('add',"$buildRoot\unsigned.apk",'classes.dex') } finally { Pop-Location }
    Run-Checked "$toolsRoot\zipalign.exe" @('-f','4',"$buildRoot\unsigned.apk", "$buildRoot\aligned.apk")
    if (!(Test-Path -LiteralPath $KeyPath)) {
        Run-Checked "$JavaRoot\bin\keytool.exe" @('-genkeypair','-keystore',$KeyPath,'-storepass','android','-keypass','android','-alias','huihui','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Huihui Support, O=Personal, C=CN')
    }
    $apk = Join-Path $projectRoot 'releases\huihui-support-1.0.0.apk'
    Run-Checked "$toolsRoot\apksigner.bat" @('sign','--ks',$KeyPath,'--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,"$buildRoot\aligned.apk")
    Run-Checked "$toolsRoot\apksigner.bat" @('verify','--verbose','--print-certs',$apk)
    Run-Checked "$toolsRoot\aapt.exe" @('dump','badging',$apk)
    Get-FileHash -LiteralPath $apk -Algorithm SHA256
    Write-Host "APK: $apk"
} finally { $env:JAVA_HOME = $previousJavaHome }
