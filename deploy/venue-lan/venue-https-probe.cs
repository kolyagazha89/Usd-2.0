using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;

namespace UsdVenue
{
    public static class HttpsProbe
    {
        public static string Get(string address, int port, string path, string caFile)
        {
            IPAddress ip;
            if (!IPAddress.TryParse(address, out ip) ||
                ip.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork ||
                (path != "/venue-api/results/venue-live" && path != "/login"))
                throw new InvalidOperationException("HTTPS_INVALID_REQUEST");

            var pem = Regex.Match(File.ReadAllText(caFile),
                @"\A-----BEGIN CERTIFICATE-----\s+([A-Za-z0-9+/=\r\n]+)-----END CERTIFICATE-----\s*\z");
            if (!pem.Success)
                throw new InvalidOperationException("TLS_INVALID_CA");

            using (var root = new X509Certificate2(Convert.FromBase64String(pem.Groups[1].Value)))
            {
                var request = (HttpWebRequest)WebRequest.Create(new UriBuilder("https", ip.ToString(), port, path).Uri);
                request.Proxy = null;
                request.AllowAutoRedirect = false;
                request.KeepAlive = false;
                request.Timeout = 4000;
                request.ReadWriteTimeout = 4000;
                request.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;

                string certificateError = null;
                request.ServerCertificateValidationCallback = (sender, certificate, presentedChain, errors) =>
                {
                    // Some Windows clients ignore IP SANs when using a private CA.
                    // Match the raw IP SAN and validate the chain against this CA ourselves.
                    if (certificate == null)
                    {
                        certificateError = "TLS_NO_CERTIFICATE";
                        return false;
                    }

                    using (var leaf = new X509Certificate2(certificate))
                    {
                        if (!HasIpAddress(leaf, ip))
                        {
                            certificateError = "TLS_IP_MISMATCH";
                            return false;
                        }

                        if (!HasTrustedChain(leaf, presentedChain, root))
                        {
                            certificateError = "TLS_CA_MISMATCH";
                            return false;
                        }
                    }

                    return true;
                };

                try
                {
                    using (var response = (HttpWebResponse)request.GetResponse())
                    {
                        if (response.StatusCode != HttpStatusCode.OK)
                            throw new InvalidOperationException("HTTP_" + (int)response.StatusCode);

                        return ReadBody(response);
                    }
                }
                catch (WebException error)
                {
                    using (var response = error.Response as HttpWebResponse)
                    {
                        var status = response == null ? error.Status.ToString() : "HTTP_" + (int)response.StatusCode;
                        throw new InvalidOperationException(certificateError ?? status);
                    }
                }
            }
        }

        private static bool HasTrustedChain(X509Certificate2 leaf, X509Chain presented, X509Certificate2 root)
        {
            using (var chain = new X509Chain())
            {
                chain.ChainPolicy.ExtraStore.Add(root);
                if (presented != null)
                {
                    foreach (X509ChainElement element in presented.ChainElements)
                        chain.ChainPolicy.ExtraStore.Add(element.Certificate);
                }

                chain.ChainPolicy.ApplicationPolicy.Add(new Oid("1.3.6.1.5.5.7.3.1"));
                chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                chain.ChainPolicy.VerificationFlags = X509VerificationFlags.AllowUnknownCertificateAuthority;
                chain.ChainPolicy.UrlRetrievalTimeout = TimeSpan.FromMilliseconds(500);

                if (!chain.Build(leaf) || chain.ChainElements.Count < 2)
                    return false;
                foreach (X509ChainStatus status in chain.ChainStatus)
                {
                    if ((status.Status & ~X509ChainStatusFlags.UntrustedRoot) != 0)
                        return false;
                }

                var last = chain.ChainElements[chain.ChainElements.Count - 1].Certificate;
                var expectedRoot = root.RawData;
                var actualRoot = last.RawData;
                return expectedRoot.Length == actualRoot.Length && SameBytes(expectedRoot, actualRoot, 0);
            }
        }

        private static bool HasIpAddress(X509Certificate2 leaf, IPAddress ip)
        {
            var extension = leaf.Extensions["2.5.29.17"];
            if (extension == null)
                return false;

            var raw = extension.RawData;
            var expected = ip.GetAddressBytes();
            var position = 1;

            int length;
            if (raw.Length < 2 || raw[0] != 0x30 || !TryReadLength(raw, ref position, out length) ||
                length != raw.Length - position)
                return false;

            bool matches = false;
            while (position < raw.Length)
            {
                var tag = raw[position++];
                if (!TryReadLength(raw, ref position, out length) || length > raw.Length - position)
                    return false;

                // GeneralName [7] is iPAddress. DNS and CN are separate names.
                if (tag == 0x87 && length == expected.Length && SameBytes(expected, raw, position))
                    matches = true;
                position += length;
            }

            return matches;
        }

        private static bool TryReadLength(byte[] data, ref int offset, out int length)
        {
            length = 0;
            if (offset >= data.Length)
                return false;

            int first = data[offset++];
            if (first < 128)
            {
                length = first;
                return true;
            }

            int count = first & 127;
            if (count == 0 || count > 3 || count > data.Length - offset)
                return false;

            for (int i = 0; i < count; i++)
                length = (length << 8) | data[offset++];
            return true;
        }

        private static bool SameBytes(byte[] expected, byte[] actual, int offset)
        {
            if (expected.Length > actual.Length - offset)
                return false;
            for (int i = 0; i < expected.Length; i++)
            {
                if (expected[i] != actual[offset + i])
                    return false;
            }
            return true;
        }

        private static string ReadBody(HttpWebResponse response)
        {
            var buffer = new char[8192];
            var body = new StringBuilder();
            var timer = Stopwatch.StartNew();
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                int read;
                while ((read = reader.Read(buffer, 0, buffer.Length)) > 0)
                {
                    if (body.Length + read > 16 * 1024 * 1024 || timer.ElapsedMilliseconds > 4000)
                        throw new InvalidOperationException("HTTPS_RESPONSE_LIMIT");
                    body.Append(buffer, 0, read);
                }
            }
            return body.ToString();
        }
    }
}
