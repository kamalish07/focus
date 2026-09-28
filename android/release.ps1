# Builds the Play Store release of Focus.
#
#   powershell -ExecutionPolicy Bypass -File C:\Users\kamal\FocusAndroid\release.ps1
#
# First run: creates your upload key (focus-upload.keystore) with a password you choose.
# Every run: builds the app, signs it with that key and writes, to .\release:
#   focus-<version>.aab   upload this to Play Console
#   focus-<version>.apk   install this on your own phone to try it
#   assetlinks.json       proves to Android that kamalish07.github.io belongs to this app
# The password is only ever typed here; it isn't saved anywhere.
# (-Keystore, -OutDir and the FOCUS_KEY_PASSWORD variable exist for testing with a throwaway key.)

param([string]$Keystore = '', [string]$OutDir = '')

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$env:JAVA_HOME = Join-Path $env:USERPROFILE '.bubblewrap\jdk-17.0.11+9'
$env:ANDROID_HOME = Join-Path $env:USERPROFILE '.bubblewrap\android_sdk'
$bin = Join-Path $env:JAVA_HOME 'bin'
$tools = Join-Path $env:ANDROID_HOME 'build-tools\36.1.0'
$keystore = if ($Keystore) { $Keystore } else { Join-Path $root 'focus-upload.keystore' }
$alias = 'focus'
$twa = Get-Content (Join-Path $root 'twa-manifest.json') -Raw | ConvertFrom-Json
$version = $twa.appVersionName

function Read-Secret($prompt) {
  if ($env:FOCUS_KEY_PASSWORD) { return $env:FOCUS_KEY_PASSWORD }
  $s = Read-Host -AsSecureString $prompt
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Run($exe, [string[]]$argv) {
  & $exe @argv
  if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed (exit $LASTEXITCODE)" }
}

Set-Location $root

if (-not (Test-Path $keystore)) {
  Step 'Create your upload key'
  Write-Host 'Choose a password (at least 8 characters). Save it in a password manager: you need it for every update.'
  do {
    $pass = Read-Secret 'New key password'
    $again = Read-Secret 'Type it again'
    if ($pass -ne $again) { Write-Host 'Those did not match. Try again.' -ForegroundColor Yellow }
    elseif ($pass.Length -lt 8) { Write-Host 'Use at least 8 characters.' -ForegroundColor Yellow }
  } until ($pass -eq $again -and $pass.Length -ge 8)
  Run (Join-Path $bin 'keytool.exe') @('-genkeypair', '-keystore', $keystore, '-alias', $alias, '-keyalg', 'RSA', '-keysize', '2048',
    '-validity', '10000', '-dname', 'CN=Focus, O=kamalish07', '-storepass', $pass, '-keypass', $pass)
  Write-Host "Key created: $keystore" -ForegroundColor Green
} else {
  $pass = Read-Secret 'Key password'
}

Step "Build Focus $version"
Run (Join-Path $root 'gradlew.bat') @('bundleRelease', 'assembleRelease', '--no-daemon', '-q')

$out = if ($OutDir) { $OutDir } else { Join-Path $root 'release' }
New-Item -ItemType Directory -Force $out | Out-Null
$aab = Join-Path $out "focus-$version.aab"
$apk = Join-Path $out "focus-$version.apk"

Step 'Sign the Play Store bundle (.aab)'
Copy-Item (Join-Path $root 'app\build\outputs\bundle\release\app-release.aab') $aab -Force
Run (Join-Path $bin 'jarsigner.exe') @('-keystore', $keystore, '-storepass', $pass, '-keypass', $pass,
  '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', $aab, $alias)

Step 'Sign the test APK'
$aligned = Join-Path $out 'aligned.apk'
Run (Join-Path $tools 'zipalign.exe') @('-f', '-p', '4', (Join-Path $root 'app\build\outputs\apk\release\app-release-unsigned.apk'), $aligned)
Run (Join-Path $tools 'apksigner.bat') @('sign', '--v4-signing-enabled', 'false', '--ks', $keystore, '--ks-key-alias', $alias, '--ks-pass', "pass:$pass", '--key-pass', "pass:$pass", '--out', $apk, $aligned)
Remove-Item $aligned

Step 'Write assetlinks.json'
$list = & (Join-Path $bin 'keytool.exe') -list -v -keystore $keystore -alias $alias -storepass $pass
$sha = ($list | Select-String 'SHA256:\s*([0-9A-F:]+)').Matches[0].Groups[1].Value
if (-not $sha) { throw 'Could not read the key fingerprint' }
$json = @"
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "$($twa.packageId)",
      "sha256_cert_fingerprints": ["$sha"]
    }
  }
]
"@
[IO.File]::WriteAllText((Join-Path $out 'assetlinks.json'), $json + "`n", (New-Object Text.UTF8Encoding $false))
$pass = $null

Step 'Done'
Write-Host "Play Store bundle : $aab"
Write-Host "Test APK          : $apk"
Write-Host "Upload key SHA-256: $sha"
Write-Host ''
Write-Host 'Back up focus-upload.keystore (for example to OneDrive or a USB stick) and keep the password in a password manager.' -ForegroundColor Yellow
Write-Host 'Then tell Claude "release built" so it can publish assetlinks.json.' -ForegroundColor Green
