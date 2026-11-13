import {useEffect,useState} from 'react';
import {AlertTriangle,BookOpen,Download,ExternalLink,RefreshCw,WifiOff} from 'lucide-react';
import {apiGet,listData,type User} from '../api';
import {saveVenueFile,trustedVenueKey,validateVenueDownload,type VenueSetup} from './venue-setup-model';
import './venue-server.css';
type Stage={id:string;name:string;date?:string;city?:string;status?:string};
export default function VenueServerPage({user,go,path,PageFrame}:{user:User;go:(p:string)=>void;path:string;PageFrame:React.ComponentType<any>}){
 const [setup,setSetup]=useState<VenueSetup|null>(null),[stages,setStages]=useState<Stage[]>([]);
 const [stageId,setStageId]=useState(()=>new URLSearchParams(path.split('?')[1]??'').get('stageId')??'');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(user.role!=='ADMIN'){setLoading(false);return;}
  let active=true;setLoading(true);setError('');setSetup(null);setStages([]);
  Promise.all([apiGet<VenueSetup>('/stages/venue/setup'),apiGet('/stages')]).then(([state,items])=>{
   if(!active)return;
   const available=listData<Stage>(items).filter(s=>['PUBLISHED','COMPLETED'].includes(s.status??''))
    .sort((a,b)=>Date.parse(b.date??'')-Date.parse(a.date??''));
   setSetup(state);setStages(available);
   setStageId(previous=>available.some(s=>s.id===previous)?previous:available[0]?.id??'');
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось проверить сервер. Повторите проверку.')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;};
 },[user.role,attempt]);
 const downloadStage=async()=>{
  if(!setup||!stageId||busy)return;
  const selected=stageId;setBusy(true);setError('');setNotice('');
  try{
   const data=await apiGet('/stages/venue/'+encodeURIComponent(selected)+'/export');
   const file=validateVenueDownload(data,selected,setup);
   saveVenueFile('usd-venue-stage-'+selected+'.json',file.text,'application/json');
   setNotice('Файл этапа скачан. Действует до '+file.expiresAt+'. Затем скачайте ключ ниже. Данные участников передавайте только ответственному за ноутбук.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось скачать этап. Повторите попытку.')}
  finally{setBusy(false)}
 };
 const downloadKey=()=>{
  if(!setup)return;
  try{const key=trustedVenueKey(setup);saveVenueFile('signing-public.pem',key.publicKeyPem,'application/x-pem-file');setNotice('Открытый ключ скачан. При установке сверьте отпечаток с этой страницей.');}
  catch(e){setError(e instanceof Error?e.message:'Ключ недоступен')}
 };
 const localMode=(window as Window&{__USD_VENUE_MODE__?:unknown}).__USD_VENUE_MODE__===true;
 return <PageFrame className="venue-server-page" title="Офлайн-сервер" subtitle="USD на ноутбуке: судьи и табло работают через общий Wi-Fi">
  {user.role!=='ADMIN'?<section className="panel" role="alert">Этот раздел доступен только администратору USD.</section>:<>
   <section className="panel venue-server-intro"><WifiOff size={30} aria-hidden="true"/><div><h2>{localMode?'Вы на локальном сервере':'Подготовьте ноутбук до выезда'}</h2><p>Первую установку выполните дома с интернетом. На площадке понадобится ноутбук и Wi-Fi-роутер. Все судьи подключаются к одной сети.</p></div></section>
   <div className="venue-server-status" role="status"><AlertTriangle size={22} aria-hidden="true"/><div><strong>Перед настоящим этапом проверьте ноутбук</strong><p>Для настоящего этапа кнопка «USD — Онлайн» автоматически переносит данные и ждёт подтверждения Ubuntu. Перед первым использованием обязательно проведите проверку на ноутбуке и двух телефонах без интернета.</p></div></div>
   <section className="panel venue-server-step" aria-labelledby="venue-download-title"><span className="venue-server-number" aria-hidden="true">1</span><div className="venue-server-step-body"><h2 id="venue-download-title">Скачайте программу и инструкцию</h2>
    <p>На ноутбуке с Windows 10 или 11 скачайте архив. Щёлкните по нему правой кнопкой → <strong>«Извлечь всё»</strong>. Откройте извлечённую папку <strong>USD-Offline-Windows</strong>.</p>
    <div className="venue-server-actions"><a className="primary-button" href="/downloads/USD-Offline-Windows.zip" download><Download size={20}/>Скачать для Windows</a><a className="secondary-button" href="/downloads/USD-Offline-Guide.html" download><BookOpen size={19}/>Скачать инструкцию</a><a className="venue-server-text-link" href="/downloads/USD-Offline-Guide.html" target="_blank" rel="noopener noreferrer">Открыть инструкцию <ExternalLink size={15}/></a></div>
    <p className="muted">В архиве уже есть все кнопки и инструкция. Её можно читать без интернета или распечатать из браузера.</p></div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-install-title"><span className="venue-server-number" aria-hidden="true">2</span><div className="venue-server-step-body"><h2 id="venue-install-title">Один раз установите дома</h2>
    <p>Подключитесь к роутеру, который возьмёте на соревнования. В папке дважды нажмите <strong>USD-Install.cmd</strong> — кнопку установки.</p>
    <ol><li>Если программа попросит Docker Desktop — согласитесь на установку, откройте Docker Desktop и завершите его настройку. После перезагрузки нажмите установку USD ещё раз.</li><li>Выберите адрес ноутбука из предложенных и <strong>«ДЕМО — пробный запуск»</strong>.</li><li>Разрешите доступ через брандмауэр и задайте отдельные пароли для администратора и судьи. Дождитесь сообщения о готовности.</li></ol>
    <p>Программа сама скачает сервер и откроет страницу входа. Если установка прервётся, снова нажмите ту же кнопку — сохранённые данные останутся на месте.</p></div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-run-title"><span className="venue-server-number" aria-hidden="true">3</span><div className="venue-server-step-body"><h2 id="venue-run-title">На площадке включите офлайн</h2>
    <p>Включите ноутбук и тот же роутер. Дважды нажмите <strong>USD-Offline.cmd</strong> или ярлык <strong>«USD — Офлайн»</strong> на рабочем столе.</p>
    <p>Программа покажет адрес входа и адрес <strong>LIVE-табло</strong>. Подключите телефоны к этому же Wi-Fi. Откройте на них показанный адрес. Понадобится один раз установить сертификат — порядок есть в инструкции ниже.</p>
    <p>Локальный администратор: <strong>operator1@venue.invalid</strong>. Судья: <strong>judge-01@venue.invalid</strong>. Используйте пароли, заданные при установке. После следующего входа в Windows сервер запустится автоматически.</p>
    {localMode&&<div className="venue-server-actions"><button className="primary-button" onClick={()=>go('/admin/event-day')}>Открыть день соревнований</button><a className="secondary-button" href="/venue/live" target="_blank" rel="noopener noreferrer">Открыть LIVE-табло</a></div>}</div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-export-title"><span className="venue-server-number" aria-hidden="true">4</span><div className="venue-server-step-body"><h2 id="venue-export-title">Сохраните результаты в защищённый файл</h2>
    <p>После настоящего этапа на ноутбуке дважды нажмите <strong>USD-Export.cmd</strong> или ярлык <strong>«USD — Экспорт»</strong>. Для ДЕМО эта кнопка не переносит данные. Для согласованного снимка программа приостанавливает ввод результатов и возобновляет его после экспорта. Кнопка «Онлайн» оставляет судейский ввод остановленным до завершения переключения.</p>
    <ol><li>Программа безопасно подготовит ключ подписи и предложит задать отдельный пароль шифрования.</li><li>В папке <strong>local-private/return-output</strong> появятся зашифрованный файл результатов, открытый ключ и его отпечаток.</li><li>Передайте файл ответственному администратору. Пароль сообщите отдельно, а отпечаток ключа сверьте независимым способом.</li></ol>
    <p><strong>Экстренный экспорт — резервная копия, а не синхронизация.</strong> Для обычного возврата используйте «USD — Онлайн»: никаких команд Linux и переноса файлов. Фотографии на площадке отключены. Все данные ноутбука сохраняются.</p></div></section>
   <section className="panel venue-server-step" aria-labelledby="venue-return-title"><span className="venue-server-number" aria-hidden="true">5</span><div className="venue-server-step-body"><h2 id="venue-return-title">Одна кнопка: синхронизация и возврат</h2>
    <p>Дважды нажмите <strong>USD-Online.cmd</strong> или ярлык <strong>«USD — Онлайн»</strong>. Для настоящего этапа программа сама приостановит судейский ввод, сохранит подписанный зашифрованный журнал, отправит его на Ubuntu и дождётся подтверждения базы и пересчёта результатов. Только после подтверждения выключит локальный сервер и откроет основной сайт.</p><p><strong>Резервная копия остаётся на ноутбуке.</strong> Если нет интернета или обнаружен конфликт, программа восстановит судейский сервер. Ничего не удаляйте; нажмите эту же кнопку после устранения проблемы.</p></div></section>
   <details className="panel venue-server-details"><summary>Телефон не открывает локальный сайт</summary><ol><li>Проверьте, что телефон и ноутбук подключены к одному Wi-Fi. При испытании отключите мобильные данные телефона.</li><li>Открывайте адрес с IP ноутбука, который показывает программа, а не обычный адрес сайта USD.</li><li>На Windows выберите для сети профиль «Частная». В роутере отключите изоляцию Wi-Fi-клиентов.</li><li>Установите на телефон сертификат <strong>USD-Venue-CA.crt</strong> из папки <strong>local-private</strong> только с вашего ноутбука. На iPhone: «Настройки» → «Профиль загружен» → «Установить», затем «Основные» → «Об этом устройстве» → «Доверие сертификатам» → включить доверие к сертификату этого сервера. На Android: настройки безопасности → установка CA-сертификата; название пункта зависит от телефона.</li><li>Если IP ноутбука сменился, верните адрес, указанный при установке. Папку и данные не удаляйте.</li></ol></details>
   {!localMode&&<details className="panel venue-server-details"><summary>Подготовка файла настоящего этапа</summary><p>Для реальных соревнований подготовьте подписанный пакет с доступом на синхронизацию. Не передавайте его посторонним.</p>
    {loading?<p role="status">Проверяем возможность скачивания…</p>:setup?.signing.ready?<>
     <label className="venue-server-stage">Этап<select value={stageId} disabled={busy} onChange={e=>{setStageId(e.target.value);setNotice('')}}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>{s.name}{s.city?' · '+s.city:''}{s.date?' · '+new Date(s.date).toLocaleDateString('ru-RU'):''}</option>)}</select></label>
     {!stages.length&&<p>Опубликованных этапов пока нет. Сначала опубликуйте нужный этап в разделе «Этапы».</p>}
     <div className="venue-server-actions"><button className="primary-button" type="button" disabled={!stageId||busy} onClick={()=>void downloadStage()}><Download size={18}/>{busy?'Готовим файл…':'Скачать файл этапа'}</button><button className="secondary-button" type="button" disabled={busy} onClick={downloadKey}>Скачать открытый ключ</button></div>
     <p>Файл действует 72 часа. Скачайте его незадолго до установки и передайте только ответственному за ноутбук. Установщик проверяет подпись, этап и срок действия.</p><p>Отпечаток ключа для сверки при установке:</p><code className="venue-server-fingerprint">{setup.signing.fingerprint}</code>
    </>:setup?<p>Для настоящего этапа нужна однократная настройка подписи на сервере. Обратитесь к ответственному за сайт. Установка и тестовый запуск доступны сейчас.</p>:null}
    {!loading&&<button className="secondary-button" disabled={busy} onClick={()=>setAttempt(n=>n+1)}><RefreshCw size={16}/>Проверить ещё раз</button>}</details>}
   {error&&<div className="form-error venue-server-feedback" role="alert">{error}<button className="secondary-button" disabled={loading||busy} onClick={()=>setAttempt(n=>n+1)}>Повторить проверку</button></div>}
   {notice&&<div className="notice venue-server-feedback" role="status">{notice}</div>}
  </>}
 </PageFrame>;
}
