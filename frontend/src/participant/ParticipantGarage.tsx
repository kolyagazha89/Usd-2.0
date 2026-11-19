import {useState, type Dispatch, type SetStateAction} from 'react';
import {CarFront, ChevronDown, ChevronRight, EyeOff, Pencil, Plus, RotateCcw} from 'lucide-react';
import {apiGet, apiPatch, getMediaUrl, listData} from '../api';
import {Photo as PublicPhoto} from '../public/PremiumUI';
import './participant-hidden-garage.css';

type GarageCar = {
  id: string;
  brand: string;
  model: string;
  registrationNumber?: string | null;
  color?: string | null;
  photoUrl?: string | null;
  isActive?: boolean;
  isPublic?: boolean;
  configurations?: unknown[];
};

type Props = {
  cars: GarageCar[];
  setCars: Dispatch<SetStateAction<GarageCar[]>>;
  go: (path: string) => void;
  photoPlaceholder?: string | null;
};

const carName = (car: GarageCar) => [car.brand, car.model].filter(Boolean).join(' ');
const carPlate = (car: GarageCar) => [car.registrationNumber || 'Госномер не указан', car.color].filter(Boolean).join(' · ');

export default function ParticipantGarage({cars, setCars, go, photoPlaceholder}: Props) {
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [hiddenCars, setHiddenCars] = useState<GarageCar[]>([]);
  const [hiddenLoading, setHiddenLoading] = useState(false);
  const [hiddenError, setHiddenError] = useState('');
  const [visibilitySaving, setVisibilitySaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const activeCars = cars.filter(car => car.isActive !== false);

  const loadHiddenCars = async () => {
    setHiddenLoading(true);
    setHiddenError('');
    try {
      const response = await apiGet<any>('/participants/me/cars?visibility=hidden');
      setHiddenCars(listData<GarageCar>(response));
    } catch (cause) {
      setHiddenError(cause instanceof Error ? cause.message : 'Не удалось загрузить скрытые автомобили');
    } finally {
      setHiddenLoading(false);
    }
  };

  const toggleHiddenCars = () => {
    const next = !hiddenOpen;
    setHiddenOpen(next);
    if (next) void loadHiddenCars();
  };

  const changeVisibility = async (car: GarageCar, nextActive: boolean) => {
    if (visibilitySaving !== null) return;
    if (!nextActive && !window.confirm('Скрыть автомобиль ' + carName(car) + '? Результаты соревнований сохранятся, но машина исчезнет из обычных списков и регистраций.')) return;
    setVisibilitySaving(car.id);
    setError('');
    setHiddenError('');
    try {
      await apiPatch('/cars/'+encodeURIComponent(car.id),{isActive:nextActive});
      if (nextActive) {
        // Restoring never automatically makes a car public. Its photo needs
        // an authenticated object URL before it is shown in the normal garage.
        const restored: GarageCar = {...car, isActive:true, isPublic:false};
        if (car.photoUrl) {
          try {
            restored.photoUrl = await getMediaUrl('CAR_PHOTO', car.id);
          } catch {
            restored.photoUrl = null;
          }
        }
        setCars(previous => [...previous.filter(item => item.id !== car.id), restored]);
        setHiddenCars(previous => previous.filter(item => item.id !== car.id));
      } else {
        setCars(previous => previous.filter(item => item.id !== car.id));
        setHiddenCars(previous => hiddenOpen ? [...previous.filter(item => item.id !== car.id), {...car, isActive:false, isPublic:false}] : previous);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить видимость автомобиля');
    } finally {
      setVisibilitySaving(null);
    }
  };

  return <>
    <section className="participant-section">
      <div className="participant-section-head">
        <div><span className="eyebrow">ГАРАЖ</span><h2>Гараж</h2></div>
        <button type="button" className="primary-button" onClick={() => go('/participant/car/new')}><Plus size={15}/>Добавить автомобиль</button>
      </div>
      {error && <div className="notice" role="alert">{error}</div>}
      {activeCars.length
        ? <div className="participant-car-grid">
            {activeCars.map(c => <article key={c.id} className="participant-car-card participant-car-card-clickable" role="button" tabIndex={0}
              onClick={() => go('/participant/car?carId='+encodeURIComponent(c.id))}
              onKeyDown={e => {if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();go('/participant/car?carId='+encodeURIComponent(c.id));}}}>
              <div className="participant-car-icon">
                <PublicPhoto src={c.photoUrl??undefined} placeholderSrc={photoPlaceholder} alt={carName(c)} className="member-list-car-photo" fallback={<CarFront size={22}/>}/>
              </div>
              <div className="participant-car-details">
                <h3>{carName(c)}</h3>
                <p>{carPlate(c)}</p>
                <small className="participant-car-config-count"><strong>{c.configurations?.length??0}</strong><span> конфигураций</span></small>
              </div>
              <div className="participant-car-actions">
                <button type="button" className="secondary-button compact" onClick={e => {e.stopPropagation();go('/participant/car?carId='+encodeURIComponent(c.id));}}><Pencil size={14}/>Открыть автомобиль</button>
                <button type="button" className="secondary-button compact" onClick={e => {e.stopPropagation();go('/participant/configurations?carId='+encodeURIComponent(c.id));}}>Оборудование <ChevronRight size={14}/></button>
                <button type="button" className="secondary-button compact participant-hide-car" disabled={visibilitySaving!==null}
                  onClick={e => {e.stopPropagation();void changeVisibility(c,false);}}><EyeOff size={14}/>Скрыть автомобиль</button>
              </div>
            </article>)}
          </div>
        : <div className="participant-empty"><CarFront size={28}/><h3>Активных автомобилей пока нет</h3><p>Добавьте автомобиль или восстановите ранее скрытый внизу страницы.</p></div>}
    </section>
    <section className="participant-hidden-garage" aria-label="Архив автомобилей">
      <button type="button" className="participant-hidden-toggle" aria-expanded={hiddenOpen} aria-controls="participant-hidden-cars" onClick={toggleHiddenCars}>
        <span><EyeOff size={16}/>Скрытые автомобили</span>
        <ChevronDown size={17} aria-hidden="true"/>
      </button>
      {hiddenOpen&&<div id="participant-hidden-cars" className="participant-hidden-body">
        <p>Эти машины не участвуют в новых регистрациях. Прежние результаты соревнований сохраняются.</p>
        {hiddenLoading ? <p role="status">Загружаем скрытые автомобили…</p> :
          hiddenError ? <div role="alert"><p>{hiddenError}</p><button type="button" className="secondary-button compact" onClick={() => void loadHiddenCars()}>Повторить</button></div> :
          hiddenCars.length ? <div className="participant-hidden-list">
            {hiddenCars.map(car => <article key={car.id} className="participant-hidden-row">
              <div><strong>{carName(car)}</strong><small>{carPlate(car)}</small></div>
              <button type="button" className="secondary-button compact" disabled={visibilitySaving!==null} onClick={() => void changeVisibility(car,true)}>
                <RotateCcw size={14}/>Восстановить
              </button>
            </article>)}
          </div> : <p>Скрытых автомобилей нет.</p>}
      </div>}
    </section>
  </>;
}
