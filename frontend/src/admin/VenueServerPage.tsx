import {useEffect,useState} from 'react';
import {AlertTriangle,BookOpen,Download,ExternalLink,RefreshCw,WifiOff} from 'lucide-react';
import {apiGet,apiPost,listData,venueCertificateDownloadUrl,venueCertificateInstallUrl,type User} from '../api';
import {QRCodeSVG} from 'qrcode.react';
import {saveVenueFile,trustedVenueKey,validateVenueStaffExport,type VenueSetup} from './venue-setup-model';
import './venue-server.css';
type Stage={id:string;name:string;date?:string;city?:string;status?:string};
type VenueCertificateInfo={available:boolean;sha256?:string;notAfter?:string;updatedAt?:string};
export default function VenueServerPage({user,go,path,PageFrame}:{user:User;go:(p:string)=>void;path:string;PageFrame:React.ComponentType<any>}){
 const [setup,setSetup]=useState<VenueSetup|null>(null),[stages,setStages]=useState<Stage[]>([]);
 const [stageId,setStageId]=useState(()=>new URLSearchParams(path.split('?')[1]??'').get('stageId')??'');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[attempt,setAttempt]=useState(0);
 const [staffKey,setStaffKey]=useState('');
 const [certificate,setCertificate]=useState<VenueCertificateInfo|null>(null);
 const [certificateError,setCertificateError]=useState(''),[certificateBusy,setCertificateBusy]=useState(false);
 useEffect(()=>{
  if(user.role!=='ADMIN'){setLoading(false);return;}
  let active=true;setLoading(true);setError('');setSetup(null);setStages([]);setStaffKey('');
  Promise.all([apiGet<VenueSetup>('/stages/venue/setup'),apiGet('/stages')]).then(([state,items])=>{
   if(!active)return;
   const available=listData<Stage>(items).filter(s=>['PUBLISHED','COMPLETED'].includes(s.status??''))
    .sort((a,b)=>Date.parse(b.date??'')-Date.parse(a.date??''));
   setSetup(state);setStages(available);
   setStageId(previous=>available.some(s=>s.id===previous)?previous:available[0]?.id??'');
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось проверить сервер. Повторите проверку.')})
   .finally(()=>{if(active)setLoading(false)});
  if((window as Window&{__USD_VENUE_MODE__?:unknown}).__USD_VENUE_MODE__!==true){
   setCertificate(null);setCertificateError('');
   void apiGet<VenueCertificateInfo>('/stages/venue/certificate').then(info=>{
    if(active)setCertificate(info);
   }).catch(e=>{if(active)setCertificateError(e instanceof Error?e.message:'Не удалось проверить сертификат');});
  }
  return()=>{active=false;};
 },[user.role,attempt]);
 const downloadStage=async()=>{
  if(!setup||!stageId||busy)return;
  const selected=stageId;setBusy(true);setError('');setNotice('');setStaffKey('');
  try{
   const data=await apiPost('/stages/venue/'+encodeURIComponent(selected)+'/staff-export',{});
   const file=validateVenueStaffExport(data,selected,setup);
   saveVenueFile('usd-venue-stage-'+selected+'.json',file.text,'application/json');
   setStaffKey(file.staffKey);
   // Browsers often block a second automatic download on the same click.
   // Unlock stays in memory only; the operator explicitly downloads it.
   setNotice('Пакет этапа сохранён. Теперь нажмите «Скачать ключ судей (.key)», затем «Скачать открытый ключ». Существующие аккаунты: '+file.staffCount+'. Действует до '+file.expiresAt+'.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось скачать этап. Повторите попытку.')}
  finally{setBusy(false)}
 };
 const downloadKey=()=>{
  if(!setup)return;
  try{const key=trustedVenueKey(setup);saveVenueFile('signing-public.pem',key.publicKeyPem,'application/x-pem-file');setNotice('Открытый ключ скачан. При установке сверьте отпечаток с этой страницей.');}
  catch(e){setError(e instanceof Error?e.message:'Ключ недоступен')}
 };
 const uploadCertificate=async(event:React.ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file||certificateBusy)return;
  setCertificateBusy(true);setCertificateError('');setNotice('');
  try{
   if(file.size>8192||file.size<500)throw new Error('Выберите публичный USD-Venue-CA.crt, не закрытый ключ.');
   const pem=await file.text();
   if(!pem.includes('-----BEGIN CERTIFICATE-----')||pem.includes('PRIVATE KEY'))
    throw new Error('Это не публичный корневой сертификат. Выберите USD-Venue-CA.crt с ноутбука.');
   const saved=await apiPost<VenueCertificateInfo>('/stages/venue/certificate',{pem});
   setCertificate(saved);
   setNotice('Сертификат площадки опубликован. Теперь ссылки для iPhone и Android работают без входа в админку. Сверьте SHA-256 с сертификатом на ноутбуке.');
  }catch(e){setCertificateError(e instanceof Error?e.message:'Сертификат не загружен. Попробуйте снова.')}
  finally{setCertificateBusy(false)}
 };
 const localMode=(window as Window&{__USD_VENUE_MODE__?:unknown}).__USD_VENUE_MODE__===true;
 return <PageFrame className="venue-server-page" title="Офлайн-сервер" subtitle="USD на ноутбуке: судьи и табло работают через общий Wi-Fi">
  {user.role!=='ADMIN'?<section className="panel" role="alert">Этот раздел доступен только администратору USD.</section>:<>
   <section className="panel venue-server-intro"><WifiOff size={30} aria-hidden="true"/><div><h2>{localMode?'Вы на локальном сервере':'Подготовьте ноутбук до выезда'}</h2><p>Первую установку выполните дома с интернетом. На площадке понадобится ноутбук и Wi-Fi-роутер. Все судьи подключаются к одной сети.</p></div></section>
   <div className="venue-server-status" role="status"><AlertTriangle size={22} aria-hidden="true"/><div><strong>Перед настоящим этапом проверьте ноутбук</strong><p>Для настоящего этапа кнопка «USD — Онлайн» автоматически переносит данные и ждёт подтверждения Ubuntu. Перед первым использованием обязательно проведите проверку на ноутбуке и двух телефонах без интернета.</p></div></div>
   <section className="panel venue-server-step" aria-labelledby="venue-download-title"><span className="venue-server-number" aria-hidden="true">1</span><div className="venue-server-step-body"><h2 id="venue-download-title">Скачайте программу и инструкцию</h2>
    <p>На ноутбуке с Windows 10 или 11 скачайте архив. Щёлкните по нему правой кнопкой → <strong>«Извлечь всё»</strong>. Откройте извлечённую папку <strong>USD-Offline-Windows</strong>.</p>
    <div className="venue-server-actions"><a className="primary-button" href="/downloads/USD-Offline-Windows.zip" download><Download size={20}/>Скачать для Windows</a><a className="secondary-button" href="/downloads/USD-Offline-Guide.html" download><BookOpen size={19}/>Скачать инструкцию</a><a className="venue-server-text-link" href="/downloads/USD-Offline-Guide.html" target="_blank" rel="noopener noreferrer">Открыть инструкцию <ExternalLink size={15}/></a></div>
    <p className="muted">В архиве уже есть все кнопки и инструкция. Если раньше устанавливали пробный сервер, скопируйте новые файлы поверх прежней папки USD, сохранив .env и local-private до запуска. Следующий настоящий этап устанавливайте кнопкой «USD — Следующий этап»: она добавит этап в ту же базу, сохранив предыдущие результаты. Инструкцию можно читать без интернета или распечатать.</p></div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-install-title"><span className="venue-server-number" aria-hidden="true">2</span><div className="venue-server-step-body"><h2 id="venue-install-title">Один раз установите дома</h2>
    <p>Подключитесь к роутеру, который возьмёте на соревнования. В папке дважды нажмите <strong>USD-Install.cmd</strong> — кнопку установки.</p>
    <ol><li>Если Docker Desktop отсутствует, установите его с официального сайта и включите режим Linux containers / WSL2. USD самостоятельно Docker не удаляет и не переустанавливает.</li><li>Выберите адрес ноутбука и скачанные из админки три файла: подписанный пакет этапа, отдельный ключ доступа судей и открытый ключ подписи.</li><li>Разрешите доступ через брандмауэр. Программа перенесёт существующие аккаунты USD с прежними email и паролями. Дождитесь сообщения о готовности.</li></ol>
    <p>Программа сама скачает сервер и откроет страницу входа. Если установка прервётся, снова нажмите ту же кнопку — сохранённые данные останутся на месте.</p></div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-run-title"><span className="venue-server-number" aria-hidden="true">3</span><div className="venue-server-step-body"><h2 id="venue-run-title">На площадке включите офлайн</h2>
    <p>Включите ноутбук и тот же роутер. Дважды нажмите <strong>USD-Offline.cmd</strong> или ярлык <strong>«USD — Офлайн»</strong> на рабочем столе.</p>
    <p>Программа покажет адрес входа и адрес <strong>LIVE-табло</strong>. Табло открывается по <strong>http://IP-ноутбука/venue/live</strong> без сертификатов. Для проверки внесите реальный результат в локальном интерфейсе судьи — он появится автоматически. Для авторизованной работы судей используется только HTTPS.</p>
    <p>Администратор и судьи входят со своими существующими email и паролями USD. Дополнительные учётные записи не требуются. После следующего входа в Windows сервер запустится автоматически.</p>
    {localMode&&<div className="venue-server-actions"><button className="primary-button" onClick={()=>go('/admin/event-day')}>Открыть день соревнований</button><a className="secondary-button" href={'http://'+window.location.hostname+'/venue/live?screen=spl'} target="_blank" rel="noopener noreferrer">Табло SPL</a><a className="secondary-button" href={'http://'+window.location.hostname+'/venue/live?screen=bfspl-bdw'} target="_blank" rel="noopener noreferrer">Табло BFSPL + BDW SPL</a></div>}</div></section>
   <section className="panel venue-server-step venue-server-certificate" aria-labelledby="venue-cert-title">
    <span className="venue-server-number" aria-hidden="true">3а</span>
    <div className="venue-server-step-body">
     <h2 id="venue-cert-title">Скачать сертификат для телефонов</h2>
     <p>Для <strong>LIVE-табло сертификат не нужен</strong>. Для работы судей с личными данными нужен защищённый HTTPS. На офлайн-ноутбуке один раз нажмите <strong>USD-Certificate.cmd</strong> (кнопка «USD — Сертификат»). Она скачает публичный сертификат Caddy в основную папку <strong>USD-Offline-Windows/USD-Venue-CA.crt</strong> и в <strong>local-private</strong>. Сертификат создаёт именно ваш ноутбук — онлайн-сервер не может создать его заранее.</p>
     {!localMode&&<>
      <p>Загрузите <strong>только публичный USD-Venue-CA.crt</strong> в онлайн-админку один раз. После этого судьи могут открыть ссылку или отсканировать QR и установить сертификат прямо на телефон. Пароль, приватные ключи и папку <strong>local-private</strong> целиком не передавайте.</p>
      <div className="venue-server-actions">
       <label className="secondary-button venue-server-cert-upload">
        <Download size={18}/>{certificateBusy?'Проверяем файл…':'Загрузить сертификат с ноутбука'}
        <input type="file" accept=".crt,.pem,application/x-x509-ca-cert" disabled={certificateBusy}
         onChange={event=>void uploadCertificate(event)}/>
       </label>
       <button className="secondary-button" type="button" disabled={certificateBusy}
        onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={16}/>Обновить статус</button>
      </div>
      {certificateError&&<p className="form-error" role="alert">{certificateError}</p>}
      {!certificate&&!certificateError&&<p role="status">Проверяем, опубликован ли сертификат…</p>}
      {certificate&&!certificate.available&&<p role="status">Сертификат ещё не загружен. Сначала получите его с офлайн-ноутбука.</p>}
      {certificate?.available&&<>
       <p className="venue-server-cert-valid">Корневой сертификат опубликован. Действует до {certificate.notAfter?new Date(certificate.notAfter).toLocaleDateString('ru-RU'):'указанного срока'}.</p>
       <p>Контрольный отпечаток SHA-256 — сверьте с ноутбуком перед установкой:</p>
       <code className="venue-server-fingerprint">{certificate.sha256}</code>
       <p>Через MAX отправьте ссылку на страницу установки — пересылать сам файл сертификата не нужно. Судьи смогут скачать его без входа в аккаунт.</p>
       <div className="venue-server-actions">
        <a className="secondary-button" href={venueCertificateInstallUrl(certificate.sha256!)} target="_blank" rel="noopener noreferrer">Открыть страницу установки</a>
        <button className="secondary-button" type="button" onClick={()=>void (navigator.clipboard?.writeText(venueCertificateInstallUrl(certificate.sha256!))??Promise.reject(new Error('Clipboard unavailable'))).then(()=>setNotice('Ссылка скопирована. Отправьте её судьям в MAX.')).catch(()=>setCertificateError('Не удалось скопировать. Выделите ссылку ниже и скопируйте вручную.'))}>Скопировать ссылку для MAX</button>
       </div>
       <input aria-label="Ссылка установки сертификата" readOnly value={venueCertificateInstallUrl(certificate.sha256!)} onFocus={event=>event.target.select()} style={{width:'100%'}}/>
       <div className="venue-server-cert-codes"><div><QRCodeSVG value={venueCertificateInstallUrl(certificate.sha256!)} size={160} title="Скачать сертификат на телефон"/><span>Страница установки на телефоне</span></div></div>
       <div className="venue-server-actions">
        <a className="primary-button" href={venueCertificateDownloadUrl('cer')} target="_blank" rel="noopener noreferrer"><Download size={19}/>Скачать для iPhone (.cer)</a>
        <a className="primary-button" href={venueCertificateDownloadUrl('crt')} target="_blank" rel="noopener noreferrer"><Download size={19}/>Скачать для Android (.crt)</a>
       </div>
       <div className="venue-server-cert-codes">
        <div><QRCodeSVG value={venueCertificateDownloadUrl('cer')} size={132} title="QR для iPhone"/><span>iPhone</span></div>
        <div><QRCodeSVG value={venueCertificateDownloadUrl('crt')} size={132} title="QR для Android"/><span>Android</span></div>
       </div>
      </>}
     </>}
     <ol>
      <li><strong>iPhone:</strong> открыть ссылку в Safari, разрешить загрузку профиля, затем «Настройки» → «Профиль загружен» → «Установить»; после установки: «Настройки» → «Основные» → «Об этом устройстве» → «Доверие сертификатам» → включить полное доверие.</li>
      <li><strong>Android:</strong> скачать .crt и открыть «Настройки» → «Безопасность» → «Шифрование и учётные данные» → «Установить сертификат CA» (названия могут отличаться по модели).</li>
      <li>После установки подключиться к Wi-Fi USD и открыть <strong>https://IP-ноутбука/login</strong>. Если сертификат на ноутбуке сменился, заново загрузите именно новый файл в админку.</li>
     </ol>
     <p className="muted">Не устанавливайте случайные сертификаты: доверие к корневому CA распространяется на HTTPS. Для проверки сравните SHA-256 на ноутбуке и в этом разделе.</p>
    </div>
   </section>
   <section className="panel venue-server-step" aria-labelledby="venue-export-title"><span className="venue-server-number" aria-hidden="true">4</span><div className="venue-server-step-body"><h2 id="venue-export-title">Сохраните результаты в защищённый файл</h2>
    <p>После настоящего этапа на ноутбуке дважды нажмите <strong>USD-Export.cmd</strong> или ярлык <strong>«USD — Экспорт»</strong>. Для согласованного снимка программа приостанавливает ввод результатов и возобновляет его после экспорта. Кнопка «Онлайн» оставляет судейский ввод остановленным до завершения переключения.</p>
    <ol><li>Программа безопасно подготовит ключ подписи и предложит задать отдельный пароль шифрования.</li><li>В папке <strong>local-private/return-output</strong> появятся зашифрованный файл результатов, открытый ключ и его отпечаток.</li><li>Передайте файл ответственному администратору. Пароль сообщите отдельно, а отпечаток ключа сверьте независимым способом.</li></ol>
    <p><strong>Экстренный экспорт — резервная копия, а не синхронизация.</strong> Для обычного возврата используйте «USD — Онлайн»: никаких команд Linux и переноса файлов. Фотографии на площадке отключены. Все данные ноутбука сохраняются.</p></div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-return-title"><span className="venue-server-number" aria-hidden="true">5</span><div className="venue-server-step-body"><h2 id="venue-return-title">Одна кнопка: синхронизация и возврат</h2>
    <p>Дважды нажмите <strong>USD-Online.cmd</strong> или ярлык <strong>«USD — Онлайн»</strong>. Для настоящего этапа программа сама приостановит судейский ввод, сохранит подписанный зашифрованный журнал, отправит его на Ubuntu и дождётся подтверждения базы и пересчёта результатов. Только после подтверждения выключит локальный сервер и откроет основной сайт.</p><p><strong>Резервная копия остаётся на ноутбуке.</strong> Если нет интернета или обнаружен конфликт, программа восстановит судейский сервер. Ничего не удаляйте; нажмите эту же кнопку после устранения проблемы.</p></div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-next-title"><span className="venue-server-number" aria-hidden="true">6</span><div className="venue-server-step-body"><h2 id="venue-next-title">Следующий этап — история остаётся</h2>
    <p>Перед новым этапом скачайте из админки три его файла. На ноутбуке откройте <strong>USD-Next-Stage.cmd</strong> или ярлык <strong>«USD — Следующий этап»</strong>.</p>
    <p>Программа сохранит возвратный файл прошлого этапа и добавит новый в общую локальную базу. <strong>Предыдущие результаты останутся на ноутбуке. Синхронизацию можно выполнить позже.</strong></p>
    <p>Используется тот же Docker-сервер, база и сертификат телефонов. Отдельная папка хранит пакет и возвратные файлы этапа. Кнопки «USD — Экспорт» и «USD — Онлайн» из папки этапа отправляют только его журнал. При смене этапа судьи входят заново; повторно устанавливать сертификат не нужно.</p></div></section>
   <details className="panel venue-server-details"><summary>Телефон не открывает локальный сайт</summary><ol><li>Проверьте, что телефон и ноутбук подключены к одному Wi-Fi. При испытании отключите мобильные данные телефона.</li><li>Открывайте адрес с IP ноутбука, который показывает программа, а не обычный адрес сайта USD.</li><li>На Windows выберите для сети профиль «Частная». В роутере отключите изоляцию Wi-Fi-клиентов.</li><li>Установите на телефон сертификат <strong>USD-Venue-CA.crt</strong> из папки <strong>local-private</strong> только с вашего ноутбука. На iPhone: «Настройки» → «Профиль загружен» → «Установить», затем «Основные» → «Об этом устройстве» → «Доверие сертификатам» → включить доверие к сертификату этого сервера. На Android: настройки безопасности → установка CA-сертификата; название пункта зависит от телефона.</li><li>Если IP ноутбука сменился, верните адрес, указанный при установке. Папку и данные не удаляйте.</li></ol></details>
   {!localMode&&<details className="panel venue-server-details"><summary>Подготовка файла настоящего этапа</summary><p>Для реальных соревнований подготовьте подписанный пакет с доступом на синхронизацию. Не передавайте его посторонним.</p>
    {loading?<p role="status">Проверяем возможность скачивания…</p>:setup?.signing.ready?<>
     <label className="venue-server-stage">Этап<select value={stageId} disabled={busy} onChange={e=>{setStageId(e.target.value);setStaffKey('');setNotice('')}}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>{s.name}{s.city?' · '+s.city:''}{s.date?' · '+new Date(s.date).toLocaleDateString('ru-RU'):''}</option>)}</select></label>
     {!stages.length&&<p>Опубликованных этапов пока нет. Сначала опубликуйте нужный этап в разделе «Этапы».</p>}
     <div className="venue-server-actions"><button className="primary-button" type="button" disabled={!stageId||busy} onClick={()=>void downloadStage()}><Download size={18}/>{busy?'Готовим файл…':'Скачать файл этапа'}</button><button className="secondary-button" type="button" disabled={busy} onClick={downloadKey}>Скачать открытый ключ</button>{staffKey&&<button className="secondary-button" type="button" onClick={()=>{saveVenueFile('usd-venue-access-'+stageId+'.key',staffKey+'\n','application/octet-stream');setNotice('Отдельный ключ судей скачан. Сохраните JSON и .key в защищённой папке ноутбука; ещё нужен открытый PEM.')}}>Скачать ключ судей (.key)</button>}</div>
     <p>Файл действует 72 часа. При подготовке одного реального этапа будут скачаны два файла: подписанный список участников с <strong>зашифрованными</strong> данными доступа судей и отдельный одноразовый ключ. Не пересылайте их вместе в общий чат. Дополнительно скачайте открытый ключ подписи, затем перенесите все три файла на ноутбук. Пароли сотрудников не меняются.</p><p>Отпечаток ключа для сверки при установке:</p><code className="venue-server-fingerprint">{setup.signing.fingerprint}</code>
    </>:setup?<p>Для загрузки настоящего этапа требуется настройка ключа подписи на основной Ubuntu. Обратитесь к ответственному за сайт. Без подписанного пакета установка офлайн-этапа недоступна.</p>:null}
    {!loading&&<button className="secondary-button" disabled={busy} onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={16}/>Проверить ещё раз</button>}</details>}
   {error&&<div className="form-error venue-server-feedback" role="alert">{error}<button className="secondary-button" disabled={loading||busy} onClick={()=>setAttempt(n=>n+1)}>Повторить проверку</button></div>}
   {notice&&<div className="notice venue-server-feedback" role="status">{notice}</div>}
  </>}
 </PageFrame>;
}
