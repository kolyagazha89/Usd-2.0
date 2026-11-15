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
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
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
        self.assertIn("Assert-VenueReleaseImages $sha",installer)
        self.assertLess(installer.index("Assert-VenueReleaseImages $sha"),installer.index("$file='';$key='';$stageId=''"))
        verifier=source[source.index("function Assert-VenueReleaseImages"):begin]
        self.assertIn("org.opencontainers.image.revision",verifier)
        self.assertIn("venue-staff-access.js",verifier)
        self.assertIn("venue-route-policy.js",verifier)
        self.assertIn("usd-release.json",verifier)
        self.assertIn("docker run --rm --network none",verifier)

    def test_only_signed_real_stage_can_be_installed(self):
        source=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        section=source[source.index('function New-InitialState'):source.index('function Confirm-SignedStage')]
        self.assertIn("Select-VenueFile 'Выберите файл этапа",section)
        self.assertIn("Read-VenueFingerprint",section)
        self.assertIn("venue-staff-access.key",section)
        self.assertIn("Assert-VenueReleaseImages $sha",section)
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
        self.assertLess(source.index('Replace-LegacyDemo $state'),source.index('New-InitialState}',source.index('function Install-Local')))

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
    def test_initial_stage_installs_root_active_selector_before_first_api(self):
        ctl=(ROOT/'venue-control.ps1').read_text(encoding='utf-8-sig')
        part=ctl[ctl.index("if($state.phase -eq 'IMPORTED')"):ctl.index("if($state.phase -eq 'JOURNAL_READY')")]
        self.assertIn("install-journal.sql",part)
        self.assertIn("install-season.sql",part)
        self.assertLess(part.index("install-season.sql"),part.index("Set-SetupPhase $state 'JOURNAL_READY'"))

    def test_next_signed_stage_uses_same_docker_project_and_postgres_history(self):
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
        self.assertIn("return 'usd-venue'",lifecycle)
        self.assertIn('Get-VenueProject',ctl[ctl.index('function Invoke-Compose'):ctl.index('function Assert-VenueCompose')])
        self.assertIn('"USD-Next-Stage.cmd"',kit)
        self.assertIn("'USD — Следующий этап'",ctl)
        self.assertIn('function Backup-VenueSeasonDb',lifecycle)
        self.assertIn('function Recover-VenueSeasonTransition',lifecycle)
        self.assertIn("'install-season.sql'",ctl)
        self.assertNotIn('New-VenueStageWorkspace',lifecycle)
        self.assertIn('function Assert-NoOtherVenueGatewayRunning',lifecycle)
        self.assertIn('Assert-NoOtherVenueGatewayRunning',ctl[ctl.index('function Start-Local'):ctl.index('function Test-VenueApiReady')])

    def test_rotation_requires_exact_central_ack_and_never_removes_old_results(self):
        lifecycle=(ROOT/'venue-season.ps1').read_text(encoding='utf-8')
        stage=lifecycle[lifecycle.index('function Switch-ToNextStage'):]
        self.assertIn('Export-VenueReturn -LeaveApiStopped -Automatic',stage)
        self.assertIn('Sync-VenueReturn -Bundle $bundle',stage)
        self.assertIn('Test-VerifiedVenueAck',stage)
        self.assertIn('journalEndHash',lifecycle[lifecycle.index('function Test-VerifiedVenueAck'):])
        self.assertIn('Invoke-Compose',stage)
        self.assertIn('Backup-VenueSeasonDb',stage)
        self.assertIn('Restore-VenueApi',stage)
        self.assertIn('Complete-VenueSeasonTransition',stage)
        self.assertNotIn("'down','--volumes'",stage)
        self.assertNotIn("'down','-v'",stage)
        self.assertLess(stage.index('Sync-VenueReturn -Bundle $bundle'),
                        stage.index('Backup-VenueSeasonDb'))
        self.assertLess(stage.index('Backup-VenueSeasonDb'),stage.index("'--append'"))

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

if __name__=="__main__":
    unittest.main()
