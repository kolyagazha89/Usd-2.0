"""Contract for one-click Windows operator; no Docker/Windows necessary for tests."""
from pathlib import Path
import codecs
import re
import unittest

ROOT=Path(__file__).resolve().parent

class VenueLauncherContracts(unittest.TestCase):
    def test_three_double_click_entrypoints_exist_and_route_to_powershell(self):
        for name,action in [
            ("USD-Install.cmd","install"),("USD-Offline.cmd","offline"),
            ("USD-Online.cmd","online"),("USD-Next-Stage.cmd","next"),
        ]:
            source=(ROOT/name).read_text(encoding="utf-8")
            self.assertIn("venue-control.ps1",source)
            self.assertIn("-Action "+action,source)
            self.assertNotIn("down -v",source)
    def test_install_is_replay_safe_and_gates_central_sync(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")+(ROOT/"venue-season.ps1").read_text(encoding="utf-8")
        for expected in (
            "setup-state.json","VENUE_STAGE_ID","VENUE_SIGNING_KEY_FINGERPRINT",
            "verify-stage-package.mjs","import-stage.mjs","install-journal.sql",
            "provision-rustfs.mjs","venue-judge-permissions.mjs","provision-existing-staff.mjs",
            "USD_VENUE_LAN_MODE","docker","compose","https://app.usd-russia.ru",
            "stop","Get-NetIPAddress",
        ):
            self.assertIn(expected,source)
        self.assertNotIn("down -v",source)
        self.assertNotIn("prune",source)
        self.assertNotIn("return-sync",source)
        self.assertNotIn("rm -rf",source)
        self.assertNotIn("usd-home",source)
        self.assertRegex(source,r"function\s+Set-SetupPhase")
        self.assertRegex(source,r"function\s+Ensure-DockerReady")
    def test_single_complete_windows_installer_is_not_duplicated(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        self.assertLess(len(source.encode("utf-8")),45000,"Duplicated PowerShell source must not ship")
        for func in ("Assert-VenueReleaseImages","New-InitialState","Confirm-SignedStage",
                     "Install-Local","Start-Local","Test-VenueApiReady","Return-Online"):
            self.assertEqual(len(re.findall(r"(?m)^function\s+"+re.escape(func)+r"\b",source)),1,func)
        self.assertIn("if($Sha -cnotmatch '^[a-f0-9]{40}$')",source)

    def test_release_image_and_api_modules_are_verified_before_installation(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        self.assertIn("function Assert-VenueReleaseImages",source)
        begin=source.index("function New-InitialState")
        end=source.index("function Confirm-SignedStage",begin)
        installer=source[begin:end]
        self.assertIn("Get-VenueReleaseSha $sharedConfig",installer)
        self.assertLess(installer.index("Get-VenueReleaseSha $sharedConfig"),installer.index("$file='';$key='';$stageId=''"))
        verifier=source[source.index("function Assert-VenueReleaseImages"):begin]
        self.assertIn("org.opencontainers.image.revision",verifier)
        self.assertIn("venue-staff-access.js",verifier)
        self.assertIn("venue-route-policy.js",verifier)
        self.assertIn("usd-release.json",verifier)
        self.assertIn("docker run --rm -i --network none",verifier)
        self.assertIn("$program | & docker",verifier)

    def test_only_signed_real_stage_can_be_installed(self):
        source=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        section=source[source.index('function New-InitialState'):source.index('function Confirm-SignedStage')]
        self.assertIn("Select-VenueFile 'Выберите файл этапа",section)
        self.assertIn("Read-VenueFingerprint",section)
        self.assertIn("venue-staff-access.key",section)
        self.assertIn("Get-VenueReleaseSha $sharedConfig",section)
        self.assertIn("Assert-VenueReleaseImages $sha",(ROOT/"venue-season.ps1").read_text(encoding="utf-8"))
        self.assertNotIn("$demoSha",section)
        self.assertNotIn("make-demo-stage",section)
        self.assertNotIn("if($kind -eq",section)
        self.assertNotIn("demo-packages",section)
        self.assertNotIn("operator1",source)
        self.assertNotIn("judge-01",source)

    def test_legacy_trial_install_is_destroyed_only_with_explicit_confirmation(self):
        source=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        self.assertIn("function Replace-LegacyDemo",source)
        replace=source[source.index("function Replace-LegacyDemo"):source.index("function New-InitialState")]
        self.assertIn("Confirm-VenueAction",replace)
        self.assertIn("Read-Env",replace)
        self.assertIn("VENUE_STAGE_ID",replace)
        self.assertIn("Invoke-Compose @('down','--volumes')",replace)
        self.assertIn("Remove-Item -LiteralPath $EnvFile",replace)
        self.assertNotIn("usd-home",replace)
        installer=source[source.index('function Install-Local'):]
        self.assertLess(installer.index('Replace-LegacyDemo $state'),installer.index('$state=New-InitialState'))

    def test_operator_sees_exact_install_step_and_native_timeout_cause(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("function Set-VenueStep",source)
        self.assertIn("USD VENUE STEP:",source)
        self.assertIn("step='+$script:VenueStep",source)
        self.assertIn("Set-VenueStep 'check-docker'",source)
        self.assertIn("Set-VenueStep 'remove-confirmed-old-demo'",source)
        self.assertIn("Set-VenueStep 'download-images'",source)
        self.assertIn("Set-VenueStep 'configure-firewall'",source)
        self.assertIn("Set-VenueStep 'start-lan-services'",source)
        self.assertIn("step='+$script:VenueStep",source[source.index("}catch{",source.index("if($MyInvocation.InvocationName -eq '.')")):])
        self.assertIn("$_.Exception.Message",source[source.index("function Invoke-Docker"):source.index("function Assert-VenueCompose")])
        self.assertNotIn("winget install",source)
        self.assertNotIn("winget uninstall",source)

    def test_cached_runtime_images_do_not_force_network_pull(self):
        control=(ROOT/"venue-control.ps1").read_text(encoding="utf-8-sig")
        season=(ROOT/"venue-season.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("function Test-VenueRuntimeImagesCached",season)
        self.assertIn("Test-VenueRuntimeImagesCached $state.image",control)
        configured=control[control.index("if($state.phase -eq 'CONFIGURED')"):control.index("if($state.phase -eq 'STORAGE_READY')")]
        self.assertIn("-not(Test-VenueRuntimeImagesCached $state.image)",configured)
        self.assertIn("Invoke-Compose @('pull')",configured)
        for image in ("postgres:18-alpine","rustfs/rustfs:1.0.4","caddy:2-alpine"):
            self.assertIn(image,season)
        self.assertNotIn("down','--volumes",configured)

    def test_windows_native_docker_templates_never_require_quoted_keys(self):
        # PS 5.1 removes embedded double quotes from native arguments:
        # {{.Label "com.docker.compose.service"}} becomes a malformed Go template.
        for name in ("venue-control.ps1", "venue-season.ps1"):
            source=(ROOT/name).read_text(encoding="utf-8-sig")
            self.assertNotRegex(source, r'\{\{[^}]*["\x27]', name)
        control=(ROOT/"venue-control.ps1").read_text(encoding="utf-8-sig")
        season=(ROOT/"venue-season.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("function Read-VenueDockerLabels",control)
        self.assertIn("{{json .Config.Labels}}",control)
        self.assertIn("Read-VenueDockerLabels 'image' $ref",control)
        self.assertIn("Read-VenueDockerLabels 'container'",control)
        self.assertIn("Read-VenueDockerLabels 'container'",season)

    def test_operator_can_retry_local_ca_export_without_touching_docker_volumes(self):
        control=(ROOT/"venue-control.ps1").read_text(encoding="utf-8-sig")
        ca=(ROOT/"venue-ca.ps1").read_text(encoding="utf-8-sig")
        kit=(ROOT/"build-windows-kit.py").read_text(encoding="utf-8")
        cmd=(ROOT/"USD-Certificate.cmd").read_text(encoding="utf-8")
        self.assertIn("'certificate'",control)
        self.assertIn("'USD — Сертификат'",control)
        self.assertIn("-Action certificate",cmd)
        self.assertIn("venue-ca.ps1",control)
        self.assertIn("USD-Certificate.cmd",kit)
        self.assertIn("venue-ca.ps1",kit)
        self.assertIn("root.crt",ca)
        self.assertNotIn("root.key",ca.split("function Export-VenueCA")[1])
        self.assertIn("for($attempt=0;$attempt -lt 30;",ca)
        self.assertIn("USD-Venue-CA.crt",ca)
        self.assertIn("Verify-VenueCACertificate",ca)
        self.assertNotIn("--volumes",ca)
        self.assertNotIn("down",ca)

    def test_windows_kit_excludes_trial_generator_and_ip_https_support(self):
        kit=(ROOT/'build-windows-kit.py').read_text(encoding='utf-8')
        gateway=(ROOT/'Caddyfile').read_text(encoding='utf-8')
        self.assertNotIn('"make-demo-stage.mjs"',kit)
        self.assertNotIn('"provision-staff.mjs"',kit)
        self.assertIn('"venue-judge-permissions.mjs"',kit)
        self.assertIn('default_sni {$VENUE_BIND_IP}',gateway)

    def test_lan_startup_verifies_pinned_api_sha_and_live_stage_not_just_http_200(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        start=source.index("function Test-VenueApiReady")
        end=source.index("function Export-VenueReturn",start)
        readiness=source[start:end]
        self.assertIn("results/venue-live",readiness)
        self.assertIn("releaseInfo.revision===sha",readiness)
        self.assertIn("liveInfo.stage?.id===stageId",readiness)
        self.assertIn("ExpectedSha",readiness)
        self.assertIn("ExpectedStage",readiness)
        startlocal=source[source.index("function Start-Local"):start]
        self.assertIn("Test-VenueApiReady -ExpectedSha $state.image -ExpectedStage $state.stageId",startlocal)

    def test_real_contest_requires_independently_verified_public_fingerprint(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        self.assertIn("Read-VenueFingerprint",source)
        self.assertIn("trusted fingerprint",source.lower())
        self.assertIn("Get-RandomSecret",source)
        self.assertNotIn("VENUE_S3_ROOT_SECRET=rustfsadmin",source)
        self.assertNotIn("VENUE_JWT_SECRET=REPLACE_",source)
    def test_new_stage_has_one_click_action_and_separate_docker_project(self):
        launch=(ROOT/'USD-Next-Stage.cmd').read_text(encoding='utf-8')
        ctl=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        kit=(ROOT/'build-windows-kit.py').read_text(encoding='utf-8')
        self.assertIn('-Action next',launch)
        self.assertIn("'next'",ctl)
        season_file=ROOT/'venue-season.ps1'
        self.assertTrue(season_file.read_bytes().startswith(codecs.BOM_UTF8), 'Windows PowerShell 5.1 requires UTF-8 BOM for Russian text')
        lifecycle=season_file.read_text(encoding='utf-8-sig')
        self.assertIn('function Switch-ToNextStage',lifecycle)
        self.assertNotRegex(lifecycle,r'(?im)^\s*\$home\s*=','HOME is a reserved PowerShell automatic variable')
        self.assertIn('function Get-VenueProject',lifecycle)
        self.assertIn('usd-venue-',lifecycle)
        self.assertIn('Get-VenueComposeArguments',ctl[ctl.index('function Invoke-Compose'):ctl.index('function Assert-VenueCompose')])
        self.assertIn("'--project-directory',$Root,'--env-file',$EnvFile",lifecycle)
        self.assertIn('"USD-Next-Stage.cmd"',kit)
        self.assertIn("'USD — Следующий этап'",ctl)
        self.assertIn('stage-workspaces',lifecycle)
        self.assertIn('function Assert-NoOtherVenueGatewayRunning',lifecycle)
        self.assertIn('Assert-NoOtherVenueGatewayRunning',ctl[ctl.index('function Start-Local'):ctl.index('function Test-VenueApiReady')])

    def test_rotation_retains_one_database_without_network_ack_gate(self):
        lifecycle=(ROOT/'venue-season.ps1').read_text(encoding='utf-8')
        stage=lifecycle[lifecycle.index('function Switch-ToNextStage'):lifecycle.index('function Import-SharedVenueStage')]
        self.assertIn('Export-VenueReturn -LeaveApiStopped -Automatic -LocalArchive',stage)
        self.assertNotIn('Sync-VenueReturn',stage)
        self.assertIn('shared-source.json',lifecycle)
        self.assertIn('Test-IsActiveVenueStage',stage)
        self.assertIn('Restore-VenueStack',stage)
        self.assertNotIn("'down','--volumes'",stage)
        self.assertNotIn("'down','-v'",stage)
        self.assertLess(stage.index('New-VenueStageWorkspace'),stage.index('Export-VenueReturn'))

    def test_return_export_keeps_one_stage_only_and_scopes_signing_keys_by_project(self):
        ctl=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        export=ctl[ctl.index('function Export-VenueReturn'):ctl.index('function Sync-VenueReturn')]
        self.assertIn('Get-VenueProject',export)
        self.assertIn('venue_return_keys',export)
        self.assertNotIn("$volume='usd-venue_venue_return_keys'",export)
        self.assertIn("SyncResult.journalEndHash -ne $Bundle.journalEndHash",ctl)

    def test_real_stage_online_button_exports_signed_journal_before_stopping_local(self):
        source=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        begin=source.index('function Return-Online')
        end=source.index("if($MyInvocation.InvocationName",begin)
        section=source[begin:end]
        self.assertIn('Export-VenueReturn',section)
        self.assertIn("$state.phase -eq 'READY'",section)
        self.assertLess(section.index('Export-VenueReturn'),section.index('Remove-Autostart'))
        self.assertLess(section.index('Export-VenueReturn'),section.index("Invoke-Compose @('stop')"))
        self.assertIn('if($Silent)',section)
        self.assertIn('ACKNOWLEDGED',section)

    def test_direct_export_quiesces_judges_and_restores_only_the_originally_running_api(self):
        source=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        start=source.index('function Export-VenueReturn')
        end=source.index('function Return-Online',start)
        export=source[start:end]
        self.assertIn('[switch]$LeaveApiStopped',export)
        self.assertIn('ps --status running -q api',export)
        self.assertIn("Invoke-Compose @('stop','api')",export)
        self.assertIn("Invoke-Compose @('up','-d','--no-build','--pull','never','api')",export)
        self.assertLess(export.index("Invoke-Compose @('stop','api')"), export.index("'/app/export-venue-return.mjs'"))
        self.assertIn('finally{',export)
        self.assertIn('$apiWasRunning',export)
        online=source[end:source.index('if($MyInvocation.InvocationName',end)]
        self.assertIn('Export-VenueReturn -LeaveApiStopped',online)
        self.assertNotIn("Invoke-Compose @('stop','api')",online)
        self.assertIn("Invoke-Compose @('stop')",online)

    def test_back_online_never_automatically_imports_or_deletes_offline_data(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        offline=source.index("function Start-Local")
        online=source.index("function Return-Online")
        self.assertLess(offline,online)
        section=source[online:]
        self.assertRegex(section,r"(?i)\bstop\b")
        self.assertNotIn(" down ",section)
        self.assertNotIn("rm -",section)
        self.assertIn("ACKNOWLEDGED",section)


    def test_export_button_is_a_safe_signed_package_not_fake_online_sync(self):
        cmd=(ROOT/'USD-Export.cmd').read_text(encoding='utf-8')
        ctl=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        kit=(ROOT/'build-windows-kit.py').read_text(encoding='utf-8')
        self.assertIn('-Action export',cmd)
        self.assertIn('function Export-VenueReturn',ctl)
        self.assertIn('ensure-return-keys.mjs',ctl)
        self.assertIn('export-venue-return.mjs',ctl)
        self.assertIn('venue-return-package.mjs',ctl)
        self.assertIn('USD-Export.cmd',kit)
        self.assertIn('ensure-return-keys.mjs',kit)
        self.assertIn('Read-VenuePassword',ctl)
        self.assertNotIn('if($state.demo)',ctl)
        section=ctl[ctl.index('function Export-VenueReturn'):]
        self.assertNotIn('down -v',section)
        self.assertNotIn('prune',section)
        self.assertIn('Sync-VenueReturn',section)

    def test_signed_participant_directory_refresh_keeps_competition_history(self):
        source=(ROOT/"venue-directory.ps1").read_text(encoding="utf-8-sig")
        for required in ("Import-VenueParticipantDirectory","--apply-directory",
                         "pg_dump","pg_restore","Get-FileHash","LocalApplicationData",
                         "Restore-VenueApi","VENUE_DB_ROOT_PASSWORD"):
            self.assertIn(required,source)
        self.assertLess(source.index("pg_dump"),source.index("--apply-directory"))
        for forbidden in ("down -v","prune","rm -rf","TRUNCATE"):
            self.assertNotIn(forbidden,source)
        self.assertIn("-Action directory",(ROOT/"USD-Participants.cmd").read_text(encoding="utf-8"))

    def test_fresh_stage_signature_preflight_requires_no_database_or_existing_receipt(self):
        source=(ROOT/'venue-control.ps1').read_text(encoding='utf-8-sig')
        confirm=source[source.index('function Confirm-SignedStage'):source.index('function Install-Local')]
        self.assertIn("'IMPORTED'",confirm)
        self.assertIn("[array]::IndexOf",confirm)
        self.assertIn("$preImport",confirm)
        self.assertIn("'--dry-run'",confirm)
        self.assertIn("'--check-installed'",confirm)
        self.assertLess(confirm.index("'--dry-run'"),confirm.index("'--check-installed'"))

    def test_fresh_stage_staff_preflight_never_opens_postgres(self):
        windows=(ROOT/'venue-season.ps1').read_text(encoding='utf-8-sig')
        source=(ROOT/'provision-existing-staff.mjs').read_text(encoding='utf-8')
        self.assertIn("'--preflight'",windows)
        self.assertIn("function Confirm-VenueStaffKey",windows)
        self.assertIn("[array]::IndexOf",windows)
        self.assertIn("'IMPORTED'",windows)
        self.assertIn("-Preflight",windows)
        self.assertIn("extra[0]==='--preflight'",source)
        self.assertLess(source.index("if(extra[0]==='--preflight')"),source.index("const require=createRequire"))
        self.assertIn("planVenueStageImport",source)
        self.assertIn("decryptExistingVenueStaff",source)

    def test_recovery_backups_match_container_sha_before_any_database_repair_or_directory_write(self):
        for name in ("venue-coverage.ps1", "venue-directory.ps1"):
            source=(ROOT/name).read_text(encoding="utf-8-sig")
            self.assertIn("sha256sum",source,name)
            self.assertIn("Get-FileHash",source,name)
            self.assertIn("backup checksum differs",source,name)
            self.assertLess(source.index("sha256sum"),source.index("Get-FileHash"),name)
            self.assertNotIn("down -v",source,name)
        coverage=(ROOT/"venue-coverage.ps1").read_text(encoding="utf-8-sig")
        directory=(ROOT/"venue-directory.ps1").read_text(encoding="utf-8-sig")
        self.assertLess(coverage.index("backup checksum differs"),coverage.index("Get-Content -LiteralPath $sql"))
        self.assertLess(directory.index("backup checksum differs"),directory.index("'--apply-directory'"))

    def test_resume_accepts_only_the_original_installed_signed_receipt(self):
        node=(ROOT/'import-stage.mjs').read_text(encoding='utf-8')
        staff=(ROOT/'provision-existing-staff.mjs').read_text(encoding='utf-8')
        self.assertIn("assertInstalledVenueStageReceipt",node)
        self.assertIn("if(mode==='--check-installed')",node)
        self.assertIn("assertInstalledVenueStageReceipt",staff)
        self.assertIn("if(extra[0]==='--check')",staff)


    def test_windows_first_boot_fixes_only_its_own_rustfs_volume_before_start(self):
        lifecycle=(ROOT/'venue-season.ps1').read_text(encoding='utf-8-sig')
        control=(ROOT/'venue-control.ps1').read_text(encoding='utf-8-sig')
        self.assertIn('function Initialize-VenueMediaVolume',lifecycle)
        section=lifecycle[lifecycle.index('function Initialize-VenueMediaVolume'):lifecycle.index('function Get-VenueKitFiles')]
        self.assertIn("com.docker.compose.project",section)
        self.assertIn("'--network','none'",section)
        self.assertIn("'--user','0:0'",section)
        self.assertIn('10001:10001',section)
        self.assertIn('venue_media',section)
        self.assertNotIn("'down'",section)
        self.assertNotIn("'--volumes'",section)
        install=control[control.index('function Install-Local'):control.index('function Start-Local')]
        self.assertIn('Initialize-VenueMediaVolume',install)
        self.assertLess(install.index('Initialize-VenueMediaVolume'),install.index("Invoke-Compose @('up','-d','db','rustfs')"))

    def test_windows_rustfs_provision_failure_shows_safe_step_without_dumping_credentials(self):
        control=(ROOT/'venue-control.ps1').read_text(encoding='utf-8-sig')
        media=(ROOT/'provision-rustfs.mjs').read_text(encoding='utf-8')
        self.assertIn('USD_VENUE_INSTALL_DIAG',control)
        self.assertIn('USD_VENUE_INSTALL_DIAG',media)
        self.assertIn('USD VENUE MEDIA FAILED AT',media)
        self.assertNotIn("console.error(error)",media)


    def test_new_windows_install_refuses_running_stage_before_binding_rustfs_ports(self):
        control=(ROOT/'venue-control.ps1').read_text(encoding='utf-8-sig')
        stage=control[control.index('function Install-Local'):control.index('function Start-Local')]
        self.assertIn("Set-VenueStep 'check-other-stage-ports'",stage)
        self.assertIn('Assert-NoOtherVenueGatewayRunning',stage)
        self.assertLess(stage.index('Assert-NoOtherVenueGatewayRunning'),stage.index('Initialize-VenueMediaVolume'))
        self.assertLess(stage.index('Assert-NoOtherVenueGatewayRunning'),stage.index("Invoke-Compose @('up','-d','db','rustfs')"))
        season=(ROOT/'venue-season.ps1').read_text(encoding='utf-8-sig')
        guard=season[season.index('function Assert-NoOtherVenueGatewayRunning'):season.index('function Test-VerifiedVenueAck')]
        self.assertIn("@('gateway','rustfs')",guard)
        self.assertIn('com.docker.compose.project',guard)

if __name__=="__main__":
    unittest.main()
