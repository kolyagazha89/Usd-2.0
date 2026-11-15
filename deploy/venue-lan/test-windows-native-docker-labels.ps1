#requires -Version 5.1
# Reproduce real PowerShell 5.1 -> native executable argument forwarding.
# No Docker daemon, existing USD volume, registry, or firewall is touched.
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'venue-control.ps1') -Action install

$temp=Join-Path ([IO.Path]::GetTempPath()) ('usd-native-labels-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp)|Out-Null
$originalPrivate=$PrivateDir;$originalEnv=$EnvFile
$oldScenario=$env:USD_TEST_GATEWAY_PROJECT
try {
 $shim=Join-Path $temp 'docker-argv.cjs'
 [IO.File]::WriteAllText($shim,@'
const fs=require("node:fs");
const args=process.argv.slice(2);
const fail=(why)=>{console.error("USD NATIVE DOCKER ARGV: "+why);process.exit(49);};
if(args.some(arg=>arg.includes("{{.Label ")||arg.includes("{{index .Config.Labels")))
 fail("quoted Go template broke across Windows PowerShell 5.1 native argument boundary");
const fmt=args.indexOf("--format");
if(fmt>=0&&!["{{.ID}}","{{.Name}}","{{json .Config.Labels}}"].includes(args[fmt+1]))
 fail("unexpected or unprotected Docker template: "+args[fmt+1]);
if(args[0]==="ps"){
 if(args.includes("label=com.docker.compose.service=gateway"))console.log("abcdef123456");
 else if(args.includes("label=com.docker.compose.project=usd-venue"))console.log("123456abcdef");
 else fail("unexpected docker ps filter");
}else if(args[0]==="inspect"){
 if(args.at(-1)==="123456abcdef")
  console.log(JSON.stringify({"com.docker.compose.service":"db","com.docker.compose.project":"usd-venue"}));
 else if(args.at(-1)==="abcdef123456")
  console.log(JSON.stringify({"com.docker.compose.service":"gateway",
    "com.docker.compose.project":process.env.USD_TEST_GATEWAY_PROJECT||"usd-venue"}));
 else fail("unexpected container inspect target");
}else if(args[0]==="volume"&&args[1]==="ls"){
 console.log("usd-venue_venue_db");
}else if(args[0]==="image"&&args[1]==="inspect"){
 const sha=args.at(-1).split(":").at(-1);
 console.log(JSON.stringify({"org.opencontainers.image.revision":sha}));
}else if(args[0]==="run"){
 const program=fs.readFileSync(0,"utf8");
 if(!args.includes("-i")||!args.includes("--network")||
    !program.includes("venue_private.active_stage")||
    !program.includes("org.opencontainers.image")&&program.length<300)
  fail("release probe was not transmitted as stdin");
 console.log("USD VENUE API RELEASE CHECK PASSED");
}else fail("unexpected Docker command: "+args.join(" "));
'@,(New-Object Text.UTF8Encoding($false)))
 function docker {
  $nativeArgs=@($args)
  if($nativeArgs[0] -eq 'run'){$input | & node.exe $shim @nativeArgs}
  else{& node.exe $shim @nativeArgs}
 }
 $PrivateDir=$temp;$EnvFile=Join-Path $temp '.env'
 $stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e'
 $sha='a'*40;$fingerprint='b'*64;$ip='192.168.60.10'
 $state=[pscustomobject]@{format=1;phase='READY';demo=$true;stageId=$stage;
   image=$sha;fingerprint=$fingerprint;ip=$ip;accessKey=$null}
 [IO.File]::WriteAllLines($EnvFile,[string[]]@(
   ('VENUE_STAGE_ID='+$stage),('VENUE_IMAGE_TAG='+$sha),
   ('VENUE_SIGNING_KEY_FINGERPRINT='+$fingerprint),('VENUE_BIND_IP='+$ip)
 ),(New-Object Text.UTF8Encoding($false)))
 $parsed=Read-Env
 if($parsed['VENUE_STAGE_ID'] -cne $stage -or $parsed['VENUE_IMAGE_TAG'] -cne $sha -or
    $parsed['VENUE_SIGNING_KEY_FINGERPRINT'] -cne $fingerprint -or $parsed['VENUE_BIND_IP'] -cne $ip){
  throw 'Synthetic old DEMO .env fixture did not round-trip'
 }
 $initial=[IO.File]::ReadAllText($EnvFile)
 $script:declinedRemoval=$false
 function Confirm-VenueAction {
  $script:declinedRemoval=$true
  return $false
 }
 try{
  Replace-LegacyDemo $state
  throw 'Unexpectedly removed legacy USD without confirmation'
 }catch{
  if(!$script:declinedRemoval -or $_.Exception.Message -notmatch 'Очистка отменена'){
   throw ('Legacy cleanup failed before user confirmation: '+$_.Exception.Message)
  }
 }
 if([IO.File]::ReadAllText($EnvFile) -cne $initial){
  throw 'Legacy cleanup mutated existing configuration before permission'
 }
 Write-Host 'USD WINDOWS LABELS: legacy operator reaches consent without Docker format failure'
 function Read-State {return $script:MockState}
 $script:MockState=[pscustomobject]@{stageId=$stage;project='usd-venue';projectStageId=$stage}
 $env:USD_TEST_GATEWAY_PROJECT='usd-venue'
 Assert-NoOtherVenueGatewayRunning
 $env:USD_TEST_GATEWAY_PROJECT='usd-venue-foreign'
 $conflict=$false
 try{Assert-NoOtherVenueGatewayRunning}catch{
  if($_.Exception.Message -notmatch 'другой этап'){throw}
  $conflict=$true
 }
 if(!$conflict){throw 'Foreign USD gateway was missed by native Docker labels inspection'}
 Write-Host 'USD WINDOWS LABELS: foreign gateway detection validated'
 Assert-VenueReleaseImages $sha
 Write-Host 'USD WINDOWS LABELS: both immutable images verified over native argv'
}finally{
 $PrivateDir=$originalPrivate;$EnvFile=$originalEnv
 if($null -eq $oldScenario){Remove-Item Env:\USD_TEST_GATEWAY_PROJECT -ErrorAction SilentlyContinue}
 else{$env:USD_TEST_GATEWAY_PROJECT=$oldScenario}
 [IO.Directory]::Delete($temp,$true)
}