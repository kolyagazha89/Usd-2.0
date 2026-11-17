/** Public installation help: contains only the public CA fingerprint. */
export function venueCertificatePage(sha256:string,notAfter:Date):string {
 if(!/^[a-f0-9]{64}$/.test(sha256)||!Number.isFinite(notAfter.getTime()))throw new Error('Invalid certificate metadata');
 const query='?sha256='+sha256;
 return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>USD — сертификат для судей</title><style>
*{box-sizing:border-box}body{margin:0;background:#121419;color:#f7f7f8;font:17px/1.6 system-ui,sans-serif}
main{max-width:680px;margin:auto;padding:28px 20px}h1{font-size:28px;line-height:1.2}h2{font-size:21px}
section{padding:20px;background:#20232a;border-radius:14px;margin:20px 0}a{display:block;background:#bd1727;color:white;padding:14px;border-radius:9px;text-align:center;text-decoration:none;font-weight:700;margin:12px 0}
code{display:block;overflow-wrap:anywhere;font-size:13px}li{margin:12px 0}small{color:#b8bec9}
</style></head><body><main><h1>USD — сертификат для судей</h1>
<p>Скачайте сертификат здесь. Пересылать файл через MAX не нужно; можно отправить ссылку на эту страницу.</p>
<p><strong>На iPhone откройте эту страницу в Safari.</strong> Если ссылка открылась внутри MAX или другого приложения, скопируйте её и вставьте в Safari.</p>
<section><h2>iPhone</h2><a href="download/cer${query}">Скачать для iPhone (.cer)</a>
<ol><li>Разрешите загрузку сертификата.</li><li>Откройте «Настройки» → «Профиль загружен» → «Установить».</li>
<li>«Настройки» → «Основные» → «Об этом устройстве» → «Доверие сертификатам»: включите полное доверие сертификату ноутбука USD.</li></ol></section>
<section><h2>Android</h2><a href="download/crt${query}">Скачать для Android (.crt)</a>
<p>В настройках безопасности выберите установку CA-сертификата и скачанный файл. Название раздела зависит от телефона.</p></section>
<p>После установки подключитесь к судейскому Wi-Fi и откройте HTTPS-адрес ноутбука, который показывает программа USD.</p>
<p>Перед установкой сверьте отпечаток с администратором:</p><code>${sha256}</code>
<small>Действует до ${notAfter.toISOString().slice(0,10)}. При замене сертификата администратор выдаст новую ссылку.</small>
</main></body></html>`;
}
