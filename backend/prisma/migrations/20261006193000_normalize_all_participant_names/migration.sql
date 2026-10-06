-- Normalize all participant name fields already stored in PostgreSQL.
-- Cyrillic tokens remain unchanged; known Latin spellings are converted and
-- unknown Latin tokens receive a deterministic Cyrillic transliteration.

CREATE OR REPLACE FUNCTION "__usd_normalize_name_token"(input text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := lower(trim(input)); r text;
BEGIN
  IF v = '' THEN RETURN ''; END IF;
  CASE v
    WHEN 'mokhov' THEN RETURN 'Мохов'; WHEN 'kosolapov' THEN RETURN 'Косолапов';
    WHEN 'krasnov' THEN RETURN 'Краснов'; WHEN 'yakovenko' THEN RETURN 'Яковенко';
    WHEN 'androsov' THEN RETURN 'Андросов'; WHEN 'kashapov' THEN RETURN 'Кашапов';
    WHEN 'zorin' THEN RETURN 'Зорин'; WHEN 'sobyanin' THEN RETURN 'Собянин';
    WHEN 'zhernakov' THEN RETURN 'Жернаков'; WHEN 'naidanov' THEN RETURN 'Найданов';
    WHEN 'nikrasov' THEN RETURN 'Никрасов'; WHEN 'shtyagin' THEN RETURN 'Штягин';
    WHEN 'mihailov' THEN RETURN 'Михайлов'; WHEN 'usolcev' THEN RETURN 'Усольцев';
    WHEN 'polikarpov' THEN RETURN 'Поликарпов'; WHEN 'cvirko' THEN RETURN 'Цвирко';
    WHEN 'nizaforov' THEN RETURN 'Низафоров'; WHEN 'aleksashin' THEN RETURN 'Алексашин';
    WHEN 'zamatov' THEN RETURN 'Заматов'; WHEN 'sozontov' THEN RETURN 'Созонтов';
    WHEN 'tarasov' THEN RETURN 'Тарасов'; WHEN 'bakulin' THEN RETURN 'Бакулин';
    WHEN 'zubarev' THEN RETURN 'Зубарев'; WHEN 'ahmetov' THEN RETURN 'Ахметов';
    WHEN 'nikonov' THEN RETURN 'Никонов'; WHEN 'permyakov' THEN RETURN 'Пермяков';
    WHEN 'vasily' THEN RETURN 'Василий'; WHEN 'vasiliy' THEN RETURN 'Василий';
    WHEN 'vasili' THEN RETURN 'Василий'; WHEN 'vasilii' THEN RETURN 'Василий';
    WHEN 'vassily' THEN RETURN 'Василий'; WHEN 'wassily' THEN RETURN 'Василий';
    WHEN 'vitaly' THEN RETURN 'Виталий'; WHEN 'vitaliy' THEN RETURN 'Виталий';
    WHEN 'maksim' THEN RETURN 'Максим'; WHEN 'maxim' THEN RETURN 'Максим';
    WHEN 'sergey' THEN RETURN 'Сергей'; WHEN 'sergei' THEN RETURN 'Сергей';
    WHEN 'vladislav' THEN RETURN 'Владислав'; WHEN 'konstantin' THEN RETURN 'Константин';
    WHEN 'shamil' THEN RETURN 'Шамиль'; WHEN 'anton' THEN RETURN 'Антон';
    WHEN 'daniil' THEN RETURN 'Даниил'; WHEN 'danil' THEN RETURN 'Данил';
    WHEN 'dmitry' THEN RETURN 'Дмитрий'; WHEN 'dmitriy' THEN RETURN 'Дмитрий';
    WHEN 'andrey' THEN RETURN 'Андрей'; WHEN 'aleksey' THEN RETURN 'Алексей';
    WHEN 'alexey' THEN RETURN 'Алексей'; WHEN 'artem' THEN RETURN 'Артем';
    WHEN 'ruslan' THEN RETURN 'Руслан'; WHEN 'yan' THEN RETURN 'Ян';
    WHEN 'damir' THEN RETURN 'Дамир'; WHEN 'ivan' THEN RETURN 'Иван';
    WHEN 'ilnur' THEN RETURN 'Ильнур';
    ELSE NULL;
  END CASE;
  IF v !~ '^[a-z]+$' THEN RETURN upper(left(input,1)) || lower(substr(input,2)); END IF;
  r := v;
  r := replace(r,'shch','щ'); r := replace(r,'zh','ж'); r := replace(r,'kh','х');
  r := replace(r,'ts','ц'); r := replace(r,'ch','ч'); r := replace(r,'sh','ш');
  r := replace(r,'yu','ю'); r := replace(r,'ya','я'); r := replace(r,'yo','ё');
  r := replace(r,'ye','е'); r := replace(r,'yi','ы'); r := replace(r,'ey','ей'); r := replace(r,'iy','ий');
  r := replace(r,'a','а'); r := replace(r,'b','б'); r := replace(r,'c','к'); r := replace(r,'d','д');
  r := replace(r,'e','е'); r := replace(r,'f','ф'); r := replace(r,'g','г'); r := replace(r,'h','х');
  r := replace(r,'i','и'); r := replace(r,'j','дж'); r := replace(r,'k','к'); r := replace(r,'l','л');
  r := replace(r,'m','м'); r := replace(r,'n','н'); r := replace(r,'o','о'); r := replace(r,'p','п');
  r := replace(r,'q','к'); r := replace(r,'r','р'); r := replace(r,'s','с'); r := replace(r,'t','т');
  r := replace(r,'u','у'); r := replace(r,'v','в'); r := replace(r,'w','в'); r := replace(r,'x','кс');
  r := replace(r,'y','й'); r := replace(r,'z','з');
  RETURN upper(left(r,1)) || lower(substr(r,2));
END; $$;

CREATE OR REPLACE FUNCTION "__usd_normalize_participant_name"(input text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE token text; result text := '';
BEGIN
  IF input IS NULL OR btrim(input) = '' THEN RETURN input; END IF;
  FOR token IN SELECT regexp_split_to_table(btrim(regexp_replace(input,'\\s+',' ','g')),' ') LOOP
    IF result <> '' THEN result := result || ' '; END IF;
    result := result || "__usd_normalize_name_token"(token);
  END LOOP;
  RETURN result;
END; $$;

UPDATE "Participant"
SET "lastName" = "__usd_normalize_participant_name"("lastName"),
    "firstName" = "__usd_normalize_participant_name"("firstName"),
    "middleName" = CASE WHEN "middleName" IS NULL THEN NULL ELSE "__usd_normalize_participant_name"("middleName") END;

DROP FUNCTION "__usd_normalize_participant_name"(text);
DROP FUNCTION "__usd_normalize_name_token"(text);
