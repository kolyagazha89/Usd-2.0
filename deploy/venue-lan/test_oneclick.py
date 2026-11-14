"""Contract for one-click Windows operator; no Docker/Windows necessary for tests."""
from pathlib import Path
import re
import unittest

ROOT=Path(__file__).resolve().parent

class VenueLauncherContracts(unittest.TestCase):
    def test_three_double_click_entrypoints_exist_and_route_to_powershell(self):
        for name,action in [
            ("USD-Install.cmd","install"),("USD-Offline.cmd","offline"),
            ("USD-Online.cmd","online"),
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
            "provision-rustfs.mjs","provision-staff.mjs","provision-existing-staff.mjs",
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

    def test_demo_can_use_pinned_approved_images_when_live_ubuntu_is_old(self):
        source=(ROOT/"venue-control.ps1").read_text(encoding="utf-8")
        installer=source[source.index("function New-InitialState"):source.index("function Confirm-SignedStage")]
        self.assertIn("$demoSha='5a5eba177d2699fc28c7d3216316e7f9bef474d5'",installer)
        self.assertIn("if($kind -ne '1'){throw}",installer)
        self.assertIn("Assert-VenueReleaseImages $sha",installer)
        self.assertIn("VENUE_IMAGE_TAG=$sha",installer)
        self.assertLess(installer.index("if($kind -ne '1'){throw}"),installer.index("$sha=$demoSha"))

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
    def test_real_stage_online_button_exports_signed_journal_before_stopping_local(self):
        source=(ROOT/'venue-control.ps1').read_text(encoding='utf-8')
        begin=source.index('function Return-Online')
        end=source.index("if($MyInvocation.InvocationName",begin)
        section=source[begin:end]
        self.assertIn('Export-VenueReturn',section)
        self.assertIn('(-not $state.demo)',section)
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
        self.assertIn('if($state.demo)',ctl)
        section=ctl[ctl.index('function Export-VenueReturn'):]
        self.assertNotIn('down -v',section)
        self.assertNotIn('prune',section)
        self.assertIn('Sync-VenueReturn',section)

if __name__=="__main__":
    unittest.main()
