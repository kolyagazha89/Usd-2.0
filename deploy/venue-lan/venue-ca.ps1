#requires -Version 5.1
# This module exports only the public Caddy root CA. Never copy root.key.
function Verify-VenueCACertificate([string]$File){
 $text=[IO.File]::ReadAllText($File)
 $match=[regex]::Match($text,'\A-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\r\n]+)-----END CERTIFICATE-----\s*\z')
 if(-not $match.Success){throw 'Caddy вернул не сертификат X.509'}
 try{
  $raw=[Convert]::FromBase64String($match.Groups[1].Value)
  $cert=[System.Security.Cryptography.X509Certificates.X509Certificate2]::new($raw)
  $ext=@($cert.Extensions|Where-Object {$_.Oid.Value -eq '2.5.29.19'})
  if($ext.Count -ne 1){throw 'Нет признака корневого CA'}
  $basic=[System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($ext[0],$ext[0].Critical)
  if(!$basic.CertificateAuthority -or $cert.Subject -cne $cert.Issuer -or
   $cert.NotAfter -le (Get-Date).AddDays(1)){throw 'Недействительный корневой CA'}
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try{
   $fingerprint=([BitConverter]::ToString($sha.ComputeHash($raw))).Replace('-','').ToLowerInvariant()
   return $fingerprint
  }finally{$sha.Dispose();$cert.Dispose()}
 }catch{throw ('Сертификат Caddy не прошёл проверку: '+$_.Exception.Message)}
}
function Export-VenueCA {
 $destination=Join-Path $PrivateDir 'USD-Venue-CA.crt'
 $share=Join-Path $Root 'USD-Venue-CA.crt'
 if(!(Test-Path -LiteralPath $PrivateDir)){New-Item -Path $PrivateDir -ItemType Directory -Force|Out-Null}
 $container=@(& docker @(Get-VenueComposeArguments) ps -q gateway 2>$null|Select-Object -First 1)
 if($LASTEXITCODE -ne 0 -or $container.Count -ne 1 -or
  [string]$container[0] -cnotmatch '^[a-f0-9]{12,64}$'){
  throw 'Caddy не запущен. Проверьте журнал службы gateway. Данные сохранены.'
 }
 $temp=Join-Path $PrivateDir ('.venue-ca-'+[guid]::NewGuid().ToString('N')+'.crt')
 try{
  for($attempt=0;$attempt -lt 30;$attempt++){
   $copied=$false
   try{
    & docker cp ($container[0]+':/data/caddy/pki/authorities/local/root.crt') $temp 2>$null|Out-Null
    $copied=$LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $temp -PathType Leaf)
   }catch{$copied=$false}
   if($copied){
    $fingerprint=Verify-VenueCACertificate $temp
    Copy-Item -LiteralPath $temp -Destination $destination -Force
    Copy-Item -LiteralPath $temp -Destination $share -Force
    Write-Host ('USD VENUE CA: '+$share)
    Write-Host ('USD VENUE CA SHA-256: '+$fingerprint)
    return
   }
   if($attempt -lt 29){Start-Sleep -Seconds 1}
  }
  throw 'Caddy не создал корневой сертификат после запуска. Проверьте журнал службы gateway; данные сохранены.'
 }finally{if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp -Force}}
}
function Download-VenueCertificate {
 $state=Read-State
 if(!$state -or $state.phase -ne 'READY'){throw 'Сначала запустите настоящий офлайн-сервер USD.'}
 Ensure-DockerReady
 if(-not(Test-IsActiveVenueStage $state.stageId)){
  throw 'Это исторический этап. Запустите «USD — Сертификат» из папки текущего этапа, иначе телефоны получат неверный CA.'
 }
 # A direct click on the Certificate shortcut must start a stopped Caddy
 # automatically. Start-Local verifies the LAN gateway and exports its CA.
 # Do not open a second browser or force the operator to click Offline first.
 Start-Local -NoUi
 Set-VenueStep 'export-caddy-public-ca'
 if(!$Silent){
  Show-VenueMessage ('Сертификат готов в папке USD-Offline-Windows и local-private.'+[Environment]::NewLine+
   'Загрузите USD-Venue-CA.crt в онлайн-админку USD → Офлайн-сервер.'+[Environment]::NewLine+
   'Сверьте SHA-256 в консоли с онлайн-страницей.')
 }
}
