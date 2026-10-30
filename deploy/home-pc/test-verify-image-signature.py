import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('signature', Path(__file__).with_name('verify-image-signature.py'))
signature = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signature)
SHA = 'a' * 40
DIGEST = 'sha256:' + 'b' * 64
IMAGE_ID = 'sha256:' + 'c' * 64
REPO = 'ghcr.io/kolyagazha89/usd-2.0-api'


class ImageSignatureTests(unittest.TestCase):
    def image(self):
        return {'Id': IMAGE_ID, 'RepoDigests': [REPO + '@' + DIGEST], 'Config': {'Labels': {'org.opencontainers.image.revision': SHA}}}

    def result(self, value, code=0):
        return SimpleNamespace(returncode=code, stdout=json.dumps(value), stderr='untrusted output never logged')

    def claims(self, digest=DIGEST, sha=SHA):
        return [{'critical': {'image': {'docker-manifest-digest': digest}}, 'optional': {'git_sha': sha}}]

    def test_valid_digest_is_bound_to_workflow_identity_and_exact_revision(self):
        with patch.object(signature, 'trusted_cosign'), patch.object(signature, 'run', side_effect=[self.result([self.image()]), self.result(self.claims())]) as run:
            result = signature.verify('api', SHA)
        self.assertEqual(result, {'image': REPO + '@' + DIGEST, 'id': IMAGE_ID, 'revision': SHA})
        args = run.call_args_list[1].args[0]
        self.assertIn('https://token.actions.githubusercontent.com', args)
        self.assertIn('https://github.com/kolyagazha89/Usd-2.0/.github/workflows/publish-home-pc-images.yml@refs/heads/main', args)
        self.assertIn('git_sha=' + SHA, args)
        self.assertIn(REPO + '@' + DIGEST, args)
        self.assertFalse(any('insecure' in arg or 'ignore' in arg for arg in args))

    def test_invalid_service_or_revision_is_refused_before_any_subprocess(self):
        for service, sha in [('db', SHA), ('api', 'main'), ('evil/image', SHA)]:
            with self.subTest(service=service), patch.object(signature, 'run') as run:
                with self.assertRaises(ValueError): signature.verify(service, sha)
                run.assert_not_called()

    def test_tag_label_mismatch_and_unrelated_or_ambiguous_digest_are_refused(self):
        for mutate in (lambda x: x['Config']['Labels'].update({'org.opencontainers.image.revision': 'd' * 40}), lambda x: x.update(RepoDigests=['ghcr.io/other/api@' + DIGEST]), lambda x: x['RepoDigests'].append(REPO + '@sha256:' + 'd' * 64)):
            image = self.image(); mutate(image)
            with patch.object(signature, 'trusted_cosign'), patch.object(signature, 'run', return_value=self.result([image])) as run:
                with self.assertRaises(ValueError): signature.verify('api', SHA)
            self.assertEqual(run.call_count, 1)

    def test_signature_failure_or_wrong_claims_never_authorize_an_image(self):
        for response in (self.result([], 1), self.result(self.claims(sha='d' * 40)), self.result(self.claims(digest='sha256:' + 'd' * 64)), self.result([])):
            with patch.object(signature, 'trusted_cosign'), patch.object(signature, 'run', side_effect=[self.result([self.image()]), response]):
                with self.assertRaises(ValueError): signature.verify('api', SHA)

    def test_untrusted_trust_root_override_is_refused(self):
        with patch.dict(signature.os.environ, {'SIGSTORE_ROOT_FILE': '/tmp/other-root'}), patch.object(signature, 'run') as run:
            with self.assertRaises(ValueError): signature.verify('api', SHA)
            run.assert_not_called()


if __name__ == '__main__': unittest.main()
